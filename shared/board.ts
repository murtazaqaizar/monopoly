import type { BoardMap, Group, Tile } from './types';

/*
 * Boards come in three sizes. The 40-tile board uses the hand-tuned classic price table;
 * bigger boards place extra cities along each side and price them by interpolating that
 * same table, so rent always rises smoothly with price.
 */

export type BoardSize = 40 | 48 | 56;
export const BOARD_SIZES: BoardSize[] = [40, 48, 56];

/** Colour sets in price order. Extras (marked) only appear on bigger boards. */
const GROUP_ORDER: { id: string; color: string; extra?: 'large' | 'mega' }[] = [
  { id: 'brown', color: '#a0673f' },
  { id: 'teal', color: '#2dd4bf', extra: 'mega' },
  { id: 'lightblue', color: '#7dd3fc' },
  { id: 'pink', color: '#f472b6' },
  { id: 'violet', color: '#a78bfa', extra: 'large' },
  { id: 'orange', color: '#fb923c' },
  { id: 'red', color: '#ef4444' },
  { id: 'lime', color: '#a3e635', extra: 'large' },
  { id: 'yellow', color: '#facc15' },
  { id: 'green', color: '#22c55e' },
  { id: 'silver', color: '#cbd5e1', extra: 'mega' },
  { id: 'blue', color: '#3b82f6' },
];

/*
 * Tile patterns per side, corners excluded. P city, C Treasure, X Surprise, T tax, A airport, U utility.
 * Each size keeps 4 airports, 2 utilities and 2 taxes; bigger sides add cities and cards.
 */
const SIDES: Record<BoardSize, [string, string, string, string]> = {
  40: ['PCPTAPXPP', 'PUPPAPCPP', 'PXPPAPPUP', 'PPCPAXPTP'],
  48: ['PCPPTAPXPPP', 'PUPPCAPPCPP', 'PXPPAPPXPUP', 'PPCPPAXPPTP'],
  56: ['PCPPPTAPXPPPP', 'PUPPPCAPPCPPP', 'PXPPPAPPXPPUP', 'PPCPPPAXPPPTP'],
};

/** Cities per colour set, in board order. */
const SET_SIZES: Record<BoardSize, number[]> = {
  40: [2, 3, 3, 3, 3, 3, 3, 2],
  48: [2, 3, 3, 3, 3, 3, 3, 3, 3, 2],
  56: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
};

/** Classic price -> rent table [base, 1-4 houses, hotel]; the anchor for all boards. */
const CLASSIC: [number, number[], number][] = [
  // price, rents, house cost
  [60, [2, 10, 30, 90, 160, 250], 50],
  [60, [4, 20, 60, 180, 320, 450], 50],
  [100, [6, 30, 90, 270, 400, 550], 50],
  [100, [6, 30, 90, 270, 400, 550], 50],
  [120, [8, 40, 100, 300, 450, 600], 50],
  [140, [10, 50, 150, 450, 625, 750], 100],
  [140, [10, 50, 150, 450, 625, 750], 100],
  [160, [12, 60, 180, 500, 700, 900], 100],
  [180, [14, 70, 200, 550, 750, 950], 100],
  [180, [14, 70, 200, 550, 750, 950], 100],
  [200, [16, 80, 220, 600, 800, 1000], 100],
  [220, [18, 90, 250, 700, 875, 1050], 150],
  [220, [18, 90, 250, 700, 875, 1050], 150],
  [240, [20, 100, 300, 750, 925, 1100], 150],
  [260, [22, 110, 330, 800, 975, 1150], 150],
  [260, [22, 110, 330, 800, 975, 1150], 150],
  [280, [24, 120, 360, 850, 1025, 1200], 150],
  [300, [26, 130, 390, 900, 1100, 1275], 200],
  [300, [26, 130, 390, 900, 1100, 1275], 200],
  [320, [28, 150, 450, 1000, 1200, 1400], 200],
  [350, [35, 175, 500, 1100, 1300, 1500], 200],
  [400, [50, 200, 600, 1400, 1700, 2000], 200],
];

// distinct price anchors for interpolation (lower city of the brown pair stands for $60)
const ANCHORS = CLASSIC.filter((c, i) => i === 0 || c[0] !== CLASSIC[i - 1][0]);

function roundRent(v: number) {
  if (v < 50) return Math.round(v);
  if (v < 200) return Math.round(v / 5) * 5;
  return Math.round(v / 25) * 25;
}

/** Rent table for any price, interpolated from the classic anchors. */
export function rentsForPrice(price: number): number[] {
  const hi = ANCHORS.findIndex((a) => a[0] >= price);
  if (hi <= 0) return [...ANCHORS[hi < 0 ? ANCHORS.length - 1 : 0][1]];
  const [p0, r0] = ANCHORS[hi - 1];
  const [p1, r1] = ANCHORS[hi];
  const t = (price - p0) / (p1 - p0);
  return r0.map((r, i) => roundRent(r + (r1[i] - r) * t));
}

function houseCostFor(price: number) {
  if (price <= 120) return 50;
  if (price <= 200) return 100;
  if (price <= 280) return 150;
  return 200;
}

export interface MapGroupDef {
  name: string;
  /** two lowercase letters = flag code, anything else = emoji badge */
  mark: string;
  /** three names, cheapest first; two-city sets use the last two */
  cities: [string, string, string];
}

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  /** keyed by group id from GROUP_ORDER */
  groups: Record<string, MapGroupDef>;
  airports: [string, string, string, string];
  utilities: [string, string];
  taxes: [string, string];
}

const CORNERS = ['Start', 'Prison', 'Vacation', 'Go to Prison'];

const cache = new Map<string, BoardMap>();

function buildMap(def: MapDef, size: BoardSize): BoardMap {
  const side = size / 4 - 1;
  const groups = GROUP_ORDER.filter(
    (g) => !g.extra || (g.extra === 'large' && size >= 48) || (g.extra === 'mega' && size >= 56),
  );
  const setSizes = SET_SIZES[size];
  const tiles: Tile[] = [];
  let city = 0;
  let setIdx = 0;
  let inSet = 0;
  const counters = { A: 0, U: 0, T: 0 };
  const cityPrices: number[] = [];

  // classic prices for the standard board, interpolated prices otherwise
  const totalCities = setSizes.reduce((a, b) => a + b, 0);
  for (let s = 0; s < setSizes.length; s++) {
    const base = size === 40 ? 0 : 60 + Math.round(((s / (setSizes.length - 1)) * 290) / 10) * 10;
    for (let k = 0; k < setSizes[s]; k++) {
      if (size === 40) cityPrices.push(CLASSIC[cityPrices.length][0]);
      else {
        const last = k === setSizes[s] - 1;
        cityPrices.push(base + (last ? (s === setSizes.length - 1 ? 50 : 20) : 0));
      }
    }
  }
  void totalCities;

  for (let i = 0; i < size; i++) {
    const cornerAt = i % (side + 1) === 0;
    if (cornerAt) {
      const c = i / (side + 1);
      tiles.push({ index: i, name: CORNERS[c], kind: (['go', 'jail', 'parking', 'gotojail'] as const)[c] });
      continue;
    }
    const sideNo = Math.floor(i / (side + 1));
    const ch = SIDES[size][sideNo][(i % (side + 1)) - 1];
    if (ch === 'P') {
      const g = groups[setIdx];
      const names = def.groups[g.id].cities;
      const n = setSizes[setIdx];
      const name = names[3 - n + inSet];
      const price = cityPrices[city];
      const classic = size === 40 ? CLASSIC[city] : null;
      tiles.push({
        index: i,
        name,
        kind: 'property',
        group: g.id,
        price,
        rents: classic ? [...classic[1]] : rentsForPrice(price),
        houseCost: classic ? classic[2] : houseCostFor(price),
      });
      city++;
      inSet++;
      if (inSet === n) {
        setIdx++;
        inSet = 0;
      }
    } else if (ch === 'A') tiles.push({ index: i, name: def.airports[counters.A++], kind: 'airport', price: 200 });
    else if (ch === 'U') tiles.push({ index: i, name: def.utilities[counters.U++], kind: 'utility', price: 150 });
    else if (ch === 'T') {
      const t = counters.T++;
      tiles.push({ index: i, name: def.taxes[t], kind: 'tax', tax: t === 0 ? 200 : 100 });
    } else if (ch === 'C') tiles.push({ index: i, name: 'Treasure', kind: 'chest' });
    else tiles.push({ index: i, name: 'Surprise', kind: 'chance' });
  }

  const outGroups: Record<string, Group> = {};
  for (const g of groups) {
    const d = def.groups[g.id];
    outGroups[g.id] = {
      id: g.id,
      color: g.color,
      name: d.name,
      ...(/^[a-z]{2}$/.test(d.mark) ? { flag: d.mark } : { badge: d.mark }),
      tiles: tiles.filter((t) => t.group === g.id).map((t) => t.index),
    };
  }

  const q = side + 1;
  const firstOf = (kind: Tile['kind'], from: number, to: number, last = false) => {
    const list = tiles.filter((t) => t.kind === kind && t.index > from && t.index < to);
    return (last ? list[list.length - 1] : list[0])?.index ?? -1;
  };

  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    size,
    side,
    tiles,
    groups: outGroups,
    jail: q,
    parking: 2 * q,
    goToJail: 3 * q,
    airports: tiles.filter((t) => t.kind === 'airport').map((t) => t.index),
    utilities: tiles.filter((t) => t.kind === 'utility').map((t) => t.index),
    specials: {
      arcade: firstOf('chest', q, 2 * q, true),
      sabotage: firstOf('chance', 2 * q, 3 * q),
      stocks: firstOf('chest', 3 * q, size),
    },
  };
}

// ---------- the maps ----------

const WORLD_DEF: Omit<MapDef, 'id' | 'name' | 'blurb'> = {
  groups: {
    brown: { name: 'Egypt', mark: 'eg', cities: ['Luxor', 'Cairo', 'Giza'] },
    teal: { name: 'Brazil', mark: 'br', cities: ['Salvador', 'São Paulo', 'Rio de Janeiro'] },
    lightblue: { name: 'Turkey', mark: 'tr', cities: ['Ankara', 'Izmir', 'Istanbul'] },
    pink: { name: 'Italy', mark: 'it', cities: ['Venice', 'Milan', 'Rome'] },
    violet: { name: 'India', mark: 'in', cities: ['Jaipur', 'Mumbai', 'Delhi'] },
    orange: { name: 'Germany', mark: 'de', cities: ['Hamburg', 'Munich', 'Berlin'] },
    red: { name: 'China', mark: 'cn', cities: ['Shenzhen', 'Shanghai', 'Hong Kong'] },
    lime: { name: 'Australia', mark: 'au', cities: ['Perth', 'Melbourne', 'Sydney'] },
    yellow: { name: 'United Kingdom', mark: 'gb', cities: ['Liverpool', 'Manchester', 'London'] },
    green: { name: 'Japan', mark: 'jp', cities: ['Kyoto', 'Osaka', 'Tokyo'] },
    silver: { name: 'UAE', mark: 'ae', cities: ['Sharjah', 'Abu Dhabi', 'Dubai'] },
    blue: { name: 'USA', mark: 'us', cities: ['Los Angeles', 'San Francisco', 'New York'] },
  },
  airports: ['JFK Airport', 'Heathrow', 'Dubai Airport', 'Changi Airport'],
  utilities: ['Power Grid', 'Water Works'],
  taxes: ['Income Tax', 'Luxury Tax'],
};

const DEFS: MapDef[] = [
  { id: 'classic', name: 'Classic', blurb: 'The standard board. No map specials', ...WORLD_DEF },
  {
    id: 'world',
    name: 'World Tour',
    blurb: 'World cities plus wars, exchange rates and the Olympics',
    ...WORLD_DEF,
  },
  {
    id: 'pakistan',
    name: 'Pakistan',
    blurb: 'Load-shedding, monsoons, cricket and chai-pani',
    groups: {
      brown: { name: 'Balochistan', mark: '🏜️', cities: ['Turbat', 'Gwadar', 'Quetta'] },
      teal: { name: 'Azad Kashmir', mark: '🌲', cities: ['Mirpur', 'Rawalakot', 'Muzaffarabad'] },
      lightblue: { name: 'Gilgit-Baltistan', mark: '🏔️', cities: ['Gilgit', 'Hunza', 'Skardu'] },
      pink: { name: 'Sindh', mark: '🐪', cities: ['Sukkur', 'Larkana', 'Hyderabad'] },
      violet: { name: 'Murree Hills', mark: '⛰️', cities: ['Nathia Gali', 'Bhurban', 'Murree'] },
      orange: { name: 'Khyber Pakhtunkhwa', mark: '🏰', cities: ['Abbottabad', 'Swat', 'Peshawar'] },
      red: { name: 'Punjab', mark: '🌾', cities: ['Multan', 'Faisalabad', 'Rawalpindi'] },
      lime: { name: 'Industrial Punjab', mark: '🏭', cities: ['Gujrat', 'Gujranwala', 'Sialkot'] },
      yellow: { name: 'Lahore', mark: '🕌', cities: ['Anarkali', 'Gulberg', 'DHA Lahore'] },
      green: { name: 'Karachi', mark: '🌊', cities: ['Saddar', 'Clifton', 'DHA Karachi'] },
      silver: { name: 'Karachi Seafront', mark: '🏖️', cities: ['Do Darya', 'Sea View', 'Hawkes Bay'] },
      blue: { name: 'Islamabad', mark: '🏛️', cities: ['G-6', 'F-7', 'E-7'] },
    },
    airports: ['Jinnah Airport', 'Allama Iqbal Airport', 'Islamabad Airport', 'Bacha Khan Airport'],
    utilities: ['Power House', 'Tarbela Dam'],
    taxes: ['Income Tax', 'Super Tax'],
  },
  {
    id: 'europe',
    name: 'Euro Trip',
    blurb: 'Rail passes, seasons, Eurovision and exit votes',
    groups: {
      brown: { name: 'Portugal', mark: 'pt', cities: ['Faro', 'Porto', 'Lisbon'] },
      teal: { name: 'Poland', mark: 'pl', cities: ['Gdańsk', 'Kraków', 'Warsaw'] },
      lightblue: { name: 'Greece', mark: 'gr', cities: ['Thessaloniki', 'Mykonos', 'Athens'] },
      pink: { name: 'Netherlands', mark: 'nl', cities: ['Utrecht', 'Rotterdam', 'Amsterdam'] },
      violet: { name: 'Italy', mark: 'it', cities: ['Florence', 'Milan', 'Rome'] },
      orange: { name: 'Spain', mark: 'es', cities: ['Valencia', 'Barcelona', 'Madrid'] },
      red: { name: 'Switzerland', mark: 'ch', cities: ['Basel', 'Geneva', 'Zurich'] },
      lime: { name: 'Germany', mark: 'de', cities: ['Hamburg', 'Munich', 'Berlin'] },
      yellow: { name: 'Sweden', mark: 'se', cities: ['Malmö', 'Gothenburg', 'Stockholm'] },
      green: { name: 'Norway', mark: 'no', cities: ['Tromsø', 'Bergen', 'Oslo'] },
      silver: { name: 'United Kingdom', mark: 'gb', cities: ['Edinburgh', 'Manchester', 'London'] },
      blue: { name: 'France', mark: 'fr', cities: ['Lyon', 'Nice', 'Paris'] },
    },
    airports: ['Amsterdam Centraal', 'Frankfurt Hbf', 'Madrid Atocha', 'Paris Gare du Nord'],
    utilities: ['Power Grid', 'Water Works'],
    taxes: ['Income Tax', 'Luxury Tax'],
  },
];

export const MAP_DEFS: Record<string, MapDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));

export function getMap(id: string, size: number = 40): BoardMap {
  const def = MAP_DEFS[id] ?? MAP_DEFS.classic;
  const sz = (BOARD_SIZES.includes(size as BoardSize) ? size : 40) as BoardSize;
  const key = `${def.id}:${sz}`;
  let m = cache.get(key);
  if (!m) {
    m = buildMap(def, sz);
    cache.set(key, m);
  }
  return m;
}

/** Board size for a room: fixed by the host, or picked from player count on Auto. */
export function boardSizeFor(setting: string, players: number): BoardSize {
  if (setting === 'standard') return 40;
  if (setting === 'large') return 48;
  if (setting === 'mega') return 56;
  return players <= 5 ? 40 : players <= 8 ? 48 : 56;
}

export type SpecialKind = 'sabotage' | 'stocks' | 'arcade';

export function specialAt(
  settings: { sabotage: boolean; stockMarket: boolean; miniGames: boolean },
  map: BoardMap,
  index: number,
): SpecialKind | null {
  if (settings.sabotage && index === map.specials.sabotage) return 'sabotage';
  if (settings.stockMarket && index === map.specials.stocks) return 'stocks';
  if (settings.miniGames && index === map.specials.arcade) return 'arcade';
  return null;
}

export const SPECIAL_NAMES: Record<SpecialKind, string> = {
  sabotage: 'Sabotage',
  stocks: 'Stock Exchange',
  arcade: 'Arcade',
};
