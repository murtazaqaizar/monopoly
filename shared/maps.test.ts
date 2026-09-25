import { describe, expect, it } from 'vitest';
import { getMap } from './board';
import { addPlayer, applyAction, BORDER_FEE, createGame, netWorth, rentFor, RENT_CAP } from './engine';
import type { Action, GameState, Settings } from './types';

// Tests for the map-only tiles and rules: World Tour, Pakistan and Euro Trip layouts.

function game(mapId: string, patch: Partial<Settings> = {}, n = 2, seed = 5): GameState {
  let s = createGame('T', { id: 'p0', name: 'Ali', color: '' }, seed);
  s = applyAction(s, 'p0', { type: 'settings', settings: { mapId, turnOrder: 'join', ...patch } }, 0);
  for (let i = 1; i < n; i++) s = addPlayer(s, { id: `p${i}`, name: ['Bano', 'Chand', 'Dua'][i - 1], color: '' });
  return applyAction(s, 'p0', { type: 'start' }, 0);
}

const act = (s: GameState, id: string | null, a: Action, dice?: [number, number], now = 0) => applyAction(s, id, a, now, { dice });
const pl = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const own = (owner: string, houses = 0) => ({ owner, houses, mortgaged: false, frozen: 0 });

function toRound(s: GameState, r: number, now = 0): GameState {
  const next = structuredClone(s);
  next.round = r - 1;
  next.turn = { ...next.turn!, playerId: next.players[next.players.length - 1].id, stage: 'end' };
  return act(next, next.turn.playerId, { type: 'endTurn' }, undefined, now);
}

const WORLD_QUIET: Partial<Settings> = {
  specialsOff: ['world.fx', 'world.visa', 'world.wonders', 'world.timezones', 'world.olympics', 'world.lockdown', 'world.war', 'world.embargo'],
};

describe('layouts differ per map', () => {
  it('each themed map has its own tile types and no Surprise/Treasure', () => {
    const kinds = (id: string) => new Set(getMap(id, 40).tiles.map((t) => t.kind));
    expect(kinds('classic').has('chance')).toBe(true);
    for (const id of ['world', 'pakistan', 'europe']) expect(kinds(id).has('chance') || kinds(id).has('chest')).toBe(false);
    expect([...kinds('world')]).toEqual(expect.arrayContaining(['port', 'news', 'customs']));
    expect([...kinds('pakistan')]).toEqual(expect.arrayContaining(['toll', 'stadium', 'committee', 'bazaar', 'shaadi', 'plots']));
    expect([...kinds('europe')]).toEqual(expect.arrayContaining(['parliament', 'museum', 'festival', 'hostel']));
  });

  it('routes cross the board: 6 flight routes, 3 rail lines, 1 motorway', () => {
    expect(getMap('world', 40).routes.filter((r) => r.kind === 'flight')).toHaveLength(6);
    expect(getMap('europe', 40).routes.filter((r) => r.kind === 'rail')).toHaveLength(3);
    expect(getMap('pakistan', 40).routes).toEqual([expect.objectContaining({ a: 15, b: 32, kind: 'road' })]);
  });
});

describe('World Tour tiles', () => {
  it('Deported sends you to an airport, not to Detention, with no salary', () => {
    let s = game('world', WORLD_QUIET);
    s.players[0].position = 25;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 30: Deported
    const p = pl(s, 'p0');
    expect(p.inJail).toBe(false);
    expect(getMap('world', 40).airports).toContain(p.position);
    expect(p.cash).toBe(1500);
  });

  it('World News puts a headline into play', () => {
    let s = game('world', WORLD_QUIET);
    s = act(s, 'p0', { type: 'roll' }, [1, 1]); // 2: World News
    expect(s.lastCard?.deck).toBe('news');
  });

  it('Customs charges duty per country you own in', () => {
    let s = game('world', WORLD_QUIET);
    s.properties[1] = own('p0');
    s.properties[11] = own('p0');
    s.properties[13] = own('p0');
    s = act(s, 'p0', { type: 'roll' }, [3, 4]); // 7: Customs
    expect(pl(s, 'p0').cash).toBe(1500 - 50); // Egypt + Italy
  });

  it('ports earn by the cities their owner holds on that side', () => {
    const s = game('world', WORLD_QUIET);
    s.properties[15] = own('p1');
    expect(rentFor(s, 15, 7)).toBe(25);
    s.properties[11] = own('p1');
    s.properties[13] = own('p1');
    expect(rentFor(s, 15, 7)).toBe(65);
    s.properties[33] = own('p1');
    expect(rentFor(s, 15, 7)).toBe(130);
  });

  it('airports earn by the routes their owner runs', () => {
    const s = game('world', WORLD_QUIET);
    s.properties[5] = own('p1');
    expect(rentFor(s, 5, 7)).toBe(40);
    s.properties[25] = own('p1');
    s.properties[38] = own('p1');
    expect(rentFor(s, 5, 7)).toBe(160);
  });

  it('time zones halve rent on the night side and move each round', () => {
    let s = game('world', { specialsOff: WORLD_QUIET.specialsOff!.filter((x) => x !== 'world.timezones') });
    s.properties[1] = own('p1');
    expect(s.special.night).toBe(0);
    expect(rentFor(s, 1, 7)).toBe(1); // Cairo $2 at night
    s = toRound(s, 2);
    expect(s.special.night).toBe(1);
    expect(rentFor(s, 1, 7)).toBe(2);
  });

  it('continent bonus pays each lap for a city in every country of a continent', () => {
    let s = game('world', WORLD_QUIET);
    s.properties[6] = own('p0'); // Mexico
    s.properties[36] = own('p0'); // USA
    s.players[0].position = 38;
    s = act(s, 'p0', { type: 'roll' }, [1, 2]); // pass Greenwich to 1
    expect(pl(s, 'p0').cash).toBe(1500 + 200 + 60);
  });

  it('Duty-Free sells one item at a fixed price', () => {
    let s = game('world', WORLD_QUIET);
    s.players[0].position = 15;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 20: Duty-Free
    expect(s.turn!.stage).toBe('shop');
    expect(() => act(s, 'p0', { type: 'haggle' })).toThrow(/fixed/);
    s = act(s, 'p0', { type: 'shopBuy', index: 1 }); // papers
    expect(pl(s, 'p0').jailCards).toBe(1);
    expect(pl(s, 'p0').cash).toBe(1440);
    expect(s.turn!.stage).toBe('end');
  });
});

describe('Pakistan tiles', () => {
  it('drive-past tolls charge cars that pass a plaza', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding', 'pk.traffic'] });
    s.properties[15] = own('p1');
    s.players[0].position = 12;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 17: drives past 15
    expect(pl(s, 'p1').cash).toBe(1520);
  });

  it('landing on a plaza offers the motorway to the other plaza', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding', 'pk.traffic'] });
    s.properties[15] = own('p0');
    s.players[0].position = 12;
    s = act(s, 'p0', { type: 'roll' }, [1, 2]); // 15
    expect(s.turn!.stage).toBe('travel');
    s = act(s, 'p0', { type: 'travel', tile: 32 });
    expect(pl(s, 'p0').position).toBe(32);
  });

  it('the committee pot fills each round and goes to whoever lands on it', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding'] });
    s = toRound(s, 2);
    expect(s.special.committee).toBe(40);
    s.turn = { ...s.turn!, playerId: 'p0', stage: 'roll' };
    s.players[0].position = 20;
    const before = pl(s, 'p0').cash;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 25: Committee
    expect(pl(s, 'p0').cash).toBe(before + 40);
    expect(s.special.committee).toBe(0);
  });

  it('Shaadi Hall collects salami from everyone', () => {
    let s = game('pakistan', {}, 3);
    s = act(s, 'p0', { type: 'roll' }, [4, 4]); // 8: Shaadi Hall
    expect(pl(s, 'p0').cash).toBe(1550);
    expect(pl(s, 'p1').cash).toBe(1475);
  });

  it('bazaar: haggle then buy', () => {
    let s = game('pakistan', { specialsOff: ['pk.traffic'] });
    s = act(s, 'p0', { type: 'roll' }, [1, 1]); // 2: Bazaar
    expect(s.turn!.stage).toBe('shop');
    const price = s.turn!.shop!.items[0].price;
    s = act(s, 'p0', { type: 'haggle' });
    // a 1 gets you thrown out; otherwise the price moved and you can buy
    if (s.turn!.stage === 'shop') {
      expect(s.turn!.shop!.items[0].price).not.toBe(price);
      s = act(s, 'p0', { type: 'shopBuy', index: 0 });
    }
    expect(s.turn!.stage).not.toBe('shop');
  });

  it('plot files: buy at the dealer, value moves each round, sell on your turn', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding'] });
    s.players[0].position = 12;
    s = act(s, 'p0', { type: 'roll' }, [2, 4]); // 18: Property Dealer
    expect(s.turn!.stage).toBe('plots');
    s = act(s, 'p0', { type: 'buyPlot' });
    expect(s.special.plots.owned.p0).toBe(1);
    expect(pl(s, 'p0').cash).toBe(1400);
    expect(netWorth(s, pl(s, 'p0'))).toBe(1500);
    for (let r = 2; r < 12; r++) s = toRound(s, r);
    expect(s.special.plots.value).toBeGreaterThanOrEqual(40);
    expect(s.special.plots.value).toBeLessThanOrEqual(500);
    s.turn = { ...s.turn!, playerId: 'p0', stage: 'end' };
    const cash = pl(s, 'p0').cash;
    s = act(s, 'p0', { type: 'sellPlot' });
    expect(pl(s, 'p0').cash).toBe(cash + s.special.plots.value);
  });

  it('Naka: pay the fine and drive on', () => {
    let s = game('pakistan', { specialsOff: ['pk.traffic'] });
    s.players[0].position = 25;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 30: Naka
    expect(s.turn!.bribe?.kind).toBe('naka');
    s = act(s, 'p0', { type: 'bribe', offer: false, fine: true });
    expect(pl(s, 'p0').inJail).toBe(false);
    expect(pl(s, 'p0').cash).toBe(1400);
  });

  it('Naka: papers get you through for free', () => {
    let s = game('pakistan', { specialsOff: ['pk.traffic'] });
    s.players[0].jailCards = 1;
    s.players[0].position = 25;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]);
    expect(pl(s, 'p0').inJail).toBe(false);
    expect(pl(s, 'p0').jailCards).toBe(0);
  });

  it('Northern Areas: skip a turn while your cities earn double', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding'] });
    s.properties[1] = own('p0');
    s.players[0].position = 15;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 20
    expect(s.turn!.stage).toBe('trip');
    const base = rentFor(s, 1, 7);
    s = act(s, 'p0', { type: 'trip', go: true });
    expect(rentFor(s, 1, 7)).toBe(base * 2);
    s = act(s, 'p0', { type: 'endTurn' });
    s = act(s, 'p1', { type: 'roll' }, [1, 2]);
    if (s.turn!.stage === 'buy') s = act(s, 'p1', { type: 'decline' }, undefined, 0);
    if (s.auction) s = act(s, null, { type: 'tick' }, undefined, 1e9);
    s = act(s, 'p1', { type: 'endTurn' });
    // p0 is away, so p1 goes again; then p0 is back
    expect(s.turn!.playerId).toBe('p1');
  });

  it('stadiums pay big on match day', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding'] });
    s.properties[12] = own('p1');
    expect(rentFor(s, 12, 7)).toBe(15);
    s = toRound(s, 3);
    expect(s.special.cricket).not.toBeNull();
    expect(rentFor(s, 12, 7)).toBe(120);
  });

  it('sifarish: one call per stay in the Thana', () => {
    let s = game('pakistan');
    s.players[0].inJail = true;
    s.players[0].position = 10;
    s = act(s, 'p0', { type: 'sifarish' });
    expect(() => act(s, 'p0', { type: 'sifarish' })).toThrow();
  });
});

describe('Euro Trip tiles', () => {
  it('rail lines only go to the other end of the line', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.borders'] });
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 5: Paris
    if (s.turn!.stage === 'buy') s = act(s, 'p0', { type: 'buy' });
    expect(s.turn!.travel?.to).toEqual([25]);
  });

  it('EU borders charge a fee for entering a non-EU country you own nothing in', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.seasons', 'eu.currency'] });
    s.players[0].position = 19;
    s = act(s, 'p0', { type: 'roll' }, [1, 2]); // 22 hostel, passing Basel (Switzerland)
    expect(s.log.some((l) => l.text.includes('Switzerland border'))).toBe(true);
    expect(pl(s, 'p0').cash).toBeLessThanOrEqual(1500 - BORDER_FEE + 75);
  });

  it('currencies float only for non-euro countries', () => {
    let s = game('europe');
    for (let r = 2; r < 20; r++) s = toRound(s, r);
    const m = getMap('europe', 40);
    for (const [g, v] of Object.entries(s.special.rates)) {
      expect(m.groups[g].currency).toBeTruthy();
      expect(v).toBeGreaterThanOrEqual(0.7);
      expect(v).toBeLessThanOrEqual(1.4);
    }
  });

  it('Parliament: a proposed law passes on a majority and caps rent', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.seasons', 'eu.currency'] });
    s.players[0].position = 15;
    s = act(s, 'p0', { type: 'roll' }, [1, 2], 1000); // 18: EU Parliament
    expect(s.turn!.stage).toBe('parliament');
    s = act(s, 'p0', { type: 'propose', law: 'rentCap' }, undefined, 1000);
    s = act(s, 'p1', { type: 'billVote', yes: true }, undefined, 2000);
    s = act(s, null, { type: 'tick' }, undefined, 30_000);
    expect(s.special.law?.id).toBe('rentCap');
    s.properties[39] = own('p1', 5);
    expect(rentFor(s, 39, 7)).toBe(RENT_CAP);
  });

  it('Parliament: a tied vote fails', () => {
    let s = game('europe', { specialsOff: ['eu.strike'] });
    s.players[0].position = 15;
    s = act(s, 'p0', { type: 'roll' }, [1, 2], 1000);
    s = act(s, 'p0', { type: 'propose', law: 'buildFreeze' }, undefined, 1000);
    s = act(s, 'p1', { type: 'billVote', yes: false }, undefined, 2000);
    s = act(s, null, { type: 'tick' }, undefined, 30_000);
    expect(s.special.law).toBeNull();
  });

  it('museums: visit them all to win the culture prize', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.borders'] });
    s.special.museums.p0 = [38];
    s.special.culture = 30;
    s = act(s, 'p0', { type: 'roll' }, [3, 4]); // 7: The Louvre
    // $30 ticket, then the fund ($60) plus a $100 bonus
    expect(pl(s, 'p0').cash).toBe(1500 - 30 + 160);
    expect(s.special.culture).toBe(0);
  });

  it('Festival triples a country and gives the lander another roll', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.borders'] });
    s.players[0].position = 22;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // 27: Festival
    expect(s.special.boosts.some((b) => b.factor === 3)).toBe(true);
    expect(s.turn!.stage).toBe('roll');
  });

  it('winter closes the Alps to building', () => {
    let s = game('europe', { specialsOff: ['eu.strike'] });
    for (const i of [21, 23, 24]) s.properties[i] = own('p0');
    s = toRound(s, 3);
    expect(s.special.season).toBe('winter');
    s.turn = { ...s.turn!, playerId: 'p0', stage: 'roll' };
    expect(() => act(s, 'p0', { type: 'build', tile: 21 })).toThrow(/snowed in/);
  });
});
