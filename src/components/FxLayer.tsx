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

/** Landing effects wait for the dice to settle. */
const DICE_MS = 600;

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
/** Tile index to its centre on the board, in %. */
function spot(state: PublicState, tile: number) {
  const side = mapOf(state).side;
  const { row, col } = cellOf(tile, side);
  return { x: centerPct(col, side), y: centerPct(row, side) };
}

/**
 * Turns the engine's fx list into calm on-board feedback: a short banner for big
 * moments (jail, hotels, auctions, bankruptcy) and a +$/−$ label on the tile.
 */
export function useFx(state: PublicState, me: string | null) {
  const seen = useRef<number | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
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
    const run = (f: Fx) => {
      const who = f.pid === me ? 'You' : name(f.pid);
      switch (f.kind) {
        case 'doubles':
          show({ tone: 'accent', icon: <Sparkles />, title: 'Doubles!', sub: `${who} roll${f.pid === me ? '' : 's'} again` }, 1200);
          break;
        case 'jail':
          show({ tone: 'jail', icon: <Siren />, title: 'Busted!', sub: `${who} ${f.pid === me ? 'are' : 'is'} going to Prison` }, 2300);
          break;
        case 'jailFree':
          show({ tone: 'good', icon: <Sparkles />, title: 'Free!', sub: `${who} broke out of Prison` }, 1400);
          break;
        case 'buy':
          if (f.tile !== undefined && f.amount) float(f.tile, f.amount, false);
          break;
        case 'auctionWon':
          show({ tone: 'gold', icon: <Gavel />, title: 'Sold!', sub: `${who} won${f.amount ? ` for $${f.amount}` : ''}`, color: colorOf(f.pid) });
          break;
        case 'hotel':
        case 'mega':
          show({
            tone: 'gold',
            icon: f.kind === 'hotel' ? <Hotel /> : <Building2 />,
            title: f.kind === 'hotel' ? 'Hotel built!' : 'Skyscraper!',
            sub: `${who} ${f.pid === me ? 'go' : 'goes'} big`,
          });
          break;
        case 'rent':
          if (f.tile !== undefined && f.amount) float(f.tile, f.amount, false);
          break;
        case 'toll':
          if (f.tile !== undefined && f.amount) {
            float(f.tile, f.amount, false);
          }
          break;
        case 'news':
          show({ tone: 'accent', icon: <Newspaper />, title: 'Breaking news', sub: state.lastCard?.text.slice(0, 60) }, 2200);
          break;
        case 'committee':
          show({ tone: 'gold', icon: <Handshake />, title: 'Committee!', sub: `${who} take${f.pid === me ? '' : 's'} the pot${f.amount ? ` · $${f.amount}` : ''}` });
          break;
        case 'shaadi':
          show({ tone: 'gold', icon: <HeartHandshake />, title: 'Shaadi Mubarak!', sub: `Salami for ${who}${f.amount ? ` · $${f.amount}` : ''}` });
          break;
        case 'law':
          show({ tone: 'accent', icon: <Landmark />, title: 'Parliament', sub: state.lastCard?.text.slice(0, 60) }, 2200);
          break;
        case 'culture':
          show({ tone: 'gold', icon: <Palette />, title: 'Culture prize!', sub: `${who} saw every museum${f.amount ? ` · $${f.amount}` : ''}` });
          break;
        case 'festival':
          show({ tone: 'accent', icon: <PartyPopper />, title: 'Festival!', sub: 'Party time' }, 1500);
          break;
        case 'deported':
          show({ tone: 'bad', icon: <PlaneTakeoff />, title: 'Deported!', sub: `${who} ${f.pid === me ? 'are' : 'is'} on the next flight out` }, 2000);
          break;
        case 'fullSet':
          show({ tone: 'gold', icon: <Crown />, title: 'Full set!', sub: `${who} own${f.pid === me ? '' : 's'} the whole country`, color: colorOf(f.pid) });
          break;
        case 'tax':
          if (f.tile !== undefined && f.amount) float(f.tile, f.amount, false);
          break;
        case 'start':
          if (f.amount) float(0, f.amount, true);
          break;
        case 'jackpot':
          show({ tone: 'gold', icon: <Coins />, title: 'Jackpot!', sub: `${who} scoop${f.pid === me ? '' : 's'} ${f.amount ? `$${f.amount}` : 'the pot'}` });
          if (f.amount) float(posOf(f.pid), f.amount, true);
          break;
        case 'bankrupt':
          show({ tone: 'bad', icon: <Skull />, title: 'Bankrupt', sub: `${who} ${f.pid === me ? 'are' : 'is'} out of the game` }, 2600);
          break;
        case 'win':
          show({ tone: 'gold', icon: <Trophy />, title: `${who} win${f.pid === me ? '' : 's'}!`, sub: 'Richest in Richlands' }, 4000);
          break;
        case 'trade':
          show({ tone: 'accent', icon: <PartyPopper />, title: 'Deal!', sub: 'A trade went through' }, 1300);
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
        // everything after the roll shows once the dice settle
        if (f.kind === 'doubles') run(f);
        delay = DICE_MS;
        continue;
      }
      if (delay) later(delay, () => run(f));
      else run(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version]);

  return { banner, floats };
}

export function FxOverlay({ fx }: { fx: ReturnType<typeof useFx> }) {
  const { banner, floats } = fx;
  return (
    <div className="fx-layer" aria-live="polite">
      {floats.map((f) => (
        <span key={f.id} className={`money-float ${f.good ? 'good' : 'bad'}`} style={{ left: `${f.x}%`, top: `${f.y}%` }}>
          {f.text}
        </span>
      ))}
      {banner && (
        <div key={banner.id} className={`fx-banner tone-${banner.tone}`} style={banner.color ? { ['--c' as string]: banner.color } : undefined}>
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
        <House key={k} strokeWidth={2.6} />
      ))}
    </span>
  );
}
