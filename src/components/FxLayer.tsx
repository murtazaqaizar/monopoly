import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  Coins,
  Crown,
  Gavel,
  Hammer,
  Handshake,
  HeartHandshake,
  Hotel,
  House,
  Landmark,
  Newspaper,
  Palette,
  PartyPopper,
  PlaneTakeoff,
  Siren,
  Skull,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { mapOf } from '../../shared/engine';
import type { Fx, PublicState } from '../../shared/types';
import { cellOf, centerPct } from './Board';

/** Matches the hop speed in Board so landing effects wait for the token. */
const HOP_MS = 140;

interface Banner {
  id: number;
  tone: 'jail' | 'gold' | 'good' | 'bad' | 'accent';
  icon: ReactNode;
  title: string;
  sub?: string;
  color?: string;
}
interface Float {
  id: number;
  x: number;
  y: number;
  text: string;
  good: boolean;
}
interface Burst {
  id: number;
  x: number;
  y: number;
  kind: 'coins' | 'confetti' | 'sparks';
  color?: string;
}
/** A stream of coins flying from one spot to another (rent paid to an owner). */
interface Flow {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** Tile index to its centre on the board, in %. */
function spot(state: PublicState, tile: number) {
  const side = mapOf(state).side;
  const { row, col } = cellOf(tile, side);
  return { x: centerPct(col, side), y: centerPct(row, side) };
}

/** Classes to add to tiles while a flash plays, keyed by tile index. */
export type TileFlashes = Record<number, string>;

/**
 * Turns the engine's fx list into on-board visuals: big banners for jail, hotels,
 * auctions and bankruptcy, floating +$/−$ labels, tile flashes and particle bursts.
 */
export function useFx(state: PublicState, me: string | null) {
  const seen = useRef<number | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [flashes, setFlashes] = useState<TileFlashes>({});
  const [flows, setFlows] = useState<Flow[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const list = state.fx ?? [];
    const latest = list.length ? list[list.length - 1].id : 0;
    if (seen.current === null) {
      seen.current = latest;
      return;
    }
    const fresh = list.filter((f) => f.id > seen.current!);
    seen.current = latest;
    if (!fresh.length) return;

    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const name = (pid: string | null) => state.players.find((p) => p.id === pid)?.name ?? 'Someone';
    const colorOf = (pid: string | null) => state.players.find((p) => p.id === pid)?.color;
    const posOf = (pid: string | null) => state.players.find((p) => p.id === pid)?.position ?? 0;
    const d = state.turn?.dice;
    let delay = 0;

    const show = (b: Omit<Banner, 'id'>, ms = 1900) => {
      const id = Math.random();
      setBanner({ ...b, id });
      later(ms, () => setBanner((cur) => (cur?.id === id ? null : cur)));
    };
    const float = (tile: number, amount: number, good: boolean) => {
      const id = Math.random();
      const at = spot(state, tile);
      setFloats((f) => [...f, { id, ...at, text: `${good ? '+' : '−'}$${amount}`, good }]);
      later(1600, () => setFloats((f) => f.filter((x) => x.id !== id)));
    };
    const burst = (tile: number | null, kind: Burst['kind'], color?: string) => {
      const id = Math.random();
      const at = tile === null ? { x: 50, y: 50 } : spot(state, tile);
      setBursts((b) => [...b, { id, ...at, kind, color }]);
      later(1400, () => setBursts((b) => b.filter((x) => x.id !== id)));
    };
    const flow = (fromTile: number, toTile: number) => {
      const id = Math.random();
      setFlows((f) => [...f, { id, from: spot(state, fromTile), to: spot(state, toTile) }]);
      later(1500, () => setFlows((f) => f.filter((x) => x.id !== id)));
    };
    const flash = (tile: number, cls: string) => {
      setFlashes((f) => ({ ...f, [tile]: cls }));
      later(1500, () => setFlashes((f) => (f[tile] === cls ? Object.fromEntries(Object.entries(f).filter(([k]) => Number(k) !== tile)) : f)));
    };

    const run = (f: Fx) => {
      const who = f.pid === me ? 'You' : name(f.pid);
      switch (f.kind) {
        case 'doubles':
          show({ tone: 'accent', icon: <Sparkles />, title: 'Doubles!', sub: `${who} roll${f.pid === me ? '' : 's'} again` }, 1200);
          break;
        case 'jail':
          show({ tone: 'jail', icon: <Siren />, title: 'Busted!', sub: `${who} ${f.pid === me ? 'are' : 'is'} going to Prison` }, 2300);
          flash(mapOf(state).jail, 'flash-jail');
          break;
        case 'jailFree':
          show({ tone: 'good', icon: <Sparkles />, title: 'Free!', sub: `${who} broke out of Prison` }, 1400);
          break;
        case 'buy':
          if (f.tile !== undefined) {
            flash(f.tile, 'flash-buy');
            burst(f.tile, 'sparks', colorOf(f.pid));
            if (f.amount) float(f.tile, f.amount, false);
          }
          break;
        case 'auctionWon':
          show({ tone: 'gold', icon: <Gavel />, title: 'Sold!', sub: `${who} won${f.amount ? ` for $${f.amount}` : ''}`, color: colorOf(f.pid) });
          if (f.tile !== undefined) {
            flash(f.tile, 'flash-buy');
            burst(f.tile, 'coins');
          }
          break;
        case 'build':
          if (f.tile !== undefined) {
            flash(f.tile, 'flash-build');
            burst(f.tile, 'sparks', '#4ade80');
          }
          break;
        case 'hotel':
        case 'mega':
          show({
            tone: 'gold',
            icon: f.kind === 'hotel' ? <Hotel /> : <Building2 />,
            title: f.kind === 'hotel' ? 'Hotel built!' : 'Skyscraper!',
            sub: `${who} ${f.pid === me ? 'go' : 'goes'} big`,
          });
          if (f.tile !== undefined) {
            flash(f.tile, 'flash-hotel');
            burst(f.tile, 'confetti');
          }
          break;
        case 'rent':
          if (f.tile !== undefined) {
            flash(f.tile, 'flash-rent');
            if (f.amount) float(f.tile, f.amount, false);
            const owner = state.properties[f.tile]?.owner;
            const ownerAt = state.players.find((p) => p.id === owner)?.position;
            if (ownerAt !== undefined && ownerAt !== f.tile) flow(f.tile, ownerAt);
          }
          break;
        case 'toll':
          if (f.tile !== undefined && f.amount) {
            float(f.tile, f.amount, false);
            const owner = state.properties[f.tile]?.owner;
            const ownerAt = state.players.find((p) => p.id === owner)?.position;
            if (ownerAt !== undefined) flow(f.tile, ownerAt);
          }
          break;
        case 'news':
          show({ tone: 'accent', icon: <Newspaper />, title: 'Breaking news', sub: state.lastCard?.text.slice(0, 60) }, 2200);
          break;
        case 'committee':
          show({ tone: 'gold', icon: <Handshake />, title: 'Committee!', sub: `${who} take${f.pid === me ? '' : 's'} the pot${f.amount ? ` · $${f.amount}` : ''}` });
          burst(posOf(f.pid), 'coins');
          break;
        case 'shaadi':
          show({ tone: 'gold', icon: <HeartHandshake />, title: 'Shaadi Mubarak!', sub: `Salami for ${who}${f.amount ? ` · $${f.amount}` : ''}` });
          burst(posOf(f.pid), 'confetti');
          break;
        case 'law':
          show({ tone: 'accent', icon: <Landmark />, title: 'Parliament', sub: state.lastCard?.text.slice(0, 60) }, 2200);
          break;
        case 'culture':
          show({ tone: 'gold', icon: <Palette />, title: 'Culture prize!', sub: `${who} saw every museum${f.amount ? ` · $${f.amount}` : ''}` });
          burst(posOf(f.pid), 'confetti');
          break;
        case 'festival':
          show({ tone: 'accent', icon: <PartyPopper />, title: 'Festival!', sub: 'Party time' }, 1500);
          burst(posOf(f.pid), 'confetti');
          break;
        case 'deported':
          show({ tone: 'bad', icon: <PlaneTakeoff />, title: 'Deported!', sub: `${who} ${f.pid === me ? 'are' : 'is'} on the next flight out` }, 2000);
          break;
        case 'fullSet':
          show({ tone: 'gold', icon: <Crown />, title: 'Full set!', sub: `${who} own${f.pid === me ? '' : 's'} the whole country`, color: colorOf(f.pid) });
          if (f.tile !== undefined) burst(f.tile, 'confetti');
          break;
        case 'tax':
          if (f.tile !== undefined && f.amount) float(f.tile, f.amount, false);
          break;
        case 'start':
          if (f.amount) float(0, f.amount, true);
          burst(0, 'coins');
          break;
        case 'jackpot':
          show({ tone: 'gold', icon: <Coins />, title: 'Jackpot!', sub: `${who} scoop${f.pid === me ? '' : 's'} ${f.amount ? `$${f.amount}` : 'the pot'}` });
          burst(null, 'coins');
          if (f.amount) float(posOf(f.pid), f.amount, true);
          break;
        case 'bankrupt':
          show({ tone: 'bad', icon: <Skull />, title: 'Bankrupt', sub: `${who} ${f.pid === me ? 'are' : 'is'} out of the game` }, 2600);
          break;
        case 'win':
          show({ tone: 'gold', icon: <Trophy />, title: `${who} win${f.pid === me ? '' : 's'}!`, sub: 'Richest in Richlands' }, 4000);
          burst(null, 'confetti');
          break;
        case 'trade':
          show({ tone: 'accent', icon: <PartyPopper />, title: 'Deal!', sub: 'A trade went through' }, 1300);
          break;
        case 'sell':
          if (f.tile !== undefined) flash(f.tile, 'flash-rent');
          break;
        case 'heist':
          show({ tone: 'bad', icon: <Hammer />, title: 'Heist!', sub: `${who} pulled a heist` }, 1500);
          break;
        default:
          break;
      }
    };

    for (const f of fresh.slice(-6)) {
      if (f.kind === 'dice' || f.kind === 'doubles') {
        // everything after the roll lands once the token finishes hopping
        const steps = d ? d[0] + d[1] : 6;
        if (f.kind === 'doubles') run(f);
        delay = 380 + steps * HOP_MS;
        continue;
      }
      if (delay) later(delay, () => run(f));
      else run(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version]);

  return { banner, floats, bursts, flashes, flows };
}

const COIN_N = 14;
const CONFETTI = ['#fbbf24', '#f472b6', '#7b5cff', '#34d399', '#7dd3fc', '#fb923c'];

export function FxOverlay({ fx }: { fx: ReturnType<typeof useFx> }) {
  const { banner, floats, bursts, flows } = fx;
  return (
    <div className="fx-layer" aria-live="polite">
      {flows.map((f) => (
        <span key={f.id} className="coin-flow" style={{ left: `${f.from.x}%`, top: `${f.from.y}%` }}>
          {Array.from({ length: 6 }, (_, i) => (
            <i
              key={i}
              style={{
                ['--tx' as string]: `${((f.to.x - f.from.x) / 100) * 100}cqw`,
                ['--ty' as string]: `${((f.to.y - f.from.y) / 100) * 100}cqh`,
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))}
        </span>
      ))}
      {bursts.map((b) => (
        <span key={b.id} className={`burst burst-${b.kind}`} style={{ left: `${b.x}%`, top: `${b.y}%` }}>
          {Array.from({ length: b.kind === 'confetti' ? 22 : COIN_N }, (_, i) => {
            const a = (i / (b.kind === 'confetti' ? 22 : COIN_N)) * Math.PI * 2 + (i % 3) * 0.3;
            const r = b.kind === 'sparks' ? 5 : b.kind === 'coins' ? 8 + (i % 4) * 2 : 10 + (i % 5) * 3;
            return (
              <i
                key={i}
                style={{
                  ['--dx' as string]: `${Math.cos(a) * r}cqmin`,
                  ['--dy' as string]: `${Math.sin(a) * r}cqmin`,
                  ['--rot' as string]: `${(i * 67) % 360}deg`,
                  ['--c' as string]: b.kind === 'confetti' ? CONFETTI[i % CONFETTI.length] : b.color ?? '#fbbf24',
                  animationDelay: `${(i % 4) * 30}ms`,
                }}
              />
            );
          })}
        </span>
      ))}
      {floats.map((f) => (
        <span key={f.id} className={`money-float ${f.good ? 'good' : 'bad'}`} style={{ left: `${f.x}%`, top: `${f.y}%` }}>
          {f.text}
        </span>
      ))}
      {banner && (
        <div key={banner.id} className={`fx-banner tone-${banner.tone}`} style={banner.color ? { ['--c' as string]: banner.color } : undefined}>
          {banner.tone === 'jail' && <span className="banner-bars" />}
          <span className="banner-icon">{banner.icon}</span>
          <span className="banner-text">
            <b>{banner.title}</b>
            {banner.sub && <small>{banner.sub}</small>}
          </span>
        </div>
      )}
    </div>
  );
}

/** Building on a tile: houses as little house icons, then hotel, tower, landmark. */
export function Buildings({ n }: { n: number }) {
  if (n <= 0) return null;
  if (n >= 5) {
    const Icon = n === 5 ? Hotel : n === 6 ? Building2 : Landmark;
    return (
      <span key={n} className={`buildings big b${n}`}>
        <Icon strokeWidth={2.4} />
      </span>
    );
  }
  return (
    <span key={n} className="buildings">
      {Array.from({ length: n }, (_, k) => (
        <House key={k} strokeWidth={2.6} style={{ animationDelay: `${k * 60}ms` }} />
      ))}
    </span>
  );
}
