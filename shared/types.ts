export type TileKind =
  | 'go'
  | 'property'
  | 'airport'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'jail'
  | 'parking'
  | 'gotojail';

export interface Tile {
  index: number;
  kind: TileKind;
  name: string;
  group?: string;
  price?: number;
  /** property: [base, 1 house, 2, 3, 4, hotel] */
  rents?: number[];
  houseCost?: number;
  tax?: number;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  /** ISO 3166 code for a flag badge, e.g. 'gb' */
  flag?: string;
  /** emoji badge for maps without country flags */
  badge?: string;
  tiles: number[];
}

export interface BoardMap {
  id: string;
  name: string;
  blurb: string;
  /** 40, 48 or 56 tiles */
  size: number;
  /** tiles between two corners */
  side: number;
  tiles: Tile[];
  groups: Record<string, Group>;
  jail: number;
  parking: number;
  goToJail: number;
  airports: number[];
  utilities: number[];
  /** card tiles that become special squares when their rule is on */
  specials: { sabotage: number; stocks: number; arcade: number };
}

export type PowerUpKind = 'shield' | 'jet' | 'freeze' | 'heist';

export interface Player {
  id: string;
  name: string;
  color: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  connected: boolean;
  /** who gets this player's assets if they go bankrupt while cash is negative (null = bank) */
  debtTo: string | null;
  /** outstanding bank loan; interest is charged each time they pass Start */
  bankLoan: number;
  powerUps: PowerUpKind[];
  /** blocks rent this player would pay during the current turn */
  shield: boolean;
  /** this player's cities collect no rent until their Nth turn ends */
  frozenTurns: number;
  /** own turns of rent insurance left */
  insuredTurns: number;
  /** next roll moves backwards (Chaos card) */
  reverse: boolean;
  /** turns auto-played while offline, for the offline-player rule */
  missed: number;
  /** already used their second chance */
  revived: boolean;
  /** set per viewer when cash is hidden: 'hidden' or [low, high] */
  cashMask?: 'hidden' | [number, number];
}

export interface Ownership {
  owner: string;
  /** 0-4 houses, 5 hotel, 6 skyscraper, 7 landmark */
  houses: number;
  mortgaged: boolean;
  /** owner turns this city stays sabotaged (no rent) */
  frozen: number;
}

export type Stage = 'roll' | 'buy' | 'auction' | 'sabotage' | 'stocks' | 'minigame' | 'bus' | 'teleport' | 'travel' | 'bribe' | 'end';

export type SpeedFace = 1 | 2 | 3 | 'bus' | 'rocket';

export interface Turn {
  playerId: string;
  stage: Stage;
  dice: [number, number] | null;
  doubles: number;
  extraRoll: boolean;
  pendingTile: number | null;
  /** auto-play time for this turn step, when a timer is on */
  deadline: number | null;
  /** higher/lower mini-game: the die shown to the player */
  mini: { shown: number } | null;
  /** third die when the speed die rule is on */
  speed: SpeedFace | null;
  /** Schengen hop: extra steps added to this turn's roll */
  bonus: number;
  /** connecting flight / rail pass offer after landing on an airport or station */
  travel: { cost: number } | null;
  /** chai-pani: what the bribe would skip */
  bribe: { kind: 'tax' | 'jail'; tile: number } | null;
  /** already attacked this turn (World War) */
  attacked: boolean;
}

export interface Auction {
  tile: number;
  highBid: number;
  highBidder: string | null;
  endsAt: number;
  /** minimum first bid */
  opening: number;
  /** sealed auctions: one secret bid per player, masked for other viewers */
  sealed: boolean;
  bids: { pid: string; amount: number }[];
  /** set when the city is being sold off for a bankrupt player; proceeds go here */
  liquidation: { creditor: string | null } | null;
}

export interface Settings {
  mapId: string;
  startingCash: number;
  maxPlayers: number;
  /** seconds per turn step, 0 = no timer */
  turnTimer: number;
  /** minutes until the richest player wins, 0 = play to the last player */
  timeLimit: number;
  auctions: boolean;
  doubleRentSet: boolean;
  noRentInJail: boolean;
  /** taxes and fines pile up on Vacation */
  jackpot: boolean;
  immunity: boolean;
  playerLoans: boolean;
  bankLoans: boolean;
  randomEvents: boolean;
  powerUps: boolean;
  megaBuildings: boolean;
  sabotage: boolean;
  stockMarket: boolean;
  insurance: boolean;
  leaderBounty: boolean;
  miniGames: boolean;
  wealthTax: boolean;
  alliances: boolean;

  // ----- general settings -----
  turnOrder: 'random' | 'join' | 'host';
  roomLock: boolean;
  spectators: boolean;
  spectatorChat: boolean;
  startSalary: number;
  exactStartDouble: boolean;
  rentSpeed: number;
  idleCashTax: boolean;
  hiddenCash: 'off' | 'ranges' | 'hidden';
  upkeep: boolean;
  bankReserve: boolean;
  mortgages: 'on' | 'interest' | 'off';
  evenBuild: boolean;
  buildingStock: 'unlimited' | 'classic' | 'tight' | 'scarce';
  firstHouseFree: boolean;
  auctionTimer: number;
  auctionOpening: 'one' | 'half';
  auctionMode: 'open' | 'sealed';
  tradeFreeze: number;
  offersOnTurnOnly: boolean;
  tradeVeto: boolean;
  /** 0 = no cap */
  cityCap: number;
  jailFine: number;
  jailTries: number;
  tripleDoublesJail: boolean;
  speedDie: boolean;
  fairDice: boolean;
  doublesBonus: number;
  deck: 'classic' | 'party' | 'chaos';
  callRent: boolean;
  catchUp: boolean;
  offline: 'auto' | 'skip' | 'bankrupt';
  startingCities: number;
  bankruptcy: 'creditor' | 'auction' | 'bank';
  secondChance: boolean;
  winCondition: 'last' | 'worth' | 'sets';
  winWorth: number;
  winSets: number;
  boardSize: 'auto' | 'standard' | 'large' | 'mega';
  /** map special ids the host switched off (all specials of the chosen map are on by default) */
  specialsOff: string[];
}

/** Live state of the map specials (World, Pakistan, Euro Trip). */
export interface SpecialState {
  war: { a: string; b: string; roundsLeft: number } | null;
  /** exchange-rate multiplier per set */
  rates: Record<string, number>;
  embargo: { group: string; roundsLeft: number } | null;
  olympics: { group: string; roundsLeft: number } | null;
  oil: number;
  lockdown: { side: number; roundsLeft: number } | null;
  /** turns a player must sit out (lockdown) */
  skip: Record<string, number>;
  blackout: { group: string; roundsLeft: number } | null;
  /** UPS protection: own turns left */
  ups: Record<string, number>;
  cricket: { group: string; roundsLeft: number } | null;
  /** next roll moves 2 fewer (traffic jam) */
  traffic: Record<string, boolean>;
  strike: number;
  season: 'summer' | 'winter';
  exited: string | null;
  /** lap number when each player last used their Schengen hop */
  schengen: Record<string, number>;
  vote: { groups: string[]; endsAt: number; votes: Record<string, string> } | null;
  match: { a: string; b: string; endsAt: number; bets: Record<string, { group: string; amount: number }> } | null;
}

/** One side of a trade: what that player hands over. */
export interface TradeSide {
  cash: number;
  tiles: number[];
  jailCards: number;
  /** giver promises the other player pays no rent on these tiles for `turns` of their turns */
  immunity: { tiles: number[]; turns: number } | null;
}

export interface TradeOffer {
  kind: 'trade';
  id: number;
  from: string;
  to: string;
  /** from -> to */
  give: TradeSide;
  /** to -> from */
  get: TradeSide;
  at: number;
}

export interface LoanOffer {
  kind: 'loan';
  id: number;
  from: string;
  to: string;
  lender: string;
  borrower: string;
  amount: number;
  /** total the borrower pays back */
  repay: number;
  /** borrower's turns until it is due */
  turns: number;
  at: number;
}

export interface AllianceOffer {
  kind: 'alliance';
  id: number;
  from: string;
  to: string;
  at: number;
}

export type Offer = TradeOffer | LoanOffer | AllianceOffer;

export interface Immunity {
  id: number;
  holder: string;
  owner: string;
  tiles: number[];
  turnsLeft: number;
}

export interface Loan {
  id: number;
  lender: string;
  borrower: string;
  repay: number;
  turnsLeft: number;
}

export interface Alliance {
  id: number;
  a: string;
  b: string;
}

export type EventKind = 'boom' | 'crash' | 'surge' | 'taxHoliday' | 'stimulus' | 'earthquake' | 'audit';

export interface WorldEvent {
  kind: EventKind;
  text: string;
  roundsLeft: number;
  at: number;
}

/** Sound-worthy moments; clients play one sound per new entry. */
export type FxKind =
  | 'dice'
  | 'doubles'
  | 'buy'
  | 'rent'
  | 'start'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'jail'
  | 'jailFree'
  | 'build'
  | 'hotel'
  | 'mega'
  | 'sell'
  | 'auction'
  | 'bid'
  | 'auctionWon'
  | 'offer'
  | 'trade'
  | 'loan'
  | 'alliance'
  | 'betray'
  | 'bankrupt'
  | 'win'
  | 'jackpot'
  | 'powerPickup'
  | 'powerUse'
  | 'heist'
  | 'jet'
  | 'shield'
  | 'sabotage'
  | 'stock'
  | 'arcadeWin'
  | 'arcadeLose'
  | 'arcadeTie'
  | 'event'
  | 'insurance'
  | 'claim'
  | 'veto'
  | 'speed'
  | 'chaos'
  | 'war'
  | 'train'
  | 'blackout';

export interface Fx {
  id: number;
  kind: FxKind;
  /** who it happened to (for 'offer', the player it was sent to) */
  pid: string | null;
  /** tile the effect happened on, for board animations */
  tile?: number;
  /** money moved, for floating +$/−$ labels */
  amount?: number;
}

export interface LogEntry {
  id: number;
  at: number;
  text: string;
}

export interface CardShown {
  deck: 'chance' | 'chest' | 'event' | 'arcade';
  text: string;
  playerId: string;
  at: number;
}

export interface PlayerStats {
  rentPaid: number;
  rentReceived: number;
  spent: number;
  laps: number;
}

export interface GameState {
  code: string;
  hostId: string;
  phase: 'lobby' | 'playing' | 'ended';
  settings: Settings;
  players: Player[];
  properties: Record<number, Ownership>;
  turn: Turn | null;
  auction: Auction | null;
  lastCard: CardShown | null;
  winner: string | null;
  offers: Offer[];
  immunities: Immunity[];
  loans: Loan[];
  alliances: Alliance[];
  /** shared id counter for offers and deals */
  seq: number;
  round: number;
  turnNo: number;
  pot: number;
  event: WorldEvent | null;
  startedAt: number | null;
  /** time-limit games end here */
  endsAt: number | null;
  /** shares[group][playerId] */
  shares: Record<string, Record<string, number>>;
  /** rent collected per group, drives share prices */
  groupRent: Record<string, number>;
  stats: Record<string, PlayerStats>;
  biggestRent: { amount: number; payer: string; owner: string; tile: number } | null;
  tileRent: Record<number, number>;
  /** net worth after each turn, for the chart */
  history: { n: number; worth: Record<string, number> }[];
  /** board tile count for this game */
  size: number;
  /** bank cash when Bank reserve is on, otherwise null */
  bank: number | null;
  /** building stock when a shortage rule is on, otherwise null */
  stock: { houses: number; hotels: number; mega: number } | null;
  /** rents the owner has to click to collect (Owner must call rent) */
  rentClaims: { id: number; payer: string; owner: string; amount: number; tile: number; roll: number }[];
  /** accepted trades waiting out the veto window */
  vetoQueue: { id: number; offer: TradeOffer; executeAt: number; vetoes: string[] }[];
  /** cities waiting to be auctioned off for a bankrupt player */
  auctionQueue: { tile: number; creditor: string | null }[];
  /** groups that already paid out their free house */
  freeHouses: string[];
  special: SpecialState;
  rollSeq: number;
  log: LogEntry[];
  logSeq: number;
  /** recent sound effects, newest last */
  fx: Fx[];
  fxSeq: number;
  version: number;
  /** hidden from clients */
  rng: number;
  decks: { chance: number[]; chest: number[] };
  /** fair-dice deck of the 36 combinations, hidden */
  diceDeck: number[];
}

export type PublicState = Omit<GameState, 'rng' | 'decks' | 'diceDeck'>;

export type Action =
  | { type: 'start' }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'kick'; playerId: string }
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'bid'; amount: number }
  | { type: 'endTurn' }
  | { type: 'build'; tile: number }
  | { type: 'sellHouse'; tile: number }
  | { type: 'mortgage'; tile: number }
  | { type: 'unmortgage'; tile: number }
  | { type: 'payJail' }
  | { type: 'useJailCard' }
  | { type: 'bankrupt' }
  | { type: 'proposeTrade'; to: string; give: TradeSide; get: TradeSide; counterOf?: number }
  | { type: 'proposeLoan'; to: string; lend: boolean; amount: number; repay: number; turns: number }
  | { type: 'proposeAlliance'; to: string }
  | { type: 'breakAlliance'; id: number }
  | { type: 'respondOffer'; id: number; accept: boolean }
  | { type: 'cancelOffer'; id: number }
  | { type: 'repayLoan'; id: number }
  | { type: 'bankBorrow'; amount: number }
  | { type: 'bankRepay'; amount: number }
  | { type: 'usePowerUp'; index: number; target?: string; tile?: number }
  | { type: 'sabotage'; tile: number; mode: 'freeze' | 'demolish' }
  | { type: 'buyShare'; group: string }
  | { type: 'sellShare'; group: string }
  | { type: 'miniGuess'; higher: boolean }
  | { type: 'skipSpecial' }
  | { type: 'buyInsurance' }
  | { type: 'movePlayer'; playerId: string; dir: -1 | 1 }
  | { type: 'collectRent'; id: number }
  | { type: 'vetoTrade'; id: number }
  | { type: 'busChoice'; pick: 0 | 1 | 2 }
  | { type: 'teleportTo'; tile: number }
  | { type: 'travel'; tile: number }
  | { type: 'bribe'; offer: boolean }
  | { type: 'schengen'; extra: 1 | 2 }
  | { type: 'attack'; tile: number }
  | { type: 'buyUps' }
  | { type: 'vote'; group: string }
  | { type: 'bet'; group: string; amount: number }
  | { type: 'tick' };
