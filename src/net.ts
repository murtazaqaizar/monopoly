import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServer, JoinInput, ServerToClient } from '../shared/protocol';
import type { Action, PublicState } from '../shared/types';

export const socket: Socket<ServerToClient, ClientToServer> = io({ transports: ['websocket'] });

interface Snapshot {
  state: PublicState | null;
  /** serverTime - localTime, for countdowns */
  offset: number;
}

let snapshot: Snapshot = { state: null, offset: 0 };
const listeners = new Set<() => void>();

socket.on('state', ({ state, serverTime }) => {
  snapshot = { state, offset: serverTime - Date.now() };
  listeners.forEach((l) => l());
});

export function clearState() {
  snapshot = { state: null, offset: 0 };
  listeners.forEach((l) => l());
}

export function useSnapshot(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

export function useConnected(): boolean {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}

function withAck(fn: (ack: (res: Ack) => void) => void): Promise<Ack> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server did not answer' }), 6000);
    fn((res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export const createRoom = (name: string, color: string) => withAck((ack) => socket.emit('room:create', { name, color }, ack));
export const joinRoom = (input: JoinInput) => withAck((ack) => socket.emit('room:join', input, ack));
export const leaveRoom = () => socket.emit('room:leave');

// ---- toasts for rejected actions ----
type ToastListener = (msg: string) => void;
const toastListeners = new Set<ToastListener>();
export function onToast(l: ToastListener) {
  toastListeners.add(l);
  return () => {
    toastListeners.delete(l);
  };
}
export function toast(msg: string) {
  toastListeners.forEach((l) => l(msg));
}

export async function send(action: Action): Promise<boolean> {
  const res = await withAck((ack) => socket.emit('game:action', action, ack));
  if (!res.ok) toast(res.error);
  return res.ok;
}

// ---- seat memory ----
export interface Seat {
  token: string;
  playerId: string;
}
export function loadSeat(code: string): Seat | null {
  try {
    return JSON.parse(localStorage.getItem(`seat:${code}`) ?? 'null');
  } catch {
    return null;
  }
}
export function saveSeat(code: string, seat: Seat) {
  try {
    localStorage.setItem(`seat:${code}`, JSON.stringify(seat));
  } catch {
    /* private mode: seat lasts until refresh */
  }
}
export function forgetSeat(code: string) {
  try {
    localStorage.removeItem(`seat:${code}`);
  } catch {
    /* ignore */
  }
}
export interface Profile {
  name: string;
  color: string;
}
export function loadProfile(): Profile | null {
  try {
    return JSON.parse(localStorage.getItem('profile') ?? 'null');
  } catch {
    return null;
  }
}
export function saveProfile(p: Profile) {
  try {
    localStorage.setItem('profile', JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// ---- tiny router ----
const routeListeners = new Set<() => void>();
window.addEventListener('popstate', () => routeListeners.forEach((l) => l()));
export function navigate(path: string) {
  history.pushState(null, '', path);
  routeListeners.forEach((l) => l());
}
export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      routeListeners.add(cb);
      return () => routeListeners.delete(cb);
    },
    () => location.pathname,
  );
}

/** Re-render on an interval, for countdowns. */
export function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
