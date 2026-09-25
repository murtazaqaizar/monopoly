import { describe, expect, it } from 'vitest';
import { BOARD_SIZES, getMap, MAP_DEFS } from './board';
import { addPlayer, applyAction, createGame, GameError, mapOf, toPublic } from './engine';
import type { Action, GameState, Settings, TradeSide } from './types';

const NAMES = ['Ali', 'Bano', 'Chand', 'Dua', 'Eman', 'Faiz', 'Gul', 'Hira', 'Ifra', 'Jaan'];

function game(patch: Partial<Settings> = {}, n = 2, seed = 11): GameState {
  let s = createGame('T', { id: 'p0', name: NAMES[0], color: '' }, seed);
  s = applyAction(s, 'p0', { type: 'settings', settings: { maxPlayers: Math.max(n, 6), ...patch } }, 0);
  for (let i = 1; i < n; i++) s = addPlayer(s, { id: `p${i}`, name: NAMES[i], color: '' });
  return applyAction(s, 'p0', { type: 'start' }, 0);
}

const cur = (s: GameState) => s.turn!.playerId;
const other = (s: GameState) => s.players.find((p) => p.id !== cur(s))!.id;
const pl = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const act = (s: GameState, id: string | null, a: Action, dice?: [number, number], now = 0, speed?: 1 | 2 | 3 | 'bus' | 'rocket') =>
  applyAction(s, id, a, now, { dice, speed });
const own = (owner: string, houses = 0) => ({ owner, houses, mortgaged: false, frozen: 0 });
const side = (p: Partial<TradeSide> = {}): TradeSide => ({ cash: 0, tiles: [], jailCards: 0, immunity: null, ...p });

describe('board sizes', () => {
  it('builds every map at every size with the right city counts', () => {
    const cities = { 40: 22, 48: 28, 56: 36 };
    for (const id of Object.keys(MAP_DEFS)) {
      for (const size of BOARD_SIZES) {
        const m = getMap(id, size);
        expect(m.tiles).toHaveLength(size);
        expect(m.tiles.filter((t) => t.kind === 'property')).toHaveLength(cities[size]);
        expect(m.airports).toHaveLength(4);
        expect(m.utilities).toHaveLength(2);
        expect(m.tiles[m.jail].kind).toBe('jail');
        expect(m.tiles[m.goToJail].kind).toBe('gotojail');
        expect(m.tiles[m.specials.sabotage].kind).toBe('chance');
        expect(m.tiles[m.specials.stocks].kind).toBe('chest');
        expect(m.tiles[m.specials.arcade].kind).toBe('chest');
        // names unique so players can tell cities apart
        const names = m.tiles.filter((t) => t.kind === 'property').map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  it('keeps prices and rents rising around every board', () => {
    for (const size of BOARD_SIZES) {
      const props = getMap('world', size).tiles.filter((t) => t.kind === 'property');
      for (let i = 1; i < props.length; i++) {
        expect(props[i].price!).toBeGreaterThanOrEqual(props[i - 1].price!);
        expect(props[i].rents![5]).toBeGreaterThanOrEqual(props[i - 1].rents![5]);
      }
    }
  });

  it('standard board keeps the classic layout', () => {
    const m = getMap('world', 40);
    expect(m.tiles[1].name).toBe('Cairo');
    expect(m.tiles[39].rents).toEqual([50, 200, 600, 1400, 1700, 2000]);
    expect(m.specials).toEqual({ arcade: 17, sabotage: 22, stocks: 33 });
  });

  it('auto size grows with the room', () => {
    expect(game({}, 4).size).toBe(40);
    expect(game({}, 7).size).toBe(48);
    expect(game({ maxPlayers: 10 }, 10).size).toBe(56);
    expect(game({ boardSize: 'mega' }, 2).size).toBe(56);
  });

  it('cards name cities from the current map', () => {
    let s = game({ mapId: 'pakistan' });
    const me = cur(s);
    // force the "Fly to red-last" card to the top of the Surprise deck
    s.decks.chance = [1, ...s.decks.chance.filter((i) => i !== 1)];
    s = act(s, me, { type: 'roll' }, [3, 4]); // tile 7 is Surprise
    expect(s.lastCard?.text).toContain('Rawalpindi');
  });
});

describe('money settings', () => {
  it('rent speed multiplies rent', () => {
    let s = game({ rentSpeed: 2 });
    const me = cur(s);
    s.properties[3] = own(other(s));
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).cash).toBe(1500 - 8);
  });

  it('start salary and exact landing double', () => {
    let s = game({ startSalary: 300, exactStartDouble: true });
    const me = cur(s);
    s.players.find((p) => p.id === me)!.position = 37;
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).position).toBe(0);
    expect(pl(s, me).cash).toBe(1500 + 600);
  });

  it('upkeep charges for buildings each lap', () => {
    let s = game({ upkeep: true, jackpot: false });
    const me = cur(s);
    s.properties[1] = own(me, 2);
    s.properties[3] = own(me, 5);
    s.players.find((p) => p.id === me)!.position = 38;
    s = act(s, me, { type: 'roll' }, [2, 3]); // pass Start to tile 3 (own)
    expect(pl(s, me).cash).toBe(1500 + 200 - (20 + 40));
  });

  it('bank reserve runs dry', () => {
    let s = game({ bankReserve: true });
    const me = cur(s);
    s.bank = 50;
    s.players.find((p) => p.id === me)!.position = 38;
    s = act(s, me, { type: 'roll' }, [2, 3]);
    expect(pl(s, me).cash).toBe(1550);
    expect(s.bank).toBe(0);
  });

  it('hidden cash masks other balances for each viewer', () => {
    const s = game({ hiddenCash: 'hidden' });
    const view = toPublic(s, 'p0');
    expect(view.players.find((p) => p.id === 'p0')!.cash).toBe(1500);
    expect(view.players.find((p) => p.id === 'p1')!.cashMask).toBe('hidden');
    const ranges = toPublic(game({ hiddenCash: 'ranges' }), 'p0');
    expect(ranges.players.find((p) => p.id === 'p1')!.cashMask).toEqual([1000, 2000]);
  });

  it('catch-up discount helps the poorest player', () => {
    let s = game({ catchUp: true });
    const me = cur(s);
    const them = other(s);
    s.players.find((p) => p.id === me)!.cash = 500;
    s.properties[39] = own(them);
    s.properties[37] = own(them);
    s.players.find((p) => p.id === me)!.position = 36;
    s = act(s, me, { type: 'roll' }, [1, 2]); // New York, full set base 50 x2 = 100, -25%
    expect(pl(s, me).cash).toBe(500 - 75);
  });
});

describe('building settings', () => {
  it('mortgages can be turned off', () => {
    const s = game({ mortgages: 'off' });
    s.properties[1] = own(cur(s));
    expect(() => act(s, cur(s), { type: 'mortgage', tile: 1 })).toThrow(/off/);
  });

  it('uneven building allowed when even building is off', () => {
    let s = game({ evenBuild: false });
    const me = cur(s);
    s.properties[1] = own(me);
    s.properties[3] = own(me);
    s = act(s, me, { type: 'build', tile: 1 });
    s = act(s, me, { type: 'build', tile: 1 });
    expect(s.properties[1].houses).toBe(2);
  });

  it('building shortage limits houses and breaks hotels down', () => {
    let s = game({ buildingStock: 'scarce', evenBuild: false }); // 2 players: 4 houses, 2 hotels
    const me = cur(s);
    expect(s.stock).toEqual({ houses: 4, hotels: 2, mega: 1 });
    s.properties[1] = own(me);
    s.properties[3] = own(me);
    for (let i = 0; i < 4; i++) s = act(s, me, { type: 'build', tile: 1 });
    expect(() => act(s, me, { type: 'build', tile: 3 })).toThrow(/run out of houses/);
    s = act(s, me, { type: 'build', tile: 1 }); // hotel returns 4 houses
    expect(s.stock!.houses).toBe(4);
    s.stock!.houses = 0;
    s = act(s, me, { type: 'sellHouse', tile: 1 }); // no houses to break into
    expect(s.properties[1].houses).toBe(0);
  });

  it('first house is free when a set completes', () => {
    let s = game({ firstHouseFree: true });
    const me = cur(s);
    s.properties[1] = own(me);
    s = act(s, me, { type: 'roll' }, [1, 2]);
    s = act(s, me, { type: 'buy' });
    expect(s.properties[1].houses).toBe(1);
  });
});

describe('auction and trade settings', () => {
  it('sealed auction: highest bid pays second price + 1', () => {
    let s = game({ auctionMode: 'sealed' });
    const me = cur(s);
    const them = other(s);
    s = act(s, me, { type: 'roll' }, [1, 2]);
    s = act(s, me, { type: 'decline' }, undefined, 0);
    s = act(s, me, { type: 'bid', amount: 50 }, undefined, 100);
    expect(toPublic(s, them).auction!.bids[0].amount).toBe(-1);
    s = act(s, them, { type: 'bid', amount: 30 }, undefined, 200);
    s = act(s, null, { type: 'tick' }, undefined, 200);
    expect(s.properties[3].owner).toBe(me);
    expect(pl(s, me).cash).toBe(1500 - 31);
  });

  it('trade freeze blocks early offers', () => {
    const s = game({ tradeFreeze: 1 });
    expect(() => act(s, cur(s), { type: 'proposeTrade', to: other(s), give: side({ cash: 10 }), get: side() })).toThrow(/round 2/);
  });

  it('trade veto lets bystanders cancel a trade', () => {
    let s = game({ tradeVeto: true }, 3);
    const [a, b, c] = s.players.map((p) => p.id);
    s.properties[1] = own(a);
    s = act(s, a, { type: 'proposeTrade', to: b, give: side({ tiles: [1] }), get: side() });
    s = act(s, b, { type: 'respondOffer', id: s.offers[0].id, accept: true }, undefined, 1000);
    expect(s.vetoQueue).toHaveLength(1);
    s = act(s, c, { type: 'vetoTrade', id: s.vetoQueue[0].id });
    expect(s.vetoQueue).toHaveLength(0);
    expect(s.properties[1].owner).toBe(a);
  });

  it('trade veto window executes when nobody objects', () => {
    let s = game({ tradeVeto: true }, 3);
    const [a, b] = s.players.map((p) => p.id);
    s.properties[1] = own(a);
    s = act(s, a, { type: 'proposeTrade', to: b, give: side({ tiles: [1] }), get: side() });
    s = act(s, b, { type: 'respondOffer', id: s.offers[0].id, accept: true }, undefined, 1000);
    s = act(s, null, { type: 'tick' }, undefined, 11_000);
    expect(s.properties[1].owner).toBe(b);
  });

  it('city cap stops buying', () => {
    const s = game({ cityCap: 6 });
    const me = cur(s);
    for (const i of [6, 8, 9, 11, 13, 14]) s.properties[i] = own(me);
    const landed = act(s, me, { type: 'roll' }, [1, 2]);
    expect(() => act(landed, me, { type: 'buy' })).toThrow(/cap/);
  });
});

describe('dice, prison and cards', () => {
  it('prison fine and tries are configurable', () => {
    let s = game({ jailFine: 100, jailTries: 1 });
    const me = cur(s);
    s.players.find((p) => p.id === me)!.inJail = true;
    s.players.find((p) => p.id === me)!.position = 10;
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).inJail).toBe(false);
    expect(pl(s, me).cash).toBe(1400);
  });

  it('triple doubles to Prison can be turned off', () => {
    let s = game({ tripleDoublesJail: false });
    const me = cur(s);
    s = act(s, me, { type: 'roll' }, [2, 2]);
    s = act(s, me, { type: 'roll' }, [3, 3]);
    s = act(s, me, { type: 'roll' }, [1, 1]);
    expect(pl(s, me).inJail).toBe(false);
  });

  it('doubles bonus pays out', () => {
    let s = game({ doublesBonus: 50 });
    const me = cur(s);
    s = act(s, me, { type: 'roll' }, [3, 3]); // lands on 6 (unowned)
    expect(pl(s, me).cash).toBe(1550);
  });

  it('fair dice deal every combination once per 36 rolls', () => {
    const s = game({ fairDice: true });
    const seen = new Set<string>();
    const st = structuredClone(s);
    for (let i = 0; i < 36; i++) {
      const next = act(st, cur(st), { type: 'roll' });
      const d = next.turn!.dice!;
      seen.add(d.join());
      Object.assign(st, { diceDeck: next.diceDeck, rng: next.rng });
    }
    expect(seen.size).toBe(36);
  });

  it('speed die bus lets you pick a die', () => {
    let s = game({ speedDie: true });
    const me = cur(s);
    s.stats[me].laps = 1;
    s = act(s, me, { type: 'roll' }, [1, 4], 0, 'bus');
    expect(s.turn!.stage).toBe('bus');
    s = act(s, me, { type: 'busChoice', pick: 0 });
    expect(pl(s, me).position).toBe(1);
  });

  it('speed die triples teleport', () => {
    let s = game({ speedDie: true });
    const me = cur(s);
    s.stats[me].laps = 1;
    s = act(s, me, { type: 'roll' }, [2, 2], 0, 2);
    expect(s.turn!.stage).toBe('teleport');
    s = act(s, me, { type: 'teleportTo', tile: 39 });
    expect(pl(s, me).position).toBe(39);
  });
});

describe('flow and ending', () => {
  it('owner must call rent before the next roll', () => {
    let s = game({ callRent: true });
    const me = cur(s);
    const them = other(s);
    s.properties[3] = own(them);
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).cash).toBe(1500);
    expect(s.rentClaims).toHaveLength(1);
    s = act(s, them, { type: 'collectRent', id: s.rentClaims[0].id });
    expect(pl(s, them).cash).toBe(1504);
  });

  it('uncalled rent expires on the next roll', () => {
    let s = game({ callRent: true });
    const me = cur(s);
    const them = other(s);
    s.properties[3] = own(them);
    s = act(s, me, { type: 'roll' }, [1, 2]);
    s = act(s, me, { type: 'endTurn' });
    s = act(s, them, { type: 'roll' }, [1, 3]);
    expect(s.rentClaims).toHaveLength(0);
  });

  it('second chance revives a player once', () => {
    let s = game({ secondChance: true });
    const me = cur(s);
    s = act(s, me, { type: 'bankrupt' });
    expect(pl(s, me).bankrupt).toBe(false);
    expect(pl(s, me).cash).toBe(300);
    expect(s.phase).toBe('playing');
  });

  it('auction bankruptcy sells cities to everyone', () => {
    let s = game({ bankruptcy: 'auction' }, 3);
    const [a, b] = s.players.map((p) => p.id);
    s.properties[1] = own(a);
    s = act(s, a, { type: 'bankrupt' });
    expect(s.auction?.tile).toBe(1);
    expect(s.auction?.liquidation).toBeTruthy();
    s = act(s, b, { type: 'bid', amount: 40 }, undefined, 100);
    s = act(s, null, { type: 'tick' }, undefined, 1e9);
    expect(s.properties[1].owner).toBe(b);
    expect(s.turn!.playerId).not.toBe(a);
  });

  it('net worth target ends the game', () => {
    let s = game({ winCondition: 'worth', winWorth: 5000 });
    const me = cur(s);
    s.players.find((p) => p.id === me)!.cash = 6000;
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(me);
  });

  it('starting cities are dealt without full sets', () => {
    const s = game({ startingCities: 3 }, 4);
    for (const p of s.players) {
      const owned = Object.values(s.properties).filter((o) => o.owner === p.id).length;
      expect(owned).toBe(3);
      const m = mapOf(s);
      for (const g of Object.values(m.groups)) expect(g.tiles.every((t) => s.properties[t]?.owner === p.id)).toBe(false);
    }
  });

  it('offline skip rule skips the absent player', () => {
    let s = game({ offline: 'skip' });
    const me = cur(s);
    s = applyAction(s, 'p0', { type: 'tick' }, 0);
    s = { ...s, players: s.players.map((p) => (p.id === me ? { ...p, connected: false } : p)) };
    s = act(s, other(s), { type: 'proposeTrade', to: me, give: side({ cash: 1 }), get: side() }, undefined, 1000);
    expect(s.turn!.deadline).toBe(31_000);
    s = act(s, null, { type: 'tick' }, undefined, 31_000);
    expect(s.turn!.playerId).not.toBe(me);
  });

  it('join order keeps lobby order and host can rearrange', () => {
    let s = createGame('T', { id: 'p0', name: 'Ali', color: '' }, 3);
    s = addPlayer(s, { id: 'p1', name: 'Bano', color: '' });
    s = applyAction(s, 'p0', { type: 'settings', settings: { turnOrder: 'host' } }, 0);
    s = applyAction(s, 'p0', { type: 'movePlayer', playerId: 'p1', dir: -1 }, 0);
    s = applyAction(s, 'p0', { type: 'start' }, 0);
    expect(s.turn!.playerId).toBe('p1');
  });

  it('room lock refuses new players', () => {
    let s = createGame('T', { id: 'p0', name: 'Ali', color: '' }, 3);
    s = applyAction(s, 'p0', { type: 'settings', settings: { roomLock: true } }, 0);
    expect(() => addPlayer(s, { id: 'p1', name: 'Bano', color: '' })).toThrow(GameError);
  });

  it('rejects unknown setting values', () => {
    const s = createGame('T', { id: 'p0', name: 'Ali', color: '' }, 3);
    expect(() => applyAction(s, 'p0', { type: 'settings', settings: { rentSpeed: 7 } }, 0)).toThrow(/rentSpeed/);
  });
});
