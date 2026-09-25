import { MAP_DEFS, boardSizeFor, getMap, specialAt } from './board';
import { deckFor, type Card, type CardTarget } from './cards';
import type {
  Action,
  BoardMap,
  EventKind,
  FxKind,
  GameState,
  Ownership,
  Player,
  PowerUpKind,
  PublicState,
  Settings,
  SpecialState,
  SpeedFace,
  Tile,
  TradeOffer,
  TradeSide,
} from './types';

export const BANK_INTEREST = 0.1;
export const MAX_OPEN_OFFERS = 5;
export const MAX_IMMUNITY_TURNS = 10;
export const MAX_LOAN_TURNS = 20;
export const OFFLINE_TURN_SECONDS = 30;
export const EVENT_EVERY_ROUNDS = 3;
export const MAX_POWER_UPS = 3;
export const MAX_SHARES = 5;
export const INSURANCE_COST = 100;
export const INSURANCE_TURNS = 5;
export const SABOTAGE_TURNS = 2;
export const JET_RANGE = 12;
export const VETO_MS = 10_000;
export const BANK_PER_PLAYER = 5000;
export const OFFLINE_STRIKES = 3;
export const PLAYER_COLORS = [
  '#f43f5e',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#f97316',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#e2e8f0',
];

export const POWER_UPS: Record<PowerUpKind, { name: string; text: string; target?: 'player' | 'tile' }> = {
  shield: { name: 'Shield', text: 'Pay no rent for the rest of this turn.' },
  jet: { name: 'Private Jet', text: `Instead of rolling, fly to any tile up to ${JET_RANGE} ahead.`, target: 'tile' },
  freeze: { name: 'Rent Freeze', text: "A rival's cities collect no rent until their next turn ends.", target: 'player' },
  heist: { name: 'Heist', text: "Steal 10% of a rival's cash ($20-$200).", target: 'player' },
};

export const BUILDING_NAMES = ['', '1 house', '2 houses', '3 houses', '4 houses', 'Hotel', 'Skyscraper', 'Landmark'];

export class GameError extends Error {}

function fail(message: string): never {
  throw new GameError(message);
}

export interface EngineOptions {
  /** Force the next roll. Tests only; the server never passes this. */
  dice?: [number, number];
  /** Force the speed die. Tests only. */
  speed?: SpeedFace;
}

interface Ctx {
  now: number;
  opts: EngineOptions;
}

// ---------- random ----------

function random(s: GameState): number {
  // mulberry32: deterministic from the stored seed, so a game can be replayed from its actions
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function d6(s: GameState) {
  return 1 + Math.floor(random(s) * 6);
}

function pick<T>(s: GameState, items: readonly T[]): T {
  return items[Math.floor(random(s) * items.length)];
}

function shuffle<T>(s: GameState, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Two dice; with Fair dice on, drawn from a shuffled deck of all 36 combinations. */
function rollPair(s: GameState): [number, number] {
  if (!s.settings.fairDice) return [d6(s), d6(s)];
  if (s.diceDeck.length === 0) s.diceDeck = shuffle(s, Array.from({ length: 36 }, (_, i) => i));
  const i = s.diceDeck.pop()!;
  return [Math.floor(i / 6) + 1, (i % 6) + 1];
}

const SPEED_FACES: SpeedFace[] = [1, 2, 3, 'bus', 'bus', 'rocket'];

// ---------- settings ----------

export const DEFAULT_SETTINGS: Settings = {
  mapId: 'classic',
  startingCash: 1500,
  maxPlayers: 6,
  turnTimer: 0,
  timeLimit: 0,
  auctions: true,
  doubleRentSet: true,
  noRentInJail: false,
  jackpot: true,
  immunity: true,
  playerLoans: true,
  bankLoans: true,
  randomEvents: false,
  powerUps: false,
  megaBuildings: false,
  sabotage: false,
  stockMarket: false,
  insurance: false,
  leaderBounty: false,
  miniGames: false,
  wealthTax: false,
  alliances: false,

  turnOrder: 'random',
  roomLock: false,
  spectators: true,
  spectatorChat: true,
  startSalary: 200,
  exactStartDouble: false,
  rentSpeed: 1,
  idleCashTax: false,
  hiddenCash: 'off',
  upkeep: false,
  bankReserve: false,
  mortgages: 'on',
  evenBuild: true,
  buildingStock: 'unlimited',
  firstHouseFree: false,
  auctionTimer: 10,
  auctionOpening: 'one',
  auctionMode: 'open',
  tradeFreeze: 0,
  offersOnTurnOnly: false,
  tradeVeto: false,
  cityCap: 0,
  jailFine: 50,
  jailTries: 3,
  tripleDoublesJail: true,
  speedDie: false,
  fairDice: false,
  doublesBonus: 0,
  deck: 'classic',
  callRent: false,
  catchUp: false,
  offline: 'auto',
  startingCities: 0,
  bankruptcy: 'creditor',
  secondChance: false,
  winCondition: 'last',
  winWorth: 10000,
  winSets: 3,
  boardSize: 'auto',
  specialsOff: [],
};

export const TURN_TIMERS = [0, 30, 60, 90, 120];
export const TIME_LIMITS = [0, 30, 45, 60, 90, 120];

/** Allowed values for every non-boolean setting. */
export const SETTING_CHOICES: Partial<Record<keyof Settings, readonly (string | number)[]>> = {
  startingCash: [1000, 1500, 2000, 2500, 3000],
  maxPlayers: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  turnTimer: TURN_TIMERS,
  timeLimit: TIME_LIMITS,
  turnOrder: ['random', 'join', 'host'],
  startSalary: [200, 300, 400, 500],
  rentSpeed: [0.5, 1, 1.5, 2],
  hiddenCash: ['off', 'ranges', 'hidden'],
  mortgages: ['on', 'interest', 'off'],
  buildingStock: ['unlimited', 'classic', 'tight', 'scarce'],
  auctionTimer: [5, 10, 20],
  auctionOpening: ['one', 'half'],
  auctionMode: ['open', 'sealed'],
  tradeFreeze: [0, 1, 2, 3],
  cityCap: [0, 6, 8, 10],
  jailFine: [50, 100, 200],
  jailTries: [1, 2, 3],
  doublesBonus: [0, 25, 50],
  deck: ['classic', 'party', 'chaos'],
  offline: ['auto', 'skip', 'bankrupt'],
  startingCities: [0, 1, 2, 3],
  bankruptcy: ['creditor', 'auction', 'bank'],
  winCondition: ['last', 'worth', 'sets'],
  winWorth: [5000, 10000, 20000],
  winSets: [2, 3],
  boardSize: ['auto', 'standard', 'large', 'mega'],
};

const PARTY_OFF: Partial<Settings> = {
  randomEvents: false,
  powerUps: false,
  megaBuildings: false,
  sabotage: false,
  stockMarket: false,
  insurance: false,
  leaderBounty: false,
  miniGames: false,
  wealthTax: false,
  alliances: false,
};

/** One-click setups. Map, player count and room options are left alone. */
export const PRESETS: Record<'classic' | 'richup' | 'party' | 'blitz', { name: string; blurb: string; settings: Partial<Settings> }> = {
  classic: {
    name: 'Classic',
    blurb: 'The traditional board game rules',
    settings: {
      ...PARTY_OFF,
      auctions: true,
      doubleRentSet: true,
      jackpot: false,
      noRentInJail: false,
      immunity: false,
      playerLoans: false,
      bankLoans: false,
      rentSpeed: 1,
      startSalary: 200,
      mortgages: 'on',
      evenBuild: true,
      buildingStock: 'classic',
      deck: 'classic',
      speedDie: false,
      startingCities: 0,
      bankruptcy: 'creditor',
      winCondition: 'last',
    },
  },
  richup: {
    name: 'Richup',
    blurb: "Richup's defaults: auctions, x2 sets, vacation cash",
    settings: {
      ...PARTY_OFF,
      auctions: true,
      doubleRentSet: true,
      jackpot: true,
      noRentInJail: false,
      immunity: true,
      playerLoans: false,
      bankLoans: false,
      rentSpeed: 1,
      mortgages: 'on',
      evenBuild: true,
      buildingStock: 'unlimited',
      deck: 'classic',
      speedDie: false,
      bankruptcy: 'creditor',
      winCondition: 'last',
    },
  },
  party: {
    name: 'Party',
    blurb: 'Every fun rule on, chaos deck, second chances',
    settings: {
      randomEvents: true,
      powerUps: true,
      megaBuildings: true,
      sabotage: true,
      stockMarket: true,
      insurance: true,
      leaderBounty: true,
      miniGames: true,
      alliances: true,
      jackpot: true,
      deck: 'chaos',
      speedDie: true,
      catchUp: true,
      secondChance: true,
      startingCities: 1,
    },
  },
  blitz: {
    name: 'Blitz',
    blurb: 'x2 rent, speed die, 30s turns, 30 minute cap',
    settings: {
      rentSpeed: 2,
      speedDie: true,
      turnTimer: 30,
      timeLimit: 30,
      startSalary: 300,
      startingCities: 2,
    },
  },
};

/** Most a player can owe the bank at once. */
export function bankLoanLimit(s: Pick<GameState, 'settings'>): number {
  return Math.floor(s.settings.startingCash / 2);
}

// ---------- setup ----------

export interface NewPlayer {
  id: string;
  name: string;
  color: string;
}

function makePlayer(p: NewPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    cash: 0,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    connected: true,
    debtTo: null,
    bankLoan: 0,
    powerUps: [],
    shield: false,
    frozenTurns: 0,
    insuredTurns: 0,
    reverse: false,
    missed: 0,
    revived: false,
  };
}

function cleanName(name: string): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 16);
  if (!n) fail('Pick a nickname');
  return n;
}

function syncSize(s: GameState) {
  if (s.phase === 'lobby') s.size = boardSizeFor(s.settings.boardSize, s.players.length);
}

export function createGame(code: string, host: NewPlayer, seed: number): GameState {
  const s: GameState = {
    code,
    hostId: host.id,
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS },
    players: [makePlayer({ ...host, name: cleanName(host.name), color: pickColor([], host.color) })],
    properties: {},
    turn: null,
    auction: null,
    lastCard: null,
    winner: null,
    offers: [],
    immunities: [],
    loans: [],
    alliances: [],
    seq: 0,
    round: 1,
    turnNo: 0,
    pot: 0,
    event: null,
    startedAt: null,
    endsAt: null,
    shares: {},
    groupRent: {},
    stats: {},
    biggestRent: null,
    tileRent: {},
    history: [],
    size: 40,
    bank: null,
    stock: null,
    rentClaims: [],
    vetoQueue: [],
    auctionQueue: [],
    freeHouses: [],
    special: blankSpecial(),
    rollSeq: 0,
    log: [],
    logSeq: 0,
    fx: [],
    fxSeq: 0,
    version: 0,
    rng: seed | 0,
    decks: { chance: [], chest: [] },
    diceDeck: [],
  };
  syncSize(s);
  return s;
}

/** Fills fields added by later versions, so saved games from older builds still load. */
export function upgradeState(old: GameState): GameState {
  const s = structuredClone(old);
  const blank = createGame(s.code, { id: 'x', name: 'x', color: '' }, 0);
  for (const key of Object.keys(blank) as (keyof GameState)[]) {
    if (s[key] === undefined) (s as unknown as Record<string, unknown>)[key] = blank[key];
  }
  s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
  const fresh = makePlayer({ id: '', name: '', color: '' });
  s.players = s.players.map((p) => ({ ...fresh, ...p }));
  for (const own of Object.values(s.properties)) own.frozen ??= 0;
  if (s.turn) {
    s.turn.deadline ??= null;
    s.turn.mini ??= null;
    s.turn.speed ??= null;
    s.turn.bonus ??= 0;
    s.turn.travel ??= null;
    s.turn.bribe ??= null;
    s.turn.attacked ??= false;
  }
  s.special = { ...blankSpecial(), ...s.special };
  if (s.auction) {
    s.auction.opening ??= 1;
    s.auction.sealed ??= false;
    s.auction.bids ??= [];
    s.auction.liquidation ??= null;
  }
  return s;
}

function pickColor(players: Player[], wanted: string): string {
  const taken = new Set(players.map((p) => p.color));
  if (PLAYER_COLORS.includes(wanted) && !taken.has(wanted)) return wanted;
  return PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0];
}

export function addPlayer(prev: GameState, p: NewPlayer): GameState {
  if (prev.phase !== 'lobby') fail('This game has already started');
  if (prev.settings.roomLock) fail('The host locked this room');
  if (prev.players.length >= prev.settings.maxPlayers) fail('This room is full');
  const s = structuredClone(prev);
  const name = cleanName(p.name);
  if (s.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) fail('That nickname is taken in this room');
  s.players.push(makePlayer({ id: p.id, name, color: pickColor(s.players, p.color) }));
  syncSize(s);
  s.version++;
  return s;
}

export function removePlayer(prev: GameState, playerId: string): GameState {
  if (prev.phase !== 'lobby') return prev;
  const s = structuredClone(prev);
  s.players = s.players.filter((p) => p.id !== playerId);
  if (s.hostId === playerId && s.players[0]) s.hostId = s.players[0].id;
  syncSize(s);
  s.version++;
  return s;
}

export function setConnected(prev: GameState, playerId: string, connected: boolean, now: number): GameState {
  const p = prev.players.find((x) => x.id === playerId);
  if (!p || p.connected === connected) return prev;
  const s = structuredClone(prev);
  s.players.find((x) => x.id === playerId)!.connected = connected;
  refreshDeadline(prev, s, now);
  s.version++;
  return s;
}

/**
 * What one viewer is allowed to see. Hidden-cash rooms mask other players' balances and
 * worth history, and sealed auctions hide other bids, until the game ends.
 */
export function toPublic(s: GameState, viewer: string | null = null): PublicState {
  const { rng: _rng, decks: _decks, diceDeck: _dice, ...rest } = s;
  const out = rest as PublicState;
  const masking = s.phase === 'playing';
  if (masking && s.settings.hiddenCash !== 'off') {
    out.players = s.players.map((p) => {
      if (p.id === viewer || p.bankrupt) return p;
      if (s.settings.hiddenCash === 'hidden') return { ...p, cash: 0, cashMask: 'hidden' as const };
      const lo = Math.floor(p.cash / 1000) * 1000;
      return { ...p, cash: lo, cashMask: [lo, lo + 1000] as [number, number] };
    });
    out.history = s.history.map((h) => ({ n: h.n, worth: viewer && viewer in h.worth ? { [viewer]: h.worth[viewer] } : {} }));
  }
  if (masking && s.auction?.sealed) {
    out.auction = { ...s.auction, bids: s.auction.bids.map((b) => (b.pid === viewer ? b : { pid: b.pid, amount: -1 })) };
  }
  return out;
}

/** When the server must dispatch a `tick` next, or null. */
export function nextDeadline(s: GameState): number | null {
  if (s.phase !== 'playing') return null;
  const times = [
    s.auction?.endsAt,
    s.auction ? null : s.turn?.deadline,
    s.endsAt,
    ...s.vetoQueue.map((v) => v.executeAt),
    s.special?.vote?.endsAt,
    s.special?.match?.endsAt,
  ].filter((t): t is number => typeof t === 'number');
  return times.length ? Math.min(...times) : null;
}

// ---------- queries (also used by the client) ----------

type View = Pick<
  GameState,
  'settings' | 'properties' | 'players' | 'event' | 'loans' | 'shares' | 'groupRent' | 'round' | 'size' | 'special'
>;

export function mapOf(s: Pick<GameState, 'settings' | 'size'>): BoardMap {
  return getMap(s.settings.mapId, s.size);
}

export function tileOf(s: Pick<GameState, 'settings' | 'size'>, index: number): Tile {
  return mapOf(s).tiles[index];
}

export function ownsGroup(s: Pick<GameState, 'settings' | 'size' | 'properties'>, playerId: string, group: string): boolean {
  return mapOf(s).groups[group].tiles.every((i) => s.properties[i]?.owner === playerId);
}

export function maxBuildings(s: Pick<GameState, 'settings'>): number {
  return s.settings.megaBuildings ? 7 : 5;
}

/** Rent table including skyscraper and landmark tiers. */
export function rentTable(tile: Tile): number[] {
  const r = tile.rents ?? [];
  return [...r, Math.round((r[5] * 1.5) / 10) * 10, Math.round((r[5] * 2.2) / 10) * 10];
}

/** Cost of the next building; skyscraper and landmark cost double. */
export function buildCost(tile: Tile, currentHouses: number): number {
  return (tile.houseCost ?? 0) * (currentHouses >= 5 ? 2 : 1);
}

export function citiesOwned(s: Pick<GameState, 'properties'>, pid: string): number {
  return Object.values(s.properties).filter((o) => o.owner === pid).length;
}

export function rentFor(s: View, index: number, diceSum: number, mod: LandMod = {}): number {
  const own = s.properties[index];
  if (!own || own.mortgaged || own.frozen > 0) return 0;
  const owner = s.players.find((p) => p.id === own.owner);
  if (!owner || owner.frozenTurns > 0) return 0;
  if (s.settings.noRentInJail && owner.inJail) return 0;
  const map = mapOf(s);
  const tile = map.tiles[index];
  let rent = 0;
  if (tile.kind === 'property') {
    if (own.houses > 0) rent = rentTable(tile)[own.houses];
    else rent = tile.rents![0] * (s.settings.doubleRentSet && ownsGroup(s, own.owner, tile.group!) ? 2 : 1);
  } else if (tile.kind === 'airport') {
    const n = map.airports.filter((i) => s.properties[i]?.owner === own.owner).length;
    rent = 25 * 2 ** (n - 1) * (mod.airportDouble ? 2 : 1);
  } else if (tile.kind === 'utility') {
    const n = map.utilities.filter((i) => s.properties[i]?.owner === own.owner).length;
    rent = (n >= 2 || mod.utilityTen ? 10 : 4) * diceSum;
  }
  if (s.event?.kind === 'crash') rent = rent / 2;
  if (s.event?.kind === 'surge') rent = rent * 1.5;
  rent *= specialRentFactor(s, index);
  return Math.floor(rent * s.settings.rentSpeed);
}

export function mortgageValue(tile: Tile): number {
  return Math.floor((tile.price ?? 0) / 2);
}

export function unmortgageCost(tile: Tile): number {
  return Math.ceil(mortgageValue(tile) * 1.1);
}

export function sharePrice(s: Pick<GameState, 'settings' | 'size' | 'groupRent'>, group: string): number {
  const map = mapOf(s);
  const base = map.groups[group].tiles.reduce((sum, i) => sum + (map.tiles[i].price ?? 0), 0) / 10;
  return Math.round(base + (s.groupRent[group] ?? 0) * 0.05);
}

export function netWorth(s: View, p: Player): number {
  if (p.bankrupt) return 0;
  let total = p.cash - p.bankLoan;
  for (const l of s.loans) {
    if (l.borrower === p.id) total -= l.repay;
    if (l.lender === p.id) total += l.repay;
  }
  for (const [idx, own] of Object.entries(s.properties)) {
    if (own.owner !== p.id) continue;
    const tile = tileOf(s, Number(idx));
    total += own.mortgaged ? 0 : mortgageValue(tile);
    for (let h = 0; h < own.houses; h++) total += Math.floor(buildCost(tile, h) / 2);
  }
  for (const [group, holders] of Object.entries(s.shares)) total += (holders[p.id] ?? 0) * sharePrice(s, group);
  return total;
}

export function wealthTaxRate(s: Pick<GameState, 'round'>): number {
  return Math.min(0.15, 0.05 + 0.01 * Math.floor(s.round / 5));
}

export function taxFor(s: View, p: Player, tile: Tile): number {
  if (s.event?.kind === 'taxHoliday') return 0;
  if (!s.settings.wealthTax) return tile.tax ?? 0;
  return Math.max(tile.tax ?? 0, Math.round(netWorth(s, p) * wealthTaxRate(s)));
}

export function allianceBetween(s: Pick<GameState, 'alliances'>, a: string, b: string) {
  return s.alliances.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) ?? null;
}

export function fullSetsOwned(s: Pick<GameState, 'settings' | 'size' | 'properties'>, pid: string): number {
  return Object.keys(mapOf(s).groups).filter((g) => ownsGroup(s, pid, g)).length;
}

// ---------- internals ----------

function log(s: GameState, ctx: Ctx, text: string) {
  s.log.push({ id: s.logSeq++, at: ctx.now, text });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

function fx(s: GameState, kind: FxKind, pid: string | null = null, extra: { tile?: number; amount?: number } = {}) {
  s.fx.push({ id: ++s.fxSeq, kind, pid, ...extra });
  if (s.fx.length > 30) s.fx.splice(0, s.fx.length - 30);
}

function player(s: GameState, id: string | null): Player {
  const p = s.players.find((x) => x.id === id);
  if (!p) fail('You are not in this game');
  return p;
}

function current(s: GameState): Player {
  return player(s, s.turn!.playerId);
}

function requireTurn(s: GameState, playerId: string | null, stage?: string): Player {
  if (s.phase !== 'playing' || !s.turn) fail('The game is not running');
  if (s.turn.playerId !== playerId) fail("It's not your turn");
  if (stage && s.turn.stage !== stage) fail("You can't do that right now");
  return current(s);
}

function requirePlaying(s: GameState, playerId: string | null): Player {
  if (s.phase !== 'playing') fail('The game is not running');
  const p = player(s, playerId);
  if (p.bankrupt) fail('You are out of the game');
  return p;
}

function money(n: number) {
  return `$${n}`;
}

function stat(s: GameState, id: string) {
  return (s.stats[id] ??= { rentPaid: 0, rentReceived: 0, spent: 0, laps: 0 });
}

function alive(s: GameState) {
  return s.players.filter((p) => !p.bankrupt);
}

interface PayOpts {
  /** fines and taxes feed the Vacation jackpot when it's on */
  toPot?: boolean;
  spent?: boolean;
}

function pay(s: GameState, ctx: Ctx, from: Player, to: Player | null, amount: number, reason: string, opts: PayOpts = {}) {
  amount = Math.ceil(amount);
  if (amount <= 0) return;
  from.cash -= amount;
  if (to) to.cash += amount;
  else if (opts.toPot && s.settings.jackpot) s.pot += amount;
  else if (s.bank !== null) s.bank += amount;
  if (from.cash < 0) from.debtTo = to ? to.id : null;
  if (opts.spent) stat(s, from.id).spent += amount;
  log(s, ctx, `${from.name} paid ${money(amount)} ${to ? `to ${to.name}` : ''} ${reason}`.replace(/\s+/g, ' ').trim());
}

/** Money from the bank. With a bank reserve it pays only what's left; returns what was paid. */
function collect(s: GameState, ctx: Ctx, p: Player, amount: number, reason: string, fromBank = true): number {
  amount = Math.floor(amount);
  if (fromBank && s.bank !== null) amount = Math.min(amount, Math.max(0, s.bank));
  if (amount <= 0) {
    if (fromBank && s.bank !== null) log(s, ctx, `The bank is empty: ${p.name} gets nothing ${reason}`.trim());
    return 0;
  }
  if (fromBank && s.bank !== null) s.bank -= amount;
  p.cash += amount;
  if (p.cash >= 0) p.debtTo = null;
  log(s, ctx, `${p.name} collected ${money(amount)} ${reason}`.trim());
  return amount;
}

function passStart(s: GameState, ctx: Ctx, p: Player, exact: boolean) {
  stat(s, p.id).laps++;
  const set = s.settings;
  let salary = set.startSalary * (s.event?.kind === 'boom' ? 2 : 1) * (exact && set.exactStartDouble ? 2 : 1);
  let note = exact && set.exactStartDouble ? 'for landing right on Start' : 'for passing Start';
  if (specialOn(s, 'world.oil') && s.special.oil > 0) {
    salary = Math.max(0, salary - 50);
    note += ' (oil crisis: -$50)';
  }
  if (set.leaderBounty) {
    const ranked = alive(s)
      .map((x) => ({ x, w: netWorth(s, x) }))
      .sort((a, b) => b.w - a.w);
    if (ranked.length > 1 && ranked[0].x.id === p.id && ranked[0].w > ranked[1].w) {
      salary = Math.floor(salary / 2);
      note += ' (halved: leader bounty)';
    } else if (ranked.length > 1 && ranked[ranked.length - 1].x.id === p.id) {
      salary += 100;
      note += ' (+$100 catch-up bonus)';
    }
  }
  collect(s, ctx, p, salary, note);
  fx(s, 'start', p.id, { amount: salary });
  if (p.bankLoan > 0) pay(s, ctx, p, null, Math.ceil(p.bankLoan * BANK_INTEREST), 'in bank loan interest');
  if (set.idleCashTax) {
    const limit = set.startingCash * 2;
    if (p.cash > limit) pay(s, ctx, p, null, Math.ceil((p.cash - limit) * 0.05), 'in idle cash tax', { toPot: true });
  }
  if (set.upkeep || set.mortgages === 'interest') {
    let upkeep = 0;
    let interest = 0;
    for (const [idx, own] of Object.entries(s.properties)) {
      if (own.owner !== p.id) continue;
      if (own.houses >= 6) upkeep += 80;
      else if (own.houses === 5) upkeep += 40;
      else upkeep += own.houses * 10;
      if (own.mortgaged) interest += Math.ceil(mortgageValue(tileOf(s, Number(idx))) * 0.05);
    }
    if (set.upkeep && upkeep) pay(s, ctx, p, null, upkeep, 'in building upkeep', { toPot: true });
    if (set.mortgages === 'interest' && interest) pay(s, ctx, p, null, interest, 'in mortgage interest');
  }
  if (set.powerUps && p.powerUps.length < MAX_POWER_UPS) {
    const kind = pick(s, Object.keys(POWER_UPS) as PowerUpKind[]);
    p.powerUps.push(kind);
    fx(s, 'powerPickup', p.id);
    log(s, ctx, `${p.name} picked up a ${POWER_UPS[kind].name} power-up`);
  }
  specialLap(s, ctx, p);
}

function sendToJail(s: GameState, ctx: Ctx, p: Player) {
  p.position = mapOf(s).jail;
  p.inJail = true;
  p.jailTurns = 0;
  if (s.turn?.playerId === p.id) s.turn.extraRoll = false;
  fx(s, 'jail', p.id);
  log(s, ctx, `${p.name} was sent to Prison`);
}

interface LandMod {
  airportDouble?: boolean;
  utilityTen?: boolean;
}

function moveBy(s: GameState, ctx: Ctx, p: Player, steps: number) {
  const n = s.size;
  const from = p.position;
  const to = (((from + steps) % n) + n) % n;
  if (steps > 0 && to < from) passStart(s, ctx, p, to === 0);
  p.position = to;
  land(s, ctx, p, {});
}

function moveTo(s: GameState, ctx: Ctx, p: Player, to: number, mod: LandMod = {}) {
  if (to < p.position || (to === 0 && p.position !== 0)) passStart(s, ctx, p, to === 0);
  p.position = to;
  land(s, ctx, p, mod);
}

/** Final rent once everything that can lower it is applied, or null when nothing is owed. */
function rentDue(s: GameState, ctx: Ctx, p: Player, tile: Tile, own: Ownership, mod: LandMod): number | null {
  if (own.mortgaged) return log(s, ctx, `${tile.name} is mortgaged, no rent`), null;
  if (own.frozen > 0) return log(s, ctx, `${tile.name} is sabotaged, no rent`), null;
  const owner = player(s, own.owner);
  if (allianceBetween(s, p.id, owner.id)) return log(s, ctx, `${p.name} and ${owner.name} are allies, no rent`), null;
  if (s.immunities.some((im) => im.holder === p.id && im.owner === own.owner && im.tiles.includes(tile.index)))
    return log(s, ctx, `${p.name} has rent immunity on ${tile.name}`), null;
  const dice = s.turn?.dice ?? [3, 4];
  let rent = rentFor(s, tile.index, dice[0] + dice[1], mod);
  if (rent <= 0) return log(s, ctx, `No rent due on ${tile.name}`), null;
  if (p.shield) {
    fx(s, 'shield', p.id);
    return log(s, ctx, `${p.name}'s shield blocked ${money(rent)} rent on ${tile.name}`), null;
  }
  if (s.settings.catchUp) {
    const worths = alive(s).map((x) => ({ x, w: netWorth(s, x) }));
    const min = Math.min(...worths.map((w) => w.w));
    const lowest = worths.filter((w) => w.w === min);
    if (worths.length > 1 && lowest.length === 1 && lowest[0].x.id === p.id) rent = Math.ceil(rent * 0.75);
  }
  return rent;
}

/** Moves rent from payer to owner and does the bookkeeping (insurance, stats, dividends). */
function settleRent(s: GameState, ctx: Ctx, p: Player, owner: Player, tile: Tile, rent: number) {
  let share = rent;
  if (p.insuredTurns > 0 && rent > 100) {
    // insurance pays half of big rents
    share = Math.ceil(rent / 2);
    collect(s, ctx, owner, rent - share, `from ${p.name}'s insurance`);
  }
  pay(s, ctx, p, owner, share, `in rent for ${tile.name}`);
  fx(s, 'rent', p.id, { tile: tile.index, amount: share });
  stat(s, p.id).rentPaid += rent;
  stat(s, owner.id).rentReceived += rent;
  s.tileRent[tile.index] = (s.tileRent[tile.index] ?? 0) + rent;
  if (!s.biggestRent || rent > s.biggestRent.amount) s.biggestRent = { amount: rent, payer: p.id, owner: owner.id, tile: tile.index };
  if (tile.group) {
    s.groupRent[tile.group] = (s.groupRent[tile.group] ?? 0) + rent;
    // shareholders get a dividend of 10% of the rent per share, paid by the bank
    for (const [holder, n] of Object.entries(s.shares[tile.group] ?? {})) {
      const h = s.players.find((x) => x.id === holder && !x.bankrupt);
      if (h && n > 0 && h.id !== p.id) collect(s, ctx, h, Math.ceil(rent * 0.1 * n), 'in dividends');
    }
  }
}

function chargeRent(s: GameState, ctx: Ctx, p: Player, tile: Tile, own: Ownership, mod: LandMod) {
  const rent = rentDue(s, ctx, p, tile, own, mod);
  if (rent === null) return;
  const owner = player(s, own.owner);
  if (s.settings.callRent) {
    // the owner has until the next roll to notice and collect
    s.rentClaims.push({ id: ++s.seq, payer: p.id, owner: owner.id, amount: rent, tile: tile.index, roll: s.rollSeq });
    fx(s, 'claim', owner.id);
    log(s, ctx, `${p.name} landed on ${owner.name}'s ${tile.name}. ${owner.name} can call ${money(rent)} rent`);
    return;
  }
  settleRent(s, ctx, p, owner, tile, rent);
}

function land(s: GameState, ctx: Ctx, p: Player, mod: LandMod) {
  const map = mapOf(s);
  const tile = map.tiles[p.position];
  const special = specialAt(s.settings, map, tile.index);
  specialLanding(s, ctx, p, tile);
  if (special === 'sabotage') {
    const targets = Object.entries(s.properties).filter(([, o]) => o.owner !== p.id && !o.mortgaged);
    if (targets.length) s.turn!.stage = 'sabotage';
    else log(s, ctx, 'Nothing to sabotage');
    return;
  }
  if (special === 'stocks') {
    s.turn!.stage = 'stocks';
    return;
  }
  if (special === 'arcade') {
    s.turn!.stage = 'minigame';
    s.turn!.mini = { shown: d6(s) };
    return;
  }
  switch (tile.kind) {
    case 'property':
    case 'airport':
    case 'utility': {
      const own = s.properties[tile.index];
      if (!own) {
        s.turn!.stage = 'buy';
        s.turn!.pendingTile = tile.index;
        return;
      }
      if (own.owner !== p.id) chargeRent(s, ctx, p, tile, own, mod);
      return;
    }
    case 'tax': {
      const tax = taxFor(s, p, tile);
      if (tax > 0 && specialOn(s, 'pk.bribe') && s.turn?.playerId === p.id && p.cash >= 50) {
        s.turn.stage = 'bribe';
        s.turn.bribe = { kind: 'tax', tile: tile.index };
        return;
      }
      if (tax > 0) {
        pay(s, ctx, p, null, tax, `for ${tile.name}`, { toPot: true });
        fx(s, 'tax', p.id, { tile: tile.index, amount: tax });
      } else log(s, ctx, `Tax holiday: ${p.name} pays no ${tile.name}`);
      return;
    }
    case 'parking':
      if (s.settings.jackpot && s.pot > 0) {
        const won = s.pot;
        collect(s, ctx, p, won, 'from the Vacation jackpot', false);
        s.pot = 0;
        fx(s, 'jackpot', p.id, { amount: won });
      }
      return;
    case 'chance':
    case 'chest':
      drawCard(s, ctx, p, tile.kind);
      return;
    case 'gotojail':
      if (specialOn(s, 'pk.bribe') && s.turn?.playerId === p.id && p.cash >= 50) {
        s.turn.stage = 'bribe';
        s.turn.bribe = { kind: 'jail', tile: tile.index };
        return;
      }
      sendToJail(s, ctx, p);
      return;
    default:
      return;
  }
}

function resolveTarget(map: BoardMap, t: CardTarget): number {
  if (t.kind === 'start') return 0;
  if (t.kind === 'airport') return map.airports[t.n] ?? map.airports[0];
  const tiles = map.groups[t.group]?.tiles ?? [];
  return (t.pick === 'first' ? tiles[0] : tiles[tiles.length - 1]) ?? 0;
}

/** Cities that can change hands without breaking the "sell buildings first" rule. */
function bareCities(s: GameState, pid: string): number[] {
  const map = mapOf(s);
  return Object.entries(s.properties)
    .filter(([idx, o]) => {
      if (o.owner !== pid) return false;
      const t = map.tiles[Number(idx)];
      return !t.group || map.groups[t.group].tiles.every((g) => (s.properties[g]?.houses ?? 0) === 0);
    })
    .map(([idx]) => Number(idx));
}

function drawCard(s: GameState, ctx: Ctx, p: Player, deck: 'chance' | 'chest') {
  const map = mapOf(s);
  const cards = deckFor(deck, s.settings.deck);
  if (s.decks[deck].length === 0 || s.decks[deck].some((i) => i >= cards.length))
    s.decks[deck] = shuffle(s, cards.map((_, i) => i));
  const idx = s.decks[deck].shift()!;
  s.decks[deck].push(idx);
  const card: Card = cards[idx];
  const e = card.effect;
  const target = e.kind === 'moveTo' ? resolveTarget(map, e.target) : null;
  const text = card.text.replace('{tile}', target !== null ? map.tiles[target].name : '');
  s.lastCard = { deck, text, playerId: p.id, at: ctx.now };
  fx(s, deck, p.id);
  log(s, ctx, `${p.name} drew: ${text}`);
  const others = alive(s).filter((o) => o.id !== p.id);
  switch (e.kind) {
    case 'money':
      if (e.amount > 0) collect(s, ctx, p, e.amount, '');
      else pay(s, ctx, p, null, -e.amount, '', { toPot: true });
      return;
    case 'moveTo':
      moveTo(s, ctx, p, target!);
      return;
    case 'moveBy':
      if (e.steps < 0) {
        p.position = (p.position + e.steps + s.size) % s.size;
        land(s, ctx, p, {});
      } else moveBy(s, ctx, p, e.steps);
      return;
    case 'jail':
      sendToJail(s, ctx, p);
      return;
    case 'jailCard':
      p.jailCards++;
      return;
    case 'eachPlayer':
      for (const o of others) {
        if (e.amount > 0) pay(s, ctx, o, p, e.amount, '');
        else pay(s, ctx, p, o, -e.amount, '');
      }
      return;
    case 'repairs': {
      let cost = 0;
      for (const own of Object.values(s.properties)) {
        if (own.owner !== p.id) continue;
        cost += own.houses >= 5 ? e.hotel : own.houses * e.house;
      }
      pay(s, ctx, p, null, cost, 'for repairs', { toPot: true });
      return;
    }
    case 'nearest': {
      const list = e.target === 'airport' ? map.airports : map.utilities;
      const to = list.find((i) => i > p.position) ?? list[0];
      moveTo(s, ctx, p, to, e.target === 'airport' ? { airportDouble: true } : { utilityTen: true });
      return;
    }
    case 'percentFromEach':
      for (const o of others) if (o.cash > 0) pay(s, ctx, o, p, Math.ceil((o.cash * e.pct) / 100), '');
      return;
    case 'payPercent':
      if (p.cash > 0) pay(s, ctx, p, null, Math.ceil((p.cash * e.pct) / 100), '', { toPot: true });
      return;
    case 'everyone':
      for (const o of alive(s)) collect(s, ctx, o, e.amount, '');
      return;
    case 'halfJackpot': {
      const half = Math.floor(s.pot / 2);
      if (half > 0) {
        s.pot -= half;
        collect(s, ctx, p, half, 'from the jackpot', false);
        fx(s, 'jackpot', p.id, { amount: half });
      }
      return;
    }
    case 'freeHouse': {
      const spot = Object.keys(map.groups)
        .filter((g) => ownsGroup(s, p.id, g) && map.groups[g].tiles.every((i) => !s.properties[i].mortgaged))
        .flatMap((g) => map.groups[g].tiles)
        .filter((i) => s.properties[i].houses < maxBuildings(s))
        .sort((a, b) => s.properties[a].houses - s.properties[b].houses)[0];
      if (spot === undefined || !takeStock(s, s.properties[spot].houses)) {
        collect(s, ctx, p, 100, 'instead (nowhere to build)');
        return;
      }
      s.properties[spot].houses++;
      fx(s, 'build', p.id, { tile: spot });
      log(s, ctx, `${p.name} got a free building on ${map.tiles[spot].name}`);
      return;
    }
    case 'swapPlaces': {
      const pool = others.filter((o) => !o.inJail);
      if (!pool.length || p.inJail) return;
      const o = pick(s, pool);
      [p.position, o.position] = [o.position, p.position];
      fx(s, 'chaos', p.id);
      log(s, ctx, `${p.name} and ${o.name} swapped places`);
      return;
    }
    case 'stealCity': {
      const pool = others.flatMap((o) => bareCities(s, o.id));
      if (!pool.length) return log(s, ctx, 'Nothing to steal');
      const i = pick(s, pool);
      const from = player(s, s.properties[i].owner);
      s.properties[i].owner = p.id;
      s.properties[i].frozen = 0;
      fx(s, 'chaos', p.id);
      log(s, ctx, `${p.name} took ${map.tiles[i].name} from ${from.name}`);
      grantFreeHouses(s, ctx, p.id);
      return;
    }
    case 'allBack':
      for (const o of alive(s)) if (!o.inJail) o.position = (o.position - e.steps + s.size) % s.size;
      fx(s, 'chaos', p.id);
      return;
    case 'reverse':
      p.reverse = true;
      return;
    case 'giftPoorest': {
      const mine = bareCities(s, p.id).sort((a, b) => (map.tiles[a].price ?? 0) - (map.tiles[b].price ?? 0));
      const poorest = [...others].sort((a, b) => netWorth(s, a) - netWorth(s, b))[0];
      if (!mine.length || !poorest) return log(s, ctx, 'Robin Hood found nothing to give');
      s.properties[mine[0]].owner = poorest.id;
      fx(s, 'chaos', p.id);
      log(s, ctx, `${p.name} gave ${map.tiles[mine[0]].name} to ${poorest.name}`);
      grantFreeHouses(s, ctx, poorest.id);
      return;
    }
  }
}

// ---------- building stock ----------

/** Takes the stock needed to go from `level` to `level + 1`; false when the bank is out. */
function takeStock(s: GameState, level: number): boolean {
  const st = s.stock;
  if (!st) return true;
  if (level < 4) {
    if (st.houses < 1) return false;
    st.houses--;
  } else if (level === 4) {
    if (st.hotels < 1) return false;
    st.hotels--;
    st.houses += 4;
  } else {
    if (st.mega < 1) return false;
    st.mega--;
    if (level === 5) st.hotels++;
  }
  return true;
}

/** Returns stock for dropping from `level` to `level - 1`. Returns the level the city actually ends on. */
function returnStock(s: GameState, level: number): number {
  const st = s.stock;
  if (!st) return level - 1;
  if (level <= 4) {
    st.houses++;
    return level - 1;
  }
  if (level === 5) {
    // a hotel breaks back into 4 houses only if the bank has them
    st.hotels++;
    if (st.houses >= 4) {
      st.houses -= 4;
      return 4;
    }
    return 0;
  }
  st.mega++;
  if (level === 6 && st.hotels > 0) st.hotels--;
  return level - 1;
}

function initialStock(s: GameState): GameState['stock'] {
  const n = s.players.length;
  const mega = Math.ceil(n / 2);
  switch (s.settings.buildingStock) {
    case 'classic':
      return { houses: Math.round(32 * Math.max(1, n / 6)), hotels: Math.round(12 * Math.max(1, n / 6)), mega };
    case 'tight':
      return { houses: 4 * n, hotels: Math.ceil(1.5 * n), mega };
    case 'scarce':
      return { houses: 2 * n, hotels: n, mega };
    default:
      return null;
  }
}

/** First-house-free rule: completing a set drops a house on its cheapest city, once per set. */
function grantFreeHouses(s: GameState, ctx: Ctx, pid: string) {
  if (!s.settings.firstHouseFree) return;
  const map = mapOf(s);
  for (const [g, group] of Object.entries(map.groups)) {
    if (s.freeHouses.includes(g) || !ownsGroup(s, pid, g)) continue;
    if (group.tiles.some((i) => s.properties[i].mortgaged)) continue;
    const cheapest = [...group.tiles].sort((a, b) => (map.tiles[a].price ?? 0) - (map.tiles[b].price ?? 0))[0];
    if (s.properties[cheapest].houses > 0 || !takeStock(s, 0)) continue;
    s.properties[cheapest].houses = 1;
    s.freeHouses.push(g);
    fx(s, 'build', pid, { tile: cheapest });
    log(s, ctx, `Full set! ${player(s, pid).name} gets a free house on ${map.tiles[cheapest].name}`);
  }
}

// ---------- turn flow ----------

const PENDING_STAGES = new Set(['buy', 'sabotage', 'stocks', 'minigame', 'bus', 'teleport', 'travel', 'bribe']);

/** Called once the current landing is fully resolved. */
function finishStep(s: GameState, ctx: Ctx) {
  const p = current(s);
  if (p.bankrupt) {
    advanceTurn(s, ctx);
    return;
  }
  s.turn!.pendingTile = null;
  s.turn!.mini = null;
  // a flight or train ride is offered once the landing itself is settled
  if (s.turn!.travel && !p.inJail && mapOf(s).airports.includes(p.position)) {
    s.turn!.stage = 'travel';
    return;
  }
  s.turn!.travel = null;
  s.turn!.stage = s.turn!.extraRoll && !p.inJail ? 'roll' : 'end';
}

function afterMove(s: GameState, ctx: Ctx) {
  if (!PENDING_STAGES.has(s.turn!.stage)) finishStep(s, ctx);
}

/** Deals that count the ending player's turns tick down here. */
function endOfTurn(s: GameState, ctx: Ctx, p: Player) {
  p.shield = false;
  if ((s.special.ups[p.id] ?? 0) > 0) s.special.ups[p.id]--;
  if (p.frozenTurns > 0) p.frozenTurns--;
  if (p.insuredTurns > 0) p.insuredTurns--;
  for (const own of Object.values(s.properties)) if (own.owner === p.id && own.frozen > 0) own.frozen--;
  for (const im of s.immunities) if (im.holder === p.id) im.turnsLeft--;
  s.immunities = s.immunities.filter((im) => im.turnsLeft > 0);
  for (const loan of s.loans) {
    if (loan.borrower !== p.id) continue;
    loan.turnsLeft--;
    if (loan.turnsLeft <= 0) {
      const lender = s.players.find((x) => x.id === loan.lender && !x.bankrupt) ?? null;
      pay(s, ctx, p, lender, loan.repay, 'to repay a loan');
    }
  }
  s.loans = s.loans.filter((l) => l.turnsLeft > 0);
}

function recordWorth(s: GameState) {
  const worth: Record<string, number> = {};
  for (const p of s.players) worth[p.id] = netWorth(s, p);
  s.history.push({ n: s.turnNo, worth });
  // keep the chart light: thin out old points once it gets long
  if (s.history.length > 300) s.history = s.history.filter((_, i) => i % 2 === 0 || i > 250);
}

const EVENTS: { kind: EventKind; text: string; rounds: number }[] = [
  { kind: 'boom', text: 'Economic boom! Passing Start pays double this round.', rounds: 1 },
  { kind: 'crash', text: 'Market crash! All rents are halved this round.', rounds: 1 },
  { kind: 'surge', text: 'Tourist season! All rents are up 50% this round.', rounds: 1 },
  { kind: 'taxHoliday', text: 'Tax holiday! No taxes this round.', rounds: 1 },
  { kind: 'stimulus', text: 'Stimulus cheque! Everyone gets $100.', rounds: 0 },
  { kind: 'earthquake', text: 'Earthquake!', rounds: 0 },
  { kind: 'audit', text: 'Surprise audit! Everyone pays 10% of their cash.', rounds: 0 },
];

function fireEvent(s: GameState, ctx: Ctx) {
  const ev = pick(s, EVENTS);
  let text = ev.text;
  if (ev.kind === 'stimulus') for (const p of alive(s)) collect(s, ctx, p, 100, 'from the stimulus');
  if (ev.kind === 'audit')
    for (const p of alive(s)) if (p.cash > 0) pay(s, ctx, p, null, Math.ceil(p.cash * 0.1), 'to the audit', { toPot: true });
  if (ev.kind === 'earthquake') {
    const group = pick(s, Object.values(mapOf(s).groups));
    let hit = 0;
    for (const i of group.tiles) {
      const own = s.properties[i];
      if (own && own.houses > 0) {
        own.houses = returnStock(s, own.houses);
        hit++;
      }
    }
    text = `Earthquake in ${group.name}! ${hit ? 'Every city there loses a building.' : 'Luckily nothing was built there.'}`;
  }
  s.event = { kind: ev.kind, text, roundsLeft: ev.rounds, at: ctx.now };
  s.lastCard = { deck: 'event', text, playerId: s.turn!.playerId, at: ctx.now };
  fx(s, 'event');
  log(s, ctx, text);
}

function newTurn(pid: string): GameState['turn'] {
  return {
    playerId: pid,
    stage: 'roll',
    dice: null,
    doubles: 0,
    extraRoll: false,
    pendingTile: null,
    deadline: null,
    mini: null,
    speed: null,
    bonus: 0,
    travel: null,
    bribe: null,
    attacked: false,
  };
}

function advanceTurn(s: GameState, ctx: Ctx) {
  const order = s.players;
  const ending = order.find((p) => p.id === s.turn!.playerId);
  if (ending && !ending.bankrupt) endOfTurn(s, ctx, ending);
  const start = order.findIndex((p) => p.id === s.turn!.playerId);
  for (let k = 1; k <= order.length * 2; k++) {
    const idx = (start + k) % order.length;
    const next = order[idx];
    if (next.bankrupt) continue;
    // lockdown: sit this turn out
    if ((s.special.skip[next.id] ?? 0) > 0 && k <= order.length) {
      s.special.skip[next.id]--;
      log(s, ctx, `${next.name} sits out a turn in lockdown`);
      continue;
    }
    s.turnNo++;
    recordWorth(s);
    s.turn = newTurn(next.id);
    if (start + k >= order.length) newRound(s, ctx);
    return;
  }
}

function newRound(s: GameState, ctx: Ctx) {
  s.round++;
  if (s.event) {
    s.event.roundsLeft--;
    if (s.event.roundsLeft <= 0) s.event = null;
  }
  if (s.settings.randomEvents && s.round % EVENT_EVERY_ROUNDS === 0) fireEvent(s, ctx);
  specialRound(s, ctx);
}

function endGame(s: GameState, ctx: Ctx, winner: Player, reason: string) {
  s.phase = 'ended';
  s.winner = winner.id;
  s.auction = null;
  s.auctionQueue = [];
  s.offers = [];
  s.vetoQueue = [];
  s.rentClaims = [];
  if (s.turn) s.turn.deadline = null;
  recordWorth(s);
  fx(s, 'win', winner.id);
  log(s, ctx, `${winner.name} wins ${reason}!`);
}

/** Checks every way the game can end; called after each action. */
function checkWinner(s: GameState, ctx: Ctx) {
  if (s.phase !== 'playing') return;
  const left = alive(s);
  if (left.length === 1) return endGame(s, ctx, left[0], 'the game');
  const set = s.settings;
  if (set.winCondition === 'worth') {
    const top = left.map((p) => ({ p, w: netWorth(s, p) })).sort((a, b) => b.w - a.w)[0];
    if (top.w >= set.winWorth) endGame(s, ctx, top.p, `by reaching ${money(set.winWorth)} net worth`);
  } else if (set.winCondition === 'sets') {
    const top = left.map((p) => ({ p, n: fullSetsOwned(s, p.id) })).sort((a, b) => b.n - a.n)[0];
    if (top.n >= set.winSets) endGame(s, ctx, top.p, `by owning ${set.winSets} full sets`);
  }
}

function ownedTile(s: GameState, playerId: string | null, index: number) {
  const tile = tileOf(s, index);
  if (!tile) fail('No such tile');
  const own = s.properties[index];
  if (!own || own.owner !== playerId) fail("You don't own that");
  return { tile, own };
}

function checkCityCap(s: GameState, p: Player, gaining: number) {
  const cap = s.settings.cityCap;
  if (cap && citiesOwned(s, p.id) + gaining > cap) fail(`${p.name} would pass the ${cap}-city cap`);
}

// ---------- auctions ----------

function startAuction(s: GameState, ctx: Ctx, tile: number, liquidation: { creditor: string | null } | null) {
  const set = s.settings;
  const price = tileOf(s, tile).price ?? 0;
  const sealed = set.auctionMode === 'sealed';
  s.auction = {
    tile,
    highBid: 0,
    highBidder: null,
    opening: set.auctionOpening === 'half' ? Math.ceil(price / 2) : 1,
    sealed,
    bids: [],
    liquidation,
    endsAt: ctx.now + (sealed ? set.auctionTimer * 2 + 5 : set.auctionTimer + 5) * 1000,
  };
  fx(s, 'auction', s.turn?.playerId ?? null);
}

function nextQueuedAuction(s: GameState, ctx: Ctx) {
  const next = s.auctionQueue.shift();
  if (next) startAuction(s, ctx, next.tile, { creditor: next.creditor });
}

function resolveAuction(s: GameState, ctx: Ctx) {
  const a = s.auction!;
  const tile = tileOf(s, a.tile);
  s.auction = null;
  let winnerId: string | null = null;
  let price = 0;
  if (a.sealed) {
    // highest sealed bid wins and pays the second-highest bid + $1 (or the opening bid)
    const bids = [...a.bids].filter((b) => s.players.some((p) => p.id === b.pid && !p.bankrupt)).sort((x, y) => y.amount - x.amount);
    if (bids.length) {
      winnerId = bids[0].pid;
      price = bids[1] ? Math.min(bids[0].amount, bids[1].amount + 1) : a.opening;
    }
  } else if (a.highBidder) {
    winnerId = a.highBidder;
    price = a.highBid;
  }
  if (winnerId) {
    const winner = player(s, winnerId);
    const creditor = a.liquidation?.creditor ? s.players.find((p) => p.id === a.liquidation!.creditor && !p.bankrupt) ?? null : null;
    pay(s, ctx, winner, creditor, price, `to win ${tile.name} at auction`, { spent: true });
    s.properties[a.tile] = { owner: winner.id, houses: 0, mortgaged: false, frozen: 0 };
    fx(s, 'auctionWon', winner.id, { tile: a.tile, amount: price });
    grantFreeHouses(s, ctx, winner.id);
  } else {
    log(s, ctx, `Nobody bid on ${tile.name}`);
  }
  if (!a.liquidation && s.turn?.stage === 'auction') finishStep(s, ctx);
  if (!s.auction) nextQueuedAuction(s, ctx);
  // a bankrupt player's turn waits for their cities to be auctioned, then moves on
  if (!s.auction && s.phase === 'playing' && s.turn && current(s).bankrupt) advanceTurn(s, ctx);
}

// ---------- bankruptcy ----------

function bankruptPlayer(s: GameState, ctx: Ctx, p: Player, allowRevive = true) {
  const map = mapOf(s);
  const creditor = p.debtTo ? s.players.find((x) => x.id === p.debtTo && !x.bankrupt) ?? null : null;
  const mode = s.settings.bankruptcy;
  let buildingCash = 0;
  const owned: number[] = [];
  for (const [idx, own] of Object.entries(s.properties)) {
    if (own.owner !== p.id) continue;
    const tile = map.tiles[Number(idx)];
    // buildings go back to the bank at half price
    while (own.houses > 0) {
      buildingCash += Math.floor(buildCost(tile, own.houses - 1) / 2);
      own.houses = returnStock(s, own.houses);
    }
    owned.push(Number(idx));
  }
  for (const idx of owned) {
    const own = s.properties[idx];
    if (mode === 'creditor' && creditor) s.properties[idx] = { owner: creditor.id, houses: 0, mortgaged: own.mortgaged, frozen: 0 };
    else delete s.properties[idx];
  }
  if (mode === 'auction') s.auctionQueue.push(...owned.map((tile) => ({ tile, creditor: creditor?.id ?? null })));
  for (const holders of Object.values(s.shares)) delete holders[p.id];
  if (creditor) {
    const cash = Math.max(0, p.cash) + buildingCash;
    if (cash > 0) creditor.cash += cash;
    creditor.jailCards += p.jailCards;
  }
  p.jailCards = 0;
  p.inJail = false;
  p.bankLoan = 0;
  p.powerUps = [];
  s.offers = s.offers.filter((o) => o.from !== p.id && o.to !== p.id);
  s.immunities = s.immunities.filter((im) => im.holder !== p.id && im.owner !== p.id);
  s.loans = s.loans.filter((l) => l.borrower !== p.id && l.lender !== p.id);
  s.alliances = s.alliances.filter((al) => al.a !== p.id && al.b !== p.id);
  s.rentClaims = s.rentClaims.filter((c) => c.payer !== p.id && c.owner !== p.id);
  if (s.auction?.highBidder === p.id) {
    s.auction.highBidder = null;
    s.auction.highBid = 0;
  }
  if (s.auction) s.auction.bids = s.auction.bids.filter((b) => b.pid !== p.id);

  if (allowRevive && s.settings.secondChance && !p.revived) {
    p.revived = true;
    p.cash = 300;
    p.debtTo = null;
    fx(s, 'bankrupt', p.id);
    log(s, ctx, `${p.name} went bankrupt but gets a second chance: debts wiped, $300 to start again`);
    if (s.turn?.playerId === p.id && s.turn.stage !== 'auction') s.turn.stage = 'end';
  } else {
    p.cash = 0;
    p.bankrupt = true;
    fx(s, 'bankrupt', p.id);
    log(s, ctx, `${p.name} went bankrupt${creditor && mode === 'creditor' ? `; assets go to ${creditor.name}` : ''}`);
  }
  if (!s.auction) nextQueuedAuction(s, ctx);
  checkWinner(s, ctx);
  if (s.phase === 'playing' && p.bankrupt && s.turn!.playerId === p.id && !s.auction) advanceTurn(s, ctx);
}

// ---------- map specials ----------

export interface SpecialDef {
  id: string;
  map: 'world' | 'pakistan' | 'europe';
  icon: string;
  name: string;
  desc: string;
}

export const SPECIALS: SpecialDef[] = [
  { id: 'world.war', map: 'world', icon: '⚔️', name: 'World War', desc: 'Every 6 rounds two countries fight for 2 rounds: rent x1.5 and owners can attack rival cities ($100, dice battle). Ceasefire pays $100.' },
  { id: 'world.fx', map: 'world', icon: '💱', name: 'Exchange rates', desc: "Each round every country's rent drifts ±10%, between x0.7 and x1.3." },
  { id: 'world.embargo', map: 'world', icon: '🚫', name: 'Trade embargo', desc: 'Every 4 rounds a country is sanctioned for 2 rounds: no trading, building or mortgaging there, rent −50%.' },
  { id: 'world.olympics', map: 'world', icon: '🏅', name: 'Olympics', desc: 'Every 5 rounds a country hosts: rent x3 there for a round.' },
  { id: 'world.oil', map: 'world', icon: '🛢️', name: 'Oil crisis', desc: 'Every 7 rounds: airport rent x2 and Start pays $50 less for a round.' },
  { id: 'world.visa', map: 'world', icon: '🛂', name: 'Visa fee', desc: "Landing in a country where you own no city costs $20." },
  { id: 'world.lockdown', map: 'world', icon: '😷', name: 'Lockdown', desc: 'Every 6 rounds one side of the board locks for a round; landing there skips your next turn.' },
  { id: 'world.aid', map: 'world', icon: '🇺🇳', name: 'UN aid', desc: 'Every 5 rounds the poorest player gets $150.' },
  { id: 'world.flights', map: 'world', icon: '✈️', name: 'Connecting flights', desc: 'After landing on an airport, pay $100 to fly to any other airport.' },
  { id: 'world.wonders', map: 'world', icon: '🗽', name: 'Tourist wonders', desc: "Owner of a country's priciest city earns $25 whenever anyone lands in that country." },

  { id: 'pk.loadshedding', map: 'pakistan', icon: '🔌', name: 'Load-shedding', desc: 'Every 2 rounds a region goes dark for a round: no rent there. Utility owners get $25 per dark city.' },
  { id: 'pk.ups', map: 'pakistan', icon: '🔋', name: 'UPS', desc: '$150 protects all your cities from blackouts for 5 turns.' },
  { id: 'pk.monsoon', map: 'pakistan', icon: '🌧️', name: 'Monsoon', desc: 'Every 4 rounds Sindh, Karachi and Seafront cities may each lose a building (1 in 3). Tarbela Dam owner gets $100.' },
  { id: 'pk.cricket', map: 'pakistan', icon: '🏏', name: 'Cricket match day', desc: 'Every 3 rounds Lahore or Karachi hosts a match: rent x2 there for a round.' },
  { id: 'pk.eidi', map: 'pakistan', icon: '🌙', name: 'Eidi', desc: 'On rounds 5 and 12 every player gets $100 Eidi.' },
  { id: 'pk.shaadi', map: 'pakistan', icon: '💍', name: 'Shaadi season', desc: 'Every 5 rounds a random player hosts a wedding; everyone pays them $50 salami.' },
  { id: 'pk.bribe', map: 'pakistan', icon: '☕', name: 'Chai-pani', desc: 'On tax or Go to Prison, offer a $50 bribe: 70% you skip it, 30% caught and pay double (or Prison anyway).' },
  { id: 'pk.traffic', map: 'pakistan', icon: '🚗', name: 'Traffic jam', desc: 'Landing in Karachi makes your next roll move 2 fewer tiles.' },
  { id: 'pk.petrol', map: 'pakistan', icon: '⛽', name: 'Petrol price', desc: 'Each lap costs fuel: $30, rising $10 every 5 rounds.' },
  { id: 'pk.cpec', map: 'pakistan', icon: '🛣️', name: 'CPEC corridor', desc: 'Own Gwadar + an airport: +$50 each lap. Also own Quetta: +$100.' },

  { id: 'eu.rail', map: 'europe', icon: '🚆', name: 'Rail pass', desc: 'After landing on a station, pay $50 to ride to any other station.' },
  { id: 'eu.strike', map: 'europe', icon: '🪧', name: 'Train strike', desc: 'Every 4 rounds stations close for a round: no rent, no rides.' },
  { id: 'eu.seasons', map: 'europe', icon: '☀️', name: 'Seasons', desc: 'Every 2 rounds summer and winter swap. Summer: Portugal, Greece, Spain, Italy x2. Winter: Norway, Sweden, Switzerland, Poland x2.' },
  { id: 'eu.eurovision', map: 'europe', icon: '🎤', name: 'Eurovision', desc: 'Every 6 rounds everyone votes for a country; its owners win $200.' },
  { id: 'eu.exit', map: 'europe', icon: '🗳️', name: 'Exit vote', desc: "In round 8 a country leaves the union: its cities can't be traded, but rent there is +50%." },
  { id: 'eu.carbon', map: 'europe', icon: '🌱', name: 'Carbon tax', desc: 'Each lap pay $20 per hotel and $40 per skyscraper or landmark.' },
  { id: 'eu.nighttrain', map: 'europe', icon: '🌙', name: 'Night train', desc: 'Land on a station with a doubles roll and your ride is free.' },
  { id: 'eu.heritage', map: 'europe', icon: '🏛️', name: 'Heritage capitals', desc: 'Capitals hold at most 2 houses, but their base rent is x3.' },
  { id: 'eu.schengen', map: 'europe', icon: '🛤️', name: 'Schengen hop', desc: 'Once per lap, before rolling, add +1 or +2 to your move.' },
  { id: 'eu.ucl', map: 'europe', icon: '⚽', name: 'Champions League', desc: 'Every 7 rounds two countries play a final. Bet $50-$200; winners double. The winning country’s owners get $100.' },
];

const SPECIAL_PREFIX: Record<string, string> = { world: 'world.', pakistan: 'pk.', europe: 'eu.' };

/** Is this map special active: right map, and not switched off by the host. */
export function specialOn(s: Pick<GameState, 'settings'>, id: string): boolean {
  const pre = SPECIAL_PREFIX[s.settings.mapId];
  return !!pre && id.startsWith(pre) && !s.settings.specialsOff.includes(id);
}

export function blankSpecial(): SpecialState {
  return {
    war: null,
    rates: {},
    embargo: null,
    olympics: null,
    oil: 0,
    lockdown: null,
    skip: {},
    blackout: null,
    ups: {},
    cricket: null,
    traffic: {},
    strike: 0,
    season: 'summer',
    exited: null,
    schengen: {},
    vote: null,
    match: null,
  };
}

const SEASON_GROUPS: Record<'summer' | 'winter', string[]> = {
  summer: ['brown', 'lightblue', 'orange', 'violet'],
  winter: ['green', 'yellow', 'red', 'teal'],
};
const MONSOON_GROUPS = ['pink', 'green', 'silver'];
const CRICKET_GROUPS = ['yellow', 'green'];
export const VOTE_MS = 15_000;

/** A set's capital / wonder: its most expensive city. */
export function capitalOf(s: Pick<GameState, 'settings' | 'size'>, group: string): number {
  const tiles = mapOf(s).groups[group]?.tiles ?? [];
  return tiles[tiles.length - 1];
}

/** Which board side (0-3) a tile sits on; corners count as no side. */
export function sideOf(s: Pick<GameState, 'settings' | 'size'>, index: number): number | null {
  const q = mapOf(s).side + 1;
  return index % q === 0 ? null : Math.floor(index / q);
}

/** Rent multiplier from the map specials for one tile; 0 means no rent. */
export function specialRentFactor(
  s: Pick<GameState, 'settings' | 'size' | 'properties' | 'special'>,
  index: number,
): number {
  const sp = s.special;
  if (!sp || !SPECIAL_PREFIX[s.settings.mapId]) return 1;
  const tile = tileOf(s, index);
  const g = tile.group;
  let f = 1;
  if (specialOn(s, 'world.war') && sp.war && g && (g === sp.war.a || g === sp.war.b)) f *= 1.5;
  if (specialOn(s, 'world.fx') && g) f *= sp.rates[g] ?? 1;
  if (specialOn(s, 'world.embargo') && sp.embargo && g === sp.embargo.group) f *= 0.5;
  if (specialOn(s, 'world.olympics') && sp.olympics && g === sp.olympics.group) f *= 3;
  if (specialOn(s, 'world.oil') && sp.oil > 0 && tile.kind === 'airport') f *= 2;
  if (specialOn(s, 'pk.loadshedding') && sp.blackout && g === sp.blackout.group) {
    const own = s.properties[index];
    const protectedByUps = own && specialOn(s, 'pk.ups') && (sp.ups[own.owner] ?? 0) > 0;
    if (!protectedByUps) f = 0;
  }
  if (specialOn(s, 'pk.cricket') && sp.cricket && g === sp.cricket.group) f *= 2;
  if (specialOn(s, 'eu.strike') && sp.strike > 0 && tile.kind === 'airport') f = 0;
  if (specialOn(s, 'eu.seasons') && g && SEASON_GROUPS[sp.season].includes(g)) f *= 2;
  if (specialOn(s, 'eu.exit') && sp.exited && g === sp.exited) f *= 1.5;
  if (specialOn(s, 'eu.heritage') && g && capitalOf(s, g) === index && (s.properties[index]?.houses ?? 0) === 0) f *= 3;
  return f;
}

/** Sets that can't change hands right now (embargo, exit vote). */
function lockedGroup(s: GameState, group: string | undefined): string | null {
  if (!group) return null;
  const sp = s.special;
  const name = mapOf(s).groups[group].name;
  if (specialOn(s, 'world.embargo') && sp.embargo?.group === group) return `${name} is under embargo`;
  if (specialOn(s, 'eu.exit') && sp.exited === group) return `${name} left the union; its cities can't be traded`;
  return null;
}

function eventCard(s: GameState, ctx: Ctx, text: string, kind: FxKind = 'event') {
  s.lastCard = { deck: 'event', text, playerId: s.turn?.playerId ?? '', at: ctx.now };
  fx(s, kind);
  log(s, ctx, text);
}

function groupName(s: GameState, g: string) {
  return mapOf(s).groups[g]?.name ?? g;
}

function ownersIn(s: GameState, group: string): Player[] {
  const ids = new Set(mapOf(s).groups[group].tiles.map((i) => s.properties[i]?.owner).filter((x): x is string => !!x));
  return alive(s).filter((p) => ids.has(p.id));
}

/** Round-start triggers for every map special. */
function specialRound(s: GameState, ctx: Ctx) {
  if (!SPECIAL_PREFIX[s.settings.mapId]) return;
  const sp = s.special;
  const r = s.round;
  const map = mapOf(s);
  const groups = Object.keys(map.groups);
  const tick = <T extends { roundsLeft: number }>(x: T | null): T | null => (x && --x.roundsLeft > 0 ? x : null);

  // ----- World -----
  if (specialOn(s, 'world.fx')) {
    for (const g of groups) {
      const next = (sp.rates[g] ?? 1) + (random(s) - 0.5) * 0.2;
      sp.rates[g] = Math.round(Math.min(1.3, Math.max(0.7, next)) * 100) / 100;
    }
  }
  if (specialOn(s, 'world.war')) {
    if (sp.war && --sp.war.roundsLeft <= 0) {
      const { a, b } = sp.war;
      for (const p of new Set([...ownersIn(s, a), ...ownersIn(s, b)])) collect(s, ctx, p, 100, 'as a ceasefire payout');
      eventCard(s, ctx, `Ceasefire between ${groupName(s, a)} and ${groupName(s, b)}.`);
      sp.war = null;
    } else if (!sp.war && r % 6 === 0) {
      const owned = groups.filter((g) => ownersIn(s, g).length > 0);
      const pairs: [string, string][] = [];
      for (const a of owned)
        for (const b of owned) {
          if (a >= b) continue;
          const oa = ownersIn(s, a).map((p) => p.id);
          const ob = ownersIn(s, b).map((p) => p.id);
          if (oa.some((x) => !ob.includes(x)) || ob.some((x) => !oa.includes(x))) pairs.push([a, b]);
        }
      if (pairs.length) {
        const [a, b] = pick(s, pairs);
        sp.war = { a, b, roundsLeft: 2 };
        eventCard(s, ctx, `War! ${groupName(s, a)} and ${groupName(s, b)} are at war for 2 rounds. Rent x1.5, and owners can attack.`, 'war');
      }
    }
  }
  if (specialOn(s, 'world.embargo')) {
    sp.embargo = tick(sp.embargo);
    if (!sp.embargo && r % 4 === 2) {
      sp.embargo = { group: pick(s, groups), roundsLeft: 2 };
      eventCard(s, ctx, `Embargo on ${groupName(s, sp.embargo.group)} for 2 rounds: no trading or building, rent halved.`);
    }
  }
  if (specialOn(s, 'world.olympics')) {
    sp.olympics = tick(sp.olympics);
    if (r % 5 === 0) {
      sp.olympics = { group: pick(s, groups), roundsLeft: 1 };
      eventCard(s, ctx, `${groupName(s, sp.olympics.group)} hosts the Olympics! Rent x3 there this round.`);
    }
  }
  if (specialOn(s, 'world.oil')) {
    if (sp.oil > 0) sp.oil--;
    if (r % 7 === 0) {
      sp.oil = 1;
      eventCard(s, ctx, 'Oil crisis! Airport rent doubles and Start pays $50 less this round.');
    }
  }
  if (specialOn(s, 'world.lockdown')) {
    sp.lockdown = tick(sp.lockdown);
    if (r % 6 === 3) {
      sp.lockdown = { side: Math.floor(random(s) * 4), roundsLeft: 1 };
      eventCard(s, ctx, `Lockdown on side ${sp.lockdown.side + 1} of the board: land there and you skip your next turn.`);
    }
  }
  if (specialOn(s, 'world.aid') && r % 5 === 0) {
    const poorest = [...alive(s)].sort((a, b) => netWorth(s, a) - netWorth(s, b))[0];
    if (poorest) {
      collect(s, ctx, poorest, 150, 'in UN aid');
      eventCard(s, ctx, `UN aid: ${poorest.name} receives $150.`);
    }
  }

  // ----- Pakistan -----
  if (specialOn(s, 'pk.loadshedding')) {
    sp.blackout = tick(sp.blackout);
    if (r % 2 === 0) {
      const g = pick(s, groups);
      sp.blackout = { group: g, roundsLeft: 1 };
      const dark = map.groups[g].tiles.length;
      for (const u of map.utilities) {
        const o = s.properties[u];
        const owner = o && s.players.find((p) => p.id === o.owner && !p.bankrupt);
        if (owner) collect(s, ctx, owner, 25 * dark, 'from generator sales');
      }
      eventCard(s, ctx, `Load-shedding in ${groupName(s, g)}: no rent there this round.`, 'blackout');
    }
  }
  if (specialOn(s, 'pk.monsoon') && r % 4 === 0) {
    let hit = 0;
    for (const g of MONSOON_GROUPS) {
      for (const i of map.groups[g]?.tiles ?? []) {
        const own = s.properties[i];
        if (own && own.houses > 0 && random(s) < 1 / 3) {
          own.houses = returnStock(s, own.houses);
          hit++;
        }
      }
    }
    const dam = s.properties[map.utilities[1]];
    const damOwner = dam && s.players.find((p) => p.id === dam.owner && !p.bankrupt);
    if (damOwner) collect(s, ctx, damOwner, 100, 'from Tarbela Dam');
    eventCard(s, ctx, `Monsoon! ${hit ? `${hit} building${hit > 1 ? 's' : ''} washed away in the south.` : 'The buildings held up.'}`);
  }
  if (specialOn(s, 'pk.cricket')) {
    sp.cricket = tick(sp.cricket);
    if (r % 3 === 0) {
      const g = pick(s, CRICKET_GROUPS.filter((x) => map.groups[x]));
      sp.cricket = { group: g, roundsLeft: 1 };
      eventCard(s, ctx, `Match day in ${groupName(s, g)}! Rent x2 there this round.`);
    }
  }
  if (specialOn(s, 'pk.eidi') && (r === 5 || r === 12)) {
    for (const p of alive(s)) collect(s, ctx, p, 100, 'as Eidi');
    eventCard(s, ctx, 'Eid Mubarak! Everyone gets $100 Eidi.');
  }
  if (specialOn(s, 'pk.shaadi') && r % 5 === 0) {
    const host = pick(s, alive(s));
    for (const p of alive(s)) if (p.id !== host.id) pay(s, ctx, p, host, 50, 'as salami');
    eventCard(s, ctx, `Shaadi season! ${host.name} is getting married and everyone pays $50 salami.`);
  }

  // ----- Euro Trip -----
  if (specialOn(s, 'eu.strike')) {
    if (sp.strike > 0) sp.strike--;
    if (r % 4 === 0) {
      sp.strike = 1;
      eventCard(s, ctx, 'Train strike! Stations are closed this round: no rent, no rides.');
    }
  }
  if (specialOn(s, 'eu.seasons')) {
    const season = Math.floor((r - 1) / 2) % 2 === 0 ? 'summer' : 'winter';
    if (season !== sp.season) {
      sp.season = season;
      eventCard(
        s,
        ctx,
        season === 'summer' ? 'Summer! Portugal, Greece, Spain and Italy pay double.' : 'Winter! Norway, Sweden, Switzerland and Poland pay double.',
      );
    }
  }
  if (specialOn(s, 'eu.exit') && r === 8 && !sp.exited) {
    sp.exited = pick(s, groups);
    eventCard(s, ctx, `Exit vote! ${groupName(s, sp.exited)} leaves the union: no trading its cities, but rent +50% from now on.`);
  }
  if (specialOn(s, 'eu.eurovision') && r % 6 === 0) {
    sp.vote = { groups, endsAt: ctx.now + VOTE_MS, votes: {} };
    eventCard(s, ctx, 'Eurovision night! Vote for a country in the next 15 seconds; its owners win $200.');
  }
  if (specialOn(s, 'eu.ucl') && r % 7 === 0 && groups.length > 1) {
    const a = pick(s, groups);
    const b = pick(s, groups.filter((g) => g !== a));
    sp.match = { a, b, endsAt: ctx.now + VOTE_MS, bets: {} };
    eventCard(s, ctx, `Champions League final: ${groupName(s, a)} vs ${groupName(s, b)}! Place your bets ($50-$200) in 15 seconds.`);
  }
}

/** Resolves timed specials (Eurovision votes, Champions League bets). */
function specialTick(s: GameState, ctx: Ctx): boolean {
  const sp = s.special;
  let changed = false;
  if (sp.vote && ctx.now >= sp.vote.endsAt) {
    const tally: Record<string, number> = {};
    for (const g of Object.values(sp.vote.votes)) tally[g] = (tally[g] ?? 0) + 1;
    const top = Math.max(0, ...Object.values(tally));
    sp.vote = null;
    if (top === 0) log(s, ctx, 'Nobody voted in Eurovision');
    else {
      const winner = pick(s, Object.keys(tally).filter((g) => tally[g] === top));
      for (const p of ownersIn(s, winner)) collect(s, ctx, p, 200, 'for winning Eurovision');
      eventCard(s, ctx, `${groupName(s, winner)} wins Eurovision with ${top} vote${top > 1 ? 's' : ''}!`);
    }
    changed = true;
  }
  if (sp.match && ctx.now >= sp.match.endsAt) {
    const { a, b, bets } = sp.match;
    sp.match = null;
    let sa = 0;
    let sb = 0;
    while (sa === sb) {
      sa = d6(s) + d6(s);
      sb = d6(s) + d6(s);
    }
    const winner = sa > sb ? a : b;
    for (const [pid, bet] of Object.entries(bets)) {
      const p = s.players.find((x) => x.id === pid && !x.bankrupt);
      if (p && bet.group === winner) collect(s, ctx, p, bet.amount * 2, 'on a winning bet');
    }
    for (const p of ownersIn(s, winner)) collect(s, ctx, p, 100, 'as a trophy bonus');
    eventCard(s, ctx, `${groupName(s, winner)} win the final ${Math.max(sa, sb)}-${Math.min(sa, sb)}!`);
    changed = true;
  }
  return changed;
}

/** Landing effects from map specials that happen before the tile's normal effect. */
function specialLanding(s: GameState, ctx: Ctx, p: Player, tile: Tile) {
  if (!SPECIAL_PREFIX[s.settings.mapId]) return;
  const sp = s.special;
  const g = tile.group;
  if (g && tile.kind === 'property') {
    const mine = mapOf(s).groups[g].tiles.some((i) => s.properties[i]?.owner === p.id);
    if (specialOn(s, 'world.visa') && !mine) pay(s, ctx, p, null, 20, `for a ${groupName(s, g)} visa`);
    if (specialOn(s, 'world.wonders')) {
      const w = s.properties[capitalOf(s, g)];
      const owner = w && s.players.find((x) => x.id === w.owner && !x.bankrupt);
      if (owner && owner.id !== p.id) collect(s, ctx, owner, 25, `in tourism from ${tileOf(s, capitalOf(s, g)).name}`);
    }
    if (specialOn(s, 'pk.traffic') && g === 'green') {
      sp.traffic[p.id] = true;
      log(s, ctx, `${p.name} is stuck in Karachi traffic: next roll moves 2 fewer`);
    }
  }
  if (specialOn(s, 'world.lockdown') && sp.lockdown && sideOf(s, tile.index) === sp.lockdown.side) {
    sp.skip[p.id] = (sp.skip[p.id] ?? 0) + 1;
    log(s, ctx, `${p.name} landed in lockdown and will miss a turn`);
  }
  // offer a connecting flight / train ride once this landing is resolved
  if (tile.kind === 'airport' && s.turn?.playerId === p.id && !p.inJail) {
    if (specialOn(s, 'world.flights')) s.turn.travel = { cost: 100 };
    if (specialOn(s, 'eu.rail') && !(specialOn(s, 'eu.strike') && sp.strike > 0)) {
      const d = s.turn.dice;
      const free = specialOn(s, 'eu.nighttrain') && d && d[0] === d[1];
      s.turn.travel = { cost: free ? 0 : 50 };
    }
  }
}

/** Lap effects from map specials, applied when passing Start. */
function specialLap(s: GameState, ctx: Ctx, p: Player) {
  if (!SPECIAL_PREFIX[s.settings.mapId]) return;
  const map = mapOf(s);
  if (specialOn(s, 'pk.petrol')) pay(s, ctx, p, null, 30 + 10 * Math.floor(s.round / 5), 'for petrol');
  if (specialOn(s, 'pk.cpec')) {
    const byName = (n: string) => map.tiles.find((t) => t.name === n)?.index;
    const gwadar = byName('Gwadar');
    const quetta = byName('Quetta');
    const ownsAirport = map.airports.some((i) => s.properties[i]?.owner === p.id);
    if (gwadar !== undefined && s.properties[gwadar]?.owner === p.id && ownsAirport) {
      const both = quetta !== undefined && s.properties[quetta]?.owner === p.id;
      collect(s, ctx, p, both ? 100 : 50, 'from the CPEC corridor');
    }
  }
  if (specialOn(s, 'eu.carbon')) {
    let tax = 0;
    for (const own of Object.values(s.properties)) {
      if (own.owner !== p.id) continue;
      if (own.houses === 5) tax += 20;
      else if (own.houses >= 6) tax += 40;
    }
    if (tax) pay(s, ctx, p, null, tax, 'in carbon tax', { toPot: true });
  }
}

/** Traffic jams and Schengen hops adjust how far a roll moves. */
function specialSteps(s: GameState, ctx: Ctx, p: Player, steps: number): number {
  const sp = s.special;
  steps += s.turn?.bonus ?? 0;
  if (s.turn) s.turn.bonus = 0;
  if (sp.traffic[p.id]) {
    delete sp.traffic[p.id];
    steps = Math.max(1, steps - 2);
    log(s, ctx, `${p.name} crawls through traffic: moves ${steps}`);
  }
  return steps;
}

// ---------- timers ----------

/** Sets or clears the auto-play deadline for the current turn step. */
function refreshDeadline(prev: GameState, s: GameState, now: number) {
  if (s.phase !== 'playing' || !s.turn) return;
  const cur = s.players.find((p) => p.id === s.turn!.playerId);
  const seconds = s.settings.turnTimer || (cur && !cur.connected ? OFFLINE_TURN_SECONDS : 0);
  if (!seconds) {
    s.turn.deadline = null;
    return;
  }
  const before = prev.turn;
  const prevCur = prev.players.find((p) => p.id === s.turn!.playerId);
  const changed =
    !before ||
    before.playerId !== s.turn.playerId ||
    before.stage !== s.turn.stage ||
    s.turn.deadline === null ||
    (s.auction === null) !== (prev.auction === null) ||
    prevCur?.connected !== cur?.connected;
  if (changed) s.turn.deadline = now + seconds * 1000;
}

/** Plays the current step for a player whose timer ran out. */
function autoStep(s: GameState, ctx: Ctx) {
  const p = current(s);
  const stage = s.turn!.stage;
  if (!p.connected) {
    if (s.settings.offline === 'skip') {
      log(s, ctx, `${p.name} is offline; turn skipped`);
      if (stage === 'buy') s.turn!.pendingTile = null;
      advanceTurn(s, ctx);
      return;
    }
    if (s.settings.offline === 'bankrupt') {
      p.missed++;
      if (p.missed >= OFFLINE_STRIKES) {
        log(s, ctx, `${p.name} missed ${OFFLINE_STRIKES} turns while offline`);
        p.debtTo = null;
        bankruptPlayer(s, ctx, p, false);
        return;
      }
    }
  }
  try {
    if (p.cash < 0 && (stage === 'roll' || stage === 'end')) {
      log(s, ctx, `${p.name} ran out of time while in debt`);
      bankruptPlayer(s, ctx, p);
    } else if (stage === 'roll') run(s, p.id, { type: 'roll' }, ctx);
    else if (stage === 'buy') run(s, p.id, { type: 'decline' }, ctx);
    else if (stage === 'end') run(s, p.id, { type: 'endTurn' }, ctx);
    else if (stage === 'bus') run(s, p.id, { type: 'busChoice', pick: 2 }, ctx);
    else if (stage === 'teleport') run(s, p.id, { type: 'teleportTo', tile: (p.position + 7) % s.size }, ctx);
    else if (stage === 'bribe') run(s, p.id, { type: 'bribe', offer: false }, ctx);
    else run(s, p.id, { type: 'skipSpecial' }, ctx);
  } catch {
    bankruptPlayer(s, ctx, p);
  }
}

function runVetoQueue(s: GameState, ctx: Ctx): boolean {
  const due = s.vetoQueue.filter((v) => ctx.now >= v.executeAt);
  if (!due.length) return false;
  s.vetoQueue = s.vetoQueue.filter((v) => ctx.now < v.executeAt);
  for (const v of due) {
    const from = s.players.find((p) => p.id === v.offer.from && !p.bankrupt);
    const to = s.players.find((p) => p.id === v.offer.to && !p.bankrupt);
    try {
      if (!from || !to) fail('A trader left');
      executeTrade(s, ctx, v.offer, from, to);
    } catch (e) {
      log(s, ctx, `A trade fell through: ${e instanceof Error ? e.message : 'invalid'}`);
    }
  }
  return true;
}

function tick(s: GameState, ctx: Ctx): boolean {
  if (s.phase !== 'playing') return false;
  if (s.endsAt && ctx.now >= s.endsAt) {
    const ranked = alive(s).sort((a, b) => netWorth(s, b) - netWorth(s, a));
    log(s, ctx, "Time's up!");
    endGame(s, ctx, ranked[0], 'on net worth');
    return true;
  }
  let changed = runVetoQueue(s, ctx);
  if (specialTick(s, ctx)) changed = true;
  if (s.auction && ctx.now >= s.auction.endsAt) {
    resolveAuction(s, ctx);
    changed = true;
  } else if (!s.auction && s.turn?.deadline && ctx.now >= s.turn.deadline) {
    autoStep(s, ctx);
    changed = true;
  }
  return changed;
}

// ---------- trades ----------

function int(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.floor(v) : NaN;
}

function cleanSide(raw: TradeSide | undefined): TradeSide {
  const im = raw?.immunity;
  return {
    cash: int(raw?.cash ?? 0),
    tiles: [...new Set((raw?.tiles ?? []).map(int))],
    jailCards: int(raw?.jailCards ?? 0),
    immunity: im && im.tiles?.length ? { tiles: [...new Set(im.tiles.map(int))], turns: int(im.turns) } : null,
  };
}

function sideIsEmpty(side: TradeSide) {
  return side.cash === 0 && side.tiles.length === 0 && side.jailCards === 0 && !side.immunity;
}

/** Throws unless `giver` can hand over everything in `side` right now. */
function checkSide(s: GameState, giver: Player, side: TradeSide) {
  if (!(side.cash >= 0)) fail('Cash must be zero or more');
  if (side.cash > Math.max(0, giver.cash)) fail(`${giver.name} doesn't have $${side.cash}`);
  if (!(side.jailCards >= 0) || side.jailCards > giver.jailCards) fail(`${giver.name} doesn't have that many get-out cards`);
  const map = mapOf(s);
  for (const i of side.tiles) {
    const tile = map.tiles[i];
    if (!tile || s.properties[i]?.owner !== giver.id) fail(`${giver.name} doesn't own that city`);
    if (tile.group && map.groups[tile.group].tiles.some((g) => (s.properties[g]?.houses ?? 0) > 0))
      fail(`Sell the buildings in ${map.groups[tile.group].name} before trading ${tile.name}`);
    const locked = lockedGroup(s, tile.group);
    if (locked) fail(locked);
  }
  if (side.immunity) {
    if (!s.settings.immunity) fail('Rent immunity deals are off in this room');
    const { tiles, turns } = side.immunity;
    if (!(turns >= 1 && turns <= MAX_IMMUNITY_TURNS)) fail(`Immunity lasts 1-${MAX_IMMUNITY_TURNS} turns`);
    for (const i of tiles) {
      if (s.properties[i]?.owner !== giver.id) fail('Immunity can only cover cities you own');
      if (side.tiles.includes(i)) fail("Can't give immunity on a city you're trading away");
    }
  }
}

function checkTrade(s: GameState, from: Player, to: Player, give: TradeSide, get: TradeSide) {
  checkSide(s, from, give);
  checkSide(s, to, get);
  checkCityCap(s, from, get.tiles.length - give.tiles.length);
  checkCityCap(s, to, give.tiles.length - get.tiles.length);
}

export function describeSide(s: Pick<GameState, 'settings' | 'size'>, side: TradeSide): string {
  const parts: string[] = [];
  if (side.tiles.length) parts.push(side.tiles.map((i) => tileOf(s, i).name).join(', '));
  if (side.cash) parts.push(money(side.cash));
  if (side.jailCards) parts.push(`${side.jailCards} get-out card${side.jailCards > 1 ? 's' : ''}`);
  if (side.immunity) parts.push(`${side.immunity.turns}-turn rent immunity`);
  return parts.join(' + ') || 'nothing';
}

function handOver(s: GameState, from: Player, to: Player, side: TradeSide) {
  from.cash -= side.cash;
  to.cash += side.cash;
  if (to.cash >= 0) to.debtTo = null;
  from.jailCards -= side.jailCards;
  to.jailCards += side.jailCards;
  for (const i of side.tiles) {
    s.properties[i].owner = to.id;
    s.properties[i].frozen = 0;
    // immunities on a city stop when it changes hands
    for (const im of s.immunities) if (im.owner === from.id) im.tiles = im.tiles.filter((t) => t !== i);
  }
  s.immunities = s.immunities.filter((im) => im.tiles.length > 0);
  if (side.immunity) {
    s.immunities.push({ id: ++s.seq, holder: to.id, owner: from.id, tiles: side.immunity.tiles, turnsLeft: side.immunity.turns });
  }
}

function executeTrade(s: GameState, ctx: Ctx, offer: TradeOffer, from: Player, to: Player) {
  checkTrade(s, from, to, offer.give, offer.get);
  handOver(s, from, to, offer.give);
  handOver(s, to, from, offer.get);
  fx(s, 'trade', to.id);
  log(s, ctx, `${from.name} traded ${describeSide(s, offer.give)} to ${to.name} for ${describeSide(s, offer.get)}`);
  grantFreeHouses(s, ctx, from.id);
  grantFreeHouses(s, ctx, to.id);
}

function otherPlayer(s: GameState, me: Player, id: string | undefined): Player {
  const o = s.players.find((x) => x.id === id);
  if (!o || o.bankrupt) fail('That player is not in the game');
  if (o.id === me.id) fail('Pick another player');
  return o;
}

function checkCanOffer(s: GameState, me: Player) {
  if (s.round <= s.settings.tradeFreeze) fail(`Trading opens in round ${s.settings.tradeFreeze + 1}`);
  if (s.settings.offersOnTurnOnly && s.turn?.playerId !== me.id) fail('You can only make offers on your own turn');
  if (s.offers.filter((o) => o.from === me.id).length >= MAX_OPEN_OFFERS) fail('Too many open offers; cancel one first');
}

// ---------- movement with the speed die ----------

function nextUnowned(s: GameState, from: number): number {
  const map = mapOf(s);
  const buyable = (i: number) => ['property', 'airport', 'utility'].includes(map.tiles[i].kind);
  for (let k = 1; k <= s.size; k++) {
    const i = (from + k) % s.size;
    if (buyable(i) && !s.properties[i]) return i;
  }
  for (let k = 1; k <= s.size; k++) {
    const i = (from + k) % s.size;
    if (buyable(i) && s.properties[i]?.owner !== current(s).id) return i;
  }
  return from;
}

/** Moves the current player by `steps`, handling the Chaos reverse card. */
function stepPlayer(s: GameState, ctx: Ctx, p: Player, steps: number) {
  if (p.reverse) {
    p.reverse = false;
    log(s, ctx, `${p.name} moves backwards`);
    p.position = (p.position - steps + s.size * 2) % s.size;
    land(s, ctx, p, {});
    return;
  }
  moveBy(s, ctx, p, steps);
}

// ---------- actions ----------

export function applyAction(
  prev: GameState,
  playerId: string | null,
  action: Action,
  now: number,
  opts: EngineOptions = {},
): GameState {
  const s = structuredClone(prev);
  const ctx: Ctx = { now, opts };
  if (action.type === 'tick') {
    if (!tick(s, ctx)) return prev;
  } else {
    run(s, playerId, action, ctx);
    const actor = s.players.find((p) => p.id === playerId);
    if (actor) actor.missed = 0;
  }
  checkWinner(s, ctx);
  refreshDeadline(prev, s, now);
  s.version++;
  return s;
}

function validateSettings(prev: Settings, patch: Partial<Settings>, players: number): Settings {
  const next = { ...prev, ...patch } as Settings;
  const rec = next as unknown as Record<string, unknown>;
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const key = k as keyof Settings;
    if (key === 'mapId') continue;
    const choices = SETTING_CHOICES[key];
    if (choices) {
      const v = typeof def === 'number' ? Number(rec[k]) : rec[k];
      if (!choices.includes(v as string | number)) fail(`Unknown value for ${k}`);
      rec[k] = v;
    } else if (typeof def === 'boolean') rec[k] = Boolean(rec[k]);
  }
  if (!MAP_DEFS[next.mapId]) fail('Unknown map');
  const known = new Set(SPECIALS.map((x) => x.id));
  next.specialsOff = Array.isArray(next.specialsOff) ? [...new Set(next.specialsOff.filter((id) => known.has(id)))] : [];
  if (next.maxPlayers < players) fail('More players already joined');
  return next;
}

function run(s: GameState, playerId: string | null, action: Action, ctx: Ctx) {
  const now = ctx.now;
  const set = s.settings;
  switch (action.type) {
    case 'settings': {
      if (s.phase !== 'lobby') fail('Settings are locked once the game starts');
      if (playerId !== s.hostId) fail('Only the host can change settings');
      s.settings = validateSettings(s.settings, action.settings, s.players.length);
      syncSize(s);
      break;
    }

    case 'movePlayer': {
      if (s.phase !== 'lobby') fail('Order is locked once the game starts');
      if (playerId !== s.hostId) fail('Only the host can arrange players');
      const i = s.players.findIndex((p) => p.id === action.playerId);
      const j = i + (action.dir === 1 ? 1 : -1);
      if (i < 0 || j < 0 || j >= s.players.length) fail("Can't move there");
      [s.players[i], s.players[j]] = [s.players[j], s.players[i]];
      break;
    }

    case 'kick': {
      if (playerId !== s.hostId) fail('Only the host can remove players');
      const target = s.players.find((p) => p.id === action.playerId);
      if (!target || target.id === s.hostId) fail("Can't remove that player");
      if (s.phase === 'lobby') {
        s.players = s.players.filter((p) => p !== target);
        syncSize(s);
      } else {
        if (target.bankrupt) fail('Already out');
        if (target.connected) fail('You can only remove players who went offline');
        target.debtTo = null;
        log(s, ctx, `${target.name} was removed by the host`);
        bankruptPlayer(s, ctx, target, false);
      }
      break;
    }

    case 'start': {
      if (s.phase !== 'lobby') fail('Already started');
      if (playerId !== s.hostId) fail('Only the host can start');
      if (s.players.length < 2) fail('Need at least 2 players');
      syncSize(s);
      if (set.turnOrder === 'random') s.players = shuffle(s, s.players);
      for (const p of s.players) {
        p.cash = set.startingCash;
        stat(s, p.id);
      }
      s.decks = {
        chance: shuffle(s, deckFor('chance', set.deck).map((_, i) => i)),
        chest: shuffle(s, deckFor('chest', set.deck).map((_, i) => i)),
      };
      s.bank = set.bankReserve ? BANK_PER_PLAYER * s.players.length : null;
      s.stock = initialStock(s);
      s.phase = 'playing';
      s.startedAt = now;
      s.endsAt = set.timeLimit ? now + set.timeLimit * 60_000 : null;
      s.turn = newTurn(s.players[0].id);
      if (set.startingCities) dealCities(s, ctx);
      recordWorth(s);
      log(s, ctx, `Game started on ${mapOf(s).name} (${s.size} tiles). ${s.players[0].name} goes first.`);
      break;
    }

    case 'roll': {
      const p = requireTurn(s, playerId, 'roll');
      if (p.cash < 0) fail('Clear your debt before rolling');
      if (s.auction) fail('Wait for the auction to finish');
      const d = ctx.opts.dice ?? rollPair(s);
      const dice: [number, number] = [d[0], d[1]];
      const isDouble = dice[0] === dice[1];
      const sum = dice[0] + dice[1];
      s.rollSeq++;
      // unclaimed rent expires once the next roll happens
      s.rentClaims = [];
      s.turn!.dice = dice;
      s.turn!.speed = null;
      s.lastCard = null;
      fx(s, isDouble ? 'doubles' : 'dice', p.id);
      log(s, ctx, `${p.name} rolled ${dice[0]} + ${dice[1]}${isDouble ? ' (doubles)' : ''}`);
      if (isDouble && set.doublesBonus && !p.inJail) collect(s, ctx, p, set.doublesBonus, 'as a doubles bonus');

      if (p.inJail) {
        s.turn!.extraRoll = false;
        if (isDouble) {
          p.inJail = false;
          p.jailTurns = 0;
          fx(s, 'jailFree', p.id);
          log(s, ctx, `${p.name} rolled doubles and left Prison`);
        } else {
          p.jailTurns++;
          if (p.jailTurns < set.jailTries) {
            s.turn!.stage = 'end';
            break;
          }
          pay(s, ctx, p, null, set.jailFine, 'to leave Prison', { toPot: true });
          p.inJail = false;
          p.jailTurns = 0;
        }
        stepPlayer(s, ctx, p, specialSteps(s, ctx, p, sum));
        afterMove(s, ctx);
        break;
      }

      if (isDouble) {
        s.turn!.doubles++;
        if (s.turn!.doubles >= 3 && set.tripleDoublesJail) {
          log(s, ctx, `${p.name} rolled doubles three times`);
          sendToJail(s, ctx, p);
          s.turn!.stage = 'end';
          break;
        }
      }
      s.turn!.extraRoll = isDouble;

      // the speed die joins after your first lap
      if (set.speedDie && stat(s, p.id).laps >= 1) {
        const face = ctx.opts.speed ?? pick(s, SPEED_FACES);
        s.turn!.speed = face;
        fx(s, 'speed', p.id);
        if (typeof face === 'number' && face === dice[0] && face === dice[1]) {
          log(s, ctx, `${p.name} rolled triples! Pick any tile`);
          s.turn!.extraRoll = false;
          s.turn!.stage = 'teleport';
          break;
        }
        if (face === 'bus') {
          log(s, ctx, `${p.name} rolled the bus: move by one die or the total`);
          s.turn!.stage = 'bus';
          break;
        }
        if (face === 'rocket') {
          if (p.reverse) {
            stepPlayer(s, ctx, p, sum);
          } else {
            const from = p.position;
            const mid = (from + sum) % s.size;
            const target = nextUnowned(s, mid);
            log(s, ctx, `${p.name}'s rocket flies on to ${tileOf(s, target).name}`);
            moveBy(s, ctx, p, (target - from + s.size) % s.size || sum);
          }
          afterMove(s, ctx);
          break;
        }
        stepPlayer(s, ctx, p, specialSteps(s, ctx, p, sum + face));
        afterMove(s, ctx);
        break;
      }
      stepPlayer(s, ctx, p, specialSteps(s, ctx, p, sum));
      afterMove(s, ctx);
      break;
    }

    case 'busChoice': {
      const p = requireTurn(s, playerId, 'bus');
      const d = s.turn!.dice!;
      const steps = action.pick === 0 ? d[0] : action.pick === 1 ? d[1] : d[0] + d[1];
      s.turn!.stage = 'roll';
      stepPlayer(s, ctx, p, specialSteps(s, ctx, p, steps));
      afterMove(s, ctx);
      break;
    }

    case 'teleportTo': {
      const p = requireTurn(s, playerId, 'teleport');
      const to = int(action.tile);
      if (!(to >= 0 && to < s.size)) fail('Pick a tile on the board');
      s.turn!.stage = 'roll';
      log(s, ctx, `${p.name} teleported to ${tileOf(s, to).name}`);
      moveTo(s, ctx, p, to);
      afterMove(s, ctx);
      break;
    }

    case 'buy': {
      const p = requireTurn(s, playerId, 'buy');
      const tile = tileOf(s, s.turn!.pendingTile!);
      if (p.cash < tile.price!) fail('Not enough cash');
      checkCityCap(s, p, 1);
      pay(s, ctx, p, null, tile.price!, `for ${tile.name}`, { spent: true });
      s.properties[tile.index] = { owner: p.id, houses: 0, mortgaged: false, frozen: 0 };
      fx(s, 'buy', p.id, { tile: tile.index, amount: tile.price });
      grantFreeHouses(s, ctx, p.id);
      finishStep(s, ctx);
      break;
    }

    case 'decline': {
      const p = requireTurn(s, playerId, 'buy');
      const tile = tileOf(s, s.turn!.pendingTile!);
      if (set.auctions) {
        startAuction(s, ctx, tile.index, null);
        s.turn!.stage = 'auction';
        log(s, ctx, `${p.name} skipped ${tile.name}; ${s.auction!.sealed ? 'sealed ' : ''}auction started`);
      } else {
        log(s, ctx, `${p.name} skipped ${tile.name}`);
        finishStep(s, ctx);
      }
      break;
    }

    case 'bid': {
      const a = s.auction;
      if (!a) fail('No auction running');
      const p = requirePlaying(s, playerId);
      const amount = int(action.amount);
      if (amount > p.cash) fail('Not enough cash');
      checkCityCap(s, p, 1);
      if (a.sealed) {
        if (a.bids.some((b) => b.pid === p.id)) fail('You already placed your sealed bid');
        if (!(amount >= a.opening)) fail(`Bid at least ${money(a.opening)}`);
        a.bids.push({ pid: p.id, amount });
        fx(s, 'bid', p.id);
        log(s, ctx, `${p.name} placed a sealed bid`);
        // everyone has bid: open the envelopes now
        if (alive(s).every((x) => a.bids.some((b) => b.pid === x.id))) a.endsAt = now;
        break;
      }
      if (a.highBidder === p.id) fail('You are already the highest bidder');
      if (!(amount > a.highBid) || amount < a.opening) fail(`Bid more than ${money(Math.max(a.highBid, a.opening - 1))}`);
      a.highBid = amount;
      a.highBidder = p.id;
      a.endsAt = Math.max(a.endsAt, now + set.auctionTimer * 1000);
      fx(s, 'bid', p.id);
      log(s, ctx, `${p.name} bid ${money(amount)}`);
      break;
    }

    case 'endTurn': {
      const p = requireTurn(s, playerId, 'end');
      if (p.cash < 0) fail('Sell or mortgage to pay your debt, or declare bankruptcy');
      if (s.auction) fail('Wait for the auction to finish');
      advanceTurn(s, ctx);
      break;
    }

    case 'payJail': {
      const p = requireTurn(s, playerId, 'roll');
      if (!p.inJail) fail("You're not in Prison");
      if (p.cash < set.jailFine) fail('Not enough cash');
      pay(s, ctx, p, null, set.jailFine, 'to leave Prison', { toPot: true });
      p.inJail = false;
      p.jailTurns = 0;
      fx(s, 'jailFree', p.id);
      break;
    }

    case 'useJailCard': {
      const p = requireTurn(s, playerId, 'roll');
      if (!p.inJail) fail("You're not in Prison");
      if (p.jailCards < 1) fail('No get-out card');
      p.jailCards--;
      p.inJail = false;
      p.jailTurns = 0;
      fx(s, 'jailFree', p.id);
      log(s, ctx, `${p.name} used a get-out-of-Prison card`);
      break;
    }

    case 'build': {
      const p = requireTurn(s, playerId);
      const { tile, own } = ownedTile(s, playerId, action.tile);
      if (tile.kind !== 'property') fail('You can only build on cities');
      const group = mapOf(s).groups[tile.group!];
      if (!ownsGroup(s, p.id, tile.group!)) fail(`Own all of ${group.name} first`);
      const setTiles = group.tiles.map((i) => s.properties[i]);
      if (setTiles.some((o) => o.mortgaged)) fail('Unmortgage the whole set first');
      if (own.houses >= maxBuildings(s)) fail('Nothing more to build here');
      if (specialOn(s, 'world.embargo') && s.special.embargo?.group === tile.group) fail(`${group.name} is under embargo`);
      const capital = capitalOf(s, tile.group!);
      const heritage = specialOn(s, 'eu.heritage');
      if (heritage && capital === action.tile && own.houses >= 2) fail('Heritage capitals hold at most 2 houses');
      // a capped heritage capital doesn't hold the rest of the set back
      const heights = group.tiles
        .filter((i) => !(heritage && i === capital && s.properties[i].houses >= 2))
        .map((i) => s.properties[i].houses);
      if (set.evenBuild && heights.length && own.houses > Math.min(...heights)) fail('Build evenly across the set');
      const cost = buildCost(tile, own.houses);
      if (p.cash < cost) fail('Not enough cash');
      if (!takeStock(s, own.houses)) fail(`The bank has run out of ${own.houses < 4 ? 'houses' : own.houses === 4 ? 'hotels' : 'towers'}`);
      pay(s, ctx, p, null, cost, `to build a ${BUILDING_NAMES[own.houses + 1].replace(/^1 /, '')} on ${tile.name}`, { spent: true });
      own.houses++;
      fx(s, own.houses >= 6 ? 'mega' : own.houses === 5 ? 'hotel' : 'build', p.id, { tile: tile.index });
      break;
    }

    case 'sellHouse': {
      const p = requirePlaying(s, playerId);
      const { tile, own } = ownedTile(s, playerId, action.tile);
      if (own.houses < 1) fail('Nothing to sell');
      const group = mapOf(s).groups[tile.group!];
      if (set.evenBuild && own.houses < Math.max(...group.tiles.map((i) => s.properties[i]?.houses ?? 0)))
        fail('Sell evenly across the set');
      const from = own.houses;
      own.houses = returnStock(s, from);
      let refund = 0;
      for (let h = own.houses; h < from; h++) refund += Math.floor(buildCost(tile, h) / 2);
      collect(s, ctx, p, refund, `selling ${from - own.houses > 1 ? 'buildings' : 'a building'} on ${tile.name}`);
      if (own.houses === 0 && from === 5) log(s, ctx, `No houses left in the bank, so the hotel on ${tile.name} was sold outright`);
      fx(s, 'sell', p.id);
      break;
    }

    case 'mortgage': {
      const p = requirePlaying(s, playerId);
      if (set.mortgages === 'off') fail('Mortgages are off in this room');
      const { tile, own } = ownedTile(s, playerId, action.tile);
      if (specialOn(s, 'world.embargo') && s.special.embargo?.group === tile.group) fail('That country is under embargo');
      if (own.mortgaged) fail('Already mortgaged');
      if (tile.group && mapOf(s).groups[tile.group].tiles.some((i) => (s.properties[i]?.houses ?? 0) > 0))
        fail('Sell the buildings in this set first');
      if (s.bank !== null && s.bank < mortgageValue(tile)) fail('The bank is out of money');
      own.mortgaged = true;
      collect(s, ctx, p, mortgageValue(tile), `mortgaging ${tile.name}`);
      fx(s, 'sell', p.id);
      break;
    }

    case 'unmortgage': {
      const p = requireTurn(s, playerId);
      const { tile, own } = ownedTile(s, playerId, action.tile);
      if (!own.mortgaged) fail('Not mortgaged');
      const cost = unmortgageCost(tile);
      if (p.cash < cost) fail('Not enough cash');
      pay(s, ctx, p, null, cost, `to unmortgage ${tile.name}`);
      own.mortgaged = false;
      fx(s, 'buy', p.id);
      grantFreeHouses(s, ctx, p.id);
      break;
    }

    case 'bankrupt': {
      const p = requirePlaying(s, playerId);
      bankruptPlayer(s, ctx, p);
      break;
    }

    case 'collectRent': {
      const me = requirePlaying(s, playerId);
      const claim = s.rentClaims.find((c) => c.id === action.id && c.owner === me.id);
      if (!claim) fail('Too late: that rent expired');
      s.rentClaims = s.rentClaims.filter((c) => c !== claim);
      const payer = s.players.find((x) => x.id === claim.payer && !x.bankrupt);
      if (!payer) fail('That player is out');
      settleRent(s, ctx, payer, me, tileOf(s, claim.tile), claim.amount);
      break;
    }

    // ----- trading -----

    case 'proposeTrade': {
      const me = requirePlaying(s, playerId);
      const them = otherPlayer(s, me, action.to);
      const give = cleanSide(action.give);
      const get = cleanSide(action.get);
      if (sideIsEmpty(give) && sideIsEmpty(get)) fail('Add something to the trade');
      if (action.counterOf !== undefined) {
        const old = s.offers.find((o) => o.id === action.counterOf && o.to === me.id);
        if (!old) fail('That offer is gone');
        s.offers = s.offers.filter((o) => o !== old);
      }
      checkCanOffer(s, me);
      checkTrade(s, me, them, give, get);
      s.offers.push({ kind: 'trade', id: ++s.seq, from: me.id, to: them.id, give, get, at: now });
      fx(s, 'offer', them.id);
      log(s, ctx, `${me.name} ${action.counterOf !== undefined ? 'countered with' : 'offered'} ${them.name} a trade`);
      break;
    }

    case 'proposeLoan': {
      const me = requirePlaying(s, playerId);
      if (!set.playerLoans) fail('Player loans are off in this room');
      const them = otherPlayer(s, me, action.to);
      const amount = int(action.amount);
      const repay = int(action.repay);
      const turns = int(action.turns);
      if (!(amount >= 10 && amount <= 5000)) fail('Loan must be $10-$5000');
      if (!(repay >= amount && repay <= amount * 3)) fail('Repayment must be between the loan and 3x the loan');
      if (!(turns >= 1 && turns <= MAX_LOAN_TURNS)) fail(`Loan length must be 1-${MAX_LOAN_TURNS} turns`);
      const lender = action.lend ? me : them;
      if (lender.cash < amount) fail(`${lender.name} doesn't have $${amount}`);
      checkCanOffer(s, me);
      s.offers.push({
        kind: 'loan',
        id: ++s.seq,
        from: me.id,
        to: them.id,
        lender: lender.id,
        borrower: action.lend ? them.id : me.id,
        amount,
        repay,
        turns,
        at: now,
      });
      fx(s, 'offer', them.id);
      log(s, ctx, action.lend ? `${me.name} offered ${them.name} a ${money(amount)} loan` : `${me.name} asked ${them.name} for a ${money(amount)} loan`);
      break;
    }

    case 'proposeAlliance': {
      const me = requirePlaying(s, playerId);
      if (!set.alliances) fail('Alliances are off in this room');
      const them = otherPlayer(s, me, action.to);
      if (s.alliances.some((a) => [a.a, a.b].includes(me.id))) fail('You already have an ally');
      if (s.alliances.some((a) => [a.a, a.b].includes(them.id))) fail(`${them.name} already has an ally`);
      if (s.offers.some((o) => o.kind === 'alliance' && o.from === me.id && o.to === them.id)) fail('Already asked');
      checkCanOffer(s, me);
      s.offers.push({ kind: 'alliance', id: ++s.seq, from: me.id, to: them.id, at: now });
      fx(s, 'offer', them.id);
      log(s, ctx, `${me.name} proposed an alliance to ${them.name}`);
      break;
    }

    case 'breakAlliance': {
      const me = requirePlaying(s, playerId);
      const al = s.alliances.find((a) => a.id === action.id && (a.a === me.id || a.b === me.id));
      if (!al) fail('No such alliance');
      const other = player(s, al.a === me.id ? al.b : al.a);
      s.alliances = s.alliances.filter((a) => a !== al);
      fx(s, 'betray', me.id);
      log(s, ctx, `${me.name} betrayed ${other.name}! Their alliance is over.`);
      break;
    }

    case 'respondOffer': {
      const me = requirePlaying(s, playerId);
      const offer = s.offers.find((o) => o.id === action.id);
      if (!offer || offer.to !== me.id) fail('That offer is gone');
      const from = player(s, offer.from);
      if (!action.accept) {
        s.offers = s.offers.filter((o) => o !== offer);
        log(s, ctx, `${me.name} declined ${from.name}'s ${offer.kind}`);
        break;
      }
      if (offer.kind === 'trade') {
        checkTrade(s, from, me, offer.give, offer.get);
        s.offers = s.offers.filter((o) => o !== offer);
        const bystanders = alive(s).filter((p) => p.id !== from.id && p.id !== me.id);
        if (set.tradeVeto && bystanders.length > 0) {
          s.vetoQueue.push({ id: ++s.seq, offer, executeAt: now + VETO_MS, vetoes: [] });
          fx(s, 'veto');
          log(s, ctx, `${me.name} accepted ${from.name}'s trade. Others have ${VETO_MS / 1000}s to veto it`);
        } else executeTrade(s, ctx, offer, from, me);
      } else if (offer.kind === 'loan') {
        const lender = player(s, offer.lender);
        const borrower = player(s, offer.borrower);
        if (lender.cash < offer.amount) fail(`${lender.name} doesn't have $${offer.amount} anymore`);
        s.offers = s.offers.filter((o) => o !== offer);
        lender.cash -= offer.amount;
        borrower.cash += offer.amount;
        if (borrower.cash >= 0) borrower.debtTo = null;
        s.loans.push({ id: ++s.seq, lender: lender.id, borrower: borrower.id, repay: offer.repay, turnsLeft: offer.turns });
        fx(s, 'loan', borrower.id);
        log(
          s,
          ctx,
          `${lender.name} lent ${borrower.name} ${money(offer.amount)}; ${money(offer.repay)} due in ${offer.turns} turn${offer.turns > 1 ? 's' : ''}`,
        );
      } else {
        if (s.alliances.some((a) => [a.a, a.b].some((x) => x === me.id || x === from.id))) fail('One of you already has an ally');
        s.offers = s.offers.filter((o) => o !== offer && !(o.kind === 'alliance' && [o.from, o.to].some((x) => x === me.id || x === from.id)));
        s.alliances.push({ id: ++s.seq, a: from.id, b: me.id });
        fx(s, 'alliance', me.id);
        log(s, ctx, `${from.name} and ${me.name} formed an alliance: no rent between them`);
      }
      break;
    }

    case 'vetoTrade': {
      const me = requirePlaying(s, playerId);
      const v = s.vetoQueue.find((x) => x.id === action.id);
      if (!v) fail('That trade already went through');
      if (v.offer.from === me.id || v.offer.to === me.id) fail("You can't veto your own trade");
      if (v.vetoes.includes(me.id)) fail('You already vetoed it');
      v.vetoes.push(me.id);
      const others = alive(s).filter((p) => p.id !== v.offer.from && p.id !== v.offer.to).length;
      if (v.vetoes.length > others / 2) {
        s.vetoQueue = s.vetoQueue.filter((x) => x !== v);
        log(s, ctx, `The table vetoed the trade between ${player(s, v.offer.from).name} and ${player(s, v.offer.to).name}`);
      } else log(s, ctx, `${me.name} voted to veto the trade`);
      break;
    }

    case 'cancelOffer': {
      const me = player(s, playerId);
      const offer = s.offers.find((o) => o.id === action.id);
      if (!offer || offer.from !== me.id) fail('That offer is gone');
      s.offers = s.offers.filter((o) => o !== offer);
      break;
    }

    case 'repayLoan': {
      const me = requirePlaying(s, playerId);
      const loan = s.loans.find((l) => l.id === action.id && l.borrower === me.id);
      if (!loan) fail('No such loan');
      if (me.cash < loan.repay) fail('Not enough cash');
      const lender = s.players.find((x) => x.id === loan.lender && !x.bankrupt) ?? null;
      pay(s, ctx, me, lender, loan.repay, 'to repay a loan early');
      s.loans = s.loans.filter((l) => l !== loan);
      break;
    }

    case 'bankBorrow': {
      const me = requirePlaying(s, playerId);
      if (!set.bankLoans) fail('Bank loans are off in this room');
      const amount = int(action.amount);
      const room = bankLoanLimit(s) - me.bankLoan;
      if (!(amount > 0)) fail('Pick an amount');
      if (amount > room) fail(`The bank will only lend you ${money(Math.max(0, room))} more`);
      if (s.bank !== null && s.bank < amount) fail('The bank is out of money');
      me.bankLoan += amount;
      collect(s, ctx, me, amount, 'as a bank loan');
      fx(s, 'loan', me.id);
      break;
    }

    case 'bankRepay': {
      const me = requirePlaying(s, playerId);
      const amount = Math.min(int(action.amount), me.bankLoan);
      if (!(amount > 0)) fail('Nothing to repay');
      if (me.cash < amount) fail('Not enough cash');
      me.cash -= amount;
      me.bankLoan -= amount;
      if (s.bank !== null) s.bank += amount;
      log(s, ctx, `${me.name} repaid ${money(amount)} to the bank`);
      break;
    }

    // ----- party rules -----

    case 'usePowerUp': {
      const p = requireTurn(s, playerId);
      if (s.auction) fail('Wait for the auction to finish');
      const kind = p.powerUps[int(action.index)];
      if (!kind) fail('No such power-up');
      if (kind === 'shield') {
        p.shield = true;
        fx(s, 'shield', p.id);
        log(s, ctx, `${p.name} raised a Shield: no rent for the rest of this turn`);
      } else if (kind === 'jet') {
        if (s.turn!.stage !== 'roll' || p.inJail) fail('Use the jet before you roll, outside Prison');
        const to = int(action.tile);
        const ahead = (to - p.position + s.size) % s.size;
        if (!(to >= 0 && to < s.size) || ahead < 1 || ahead > JET_RANGE) fail(`Pick a tile 1-${JET_RANGE} spaces ahead`);
        p.powerUps.splice(int(action.index), 1);
        fx(s, 'jet', p.id);
        log(s, ctx, `${p.name} took a Private Jet to ${tileOf(s, to).name}`);
        s.turn!.extraRoll = false;
        s.turn!.dice = null;
        s.lastCard = null;
        moveTo(s, ctx, p, to);
        afterMove(s, ctx);
        break;
      } else {
        const target = otherPlayer(s, p, action.target);
        if (kind === 'freeze') {
          target.frozenTurns = Math.max(target.frozenTurns, 1);
          fx(s, 'powerUse', p.id);
          log(s, ctx, `${p.name} froze ${target.name}'s rent until their next turn ends`);
        } else {
          const amount = Math.max(0, Math.min(200, Math.max(20, Math.floor(target.cash * 0.1)), target.cash));
          if (amount <= 0) fail(`${target.name} has no cash to steal`);
          target.cash -= amount;
          collect(s, ctx, p, amount, `in a Heist on ${target.name}`, false);
          fx(s, 'heist', p.id);
        }
      }
      p.powerUps.splice(int(action.index), 1);
      break;
    }

    case 'sabotage': {
      const p = requireTurn(s, playerId, 'sabotage');
      const own = s.properties[int(action.tile)];
      const tile = tileOf(s, int(action.tile));
      if (!own || own.owner === p.id || own.mortgaged) fail("Pick a rival's city");
      const owner = player(s, own.owner);
      if (action.mode === 'demolish') {
        if (own.houses < 1) fail('Nothing built there');
        own.houses = returnStock(s, own.houses);
        log(s, ctx, `${p.name} sabotaged ${owner.name}: a building on ${tile.name} was demolished`);
      } else {
        own.frozen = SABOTAGE_TURNS;
        log(s, ctx, `${p.name} sabotaged ${tile.name}: no rent for ${SABOTAGE_TURNS} of ${owner.name}'s turns`);
      }
      fx(s, 'sabotage', p.id);
      finishStep(s, ctx);
      break;
    }

    case 'buyShare': {
      const p = requireTurn(s, playerId, 'stocks');
      const group = mapOf(s).groups[action.group];
      if (!group) fail('No such stock');
      const holders = (s.shares[group.id] ??= {});
      if ((holders[p.id] ?? 0) >= MAX_SHARES) fail(`Max ${MAX_SHARES} shares per stock`);
      const price = sharePrice(s, group.id);
      if (p.cash < price) fail('Not enough cash');
      pay(s, ctx, p, null, price, `for a ${group.name} share`, { spent: true });
      holders[p.id] = (holders[p.id] ?? 0) + 1;
      fx(s, 'stock', p.id);
      break;
    }

    case 'sellShare': {
      const p = requireTurn(s, playerId, 'stocks');
      const group = mapOf(s).groups[action.group];
      const holders = group ? s.shares[group.id] : undefined;
      if (!group || !holders?.[p.id]) fail("You don't hold that stock");
      holders[p.id]--;
      collect(s, ctx, p, sharePrice(s, group.id), `selling a ${group.name} share`);
      fx(s, 'stock', p.id);
      break;
    }

    case 'miniGuess': {
      const p = requireTurn(s, playerId, 'minigame');
      const shown = s.turn!.mini!.shown;
      const rolled = d6(s);
      const won = action.higher ? rolled > shown : rolled < shown;
      let text = `Arcade: ${shown} then ${rolled}. `;
      if (rolled === shown) {
        text += 'A tie, no prize.';
        log(s, ctx, `${p.name}'s arcade game was a tie`);
        fx(s, 'arcadeTie', p.id);
      } else if (won) {
        text += `${p.name} guessed right and won $100!`;
        collect(s, ctx, p, 100, 'at the Arcade');
        fx(s, 'arcadeWin', p.id);
      } else {
        text += `${p.name} guessed wrong and lost $50.`;
        pay(s, ctx, p, null, 50, 'at the Arcade', { toPot: true });
        fx(s, 'arcadeLose', p.id);
      }
      s.lastCard = { deck: 'arcade', text, playerId: p.id, at: now };
      finishStep(s, ctx);
      break;
    }

    case 'skipSpecial': {
      const p = requireTurn(s, playerId);
      if (!['sabotage', 'stocks', 'minigame', 'travel'].includes(s.turn!.stage)) fail('Nothing to skip');
      if (s.turn!.stage !== 'stocks' && s.turn!.stage !== 'travel') log(s, ctx, `${p.name} passed`);
      s.turn!.travel = null;
      finishStep(s, ctx);
      break;
    }

    case 'buyInsurance': {
      const p = requireTurn(s, playerId);
      if (!set.insurance) fail('Insurance is off in this room');
      if (p.insuredTurns > 0) fail('Already insured');
      if (p.cash < INSURANCE_COST) fail('Not enough cash');
      pay(s, ctx, p, null, INSURANCE_COST, `for ${INSURANCE_TURNS} turns of rent insurance`, { spent: true });
      p.insuredTurns = INSURANCE_TURNS;
      fx(s, 'insurance', p.id);
      break;
    }

    // ----- map specials -----

    case 'travel': {
      const p = requireTurn(s, playerId, 'travel');
      const offer = s.turn!.travel;
      if (!offer) fail('No ride on offer');
      const map = mapOf(s);
      const to = int(action.tile);
      if (!map.airports.includes(to) || to === p.position) fail('Pick another airport or station');
      if (p.cash < offer.cost) fail('Not enough cash');
      s.turn!.travel = null;
      if (offer.cost) pay(s, ctx, p, null, offer.cost, `to travel to ${tileOf(s, to).name}`);
      fx(s, 'train', p.id);
      log(s, ctx, `${p.name} travelled to ${tileOf(s, to).name}`);
      s.turn!.stage = 'roll';
      moveTo(s, ctx, p, to);
      // one connection per landing
      s.turn!.travel = null;
      afterMove(s, ctx);
      break;
    }

    case 'bribe': {
      const p = requireTurn(s, playerId, 'bribe');
      const b = s.turn!.bribe!;
      s.turn!.bribe = null;
      const tile = tileOf(s, b.tile);
      const due = () => {
        if (b.kind === 'jail') sendToJail(s, ctx, p);
        else {
          const tax = taxFor(s, p, tile);
          if (tax > 0) pay(s, ctx, p, null, tax, `for ${tile.name}`, { toPot: true });
        }
      };
      if (!action.offer) due();
      else {
        pay(s, ctx, p, null, 50, 'in chai-pani');
        fx(s, 'heist', p.id);
        if (random(s) < 0.7) log(s, ctx, `The bribe worked: ${p.name} walks away`);
        else {
          log(s, ctx, `${p.name} got caught bribing!`);
          if (b.kind === 'jail') sendToJail(s, ctx, p);
          else pay(s, ctx, p, null, taxFor(s, p, tile) * 2, `as a fine for bribery`, { toPot: true });
        }
      }
      finishStep(s, ctx);
      break;
    }

    case 'schengen': {
      const p = requireTurn(s, playerId, 'roll');
      if (!specialOn(s, 'eu.schengen')) fail('Schengen hops are off');
      if (p.inJail) fail("You can't hop out of Prison");
      const lap = stat(s, p.id).laps;
      if (s.special.schengen[p.id] === lap) fail('You already hopped this lap');
      s.special.schengen[p.id] = lap;
      s.turn!.bonus = action.extra === 2 ? 2 : 1;
      log(s, ctx, `${p.name} takes a Schengen hop: +${s.turn!.bonus} on this roll`);
      break;
    }

    case 'attack': {
      const p = requireTurn(s, playerId);
      const war = s.special.war;
      if (!specialOn(s, 'world.war') || !war) fail('There is no war right now');
      if (s.turn!.attacked) fail('One attack per turn');
      if (s.auction) fail('Wait for the auction to finish');
      const target = s.properties[int(action.tile)];
      const tile = tileOf(s, int(action.tile));
      if (!target || target.owner === p.id || !tile.group || ![war.a, war.b].includes(tile.group)) fail('Pick a rival city in a warring country');
      const home = tile.group === war.a ? war.b : war.a;
      const homeTiles = mapOf(s).groups[home].tiles.filter((i) => s.properties[i]?.owner === p.id);
      if (!homeTiles.length) fail(`You need a city in ${groupName(s, home)} to attack`);
      if (p.cash < 100) fail('Not enough cash');
      pay(s, ctx, p, null, 100, 'to launch an attack');
      s.turn!.attacked = true;
      const atk = d6(s);
      const def = d6(s);
      const defender = player(s, target.owner);
      fx(s, 'war', p.id);
      if (atk > def) {
        if (target.houses > 0) target.houses = returnStock(s, target.houses);
        else target.frozen = Math.max(target.frozen, 1);
        eventCard(s, ctx, `${p.name} attacked ${tile.name} (${atk} vs ${def}) and won! ${defender.name} ${target.frozen ? 'loses rent there for a turn' : 'loses a building'}.`, 'war');
      } else {
        const built = homeTiles.filter((i) => s.properties[i].houses > 0);
        if (built.length) {
          const i = pick(s, built);
          s.properties[i].houses = returnStock(s, s.properties[i].houses);
        }
        eventCard(s, ctx, `${p.name}'s attack on ${tile.name} failed (${atk} vs ${def})${built.length ? ' and they lost a building' : ''}.`, 'war');
      }
      break;
    }

    case 'buyUps': {
      const p = requirePlaying(s, playerId);
      if (!specialOn(s, 'pk.ups')) fail('UPS is off');
      if ((s.special.ups[p.id] ?? 0) > 0) fail('Your UPS is already running');
      if (p.cash < 150) fail('Not enough cash');
      pay(s, ctx, p, null, 150, 'for a UPS');
      s.special.ups[p.id] = 5;
      fx(s, 'insurance', p.id);
      break;
    }

    case 'vote': {
      const p = requirePlaying(s, playerId);
      const v = s.special.vote;
      if (!v || now >= v.endsAt) fail('Voting is closed');
      if (!v.groups.includes(action.group)) fail('Unknown country');
      v.votes[p.id] = action.group;
      fx(s, 'bid', p.id);
      break;
    }

    case 'bet': {
      const p = requirePlaying(s, playerId);
      const m = s.special.match;
      if (!m || now >= m.endsAt) fail('Betting is closed');
      if (m.bets[p.id]) fail('You already bet');
      if (![m.a, m.b].includes(action.group)) fail('Bet on one of the two finalists');
      const amount = int(action.amount);
      if (!(amount >= 50 && amount <= 200)) fail('Bet $50-$200');
      if (p.cash < amount) fail('Not enough cash');
      pay(s, ctx, p, null, amount, `on ${groupName(s, action.group)}`);
      m.bets[p.id] = { group: action.group, amount };
      fx(s, 'bid', p.id);
      break;
    }

    default:
      fail('Unknown action');
  }
}

/** Starting cities: deals N random cities to each player, never a complete set. */
function dealCities(s: GameState, ctx: Ctx) {
  const map = mapOf(s);
  let pool = shuffle(
    s,
    map.tiles.filter((t) => t.kind === 'property').map((t) => t.index),
  );
  for (let r = 0; r < s.settings.startingCities; r++) {
    for (const p of s.players) {
      const i = pool.findIndex((idx) => {
        const g = map.groups[map.tiles[idx].group!];
        return !g.tiles.every((t) => t === idx || s.properties[t]?.owner === p.id);
      });
      if (i < 0) continue;
      const idx = pool[i];
      pool = pool.filter((_, k) => k !== i);
      s.properties[idx] = { owner: p.id, houses: 0, mortgaged: false, frozen: 0 };
    }
  }
  log(s, ctx, `Each player was dealt ${s.settings.startingCities} random cit${s.settings.startingCities > 1 ? 'ies' : 'y'}`);
}
