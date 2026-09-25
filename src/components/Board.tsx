import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TrainFront, Bomb, Dices, Droplets, Gift, Palmtree, Plane, Receipt, Siren, Snowflake, TrendingUp, Zap } from 'lucide-react';
import { SPECIAL_NAMES, specialAt, type SpecialKind } from '../../shared/board';
import { mapOf, rentFor } from '../../shared/engine';
import type { Player, PublicState, Tile } from '../../shared/types';
import { useReactions } from '../social';
import { play } from '../sound';
import { Avatar } from './Avatar';
import { GroupMark } from './Mark';
import { rateLabel, tileEffects } from './MapSpecials';

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';

/**
 * Grid cell (1-based) for a tile index on a board with `side` tiles between corners.
 * Start is bottom-right and play runs clockwise.
 */
export function cellOf(i: number, side = 9): { row: number; col: number; side: Side } {
  const q = side + 1;
  const last = side + 2;
  if (i === 0) return { row: last, col: last, side: 'corner' };
  if (i < q) return { row: last, col: last - i, side: 'bottom' };
  if (i === q) return { row: last, col: 1, side: 'corner' };
  if (i < 2 * q) return { row: last - (i - q), col: 1, side: 'left' };
  if (i === 2 * q) return { row: 1, col: 1, side: 'corner' };
  if (i < 3 * q) return { row: 1, col: 1 + (i - 2 * q), side: 'top' };
  if (i === 3 * q) return { row: 1, col: last, side: 'corner' };
  return { row: 1 + (i - 3 * q), col: last, side: 'right' };
}

/** Centre of grid line `n` as a % of the board; corners are 1.6 units, other tiles 1. */
export function centerPct(n: number, side = 9): number {
  const units = side + 3.2;
  if (n === 1) return (0.8 / units) * 100;
  if (n === side + 2) return ((units - 0.8) / units) * 100;
  return ((1.6 + (n - 2) + 0.5) / units) * 100;
}

/** Walks tokens one tile at a time toward their real position so moves read as hops. */
function useHopPositions(players: Player[], size: number, jail: number): Record<string, number> {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.position])),
  );
  const target = useRef<Record<string, number>>({});
  target.current = Object.fromEntries(players.map((p) => [p.id, p.position]));
  const key = players.map((p) => `${p.id}:${p.position}:${p.inJail}`).join('|');

  useEffect(() => {
    const jumps: Record<string, number> = {};
    for (const p of players) {
      // players we haven't tracked yet (the game just started) appear where they stand
      if (shown[p.id] === undefined) {
        jumps[p.id] = p.position;
        continue;
      }
      const ahead = (p.position - shown[p.id] + size) % size;
      // long trips (sent to Prison, cards moving backwards) teleport instead of walking
      if (ahead > 15 || (p.inJail && p.position === jail)) jumps[p.id] = p.position;
    }
    if (Object.keys(jumps).length) setShown((s) => ({ ...s, ...jumps }));
    const id = setInterval(() => {
      setShown((s) => {
        let moved = false;
        const next = { ...s };
        for (const [pid, to] of Object.entries(target.current)) {
          const at = next[pid];
          if (at !== undefined && at !== to) {
            next[pid] = (at + 1) % size;
            moved = true;
          }
        }
        if (!moved) clearInterval(id);
        return moved ? next : s;
      });
    }, 140);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // one soft tick per hop, outside the state updater so it can't double-fire
  const shownKey = Object.values(shown).join(',');
  const prevKey = useRef(shownKey);
  useEffect(() => {
    if (prevKey.current !== shownKey) play('step');
    prevKey.current = shownKey;
  }, [shownKey]);

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
      return tile.index === 12 ? <Zap className="ico gold" strokeWidth={2.2} /> : <Droplets className="ico sky" strokeWidth={2.2} />;
    default:
      return null;
  }
}

function Corner({ tile, jailed, pot }: { tile: Tile; jailed: number; pot: number }) {
  switch (tile.kind) {
    case 'go':
      return (
        <div className="corner-body go">
          <span className="go-word">START</span>
          <span className="go-sub">collect $200</span>
          <span className="go-arrow">←</span>
        </div>
      );
    case 'jail':
      return (
        <div className="corner-body jail">
          <div className="bars">
            <span>In Prison</span>
            {jailed > 0 && <b>{jailed}</b>}
          </div>
          <span className="visiting">Just visiting</span>
        </div>
      );
    case 'parking':
      return (
        <div className="corner-body">
          <Palmtree className="ico big mint" strokeWidth={2} />
          <span className="corner-name">{tile.name}</span>
          {pot > 0 && <span className="pot">${pot}</span>}
        </div>
      );
    default:
      return (
        <div className="corner-body">
          <Siren className="ico big rose" strokeWidth={2} />
          <span className="corner-name">{tile.name}</span>
        </div>
      );
  }
}

export function Board({
  state,
  onTile,
  children,
}: {
  state: PublicState;
  onTile: (i: number) => void;
  children: ReactNode;
}) {
  const map = mapOf(state);
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const alive = state.phase === 'lobby' ? [] : state.players.filter((p) => !p.bankrupt);
  const shown = useHopPositions(alive, map.size, map.jail);
  const sd = map.side;
  const jailed = alive.filter((p) => p.inJail).length;
  const lastDice = state.turn?.dice ? state.turn.dice[0] + state.turn.dice[1] : 7;

  const onTileMap = new Map<number, string[]>();
  for (const p of alive) {
    const at = shown[p.id] ?? p.position;
    onTileMap.set(at, [...(onTileMap.get(at) ?? []), p.id]);
  }

  return (
    <div
      className={`board size-${map.size}`}
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
        const buyable = t.kind === 'property' || t.kind === 'airport' || t.kind === 'utility';
        const cls = [
          'tile',
          side,
          `kind-${t.kind}`,
          owner ? 'owned' : '',
          own?.mortgaged ? 'mortgaged' : '',
          own?.frozen ? 'frozen' : '',
          special ? `special-${special}` : '',
          active ? 'active' : '',
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
        } else if (t.kind === 'tax') chip = state.settings.wealthTax ? '%' : `$${t.tax}`;

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
            tabIndex={buyable ? 0 : -1}
            aria-label={owner ? `${name}, owned by ${owner.name}` : name}
          >
            {side === 'corner' ? (
              <Corner tile={t} jailed={jailed} pot={state.settings.jackpot ? state.pot : 0} />
            ) : (
              <span className="tile-body">
                <span className="tile-icon">
                  <TileIcon tile={t} special={special} rail={map.id === 'europe'} />
                  {own && own.houses > 0 && (
                    <span className={`houses${own.houses >= 5 ? ' hotel' : ''}${own.houses >= 6 ? ' mega' : ''}`}>
                      {own.houses >= 5 ? ['H', 'SKY', 'LM'][own.houses - 5] : Array.from({ length: own.houses }, (_, k) => <i key={k} />)}
                    </span>
                  )}
                  {own?.frozen ? <Snowflake className="frozen-ico" /> : null}
                </span>
                <span className="tile-name">{name}</span>
                {chip && <span className="chip">{chip}</span>}
              </span>
            )}
            {group && <GroupMark group={group} className="flag" />}
            {rate && <span className={`rate-badge${rate.startsWith('-') ? ' down' : ''}`}>{rate}</span>}
          </button>
        );
      })}

      <div className="board-center">{children}</div>

      <Reactions state={state} shown={shown} />

      <div className="tokens" aria-hidden>
        {alive.map((p) => {
          const at = shown[p.id] ?? p.position;
          const { row, col } = cellOf(at, sd);
          const group = onTileMap.get(at) ?? [p.id];
          const k = group.indexOf(p.id);
          const spread = group.length > 1 ? 1.3 : 0;
          const angle = (k / group.length) * Math.PI * 2 - Math.PI / 2;
          const isTurn = state.turn?.playerId === p.id;
          return (
            <span
              key={p.id}
              className={`token${isTurn ? ' turn' : ''}${p.inJail ? ' jailed' : ''}`}
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
