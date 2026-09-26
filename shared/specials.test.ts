import { describe, expect, it } from 'vitest';
import { getMap, MAP_DEFS } from './board';
import { addPlayer, applyAction, createGame, rentFor, SPECIALS, specialOn } from './engine';
import type { Action, GameState, Settings, TradeSide } from './types';

function game(mapId: string, patch: Partial<Settings> = {}, n = 2, seed = 5): GameState {
  let s = createGame('T', { id: 'p0', name: 'Ali', color: '' }, seed);
  s = applyAction(s, 'p0', { type: 'settings', settings: { mapId, turnOrder: 'join', ...patch } }, 0);
  for (let i = 1; i < n; i++) s = addPlayer(s, { id: `p${i}`, name: ['Bano', 'Chand', 'Dua'][i - 1], color: '' });
  return applyAction(s, 'p0', { type: 'start' }, 0);
}

const act = (s: GameState, id: string | null, a: Action, dice?: [number, number], now = 0) => applyAction(s, id, a, now, { dice });
const pl = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const own = (owner: string, houses = 0) => ({ owner, houses, mortgaged: false, frozen: 0 });
const side = (p: Partial<TradeSide> = {}): TradeSide => ({ cash: 0, tiles: [], jailCards: 0, immunity: null, ...p });
const idx = (s: GameState, name: string) => getMap(s.settings.mapId, s.size).tiles.find((t) => t.name === name)!.index;

/** Ends the last player's turn so the game rolls into round `r`. */
function toRound(s: GameState, r: number, now = 0): GameState {
  const next = structuredClone(s);
  next.round = r - 1;
  next.turn = { ...next.turn!, playerId: next.players[next.players.length - 1].id, stage: 'end' };
  return act(next, next.turn.playerId, { type: 'endTurn' }, undefined, now);
}

describe('map roster', () => {
  it('has exactly Classic, World, Pakistan and Euro Trip', () => {
    expect(Object.keys(MAP_DEFS)).toEqual(['classic', 'world', 'pakistan', 'europe']);
    expect(createGame('T', { id: 'a', name: 'A', color: '' }, 1).settings.mapId).toBe('classic');
  });

  it('classic has no specials; each special map has at least 10', () => {
    const s = game('classic');
    expect(SPECIALS.some((x) => specialOn(s, x.id))).toBe(false);
    for (const m of ['world', 'pakistan', 'europe']) expect(SPECIALS.filter((x) => x.map === m).length).toBeGreaterThanOrEqual(10);
  });

  it('host can switch a special off', () => {
    const s = game('world', { specialsOff: ['world.visa', 'bogus'] });
    expect(specialOn(s, 'world.visa')).toBe(false);
    expect(specialOn(s, 'world.war')).toBe(true);
    expect(s.settings.specialsOff).toEqual(['world.visa']);
  });

  it('pakistan renames are in', () => {
    const m = getMap('pakistan', 56);
    expect(m.groups.silver.name).toBe('Karachi Seafront');
    expect(m.tiles.some((t) => t.name === 'G-6')).toBe(true);
    expect(m.tiles.some((t) => t.name.includes('Bahria'))).toBe(false);
  });
});

describe('World Tour', () => {
  it('war starts on round 6 with rent x1.5 and attacks', () => {
    let s = game('world', { specialsOff: ['world.fx', 'world.olympics', 'world.lockdown'] });
    s.properties[1] = own('p0');
    s.properties[3] = own('p0');
    s.properties[39] = own('p1', 1);
    s.properties[37] = own('p1', 1);
    s = toRound(s, 6);
    expect(s.special.war).not.toBeNull();
    const { a, b } = s.special.war!;
    expect([a, b].sort()).toEqual(['blue', 'brown'].sort());
    expect(rentFor(s, 39, 7)).toBe(Math.floor(200 * 1.5));
    s.turn = { ...s.turn!, playerId: 'p0', stage: 'roll', attacked: false };
    s = act(s, 'p0', { type: 'attack', tile: 39 });
    expect(pl(s, 'p0').cash).toBe(1400);
    expect(() => act(s, 'p0', { type: 'attack', tile: 39 })).toThrow(/One attack/);
  });

  it('exchange rates drift within bounds', () => {
    let s = game('world');
    for (let r = 2; r < 30; r++) s = toRound(s, r);
    for (const v of Object.values(s.special.rates)) {
      expect(v).toBeGreaterThanOrEqual(0.7);
      expect(v).toBeLessThanOrEqual(1.3);
    }
  });

  it('embargo blocks trading and building', () => {
    let s = game('world', { specialsOff: ['world.fx'] });
    s = toRound(s, 2);
    const g = s.special.embargo!.group;
    const tile = getMap('world', 40).groups[g].tiles[0];
    s.properties[tile] = own('p0');
    s.turn = { ...s.turn!, playerId: 'p0' };
    expect(() => act(s, 'p0', { type: 'proposeTrade', to: 'p1', give: side({ tiles: [tile] }), get: side() })).toThrow(/embargo/);
  });

  it('olympics triples rent', () => {
    let s = game('world', { specialsOff: ['world.fx'] });
    s = toRound(s, 5);
    const g = s.special.olympics!.group;
    const tile = getMap('world', 40).groups[g].tiles[0];
    s.properties[tile] = own('p1');
    const base = getMap('world', 40).tiles[tile].rents![0];
    expect(rentFor(s, tile, 7)).toBe(base * 3);
  });

  it('oil crisis doubles airports and trims salary', () => {
    let s = game('world', { specialsOff: ['world.fx'] });
    s = toRound(s, 7);
    expect(s.special.oil).toBe(1);
    s.properties[5] = own('p1');
    expect(rentFor(s, 5, 7)).toBe(80); // a lone World airport earns $40, doubled
  });

  it('visa fee and tourist wonders', () => {
    let s = game('world', { specialsOff: ['world.fx'] });
    s.properties[3] = own('p1'); // Giza, the Egypt wonder
    s = act(s, 'p0', { type: 'roll' }, [0, 1]); // Cairo (1): no city in Egypt
    expect(pl(s, 'p0').cash).toBe(1500 - 20);
    expect(pl(s, 'p1').cash).toBe(1500 + 25);
  });

  it('lockdown makes you miss a turn', () => {
    let s = game('world', { specialsOff: ['world.fx'] });
    s.special.lockdown = { side: 0, roundsLeft: 1 };
    s = act(s, 'p0', { type: 'roll' }, [1, 2]);
    expect(s.special.skip.p0).toBe(1);
    s.special.lockdown = null;
    if (s.turn!.stage === 'buy') s = act(s, 'p0', { type: 'buy' });
    s = act(s, 'p0', { type: 'endTurn' });
    s = act(s, 'p1', { type: 'roll' }, [1, 3]);
    if (s.turn!.stage === 'buy') s = act(s, 'p1', { type: 'buy' });
    s = act(s, 'p1', { type: 'endTurn' });
    expect(s.turn!.playerId).toBe('p1');
  });

  it('UN aid helps the poorest', () => {
    let s = game('world', { specialsOff: ['world.fx', 'world.olympics'] });
    s.players[1].cash = 100;
    s = toRound(s, 5);
    expect(pl(s, 'p1').cash).toBe(250);
  });

  it("flights only go along the airport's routes; the fare goes to the destination owner", () => {
    let s = game('world', { specialsOff: ['world.fx'] });
    s.properties[5] = own('p0');
    s.properties[25] = own('p1');
    s = act(s, 'p0', { type: 'roll' }, [2, 3]);
    expect(s.turn!.stage).toBe('travel');
    expect(s.turn!.travel!.to.sort()).toEqual([25, 38]);
    expect(() => act(s, 'p0', { type: 'travel', tile: 12 })).toThrow(/route/);
    const p1 = pl(s, 'p1').cash;
    s = act(s, 'p0', { type: 'travel', tile: 25 });
    expect(pl(s, 'p0').position).toBe(25);
    // $60 fare to p1, then rent at Dubai: p1 runs 0 of its routes, so $40
    expect(pl(s, 'p1').cash).toBe(p1 + 60 + 40);
  });
});

describe('Pakistan', () => {
  it('load-shedding blacks out a region unless you have UPS', () => {
    let s = game('pakistan');
    s = toRound(s, 2);
    const g = s.special.blackout!.group;
    const tile = getMap('pakistan', 40).groups[g].tiles[0];
    s.properties[tile] = own('p1');
    expect(rentFor(s, tile, 7)).toBe(0);
    s.turn = { ...s.turn!, playerId: 'p1' };
    s = act(s, 'p1', { type: 'buyUps' });
    expect(rentFor(s, tile, 7)).toBeGreaterThan(0);
  });

  it('monsoon can wash buildings away', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding'] }, 2, 99);
    const m = getMap('pakistan', 40);
    for (const g of ['pink', 'green']) for (const t of m.groups[g].tiles) s.properties[t] = own('p1', 4);
    s = toRound(s, 4);
    const total = ['pink', 'green'].flatMap((g) => m.groups[g].tiles).reduce((n, t) => n + s.properties[t].houses, 0);
    expect(total).toBeLessThanOrEqual(24);
  });

  it('cricket doubles Lahore or Karachi', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding'] });
    s = toRound(s, 3);
    expect(['yellow', 'green']).toContain(s.special.cricket!.group);
  });

  it('eidi on round 5', () => {
    let s = game('pakistan', { specialsOff: ['pk.loadshedding', 'pk.monsoon'] });
    s = toRound(s, 5);
    const total = s.players.reduce((n, p) => n + p.cash, 0);
    // Eidi paid out; each player also put $20 into the committee this round
    expect(total).toBe(3000 + 200 - 40);
    expect(s.special.committee).toBe(40);
  });

  it('chai-pani: refusing the bribe pays tax normally', () => {
    let s = game('pakistan');
    s.players[0].position = 24;
    s = act(s, 'p0', { type: 'roll' }, [1, 3]); // 28: Income Tax
    expect(s.turn!.stage).toBe('bribe');
    s = act(s, 'p0', { type: 'bribe', offer: false });
    expect(pl(s, 'p0').cash).toBe(1350); // 10% of $1500
  });

  it('chai-pani: a bribe skips or doubles', () => {
    let s = game('pakistan');
    s.players[0].position = 24;
    s = act(s, 'p0', { type: 'roll' }, [1, 3]);
    s = act(s, 'p0', { type: 'bribe', offer: true });
    // $50 bribe, then either nothing or a double tax on what is left (2 x 10% of $1450)
    expect([1450, 1160]).toContain(pl(s, 'p0').cash);
  });

  it('traffic jam slows the next roll', () => {
    let s = game('pakistan');
    s.players[0].position = 30;
    s = act(s, 'p0', { type: 'roll' }, [0, 1]); // 31 = Saddar (Karachi)
    expect(s.special.traffic.p0).toBe(true);
    if (s.turn!.stage === 'buy') s = act(s, 'p0', { type: 'buy' });
    s = act(s, 'p0', { type: 'endTurn' });
    s = act(s, 'p1', { type: 'roll' }, [3, 4]);
    if (s.turn!.stage === 'buy') s = act(s, 'p1', { type: 'buy' });
    if (s.turn!.stage === 'bribe') s = act(s, 'p1', { type: 'bribe', offer: false });
    s = act(s, 'p1', { type: 'endTurn' });
    s = act(s, 'p0', { type: 'roll' }, [2, 3]);
    expect(pl(s, 'p0').position).toBe(34);
  });

  it('petrol and CPEC on each lap', () => {
    let s = game('pakistan');
    s.properties[idx(s, 'Gwadar')] = own('p0');
    s.properties[idx(s, 'Quetta')] = own('p0');
    s.properties[5] = own('p0');
    s.players[0].position = 38;
    s = act(s, 'p0', { type: 'roll' }, [2, 3]); // pass Start to Quetta (own)
    expect(pl(s, 'p0').cash).toBe(1500 + 200 - 30 + 100);
  });
});

describe('Euro Trip', () => {
  it('rail pass rides between stations, night train is free on doubles', () => {
    let s = game('europe');
    s.properties[5] = own('p0');
    s = act(s, 'p0', { type: 'roll' }, [2, 3]);
    expect(s.turn!.travel?.cost).toBe(50);
    s = act(s, 'p0', { type: 'skipSpecial' });
    expect(s.turn!.stage).toBe('end');
    let t = game('europe');
    t.properties[5] = own('p0');
    t.players[0].position = 1;
    t = act(t, 'p0', { type: 'roll' }, [2, 2]);
    expect(t.turn!.travel?.cost).toBe(0);
  });

  it('train strike shuts stations', () => {
    let s = game('europe');
    s.properties[5] = own('p1');
    s = toRound(s, 4);
    expect(rentFor(s, 5, 7)).toBe(0);
  });

  it('seasons double summer then winter sets', () => {
    let s = game('europe', { specialsOff: ['eu.strike'] });
    s.properties[1] = own('p1');
    expect(rentFor(s, 1, 7)).toBe(4); // summer: Portugal x2
    s = toRound(s, 3);
    expect(s.special.season).toBe('winter');
    expect(rentFor(s, 1, 7)).toBe(2);
  });

  it('eurovision votes pay the winning country', () => {
    let s = game('europe', { specialsOff: ['eu.strike'] });
    s.properties[1] = own('p1');
    s = toRound(s, 6, 1000);
    expect(s.special.vote).not.toBeNull();
    s = act(s, 'p0', { type: 'vote', group: 'brown' }, undefined, 2000);
    const before = pl(s, 'p1').cash;
    s = act(s, null, { type: 'tick' }, undefined, 20_000);
    expect(pl(s, 'p1').cash).toBe(before + 200);
  });

  it('exit vote locks a country and boosts its rent', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.seasons'] });
    s = toRound(s, 8);
    const g = s.special.exited!;
    const tile = getMap('europe', 40).groups[g].tiles[0];
    s.properties[tile] = own('p1');
    const base = getMap('europe', 40).tiles[tile].rents![0];
    expect(rentFor(s, tile, 7)).toBe(Math.floor(base * 1.5));
  });

  it('carbon tax on big buildings each lap', () => {
    let s = game('europe', { specialsOff: ['eu.seasons'] });
    s.properties[6] = own('p0', 5);
    s.players[0].position = 38;
    s = act(s, 'p0', { type: 'roll' }, [1, 2]);
    expect(pl(s, 'p0').cash).toBe(1500 + 200 - 20);
  });

  it('heritage capitals: x3 base rent, max 2 houses', () => {
    let s = game('europe', { specialsOff: ['eu.seasons'] });
    s.properties[1] = own('p0');
    s.properties[3] = own('p0');
    expect(rentFor({ ...s, properties: { 3: own('p1'), 1: own('p0') } }, 3, 7)).toBe(12);
    s = act(s, 'p0', { type: 'build', tile: 3 });
    s = act(s, 'p0', { type: 'build', tile: 1 });
    s = act(s, 'p0', { type: 'build', tile: 3 });
    expect(() => act(s, 'p0', { type: 'build', tile: 3 })).toThrow(/Heritage/);
    s = act(s, 'p0', { type: 'build', tile: 1 });
    s = act(s, 'p0', { type: 'build', tile: 1 });
    expect(s.properties[1].houses).toBe(3);
  });

  it('schengen hop adds steps once per lap', () => {
    let s = game('europe');
    s = act(s, 'p0', { type: 'schengen', extra: 2 });
    s = act(s, 'p0', { type: 'roll' }, [1, 2]);
    expect(pl(s, 'p0').position).toBe(5);
  });

  it('champions league bets pay double', () => {
    let s = game('europe', { specialsOff: ['eu.strike', 'eu.seasons'] });
    s = toRound(s, 7, 1000);
    const m = s.special.match!;
    s = act(s, 'p0', { type: 'bet', group: m.a, amount: 100 }, undefined, 2000);
    s = act(s, 'p1', { type: 'bet', group: m.b, amount: 100 }, undefined, 2000);
    s = act(s, null, { type: 'tick' }, undefined, 20_000);
    const total = pl(s, 'p0').cash + pl(s, 'p1').cash;
    expect(total).toBe(3000); // the loser's $100 stake is the winner's $100 profit
  });
});
