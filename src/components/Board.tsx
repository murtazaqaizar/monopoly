import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BedDouble,
  Bomb,
  Construction,
  Dices,
  Droplets,
  FileText,
  Gift,
  HeartHandshake,
  Landmark,
  Mountain,
  Newspaper,
  Palette,
  Palmtree,
  PartyPopper,
  Plane,
  PlaneTakeoff,
  Receipt,
  Ship,
  ShoppingBag,
  ShoppingBasket,
  Siren,
  Snowflake,
  Stamp,
  TrafficCone,
  TrainFront,
  TrendingUp,
  Trophy,
  Handshake,
  Zap,
} from 'lucide-react';
import { SPECIAL_NAMES, isBuyable, specialAt, type SpecialKind } from '../../shared/board';
import { mapOf, ownsGroup, rentFor, taxRate } from '../../shared/engine';
import type { BoardMap, Player, PublicState, Tile } from '../../shared/types';
import { useReactions } from '../social';
import { play } from '../sound';
import { Avatar } from './Avatar';
import { GroupMark } from './Mark';
import { rateLabel, tileEffects } from './MapSpecials';
import { Buildings, FxOverlay, useFx } from './FxLayer';
import { CenterArt } from './CenterArt';
import { rentInfo } from './rentInfo';

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';

/**
 * Grid cell (1-based) for a tile index on a board with `side` tiles between corners.
 * Start is top-left and play runs clockwise.
 */
export function cellOf(i: number, side = 9): { row: number; col: number; side: Side } {
  const q = side + 1;
  const last = side + 2;
  if (i === 0) return { row: 1, col: 1, side: 'corner' };
  if (i < q) return { row: 1, col: 1 + i, side: 'top' };
  if (i === q) return { row: 1, col: last, side: 'corner' };
  if (i < 2 * q) return { row: 1 + (i - q), col: last, side: 'right' };
  if (i === 2 * q) return { row: last, col: last, side: 'corner' };
  if (i < 3 * q) return { row: last, col: last - (i - 2 * q), side: 'bottom' };
  if (i === 3 * q) return { row: last, col: 1, side: 'corner' };
  return { row: last - (i - 3 * q), col: 1, side: 'left' };
}

/** Centre of grid line `n` as a % of the board; corners are 1.6 units, other tiles 1. */
export function centerPct(n: number, side = 9): number {
  const units = side + 3.2;
  if (n === 1) return (0.8 / units) * 100;
  if (n === side + 2) return ((units - 0.8) / units) * 100;
  return ((1.6 + (n - 2) + 0.5) / units) * 100;
}

/** A tile's centre on the board in %. */
export function tilePoint(i: number, side: number): { x: number; y: number } {
  const c = cellOf(i, side);
  return { x: centerPct(c.col, side), y: centerPct(c.row, side) };
}

/** Long single words step the font down so names never break mid-word. */
function fit(name: string): string {
  const longest = Math.max(...name.split(/[\s-]+/).map((w) => w.length));
  return longest > 8 ? ' xlong' : longest > 6 ? ' long' : '';
}

/** Tokens jump straight to their tile; one soft tick when anyone moves. */
function usePositions(players: Player[]): Record<string, number> {
  const shown = Object.fromEntries(players.map((p) => [p.id, p.position]));
  const key = players.map((p) => `${p.id}:${p.position}`).join('|');
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current !== key) play('step');
    prev.current = key;
  }, [key]);
  return shown;
}

function TileIcon({ tile, special, rail }: { tile: Tile; special: SpecialKind | null; rail?: boolean }) {
  if (tile.kind === 'airport' && rail) return <TrainFront className="ico sky" strokeWidth={2.2} />;
  if (special === 'sabotage') return <Bomb className="ico rose" strokeWidth={2.2} />;
  if (special === 'stocks') return <TrendingUp className="ico mint" strokeWidth={2.2} />;
  if (special === 'arcade') return <Dices className="ico sky" strokeWidth={2.2} />;
  switch (tile.kind) {
    case 'chance':
      return <span className="glyph-q">?</span>;
    case 'chest':
      return <Gift className="ico gold" strokeWidth={2.2} />;
    case 'tax':
      return <Receipt className="ico mint" strokeWidth={2.2} />;
    case 'airport':
      return <Plane className="ico sky" strokeWidth={2.2} />;
    case 'utility':
      return /water/i.test(tile.name) ? <Droplets className="ico sky" strokeWidth={2.2} /> : <Zap className="ico gold" strokeWidth={2.2} />;
    case 'port':
      return <Ship className="ico sky" strokeWidth={2.2} />;
    case 'news':
      return <Newspaper className="ico gold" strokeWidth={2.2} />;
    case 'customs':
      return <Stamp className="ico rose" strokeWidth={2.2} />;
    case 'toll':
      return <TrafficCone className="ico gold" strokeWidth={2.2} />;
    case 'stadium':
      return <Trophy className="ico mint" strokeWidth={2.2} />;
    case 'committee':
      return <Handshake className="ico gold" strokeWidth={2.2} />;
    case 'bazaar':
      return <ShoppingBasket className="ico rose" strokeWidth={2.2} />;
    case 'shaadi':
      return <HeartHandshake className="ico rose" strokeWidth={2.2} />;
    case 'plots':
      return <FileText className="ico mint" strokeWidth={2.2} />;
    case 'parliament':
      return <Landmark className="ico sky" strokeWidth={2.2} />;
    case 'museum':
      return <Palette className="ico gold" strokeWidth={2.2} />;
    case 'festival':
      return <PartyPopper className="ico rose" strokeWidth={2.2} />;
    case 'hostel':
      return <BedDouble className="ico sky" strokeWidth={2.2} />;
    default:
      return null;
  }
}

/** Little prison cell: bars, a barred window and a bench. */
function CellArt() {
  return (
    <svg className="cell-art" viewBox="0 0 60 60" aria-hidden>
      <rect x="4" y="4" width="52" height="52" rx="5" className="cell-wall" />
      <rect x="20" y="10" width="20" height="12" rx="2" className="cell-window" />
      {[24, 28, 32, 36].map((x) => (
        <line key={x} x1={x} y1="10" x2={x} y2="22" className="cell-bar thin" />
      ))}
      <rect x="10" y="40" width="40" height="5" rx="1.5" className="cell-bench" />
      {[10, 18, 26, 34, 42, 50].map((x) => (
        <line key={x} x1={x} y1="4" x2={x} y2="56" className="cell-bar" />
      ))}
    </svg>
  );
}

function Corner({ tile, jailed, pot, mapId }: { tile: Tile; jailed: number; pot: number; mapId: string }) {
  switch (tile.kind) {
    case 'go':
      return (
        <div className="corner-body go">
          <span className={`go-word${tile.name.length > 6 ? ' long' : ''}`}>{tile.name.toUpperCase()}</span>
          <span className="go-sub">collect salary</span>
          <span className="go-arrow">
            <span>←</span>
          </span>
        </div>
      );
    case 'jail':
      return (
        <div className="corner-body jail">
          <div className="bars">
            <CellArt />
            <span>{tile.name}</span>
            {jailed > 0 && <b>{jailed}</b>}
          </div>
          <span className="visiting">Just visiting</span>
        </div>
      );
    case 'parking':
      return (
        <div className="corner-body parking">
          {mapId === 'world' ? (
            <ShoppingBag className="ico big gold sway" strokeWidth={2} />
          ) : mapId === 'pakistan' ? (
            <Mountain className="ico big sky" strokeWidth={2} />
          ) : (
            <Palmtree className="ico big mint sway" strokeWidth={2} />
          )}
          <span className="corner-name">{tile.name}</span>
          {pot > 0 && <span className="pot">${pot}</span>}
        </div>
      );
    default:
      return (
        <div className="corner-body gotojail">
          {mapId === 'world' ? (
            <PlaneTakeoff className="ico big rose" strokeWidth={2} />
          ) : mapId === 'pakistan' ? (
            <Construction className="ico big gold" strokeWidth={2} />
          ) : (
            <Siren className="ico big rose siren" strokeWidth={2} />
          )}
          <span className="corner-name">{tile.name}</span>
        </div>
      );
  }
}

/** Flight arcs, rail lines and the motorway drawn across the middle of the board. */
function RoutesLayer({ map }: { map: BoardMap }) {
  if (!map.routes.length) return null;
  const pull = (p: { x: number; y: number }) => ({ x: p.x + (50 - p.x) * 0.1, y: p.y + (50 - p.y) * 0.1 });
  return (
    <svg className="routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {map.routes.map((r, k) => {
        const a = pull(tilePoint(r.a, map.side));
        const b = pull(tilePoint(r.b, map.side));
        let d: string;
        if (r.kind === 'flight') {
          // arc: bow the midpoint sideways
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const bow = 9 * (k % 2 ? 1 : -1);
          d = `M${a.x},${a.y} Q${mx + (-dy / len) * bow},${my + (dx / len) * bow} ${b.x},${b.y}`;
        } else d = `M${a.x},${a.y} L${b.x},${b.y}`;
        return (
          <g key={k} className={`route route-${r.kind}`} style={{ ['--rc' as string]: r.color }}>
            {r.kind !== 'flight' && <path d={d} className="route-bed" />}
            <path d={d} className="route-line" />
            <circle cx={a.x} cy={a.y} r="0.9" className="route-end" />
            <circle cx={b.x} cy={b.y} r="0.9" className="route-end" />
          </g>
        );
      })}
    </svg>
  );
}

/** Hover card for a buyable tile: price, rent table and owner. */
function HoverCard({ state, index }: { state: PublicState; index: number }) {
  const map = mapOf(state);
  const tile = map.tiles[index];
  const group = tile.group ? map.groups[tile.group] : null;
  const own = state.properties[index];
  const owner = own ? state.players.find((p) => p.id === own.owner) : null;
  const info = rentInfo(state, tile);
  const at = tilePoint(index, map.side);
  // sit between the tile and the board centre so it never covers the tile itself
  const x = at.x + (50 - at.x) * 0.42;
  const y = at.y + (50 - at.y) * 0.42;
  return (
    <div className="hover-card" style={{ left: `${x}%`, top: `${y}%`, ['--g' as string]: group?.color ?? '#475569' }}>
      <header>
        {group && <GroupMark group={group} />}
        <span>
          <small>{info.label}</small>
          <b>{tile.name}</b>
        </span>
      </header>
      {info.rows.slice(0, 8).map(([label, value], i) => (
        <div key={i} className={`hc-row${tile.kind === 'property' && own && own.houses === i ? ' on' : ''}`}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
      {info.note && <p className="muted small">{info.note}</p>}
      <footer>
        <span>${tile.price}</span>
        {owner ? (
          <span>
            <Avatar player={owner} size={14} /> {owner.name}
            {own?.mortgaged ? ' · mortgaged' : ''}
          </span>
        ) : (
          <span className="muted">For sale</span>
        )}
      </footer>
    </div>
  );
}

/** Before the game starts, the chosen map's countries orbit the middle of the board. */
function LobbyOrbit({ map }: { map: BoardMap }) {
  const groups = Object.values(map.groups);
  return (
    <div className="lobby-orbit" aria-hidden>
      <div className="orbit-ring">
        {groups.map((g, i) => (
          <span key={g.id} className="orbit-item" style={{ ['--a' as string]: `${(i / groups.length) * 360}deg` }}>
            <span className="orbit-face">
              <GroupMark group={g} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Board({
  state,
  me = null,
  onTile,
  children,
}: {
  state: PublicState;
  me?: string | null;
  onTile: (i: number) => void;
  children: ReactNode;
}) {
  const map = mapOf(state);
  const fx = useFx(state, me);
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const alive = state.phase === 'lobby' ? [] : state.players.filter((p) => !p.bankrupt);
  const shown = usePositions(alive);
  const sd = map.side;
  const jailed = alive.filter((p) => p.inJail).length;
  const lastDice = state.turn?.dice ? state.turn.dice[0] + state.turn.dice[1] : 7;
  const [hover, setHover] = useState<number | null>(null);

  const onTileMap = new Map<number, string[]>();
  for (const p of alive) {
    const at = shown[p.id] ?? p.position;
    onTileMap.set(at, [...(onTileMap.get(at) ?? []), p.id]);
  }

  return (
    <div
      className={`board size-${map.size} map-${map.id}`}
      style={{
        gridTemplateColumns: `1.6fr repeat(${sd}, 1fr) 1.6fr`,
        gridTemplateRows: `1.6fr repeat(${sd}, 1fr) 1.6fr`,
      }}
    >
      {map.tiles.map((t) => {
        const { row, col, side } = cellOf(t.index, sd);
        const own = state.properties[t.index];
        const owner = own ? byId(own.owner) : undefined;
        const group = t.group ? map.groups[t.group] : null;
        const special = specialAt(state.settings, map, t.index);
        const name = special ? SPECIAL_NAMES[special] : t.name;
        const active = state.turn?.pendingTile === t.index || state.auction?.tile === t.index;
        const buyable = isBuyable(t.kind);
        const fullSet = !!(own && t.group && ownsGroup(state, own.owner, t.group));
        const cls = [
          'tile',
          side,
          `kind-${t.kind}`,
          buyable ? 'buyable' : '',
          owner ? 'owned' : '',
          own?.mortgaged ? 'mortgaged' : '',
          own?.frozen ? 'frozen' : '',
          special ? `special-${special}` : '',
          active ? 'active' : '',
          group ? 'has-group' : '',
          fullSet ? 'full-set' : '',
          ...tileEffects(state, t.index),
        ].join(' ');
        const rate = rateLabel(state, t.group);

        let chip: ReactNode = null;
        if (buyable) {
          if (!own) chip = `$${t.price}`;
          else if (own.mortgaged) chip = 'MORT';
          // owned tiles show what a visitor pays, labelled so it isn't mistaken for the price
          else if (t.kind === 'utility') chip = <><small>rent</small>x{rentFor(state, t.index, 1)}</>;
          else chip = <><small>rent</small>${rentFor(state, t.index, lastDice)}</>;
        } else if (t.kind === 'tax') chip = `${Math.round(taxRate(state, t) * 100)}%`;

        return (
          <button
            key={t.index}
            className={cls}
            style={{
              gridRow: row,
              gridColumn: col,
              ['--owner' as string]: owner?.color ?? 'transparent',
              ['--group' as string]: group?.color ?? 'transparent',
            }}
            onClick={() => buyable && onTile(t.index)}
            onMouseEnter={() => buyable && setHover(t.index)}
            onMouseLeave={() => setHover((h) => (h === t.index ? null : h))}
            tabIndex={buyable ? 0 : -1}
            aria-label={owner ? `${name}, owned by ${owner.name}` : name}
          >
            {side === 'corner' ? (
              <Corner tile={t} jailed={jailed} pot={state.settings.jackpot ? state.pot : 0} mapId={map.id} />
            ) : (
              <span className="tile-body">
                <span className="tile-icon">
                  <TileIcon tile={t} special={special} rail={map.id === 'europe'} />
                  {own && own.houses > 0 && <Buildings n={own.houses} />}
                  {own?.frozen ? <Snowflake className="frozen-ico" /> : null}
                </span>
                <span className={`tile-name${fit(name)}`}>{name}</span>
                {chip && <span className="chip">{chip}</span>}
              </span>
            )}
            {group && <GroupMark group={group} className="flag" />}
            {rate && <span className={`rate-badge${rate.startsWith('-') ? ' down' : ''}`}>{rate}</span>}
          </button>
        );
      })}

      <div className={`board-center map-${map.id}`}>
        <div className="center-deco" aria-hidden>
          <span className="deco-ring" />
          <CenterArt mapId={map.id} />
          <span className="deco-word">RICHLANDS</span>
          <span className="deco-map">{map.name}</span>
        </div>
        {state.phase === 'lobby' && <LobbyOrbit map={map} />}
        {children}
      </div>

      <RoutesLayer map={map} />

      <FxOverlay fx={fx} />

      <Reactions state={state} shown={shown} />

      <div className="tokens" aria-hidden>
        {alive.map((p) => {
          const at = shown[p.id] ?? p.position;
          const { row, col } = cellOf(at, sd);
          const group = onTileMap.get(at) ?? [p.id];
          const k = group.indexOf(p.id);
          const spread = group.length > 1 ? 2 : 0;
          const angle = (k / group.length) * Math.PI * 2 - Math.PI / 2;
          const isTurn = state.turn?.playerId === p.id;
          return (
            <span
              key={p.id}
              className={`token${isTurn ? ' turn' : ''}${p.inJail ? ' jailed' : ''}${state.special.away?.[p.id] ? ' away' : ''}`}
              style={{
                left: `calc(${centerPct(col, sd)}% + ${Math.cos(angle) * spread}%)`,
                top: `calc(${centerPct(row, sd)}% + ${Math.sin(angle) * spread}%)`,
              }}
            >
              <Avatar player={p} />
            </span>
          );
        })}
      </div>

      {hover !== null && state.phase !== 'lobby' && <HoverCard state={state} index={hover} />}
    </div>
  );
}

/** Emoji reactions float up from the reacting player's token (or the board centre for spectators). */
function Reactions({ state, shown }: { state: PublicState; shown: Record<string, number> }) {
  const list = useReactions();
  return (
    <div className="reactions" aria-hidden>
      {list.map((r) => {
        const p = state.players.find((x) => x.id === r.playerId && !x.bankrupt);
        const at = p ? shown[p.id] ?? p.position : null;
        const side = mapOf(state).side;
        const cell = at !== null && state.phase !== 'lobby' ? cellOf(at, side) : null;
        const left = cell ? centerPct(cell.col, side) : 50;
        const top = cell ? centerPct(cell.row, side) : 50;
        return (
          <span key={r.id} className="reaction" style={{ left: `${left}%`, top: `${top}%` }}>
            {r.emoji}
            <small>{r.name}</small>
          </span>
        );
      })}
    </div>
  );
}
