import type { BoardMap, Group, Route, Tile, TileKind } from './types';

/*
 * Boards come in three sizes. The classic 40-tile board uses the hand-tuned classic price table;
 * other layouts place their cities along each side and price them by interpolating that same
 * table, so rent always rises smoothly with price.
 *
 * Each map has its own layout: which special tiles it has, how many, and where. Classic keeps the
 * traditional mix; World Tour, Pakistan and Euro Trip swap in their own tile types.
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
 * Tile patterns per side, corners excluded.
 *   P city     A airport / station   U utility   T tax   C Treasure   X Surprise
 *   O port     N World News          K Customs                                  (World Tour)
 *   M toll     S stadium   B committee   Z bazaar   W shaadi hall   F property dealer   (Pakistan)
 *   L parliament   Y museum   Q festival   H hostel                                  (Euro Trip)
 */
type Layout = Record<BoardSize, [string, string, string, string]>;

const CLASSIC_LAYOUT: Layout = {
  40: ['PCPTAPXPP', 'PUPPAPCPP', 'PXPPAPPUP', 'PPCPAXPTP'],
  48: ['PCPPTAPXPPP', 'PUPPCAPPCPP', 'PXPPAPPXPUP', 'PPCPPAXPPTP'],
  56: ['PCPPPTAPXPPPP', 'PUPPPCAPPCPPP', 'PXPPPAPPXPPUP', 'PPCPPPAXPPPTP'],
};

/** Six airports on a route network, two ports, news desks and customs; no utilities or cards. */
const WORLD_LAYOUT: Layout = {
  40: ['PNPTAPKPP', 'PAPPOPPNP', 'PKPPAPPAP', 'PPOPAPNAP'],
  48: ['PNPTPAPKPPP', 'PAPPPOPNPKP', 'PNPPPAPPAPK', 'PPOPPAPNPAP'],
  56: ['PNPPTPAPPKPPP', 'PAPPPPOPPNPKP', 'PNPPPPAPPPAPK', 'PPOPPPAPPNPAP'],
};

/** Only two airports; toll plazas on a motorway, stadiums, bazaars, the committee and more cities. */
const PAKISTAN_LAYOUT: Layout = {
  40: ['PZPPAPPWP', 'PSPPMPPFP', 'PZPPBPPTP', 'PMPPAPPSP'],
  48: ['PZPTPAPPWPP', 'PSPPPMPPFPP', 'PZPPBPPTPZP', 'PMPPPAPPSPP'],
  56: ['PZPPTPAPPWPPP', 'PSPPPPMPPFPZP', 'PZPPPBPPTPPWP', 'PMPPPPAPPSPBP'],
};

/** Six stations on three rail lines (two cross the middle), museums, hostels, a festival and Parliament. */
const EUROPE_LAYOUT: Layout = {
  40: ['PHPTAPYPP', 'PAPPAPPLP', 'PHPPAPQPP', 'PAPPAPTYP'],
  48: ['PHPTPAPYPPP', 'PAPPPAPLPYP', 'PHPPPAPQPHP', 'PAPYPAPTPPP'],
  56: ['PHPPTPAPPYPPP', 'PAPPPPAPLPPYP', 'PHPPPPAPQPPHP', 'PAPPYPAPPTPPP'],
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

/** Cities per set: three each, trimming the cheapest and priciest sets to two when cities run short. */
function setSizes(groups: number, cities: number): number[] {
  const sizes = Array.from({ length: groups }, () => 3);
  let extra = groups * 3 - cities;
  for (let k = 0; extra > 0; k++, extra--) sizes[k % 2 === 0 ? k / 2 : groups - 1 - (k - 1) / 2]--;
  return sizes;
}

export interface MapGroupDef {
  name: string;
  /** two lowercase letters = flag code, anything else = emoji badge */
  mark: string;
  /** three names, cheapest first; two-city sets use the last two */
  cities: [string, string, string];
  region?: string;
  currency?: string;
  nonEU?: boolean;
}

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  /** keyed by group id from GROUP_ORDER */
  groups: Record<string, MapGroupDef>;
  layout: Layout;
  corners: [string, string, string, string];
  /** names for repeated tile types, in board order */
  airports: string[];
  utilities?: string[];
  taxes: string[];
  ports?: string[];
  tolls?: string[];
  stadiums?: string[];
  museums?: string[];
  /** route links between tiles of one kind, as index pairs into that kind's board-order list */
  routes?: { kind: Route['kind']; of: 'A' | 'M'; pairs: [number, number, string, string][] };
}

const SINGLES: Record<string, [TileKind, string]> = {
  C: ['chest', 'Treasure'],
  X: ['chance', 'Surprise'],
  N: ['news', 'World News'],
  K: ['customs', 'Customs'],
  B: ['committee', 'Committee'],
  Z: ['bazaar', 'Bazaar'],
  W: ['shaadi', 'Shaadi Hall'],
  F: ['plots', 'Property Dealer'],
  L: ['parliament', 'EU Parliament'],
  Q: ['festival', 'Festival'],
  H: ['hostel', 'Hostel'],
};

/** Buyable tile kinds and their list price. */
export const BUYABLE: Partial<Record<TileKind, number>> = {
  property: 0,
  airport: 200,
  utility: 150,
  port: 180,
  toll: 160,
  stadium: 150,
};

export function isBuyable(kind: TileKind): boolean {
  return kind in BUYABLE;
}

/** Tiles that can host the general Sabotage / Stock Exchange / Arcade squares. */
const FLEX: TileKind[] = ['chance', 'chest', 'news', 'customs', 'bazaar', 'shaadi', 'hostel', 'festival'];

const cache = new Map<string, BoardMap>();

function buildMap(def: MapDef, size: BoardSize): BoardMap {
  const side = size / 4 - 1;
  const pattern = def.layout[size];
  const groups = GROUP_ORDER.filter(
    (g) => !g.extra || (g.extra === 'large' && size >= 48) || (g.extra === 'mega' && size >= 56),
  );
  const totalCities = pattern.join('').split('').filter((c) => c === 'P').length;
  const sizes = setSizes(groups.length, totalCities);
  const classicPrices = size === 40 && totalCities === CLASSIC.length;
  const tiles: Tile[] = [];
  let city = 0;
  let setIdx = 0;
  let inSet = 0;
  const counters: Record<string, number> = {};
  const next = (list: string[] | undefined, ch: string, fallback: string) => {
    const n = (counters[ch] = (counters[ch] ?? 0) + 1) - 1;
    return list?.[n] ?? `${fallback} ${n + 1}`;
  };

  // classic prices for the standard board, interpolated prices per set otherwise
  const cityPrices: number[] = [];
  for (let st = 0; st < sizes.length; st++) {
    const base = 60 + Math.round(((st / (sizes.length - 1)) * 290) / 10) * 10;
    for (let k = 0; k < sizes[st]; k++) {
      if (classicPrices) cityPrices.push(CLASSIC[cityPrices.length][0]);
      else cityPrices.push(base + (k === sizes[st] - 1 ? (st === sizes.length - 1 ? 50 : 20) : 0));
    }
  }

  for (let i = 0; i < size; i++) {
    if (i % (side + 1) === 0) {
      const c = i / (side + 1);
      tiles.push({ index: i, name: def.corners[c], kind: (['go', 'jail', 'parking', 'gotojail'] as const)[c] });
      continue;
    }
    const ch = pattern[Math.floor(i / (side + 1))][(i % (side + 1)) - 1];
    if (ch === 'P') {
      const g = groups[setIdx];
      const n = sizes[setIdx];
      const price = cityPrices[city];
      const classic = classicPrices ? CLASSIC[city] : null;
      tiles.push({
        index: i,
        name: def.groups[g.id].cities[3 - n + inSet],
        kind: 'property',
        group: g.id,
        price,
        rents: classic ? [...classic[1]] : rentsForPrice(price),
        houseCost: classic ? classic[2] : houseCostFor(price),
      });
      city++;
      if (++inSet === n) {
        setIdx++;
        inSet = 0;
      }
    } else if (ch === 'A') tiles.push({ index: i, name: next(def.airports, 'A', 'Airport'), kind: 'airport', price: BUYABLE.airport });
    else if (ch === 'U') tiles.push({ index: i, name: next(def.utilities, 'U', 'Utility'), kind: 'utility', price: BUYABLE.utility });
    else if (ch === 'O') tiles.push({ index: i, name: next(def.ports, 'O', 'Port'), kind: 'port', price: BUYABLE.port });
    else if (ch === 'M') tiles.push({ index: i, name: next(def.tolls, 'M', 'Toll Plaza'), kind: 'toll', price: BUYABLE.toll });
    else if (ch === 'S') tiles.push({ index: i, name: next(def.stadiums, 'S', 'Stadium'), kind: 'stadium', price: BUYABLE.stadium });
    else if (ch === 'Y') tiles.push({ index: i, name: next(def.museums, 'Y', 'Museum'), kind: 'museum' });
    else if (ch === 'T') {
      const t = counters.T ?? 0;
      tiles.push({ index: i, name: next(def.taxes, 'T', 'Tax'), kind: 'tax', tax: t === 0 ? 10 : 5 }); // percent of net worth
    } else {
      const [kind, name] = SINGLES[ch] ?? SINGLES.X;
      tiles.push({ index: i, name, kind });
    }
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
      ...(d.region ? { region: d.region } : {}),
      ...(d.currency ? { currency: d.currency } : {}),
      ...(d.nonEU ? { nonEU: true } : {}),
    };
  }

  const q = side + 1;
  const ofKind = (k: TileKind) => tiles.filter((t) => t.kind === k).map((t) => t.index);

  // general special squares take over flex tiles, preferring the classic spots
  const flex = tiles.filter((t) => FLEX.includes(t.kind)).map((t) => t.index);
  const used = new Set<number>();
  const take = (from: number, to: number, last: boolean) => {
    const inRange = flex.filter((i) => i > from && i < to && !used.has(i));
    const pickFrom = inRange.length ? inRange : flex.filter((i) => !used.has(i));
    const i = (last ? pickFrom[pickFrom.length - 1] : pickFrom[0]) ?? -1;
    if (i >= 0) used.add(i);
    return i;
  };
  const arcade = take(q, 2 * q, true);
  const sabotage = take(2 * q, 3 * q, false);
  const stocks = take(3 * q, size, false);

  const routes: Route[] = [];
  if (def.routes) {
    const list = ofKind(def.routes.of === 'A' ? 'airport' : 'toll');
    for (const [a, b, name, color] of def.routes.pairs) {
      if (list[a] !== undefined && list[b] !== undefined) routes.push({ a: list[a], b: list[b], kind: def.routes.kind, name, color });
    }
  }

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
    airports: ofKind('airport'),
    utilities: ofKind('utility'),
    ports: ofKind('port'),
    tolls: ofKind('toll'),
    stadiums: ofKind('stadium'),
    museums: ofKind('museum'),
    routes,
    specials: { arcade, sabotage, stocks },
  };
}

// ---------- the maps ----------

const DEFS: MapDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Richup-style world board. No map specials',
    layout: CLASSIC_LAYOUT,
    corners: ['Start', 'Prison', 'Vacation', 'Go to Prison'],
    groups: {
      brown: { name: 'Brazil', mark: 'br', cities: ['São Paulo', 'Salvador', 'Rio'] },
      teal: { name: 'Canada', mark: 'ca', cities: ['Montreal', 'Vancouver', 'Toronto'] },
      lightblue: { name: 'Israel', mark: 'il', cities: ['Tel Aviv', 'Haifa', 'Jerusalem'] },
      pink: { name: 'Italy', mark: 'it', cities: ['Venice', 'Milan', 'Rome'] },
      violet: { name: 'Spain', mark: 'es', cities: ['Seville', 'Barcelona', 'Madrid'] },
      orange: { name: 'Germany', mark: 'de', cities: ['Frankfurt', 'Munich', 'Berlin'] },
      red: { name: 'China', mark: 'cn', cities: ['Shenzhen', 'Beijing', 'Shanghai'] },
      lime: { name: 'Japan', mark: 'jp', cities: ['Kyoto', 'Osaka', 'Tokyo'] },
      yellow: { name: 'France', mark: 'fr', cities: ['Lyon', 'Toulouse', 'Paris'] },
      green: { name: 'United Kingdom', mark: 'gb', cities: ['Liverpool', 'Manchester', 'London'] },
      silver: { name: 'UAE', mark: 'ae', cities: ['Sharjah', 'Abu Dhabi', 'Dubai'] },
      blue: { name: 'USA', mark: 'us', cities: ['Chicago', 'California', 'New York'] },
    },
    airports: ['TLV Airport', 'MUC Airport', 'CDG Airport', 'JFK Airport'],
    utilities: ['Electric Company', 'Water Company'],
    taxes: ['Income Tax', 'Luxury Tax'],
  },
  {
    id: 'world',
    name: 'World Tour',
    blurb: 'Flight routes, shipping ports, world news, time zones and continents',
    layout: WORLD_LAYOUT,
    corners: ['Greenwich', 'Detention', 'Duty-Free', 'Deported'],
    groups: {
      brown: { name: 'Egypt', mark: 'eg', cities: ['Luxor', 'Cairo', 'Giza'], region: 'Africa & Middle East' },
      teal: { name: 'Brazil', mark: 'br', cities: ['Salvador', 'São Paulo', 'Rio de Janeiro'], region: 'Americas' },
      lightblue: { name: 'Mexico', mark: 'mx', cities: ['Cancún', 'Guadalajara', 'Mexico City'], region: 'Americas' },
      pink: { name: 'Italy', mark: 'it', cities: ['Venice', 'Milan', 'Rome'], region: 'Europe' },
      violet: { name: 'India', mark: 'in', cities: ['Jaipur', 'Mumbai', 'Delhi'], region: 'Asia-Pacific' },
      orange: { name: 'Germany', mark: 'de', cities: ['Hamburg', 'Munich', 'Berlin'], region: 'Europe' },
      red: { name: 'China', mark: 'cn', cities: ['Shenzhen', 'Shanghai', 'Hong Kong'], region: 'Asia-Pacific' },
      lime: { name: 'Australia', mark: 'au', cities: ['Perth', 'Melbourne', 'Sydney'], region: 'Asia-Pacific' },
      yellow: { name: 'United Kingdom', mark: 'gb', cities: ['Liverpool', 'Manchester', 'London'], region: 'Europe' },
      green: { name: 'Japan', mark: 'jp', cities: ['Kyoto', 'Osaka', 'Tokyo'], region: 'Asia-Pacific' },
      silver: { name: 'UAE', mark: 'ae', cities: ['Sharjah', 'Abu Dhabi', 'Dubai'], region: 'Africa & Middle East' },
      blue: { name: 'USA', mark: 'us', cities: ['Los Angeles', 'San Francisco', 'New York'], region: 'Americas' },
    },
    airports: ['JFK Airport', 'Heathrow', 'Dubai Airport', 'Changi Airport', 'Haneda Airport', 'Sydney Airport'],
    ports: ['Port of Rotterdam', 'Port of Shanghai'],
    taxes: ['Income Tax'],
    routes: {
      kind: 'flight',
      of: 'A',
      pairs: [
        [0, 2, 'JFK ✈ Dubai', '#7dd3fc'],
        [0, 5, 'JFK ✈ Sydney', '#7dd3fc'],
        [1, 3, 'Heathrow ✈ Changi', '#7dd3fc'],
        [1, 4, 'Heathrow ✈ Haneda', '#7dd3fc'],
        [2, 4, 'Dubai ✈ Haneda', '#7dd3fc'],
        [3, 5, 'Changi ✈ Sydney', '#7dd3fc'],
      ],
    },
  },
  {
    id: 'pakistan',
    name: 'Pakistan',
    blurb: 'Motorway tolls, committees, bazaars, plot files and chai-pani',
    layout: PAKISTAN_LAYOUT,
    corners: ['Start', 'Thana', 'Northern Areas', 'Naka'],
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
    airports: ['Jinnah Airport', 'Islamabad Airport'],
    tolls: ['M-9 Toll Plaza', 'M-2 Toll Plaza'],
    stadiums: ['National Stadium', 'Gaddafi Stadium'],
    taxes: ['Income Tax', 'Super Tax'],
    routes: { kind: 'road', of: 'M', pairs: [[0, 1, 'Motorway', '#facc15']] },
  },
  {
    id: 'europe',
    name: 'Euro Trip',
    blurb: 'Rail lines, borders, currencies, museums, festivals and a parliament',
    layout: EUROPE_LAYOUT,
    corners: ['Start', 'Prison', 'Riviera', 'Go to Prison'],
    groups: {
      brown: { name: 'Portugal', mark: 'pt', cities: ['Faro', 'Porto', 'Lisbon'] },
      teal: { name: 'Poland', mark: 'pl', cities: ['Gdańsk', 'Kraków', 'Warsaw'], currency: 'zł' },
      lightblue: { name: 'Greece', mark: 'gr', cities: ['Thessaloniki', 'Mykonos', 'Athens'] },
      pink: { name: 'Netherlands', mark: 'nl', cities: ['Utrecht', 'Rotterdam', 'Amsterdam'] },
      violet: { name: 'Italy', mark: 'it', cities: ['Florence', 'Milan', 'Rome'] },
      orange: { name: 'Spain', mark: 'es', cities: ['Valencia', 'Barcelona', 'Madrid'] },
      red: { name: 'Switzerland', mark: 'ch', cities: ['Basel', 'Geneva', 'Zurich'], currency: 'CHF', nonEU: true },
      lime: { name: 'Germany', mark: 'de', cities: ['Hamburg', 'Munich', 'Berlin'] },
      yellow: { name: 'Sweden', mark: 'se', cities: ['Malmö', 'Gothenburg', 'Stockholm'], currency: 'kr' },
      green: { name: 'Norway', mark: 'no', cities: ['Tromsø', 'Bergen', 'Oslo'], currency: 'kr', nonEU: true },
      silver: { name: 'United Kingdom', mark: 'gb', cities: ['Edinburgh', 'Manchester', 'London'], currency: '£', nonEU: true },
      blue: { name: 'France', mark: 'fr', cities: ['Lyon', 'Nice', 'Paris'] },
    },
    airports: ['Paris Gare du Nord', 'Wien Hbf', 'Frankfurt Hbf', 'Madrid Atocha', 'Milano Centrale', 'Amsterdam Centraal'],
    museums: ['The Louvre', 'The Prado', 'Rijksmuseum'],
    taxes: ['Income Tax', 'VAT'],
    routes: {
      kind: 'rail',
      of: 'A',
      pairs: [
        [0, 3, 'Red line', '#f87171'],
        [2, 5, 'Blue line', '#60a5fa'],
        [1, 4, 'Orient Express', '#fbbf24'],
      ],
    },
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

/** Partner tiles reachable by a route from `tile`. */
export function routesFrom(map: BoardMap, tile: number): { to: number; route: Route }[] {
  return map.routes.flatMap((r) => (r.a === tile ? [{ to: r.b, route: r }] : r.b === tile ? [{ to: r.a, route: r }] : []));
}
