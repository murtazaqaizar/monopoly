import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { FxKind, PublicState } from '../shared/types';

/*
 * Every sound is synthesised with Web Audio: no files to download, license or cache.
 * Browsers only allow audio after a user gesture, so the context is created lazily
 * and resumed on the first click or key press.
 */

export type SoundName = FxKind | 'step' | 'yourTurn' | 'pop' | 'tick';

interface Prefs {
  muted: boolean;
  volume: number;
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem('sound') ?? 'null');
    if (p && typeof p.volume === 'number') return { muted: !!p.muted, volume: p.volume };
  } catch {
    /* use defaults */
  }
  return { muted: false, volume: 0.6 };
}

let prefs = loadPrefs();
const subs = new Set<() => void>();

export function useSoundPrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => prefs,
  );
}

export function setSoundPrefs(next: Partial<Prefs>) {
  prefs = { ...prefs, ...next };
  try {
    localStorage.setItem('sound', JSON.stringify(prefs));
  } catch {
    /* per-tab only */
  }
  if (master && ctx) master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, ctx.currentTime, 0.02);
  subs.forEach((s) => s());
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = prefs.muted ? 0 : prefs.volume;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function unlock() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: false, passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

// ---------- building blocks ----------

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** glide to this frequency over the note */
  to?: number;
  /** vibrato depth in Hz */
  vibrato?: number;
  /** lowpass cutoff, softens square and saw waves */
  cutoff?: number;
}

function tone(freq: number, at: number, dur: number, o: ToneOpts = {}) {
  const c = ctx!;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  if (o.vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = o.vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const peak = o.gain ?? 0.3;
  const attack = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc.connect(g);
  if (o.cutoff) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cutoff;
    node = node.connect(f);
  }
  node.connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

interface NoiseOpts {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

function noise(at: number, dur: number, o: NoiseOpts = {}) {
  const c = ctx!;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12); // MIDI note -> Hz

function arp(notes: number[], at: number, gap: number, dur: number, o: ToneOpts = {}) {
  notes.forEach((n, i) => tone(NOTE(n), at + i * gap, dur, o));
}

function coin(at: number, pitch = 1) {
  tone(1975 * pitch, at, 0.09, { type: 'triangle', gain: 0.22 });
  tone(2637 * pitch, at + 0.05, 0.25, { type: 'triangle', gain: 0.18 });
}

function knock(at: number, gain = 0.5) {
  noise(at, 0.08, { filter: 'lowpass', freq: 900, gain });
  tone(180, at, 0.12, { to: 70, gain: gain * 0.9 });
}

// ---------- the sounds ----------

const SOUNDS: Record<SoundName, () => void> = {
  dice() {
    // a handful of plastic clicks tumbling across the board
    for (let i = 0; i < 7; i++) noise(i * 0.045 + Math.random() * 0.02, 0.03, { freq: 2500 + Math.random() * 1500, q: 4, gain: 0.35 });
    knock(0.32, 0.25);
  },
  doubles() {
    SOUNDS.dice();
    arp([84, 91], 0.4, 0.09, 0.14, { type: 'square', gain: 0.08, cutoff: 3000 });
  },
  step() {
    tone(1300, 0, 0.03, { type: 'triangle', gain: 0.05 });
  },
  buy() {
    // cha-ching
    noise(0, 0.07, { freq: 3000, q: 2, gain: 0.25 });
    tone(1568, 0.04, 0.18, { type: 'triangle', gain: 0.22 });
    tone(2093, 0.12, 0.45, { type: 'triangle', gain: 0.25 });
    tone(4186, 0.12, 0.3, { gain: 0.06 });
  },
  rent() {
    // coins falling out of a pocket
    coin(0, 0.9);
    coin(0.08, 0.8);
    coin(0.16, 0.7);
    tone(220, 0.05, 0.25, { to: 150, type: 'triangle', gain: 0.12 });
  },
  start() {
    arp([72, 76, 79, 84], 0, 0.07, 0.25, { type: 'triangle', gain: 0.2 });
    coin(0.3);
  },
  tax() {
    tone(147, 0, 0.35, { type: 'square', to: 98, gain: 0.12, cutoff: 800 });
    tone(110, 0.12, 0.35, { type: 'square', to: 73, gain: 0.1, cutoff: 700 });
  },
  chance() {
    // surprise: rising whoosh into a mystical sparkle
    noise(0, 0.35, { freq: 400, to: 5000, q: 3, gain: 0.12 });
    arp([72, 79, 84, 88, 91], 0.2, 0.06, 0.4, { gain: 0.12 });
    tone(NOTE(96), 0.5, 0.6, { gain: 0.06, vibrato: 12 });
  },
  chest() {
    // present: a bright little music-box flourish
    arp([79, 84, 86, 88, 91, 96], 0, 0.05, 0.35, { type: 'triangle', gain: 0.14 });
    tone(NOTE(100), 0.32, 0.7, { gain: 0.06 });
  },
  jail() {
    // siren down-sweep and a cell door slam
    tone(900, 0, 0.3, { type: 'sawtooth', to: 500, gain: 0.08, cutoff: 2500 });
    tone(900, 0.3, 0.3, { type: 'sawtooth', to: 500, gain: 0.08, cutoff: 2500 });
    noise(0.62, 0.25, { freq: 700, q: 6, gain: 0.35 });
    tone(110, 0.62, 0.3, { type: 'square', gain: 0.15, cutoff: 600 });
  },
  jailFree() {
    // keys jingling
    for (let i = 0; i < 5; i++) tone(i % 2 ? 2800 : 2350, i * 0.06, 0.12, { type: 'triangle', gain: 0.1 });
    arp([72, 79], 0.32, 0.08, 0.3, { type: 'triangle', gain: 0.15 });
  },
  build() {
    // two hammer knocks
    knock(0, 0.45);
    knock(0.16, 0.4);
    tone(NOTE(79), 0.32, 0.2, { type: 'triangle', gain: 0.12 });
  },
  hotel() {
    knock(0, 0.4);
    arp([60, 64, 67, 72], 0.15, 0.09, 0.3, { type: 'square', gain: 0.07, cutoff: 2200 });
    [72, 76, 79].forEach((n) => tone(NOTE(n), 0.55, 0.7, { type: 'triangle', gain: 0.1 }));
  },
  mega() {
    knock(0, 0.5);
    arp([55, 60, 64, 67, 72, 76], 0.12, 0.07, 0.3, { type: 'sawtooth', gain: 0.05, cutoff: 1800 });
    [60, 67, 72, 76, 79].forEach((n) => tone(NOTE(n), 0.6, 1.1, { type: 'triangle', gain: 0.08, vibrato: 3 }));
  },
  sell() {
    noise(0, 0.12, { filter: 'highpass', freq: 3000, gain: 0.12 });
    coin(0.08, 0.75);
  },
  auction() {
    knock(0, 0.55);
    tone(NOTE(76), 0.12, 0.25, { type: 'triangle', gain: 0.12 });
  },
  bid() {
    tone(1000, 0, 0.05, { type: 'square', gain: 0.06, cutoff: 3000 });
    tone(1500, 0.05, 0.08, { type: 'triangle', gain: 0.08 });
  },
  auctionWon() {
    // going, going, sold!
    knock(0, 0.4);
    knock(0.22, 0.45);
    knock(0.4, 0.55);
    SOUNDS.buy();
  },
  offer() {
    tone(988, 0, 0.25, { gain: 0.18 });
    tone(784, 0.18, 0.45, { gain: 0.18 });
  },
  trade() {
    arp([67, 74, 79], 0, 0.08, 0.35, { type: 'triangle', gain: 0.15 });
    coin(0.2);
  },
  loan() {
    coin(0);
    coin(0.07, 1.1);
    tone(NOTE(76), 0.15, 0.4, { gain: 0.1 });
  },
  alliance() {
    [60, 64, 67, 71].forEach((n) => tone(NOTE(n), 0, 0.9, { type: 'triangle', gain: 0.09, attack: 0.04 }));
    tone(NOTE(84), 0.2, 0.7, { gain: 0.06 });
  },
  betray() {
    tone(466, 0, 0.5, { type: 'sawtooth', gain: 0.09, cutoff: 1500 });
    tone(494, 0, 0.5, { type: 'sawtooth', gain: 0.09, cutoff: 1500 });
    noise(0, 0.2, { filter: 'lowpass', freq: 500, gain: 0.25 });
    tone(233, 0.25, 0.6, { type: 'sawtooth', to: 110, gain: 0.08, cutoff: 900 });
  },
  bankrupt() {
    // sad trombone
    [67, 66, 65].forEach((n, i) => tone(NOTE(n), i * 0.32, 0.3, { type: 'sawtooth', gain: 0.09, cutoff: 1200 }));
    tone(NOTE(64), 0.96, 0.9, { type: 'sawtooth', gain: 0.09, cutoff: 1200, vibrato: 8 });
  },
  win() {
    arp([60, 64, 67, 72, 76, 79], 0, 0.1, 0.3, { type: 'square', gain: 0.07, cutoff: 2600 });
    [72, 76, 79, 84].forEach((n) => tone(NOTE(n), 0.65, 1.4, { type: 'triangle', gain: 0.1, vibrato: 3 }));
    for (let i = 0; i < 8; i++) tone(2000 + Math.random() * 2500, 0.7 + i * 0.08, 0.15, { gain: 0.04 });
  },
  jackpot() {
    // a shower of coins
    for (let i = 0; i < 14; i++) coin(i * 0.05 + Math.random() * 0.03, 0.8 + Math.random() * 0.5);
    arp([72, 76, 79, 84], 0.1, 0.08, 0.3, { type: 'triangle', gain: 0.12 });
  },
  powerPickup() {
    tone(600, 0, 0.35, { to: 2200, gain: 0.1 });
    arp([84, 88, 91], 0.25, 0.05, 0.2, { type: 'triangle', gain: 0.1 });
  },
  powerUse() {
    tone(1400, 0, 0.25, { type: 'square', to: 180, gain: 0.08, cutoff: 3000 });
    noise(0, 0.2, { freq: 2000, to: 300, gain: 0.1 });
  },
  heist() {
    // sneaky pizzicato
    [69, 66, 63, 60].forEach((n, i) => tone(NOTE(n), i * 0.12, 0.1, { type: 'triangle', gain: 0.16 }));
    coin(0.5);
  },
  jet() {
    noise(0, 0.9, { freq: 250, to: 3500, q: 1.5, gain: 0.2 });
    tone(220, 0, 0.9, { type: 'sawtooth', to: 440, gain: 0.03, cutoff: 900 });
  },
  shield() {
    [72, 79, 84].forEach((n, i) => tone(NOTE(n), i * 0.04, 0.6, { gain: 0.08, vibrato: 10 }));
  },
  sabotage() {
    // explosion
    noise(0, 0.9, { filter: 'lowpass', freq: 1500, to: 60, gain: 0.6 });
    tone(80, 0, 0.6, { to: 35, gain: 0.5 });
  },
  stock() {
    tone(1200, 0, 0.05, { type: 'square', gain: 0.05, cutoff: 3000 });
    tone(1800, 0.05, 0.12, { type: 'triangle', gain: 0.1 });
  },
  arcadeWin() {
    arp([72, 76, 79, 84, 88], 0, 0.06, 0.12, { type: 'square', gain: 0.07, cutoff: 4000 });
    coin(0.32);
  },
  arcadeLose() {
    arp([67, 63], 0, 0.14, 0.25, { type: 'square', gain: 0.08, cutoff: 2500 });
  },
  arcadeTie() {
    arp([72, 72], 0, 0.12, 0.1, { type: 'square', gain: 0.06, cutoff: 3000 });
  },
  event() {
    // gong: inharmonic partials with a long tail
    [98, 196, 247, 390, 523].forEach((f, i) => tone(f, 0, 2.2 - i * 0.2, { gain: 0.12 / (i + 1), attack: 0.01 }));
    noise(0, 0.08, { filter: 'lowpass', freq: 600, gain: 0.2 });
  },
  insurance() {
    tone(NOTE(76), 0, 0.3, { gain: 0.14 });
    tone(NOTE(81), 0.14, 0.5, { gain: 0.14 });
  },
  claim() {
    // a cash-bell nudge for the owner: rent is waiting
    tone(NOTE(84), 0, 0.12, { type: 'triangle', gain: 0.16 });
    tone(NOTE(88), 0.1, 0.12, { type: 'triangle', gain: 0.16 });
    coin(0.2);
  },
  veto() {
    // a courtroom-style double knock: the table can object
    knock(0, 0.35);
    knock(0.14, 0.35);
    tone(NOTE(70), 0.3, 0.4, { type: 'triangle', gain: 0.1 });
  },
  speed() {
    tone(500, 0, 0.25, { type: 'sawtooth', to: 1400, gain: 0.05, cutoff: 3000 });
  },
  chaos() {
    // warped wobble
    tone(300, 0, 0.6, { type: 'sawtooth', to: 900, gain: 0.06, cutoff: 1800, vibrato: 40 });
    noise(0.1, 0.4, { freq: 3000, to: 300, gain: 0.1 });
  },
  war() {
    // war drums and a distant blast
    for (let i = 0; i < 4; i++) knock(i * 0.13, 0.4 + i * 0.05);
    noise(0.55, 0.6, { filter: 'lowpass', freq: 900, to: 60, gain: 0.35 });
  },
  train() {
    // two-tone horn and wheels clacking
    tone(NOTE(64), 0, 0.35, { type: 'sawtooth', gain: 0.06, cutoff: 1400 });
    tone(NOTE(68), 0, 0.35, { type: 'sawtooth', gain: 0.06, cutoff: 1400 });
    for (let i = 0; i < 4; i++) noise(0.4 + i * 0.12, 0.05, { freq: 1800, q: 3, gain: 0.2 });
  },
  blackout() {
    // power dying: a falling hum, then silence
    tone(220, 0, 0.7, { type: 'sawtooth', to: 40, gain: 0.08, cutoff: 900 });
    noise(0, 0.1, { freq: 4000, q: 2, gain: 0.15 });
  },
  news() {
    // newsroom sting: urgent staccato over a low pulse
    arp([76, 76, 79, 76], 0, 0.09, 0.08, { type: 'square', gain: 0.07, cutoff: 3000 });
    tone(NOTE(52), 0, 0.5, { type: 'sawtooth', gain: 0.05, cutoff: 700 });
  },
  shop() {
    // shop door bell and the till
    tone(NOTE(88), 0, 0.3, { gain: 0.12 });
    tone(NOTE(84), 0.12, 0.4, { gain: 0.12 });
    SOUNDS.buy();
  },
  toll() {
    // barrier beep and a coin in the slot
    tone(1400, 0, 0.08, { type: 'square', gain: 0.06, cutoff: 3000 });
    coin(0.1, 0.85);
  },
  committee() {
    for (let i = 0; i < 8; i++) coin(i * 0.06, 0.8 + (i % 3) * 0.1);
    arp([67, 72, 76], 0.1, 0.08, 0.3, { type: 'triangle', gain: 0.12 });
  },
  shaadi() {
    // dhol beats with a shehnai-ish wail
    for (let i = 0; i < 6; i++) knock(i * 0.11, i % 2 ? 0.25 : 0.4);
    tone(NOTE(74), 0.1, 0.7, { type: 'sawtooth', to: NOTE(77), gain: 0.05, cutoff: 2200, vibrato: 7 });
  },
  law() {
    // gavel and a short fanfare
    knock(0, 0.5);
    arp([67, 72, 76], 0.18, 0.1, 0.35, { type: 'triangle', gain: 0.12 });
  },
  culture() {
    // a little chamber chord
    [60, 64, 67, 72].forEach((n, i) => tone(NOTE(n), i * 0.08, 1, { type: 'triangle', gain: 0.08, attack: 0.03 }));
    coin(0.5);
  },
  festival() {
    arp([72, 76, 79, 84, 79, 84], 0, 0.07, 0.15, { type: 'square', gain: 0.06, cutoff: 3500 });
    for (let i = 0; i < 5; i++) noise(0.1 + i * 0.1, 0.05, { freq: 5000, q: 2, gain: 0.08 });
  },
  deported() {
    tone(700, 0, 0.5, { type: 'sawtooth', to: 350, gain: 0.07, cutoff: 1800 });
    SOUNDS.jet();
  },
  fullSet() {
    arp([72, 76, 79, 84], 0, 0.06, 0.4, { type: 'triangle', gain: 0.13 });
    tone(NOTE(96), 0.3, 0.8, { gain: 0.05, vibrato: 8 });
  },
  yourTurn() {
    tone(NOTE(76), 0, 0.35, { gain: 0.14 });
    tone(NOTE(83), 0.12, 0.6, { gain: 0.14 });
  },
  pop() {
    tone(500, 0, 0.07, { to: 900, gain: 0.08 });
  },
  tick() {
    tone(1600, 0, 0.025, { type: 'square', gain: 0.05, cutoff: 4000 });
  },
};

export function play(name: SoundName) {
  // dev-only trace so sounds can be checked without speakers
  if (import.meta.env.DEV) ((window as unknown as { __sfx?: string[] }).__sfx ??= []).push(name);
  if (prefs.muted) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  try {
    SOUNDS[name]();
  } catch {
    /* never let a sound break the game */
  }
}

// ---------- game hook ----------

const GAP = 320;
const HOP_MS = 140;

// One queue across state updates, so a later event never plays before an earlier one.
let queueFree = 0;
function enqueue(name: SoundName, holdMs: number) {
  const now = performance.now();
  const at = Math.max(now, queueFree);
  // during a flurry (fast bidding) drop sounds rather than lag seconds behind the board
  if (at - now > 3000 && name !== 'yourTurn') return;
  queueFree = at + holdMs;
  setTimeout(() => play(name), at - now);
}

/**
 * Plays a sound for each new engine effect. Effects that happen on landing wait
 * until the token has finished hopping, so the sound lines up with the board.
 */
export function useGameSounds(state: PublicState, me: string | null) {
  const seen = useRef<number | null>(null);
  const lastTurn = useRef<string | null>(null);

  useEffect(() => {
    const list = state.fx ?? [];
    const latest = list.length ? list[list.length - 1].id : 0;
    const turnPid = state.phase === 'playing' ? (state.turn?.playerId ?? null) : null;
    // first state after joining: stay quiet about the past
    if (seen.current === null) {
      seen.current = latest;
      lastTurn.current = turnPid;
      return;
    }
    const fresh = list.filter((f) => f.id > seen.current! && (f.kind !== 'offer' || f.pid === me));
    seen.current = latest;

    for (const f of fresh.slice(-4)) {
      const d = state.turn?.dice;
      // landing sounds wait for the token to finish hopping
      enqueue(f.kind, f.kind === 'dice' || f.kind === 'doubles' ? 380 + (d ? d[0] + d[1] : 6) * HOP_MS : GAP);
    }
    if (turnPid !== lastTurn.current) {
      lastTurn.current = turnPid;
      if (turnPid && turnPid === me) enqueue('yourTurn', GAP);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version]);
}
