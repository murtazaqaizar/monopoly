import { describe, expect, it } from 'vitest';
import { addPlayer, applyAction, createGame, GameError, upgradeState } from './engine';
import type { Action, GameState, TradeSide } from './types';

function newGame(n = 2): GameState {
  let s = createGame('TEST', { id: 'a', name: 'Ali', color: '#f43f5e' }, 42);
  const extra = [
    { id: 'b', name: 'Bano', color: '#3b82f6' },
    { id: 'c', name: 'Chand', color: '#22c55e' },
  ];
  for (const p of extra.slice(0, n - 1)) s = addPlayer(s, p);
  s = applyAction(s, 'a', { type: 'start' }, 0);
  return s;
}

const cur = (s: GameState) => s.turn!.playerId;
const pl = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const act = (s: GameState, id: string, a: Action, dice?: [number, number], now = 0) => applyAction(s, id, a, now, { dice });
const other = (s: GameState) => s.players.find((p) => p.id !== cur(s))!.id;

describe('engine', () => {
  it('starts with starting cash and a turn', () => {
    const s = newGame();
    expect(s.phase).toBe('playing');
    expect(s.players.every((p) => p.cash === 1500)).toBe(true);
    expect(s.turn?.stage).toBe('roll');
  });

  it('rejects out-of-turn actions', () => {
    const s = newGame();
    expect(() => act(s, other(s), { type: 'roll' })).toThrow(GameError);
  });

  it('moves, offers buy, and buys', () => {
    let s = newGame();
    const me = cur(s);
    s = act(s, me, { type: 'roll' }, [1, 2]); // to Giza (3)
    expect(pl(s, me).position).toBe(3);
    expect(s.turn!.stage).toBe('buy');
    s = act(s, me, { type: 'buy' });
    expect(s.properties[3].owner).toBe(me);
    expect(pl(s, me).cash).toBe(1440);
    expect(s.turn!.stage).toBe('end');
  });

  it('charges rent, doubled for a full set', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s.properties[1] = { owner: them, houses: 0, mortgaged: false, frozen: 0 };
    s.properties[3] = { owner: them, houses: 0, mortgaged: false, frozen: 0 };
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).cash).toBe(1500 - 8);
    expect(pl(s, them).cash).toBe(1500 + 8);
  });

  it('gives an extra roll on doubles and jails on the third', () => {
    let s = newGame();
    const me = cur(s);
    s = act(s, me, { type: 'roll' }, [2, 2]); // 4 income tax
    expect(s.turn!.stage).toBe('roll');
    s = act(s, me, { type: 'roll' }, [3, 3]); // 10 just visiting
    expect(s.turn!.stage).toBe('roll');
    s = act(s, me, { type: 'roll' }, [1, 1]);
    expect(pl(s, me).inJail).toBe(true);
    expect(pl(s, me).position).toBe(10);
    expect(s.turn!.stage).toBe('end');
  });

  it('pays Start salary when passing', () => {
    let s = newGame();
    const me = cur(s);
    s.players.find((p) => p.id === me)!.position = 38;
    s = act(s, me, { type: 'roll' }, [1, 2]); // 41 -> 1, Cairo
    expect(pl(s, me).position).toBe(1);
    expect(pl(s, me).cash).toBe(1700);
  });

  it('runs an auction when a buy is declined', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s = act(s, me, { type: 'roll' }, [1, 2]);
    s = act(s, me, { type: 'decline' }, undefined, 1000);
    expect(s.auction?.tile).toBe(3);
    s = act(s, them, { type: 'bid', amount: 30 }, undefined, 2000);
    expect(() => act(s, me, { type: 'bid', amount: 30 }, undefined, 2500)).toThrow(GameError);
    s = act(s, me, { type: 'bid', amount: 40 }, undefined, 3000);
    // the top bidder can't raise their own bid
    expect(() => act(s, me, { type: 'bid', amount: 50 }, undefined, 3100)).toThrow(GameError);
    s = act(s, 'server' as string, { type: 'tick' }, undefined, 3000 + 99999);
    expect(s.auction).toBeNull();
    expect(s.properties[3].owner).toBe(me);
    expect(pl(s, me).cash).toBe(1460);
    expect(s.turn!.stage).toBe('end');
  });

  it('enforces even building and needs the full set', () => {
    let s = newGame();
    const me = cur(s);
    s.properties[1] = { owner: me, houses: 0, mortgaged: false, frozen: 0 };
    expect(() => act(s, me, { type: 'build', tile: 1 })).toThrow(/Own all/);
    s.properties[3] = { owner: me, houses: 0, mortgaged: false, frozen: 0 };
    s = act(s, me, { type: 'build', tile: 1 });
    expect(() => act(s, me, { type: 'build', tile: 1 })).toThrow(/evenly/);
    s = act(s, me, { type: 'build', tile: 3 });
    expect(s.properties[1].houses + s.properties[3].houses).toBe(2);
    expect(pl(s, me).cash).toBe(1400);
  });

  it('blocks ending turn while in debt and bankrupts to the creditor', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s.players.find((p) => p.id === me)!.cash = 10;
    s.properties[39] = { owner: them, houses: 5, mortgaged: false, frozen: 0 };
    s.properties[1] = { owner: me, houses: 0, mortgaged: false, frozen: 0 };
    s.players.find((p) => p.id === me)!.position = 36;
    s = act(s, me, { type: 'roll' }, [1, 2]); // 39, hotel rent 2000
    expect(pl(s, me).cash).toBe(-1990);
    expect(() => act(s, me, { type: 'endTurn' })).toThrow(GameError);
    s = act(s, me, { type: 'bankrupt' });
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(them);
    expect(s.properties[1].owner).toBe(them);
  });

  it('keeps a player in jail until doubles or three tries', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s.players.find((p) => p.id === me)!.inJail = true;
    s.players.find((p) => p.id === me)!.position = 10;
    for (let i = 0; i < 2; i++) {
      s = act(s, me, { type: 'roll' }, [1, 2]);
      expect(pl(s, me).inJail).toBe(true);
      s = act(s, me, { type: 'endTurn' });
      s = act(s, them, { type: 'roll' }, [1, 3]);
      if (s.turn!.stage === 'buy') s = act(s, them, { type: 'buy' });
      s = act(s, them, { type: 'endTurn' });
      s.players.find((p) => p.id === them)!.position = 0;
    }
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).inJail).toBe(false);
    expect(pl(s, me).position).toBe(13);
  });

  it('is deterministic for the same seed', () => {
    const run = () => {
      let s = newGame(3);
      for (let i = 0; i < 30 && s.phase === 'playing'; i++) {
        const me = cur(s);
        if (s.turn!.stage === 'roll') s = applyAction(s, me, { type: 'roll' }, i);
        else if (s.turn!.stage === 'buy') s = applyAction(s, me, { type: 'decline' }, i);
        else if (s.turn!.stage === 'auction') s = applyAction(s, null, { type: 'tick' }, i + 1e9);
        else if (pl(s, me).cash < 0) s = applyAction(s, me, { type: 'bankrupt' }, i);
        else s = applyAction(s, me, { type: 'endTurn' }, i);
      }
      return s.log.map((l) => l.text).join('\n');
    };
    expect(run()).toBe(run());
  });
});

function withSettings(patch: Partial<GameState['settings']>): GameState {
  let s = createGame('TEST', { id: 'a', name: 'Ali', color: '#f43f5e' }, 7);
  s = addPlayer(s, { id: 'b', name: 'Bano', color: '#3b82f6' });
  s = applyAction(s, 'a', { type: 'settings', settings: patch }, 0);
  return applyAction(s, 'a', { type: 'start' }, 0);
}
const own = (owner: string, houses = 0) => ({ owner, houses, mortgaged: false, frozen: 0 });
const side = (p: Partial<TradeSide> = {}): TradeSide => ({ cash: 0, tiles: [], jailCards: 0, immunity: null, ...p });
const setPos = (s: GameState, id: string, pos: number) => {
  s.players.find((p) => p.id === id)!.position = pos;
};

describe('trading and loans', () => {
  it('swaps cities and cash on accept', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s.properties[1] = own(me);
    s.properties[3] = own(them);
    s = act(s, me, { type: 'proposeTrade', to: them, give: side({ tiles: [1] }), get: side({ tiles: [3], cash: 100 }) });
    const id = s.offers[0].id;
    expect(() => act(s, me, { type: 'respondOffer', id, accept: true })).toThrow(GameError);
    s = act(s, them, { type: 'respondOffer', id, accept: true });
    expect(s.properties[1].owner).toBe(them);
    expect(s.properties[3].owner).toBe(me);
    expect(pl(s, me).cash).toBe(1600);
    expect(s.offers).toHaveLength(0);
  });

  it('refuses to trade a city whose set has buildings', () => {
    const s = newGame();
    const me = cur(s);
    s.properties[1] = own(me, 1);
    s.properties[3] = own(me, 1);
    expect(() => act(s, me, { type: 'proposeTrade', to: other(s), give: side({ tiles: [1] }), get: side() })).toThrow(/buildings/);
  });

  it('rent immunity skips rent for the agreed turns', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s.properties[3] = own(them);
    s = act(s, them, { type: 'proposeTrade', to: me, give: side({ immunity: { tiles: [3], turns: 1 } }), get: side({ cash: 10 }) });
    s = act(s, me, { type: 'respondOffer', id: s.offers[0].id, accept: true });
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).cash).toBe(1490);
    s = act(s, me, { type: 'endTurn' });
    expect(s.immunities).toHaveLength(0);
  });

  it('player loan is paid back automatically when due', () => {
    let s = newGame();
    const me = cur(s);
    const them = other(s);
    s = act(s, them, { type: 'proposeLoan', to: me, lend: true, amount: 200, repay: 250, turns: 1 });
    s = act(s, me, { type: 'respondOffer', id: s.offers[0].id, accept: true });
    expect(pl(s, me).cash).toBe(1700);
    s = act(s, me, { type: 'roll' }, [1, 3]); // income tax: 10% of net worth (1700 cash - 250 owed)
    s = act(s, me, { type: 'endTurn' });
    expect(pl(s, me).cash).toBe(1700 - 145 - 250);
    expect(pl(s, them).cash).toBe(1300 + 250);
    expect(s.loans).toHaveLength(0);
  });

  it('bank loan charges interest when passing Start', () => {
    let s = newGame();
    const me = cur(s);
    s = act(s, me, { type: 'bankBorrow', amount: 500 });
    expect(() => act(s, me, { type: 'bankBorrow', amount: 500 })).toThrow(/only lend/);
    setPos(s, me, 38);
    s = act(s, me, { type: 'roll' }, [1, 2]); // pass Start, land on the first city
    expect(pl(s, me).cash).toBe(1500 + 500 + 200 - 50);
  });
});

describe('room rules', () => {
  it('turn timer auto-plays a stalled turn', () => {
    let s = withSettings({ turnTimer: 30 });
    const me = cur(s);
    s = applyAction(s, me, { type: 'roll' }, 1000, { dice: [1, 2] });
    expect(s.turn!.stage).toBe('buy');
    expect(s.turn!.deadline).toBe(31_000);
    s = applyAction(s, null, { type: 'tick' }, 31_000);
    expect(s.auction).not.toBeNull();
  });

  it('time limit ends the game on net worth', () => {
    let s = withSettings({ timeLimit: 30 });
    const me = cur(s);
    s.players.find((p) => p.id === me)!.cash = 5000;
    s = applyAction(s, null, { type: 'tick' }, 30 * 60_000);
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(me);
  });

  it('taxes feed the Vacation jackpot', () => {
    let s = withSettings({ jackpot: true });
    const me = cur(s);
    s = act(s, me, { type: 'roll' }, [1, 3]); // income tax: 10% of $1500
    expect(s.pot).toBe(150);
    s = act(s, me, { type: 'endTurn' });
    const them = cur(s);
    setPos(s, them, 16);
    s = act(s, them, { type: 'roll' }, [1, 3]);
    expect(s.pot).toBe(0);
    expect(pl(s, them).cash).toBe(1650);
  });

  it('alliance members pay no rent to each other', () => {
    let s = withSettings({ alliances: true });
    const me = cur(s);
    const them = other(s);
    s.properties[3] = own(them);
    s = act(s, me, { type: 'proposeAlliance', to: them });
    s = act(s, them, { type: 'respondOffer', id: s.offers[0].id, accept: true });
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(pl(s, me).cash).toBe(1500);
    s = act(s, me, { type: 'breakAlliance', id: s.alliances[0].id });
    expect(s.alliances).toHaveLength(0);
  });

  it('mega buildings go past the hotel', () => {
    let s = withSettings({ megaBuildings: true });
    const me = cur(s);
    s.properties[1] = own(me, 5);
    s.properties[3] = own(me, 5);
    s = act(s, me, { type: 'build', tile: 1 });
    expect(s.properties[1].houses).toBe(6);
    expect(pl(s, me).cash).toBe(1400);
  });

  it('sabotage freezes a rival city', () => {
    let s = withSettings({ sabotage: true });
    const me = cur(s);
    const them = other(s);
    s.properties[24] = own(them);
    setPos(s, me, 20);
    s = act(s, me, { type: 'roll' }, [1, 1]);
    expect(s.turn!.stage).toBe('sabotage');
    s = act(s, me, { type: 'sabotage', tile: 24, mode: 'freeze' });
    expect(s.properties[24].frozen).toBe(2);
    expect(s.turn!.stage).toBe('roll');
  });

  it('stock exchange sells shares', () => {
    let s = withSettings({ stockMarket: true });
    const me = cur(s);
    setPos(s, me, 30);
    s = act(s, me, { type: 'roll' }, [1, 2]);
    expect(s.turn!.stage).toBe('stocks');
    s = act(s, me, { type: 'buyShare', group: 'brown' });
    expect(s.shares.brown[me]).toBe(1);
    s = act(s, me, { type: 'skipSpecial' });
    expect(s.turn!.stage).toBe('end');
  });

  it('power-up heist steals cash', () => {
    let s = withSettings({ powerUps: true });
    const me = cur(s);
    const them = other(s);
    s.players.find((p) => p.id === me)!.powerUps = ['heist'];
    s = act(s, me, { type: 'usePowerUp', index: 0, target: them });
    expect(pl(s, me).cash).toBe(1650);
    expect(pl(s, them).cash).toBe(1350);
    expect(pl(s, me).powerUps).toHaveLength(0);
  });

  it('upgrades old saves', () => {
    const old = newGame() as unknown as Record<string, unknown>;
    delete old.alliances;
    delete old.pot;
    const up = upgradeState(old as unknown as GameState);
    expect(up.alliances).toEqual([]);
    expect(up.pot).toBe(0);
  });
});
