import type { Action, GameState, PublicState } from './types';

export type Ack = { ok: true; code?: string; token?: string; playerId?: string; spectator?: boolean } | { ok: false; error: string };

export interface JoinInput {
  code: string;
  token?: string;
  name?: string;
  color?: string;
  /** watch without taking a seat */
  spectate?: boolean;
}

export interface StatePayload {
  state: PublicState;
  serverTime: number;
}

export interface ChatMessage {
  id: number;
  name: string;
  color: string;
  text: string;
  at: number;
  spectator: boolean;
}

export const REACTIONS = ['😂', '😭', '😡', '🔥', '💸', '👏', '😱', '🤝'] as const;

export interface Reaction {
  id: number;
  playerId: string | null;
  name: string;
  emoji: string;
}

export interface VoicePeer {
  socketId: string;
  name: string;
  playerId: string | null;
}

export type ReplayEvent =
  | { t: 'a'; pid: string | null; action: Action; now: number }
  | { t: 'c'; pid: string; connected: boolean; now: number };

export interface ReplayData {
  initial: GameState;
  events: ReplayEvent[];
}

export interface RoomMeta {
  spectators: string[];
  voice: VoicePeer[];
}

export interface ClientToServer {
  'room:create': (input: { name: string; color: string }, ack: (res: Ack) => void) => void;
  'room:join': (input: JoinInput, ack: (res: Ack) => void) => void;
  'room:leave': () => void;
  'game:action': (action: Action, ack: (res: Ack) => void) => void;
  'chat:send': (text: string) => void;
  react: (emoji: string) => void;
  'voice:join': () => void;
  'voice:leave': () => void;
  'voice:signal': (msg: { to: string; data: unknown }) => void;
  'replay:get': (ack: (res: { ok: true; data: ReplayData } | { ok: false; error: string }) => void) => void;
}

export interface ServerToClient {
  state: (payload: StatePayload) => void;
  meta: (meta: RoomMeta) => void;
  chat: (msg: ChatMessage) => void;
  'chat:history': (msgs: ChatMessage[]) => void;
  reaction: (r: Reaction) => void;
  'voice:peers': (peers: VoicePeer[]) => void;
  'voice:signal': (msg: { from: string; data: unknown }) => void;
}
