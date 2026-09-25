import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Rewind, Trophy, X } from 'lucide-react';
import { applyAction, netWorth, setConnected, tileOf, toPublic, upgradeState } from '../../shared/engine';
import type { ReplayData } from '../../shared/protocol';
import type { GameState, PublicState } from '../../shared/types';
import { socket, toast } from '../net';
import { Avatar } from './Avatar';
import { Board } from './Board';

// ---------- net worth chart ----------

export function NetWorthChart({ state, height = 150 }: { state: PublicState; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = state.history;
  // with hidden cash the history only carries the viewer's own line
  const players = state.players.filter((p) => points.some((pt) => p.id in pt.worth));
  if (points.length < 2) return <p className="muted small empty">The chart fills in as turns are played.</p>;

  const W = 320;
  const H = height;
  const padL = 4;
  const padR = 58; // room for direct labels
  const padT = 8;
  const padB = 14;
  const max = Math.max(100, ...points.flatMap((p) => Object.values(p.worth)));
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - Math.max(0, v) / max) * (H - padT - padB);
  const last = points[points.length - 1];
  const hi = hover ?? points.length - 1;

  // spread end labels so they don't collide
  const labels = players
    .map((p) => ({ p, v: last.worth[p.id] ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .map((l) => ({ ...l, ly: y(l.v) }));
  for (let i = 1; i < labels.length; i++) labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + 11);

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Net worth of each player over the game"
        onMouseMove={(e) => {
          const r = svgRef.current!.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - padL) / (W - padL - padR)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} className="grid" />
        ))}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="axis" />
        {players.map((p) => (
          <polyline
            key={p.id}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={p.bankrupt ? 0.45 : 1}
            points={points.map((pt, i) => `${x(i)},${y(pt.worth[p.id] ?? 0)}`).join(' ')}
          />
        ))}
        {hover !== null && <line x1={x(hi)} x2={x(hi)} y1={padT} y2={H - padB} className="crosshair" />}
        {hover !== null &&
          players.map((p) => (
            <circle key={p.id} cx={x(hi)} cy={y(points[hi].worth[p.id] ?? 0)} r={4} fill={p.color} className="dot-ring" />
          ))}
        {labels.map(({ p, ly }) => (
          <text key={p.id} x={W - padR + 6} y={ly + 3} className="end-label">
            {p.name.slice(0, 9)}
          </text>
        ))}
        <text x={padL} y={H - 2} className="axis-label">
          turn 1
        </text>
        <text x={W - padR} y={H - 2} className="axis-label" textAnchor="end">
          turn {last.n}
        </text>
      </svg>
      <ul className="chart-legend">
        {players.map((p) => (
          <li key={p.id}>
            <Avatar player={p} size={14} /> {p.name}
            <b>${points[hi].worth[p.id] ?? 0}</b>
          </li>
        ))}
      </ul>
      {hover !== null && <p className="muted small chart-note">After turn {points[hi].n}</p>}
    </div>
  );
}

// ---------- end of game ----------

export function EndSummary({ state, onReplay }: { state: PublicState; onReplay: () => void }) {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const topTile = Object.entries(state.tileRent).sort((a, b) => b[1] - a[1])[0];
  const ranked = [...state.players].sort((a, b) => {
    if (a.id === state.winner) return -1;
    if (b.id === state.winner) return 1;
    return netWorth(state, b) - netWorth(state, a);
  });
  const stats = Object.entries(state.stats);
  const landlord = stats.sort((a, b) => b[1].rentReceived - a[1].rentReceived)[0];
  const minutes = state.startedAt ? Math.round((state.log[state.log.length - 1]?.at - state.startedAt) / 60000) : 0;

  const top = ranked.slice(0, 3);
  // podium order on screen: 2nd, 1st, 3rd
  const steps = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="summary">
      <div className="podium-steps" aria-label="Podium">
        {steps.map((p) => {
          const place = ranked.indexOf(p) + 1;
          return (
            <div key={p.id} className={`step place-${place}`} style={{ ['--c' as string]: p.color }}>
              <Avatar player={p} size={place === 1 ? 46 : 36} />
              <b>{p.name}</b>
              <span className="muted small">{p.bankrupt ? 'bankrupt' : `$${netWorth(state, p)}`}</span>
              <div className="block">{place === 1 ? <Trophy size={20} /> : place}</div>
            </div>
          );
        })}
      </div>
      <ol className="podium" start={4}>
        {ranked.slice(3).map((p, i) => (
          <li key={p.id}>
            <span className="rank">{i + 4}</span>
            <Avatar player={p} size={24} />
            <b>{p.name}</b>
            <span className="muted">{p.bankrupt ? 'bankrupt' : `$${netWorth(state, p)}`}</span>
          </li>
        ))}
      </ol>
      <dl className="facts">
        {state.biggestRent && (
          <div>
            <dt>Biggest rent</dt>
            <dd>
              ${state.biggestRent.amount} · {name(state.biggestRent.payer)} → {name(state.biggestRent.owner)} on{' '}
              {tileOf(state, state.biggestRent.tile).name}
            </dd>
          </div>
        )}
        {topTile && (
          <div>
            <dt>MVP city</dt>
            <dd>
              {tileOf(state, Number(topTile[0])).name} · ${topTile[1]} earned
            </dd>
          </div>
        )}
        {landlord && landlord[1].rentReceived > 0 && (
          <div>
            <dt>Top landlord</dt>
            <dd>
              {name(landlord[0])} · ${landlord[1].rentReceived} collected
            </dd>
          </div>
        )}
        <div>
          <dt>Length</dt>
          <dd>
            {state.round} rounds · {state.turnNo} turns{minutes > 0 ? ` · ${minutes} min` : ''}
          </dd>
        </div>
      </dl>
      <NetWorthChart state={state} height={120} />
      <button className="btn big" onClick={onReplay}>
        <Play size={16} /> Watch replay
      </button>
    </div>
  );
}

// ---------- replay ----------

const CHECKPOINT_EVERY = 40;

/** Rebuilds any moment of the game by re-running the recorded events through the engine. */
function useReplay(data: ReplayData | null) {
  return useMemo(() => {
    if (!data) return null;
    const checkpoints: GameState[] = [];
    let s = upgradeState(data.initial);
    const step = (state: GameState, i: number) => {
      const ev = data.events[i];
      try {
        return ev.t === 'a' ? applyAction(state, ev.pid, ev.action, ev.now) : setConnected(state, ev.pid, ev.connected, ev.now);
      } catch {
        return state;
      }
    };
    for (let i = 0; i < data.events.length; i++) {
      if (i % CHECKPOINT_EVERY === 0) checkpoints.push(s);
      s = step(s, i);
    }
    const at = (n: number): GameState => {
      let st = checkpoints[Math.floor(n / CHECKPOINT_EVERY)] ?? s;
      for (let i = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY; i < n; i++) st = step(st, i);
      return st;
    };
    return { total: data.events.length, at };
  }, [data]);
}

export function ReplayViewer({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const replay = useReplay(data);

  useEffect(() => {
    socket.emit('replay:get', (res) => {
      if (res.ok) setData(res.data);
      else {
        toast(res.error);
        onClose();
      }
    });
  }, [onClose]);

  useEffect(() => {
    if (!replay || !playing) return;
    const id = setInterval(() => setPos((p) => (p >= replay.total ? p : p + 1)), 600 / speed);
    return () => clearInterval(id);
  }, [replay, playing, speed]);

  useEffect(() => {
    if (replay && pos >= replay.total) setPlaying(false);
  }, [pos, replay]);

  const view = useMemo(() => (replay ? toPublic(replay.at(pos), null) : null), [replay, pos]);

  return (
    <div className="modal-backdrop replay-backdrop">
      <div className="replay" role="dialog" aria-label="Game replay">
        <header className="replay-head">
          <h2>Replay</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close replay">
            <X size={18} />
          </button>
        </header>
        {!view || !replay ? (
          <p className="center-note">Loading replay…</p>
        ) : (
          <div className="replay-body">
            <div className="replay-board">
              <Board state={view} onTile={() => {}}>
                <div className="center">
                  <p className="hint">
                    Round {view.round} · turn {view.turnNo}
                  </p>
                  <ul className="feed">
                    {view.log.slice(-5).map((l) => (
                      <li key={l.id}>{l.text}</li>
                    ))}
                  </ul>
                </div>
              </Board>
            </div>
            <aside className="replay-side">
              {view.players.map((p) => (
                <div key={p.id} className={`player${view.turn?.playerId === p.id ? ' turn' : ''}${p.bankrupt ? ' out' : ''}`}>
                  <Avatar player={p} size={24} />
                  <span className="name">{p.name}</span>
                  <span className="cash">${p.cash}</span>
                </div>
              ))}
              <NetWorthChart state={view} height={110} />
            </aside>
            <div className="replay-ctrls">
              <button className="icon-btn" onClick={() => setPos(0)} aria-label="Back to start">
                <Rewind size={16} />
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  if (pos >= replay.total) setPos(0);
                  setPlaying((v) => !v);
                }}
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={replay.total}
                value={pos}
                onChange={(e) => {
                  setPlaying(false);
                  setPos(Number(e.target.value));
                }}
                aria-label="Replay position"
              />
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
                {[1, 2, 4, 8, 16].map((v) => (
                  <option key={v} value={v}>
                    {v}x
                  </option>
                ))}
              </select>
              <span className="muted small">
                {pos}/{replay.total}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
