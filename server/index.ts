import express from 'express';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { customAlphabet, nanoid } from 'nanoid';
import {
  GameError,
  addPlayer,
  applyAction,
  createGame,
  nextDeadline,
  removePlayer,
  setConnected,
  toPublic,
  upgradeState,
} from '../shared/engine';
import type { Action, GameState } from '../shared/types';
import {
  REACTIONS,
  type Ack,
  type ChatMessage,
  type ClientToServer,
  type ReplayData,
  type ReplayEvent,
  type ServerToClient,
  type VoicePeer,
} from '../shared/protocol';

// dev always uses 3001 (Vite proxies to it); hosts set PORT in production
const PORT = process.argv.includes('--dev') ? 3001 : Number(process.env.PORT ?? 3001);
const ROOM_IDLE_MS = 60 * 60 * 1000;
const CHAT_KEEP = 150;
const makeCode = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 6);

interface Room {
  state: GameState;
  /** secret token -> player id, lets a refreshed tab take its seat back */
  tokens: Map<string, string>;
  timer: NodeJS.Timeout | null;
  idleSince: number | null;
  chat: ChatMessage[];
  chatSeq: number;
  /** state just before the game started, plus everything that happened since */
  replay: { initial: GameState | null; events: ReplayEvent[] };
}

interface SocketData {
  code?: string;
  playerId?: string;
  spectator?: string;
  lastChat?: number;
  lastReact?: number;
  inVoice?: boolean;
}

type GameSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const rooms = new Map<string, Room>();

// Rooms live in memory; a debounced snapshot on disk lets them survive a server restart.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.data');
const SNAPSHOT = join(DATA_DIR, 'rooms.json');
let saveTimer: NodeJS.Timeout | null = null;

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const data = [...rooms.values()].map((r) => ({
      state: r.state,
      tokens: [...r.tokens],
      chat: r.chat,
      chatSeq: r.chatSeq,
      replay: r.replay,
    }));
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(`${SNAPSHOT}.tmp`, JSON.stringify(data));
      renameSync(`${SNAPSHOT}.tmp`, SNAPSHOT);
    } catch (e) {
      console.error('snapshot failed', e);
    }
  }, 800);
}

interface SavedRoom {
  state: GameState;
  tokens: [string, string][];
  chat?: ChatMessage[];
  chatSeq?: number;
  replay?: Room['replay'];
}

function loadSnapshot() {
  if (!existsSync(SNAPSHOT)) return;
  try {
    const data: SavedRoom[] = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    for (const r of data) {
      const state = upgradeState(r.state);
      // nobody is connected right after a restart; sockets flip this back on rejoin
      for (const p of state.players) p.connected = false;
      rooms.set(state.code, {
        state,
        tokens: new Map(r.tokens),
        timer: null,
        idleSince: null,
        chat: r.chat ?? [],
        chatSeq: r.chatSeq ?? 0,
        replay: r.replay ?? { initial: null, events: [] },
      });
    }
    console.log(`restored ${rooms.size} room(s)`);
  } catch (e) {
    console.error('could not read snapshot', e);
  }
}

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(http, {
  cors: { origin: true },
});

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

/** Each socket gets its own view, so hidden cash and sealed bids stay private. */
function broadcast(room: Room) {
  const serverTime = Date.now();
  const views = new Map<string | null, ReturnType<typeof toPublic>>();
  for (const sock of io.sockets.adapter.rooms.get(room.state.code) ?? []) {
    const socket = io.sockets.sockets.get(sock);
    if (!socket) continue;
    const viewer = socket.data.playerId ?? null;
    if (!views.has(viewer)) views.set(viewer, toPublic(room.state, viewer));
    socket.emit('state', { state: views.get(viewer)!, serverTime });
  }
}

function nameOf(code: string, data: SocketData): string {
  if (data.spectator) return data.spectator;
  return rooms.get(code)?.state.players.find((p) => p.id === data.playerId)?.name ?? 'Someone';
}

async function sendMeta(code: string) {
  const sockets = await io.in(code).fetchSockets();
  const spectators = [...new Set(sockets.map((s) => s.data.spectator).filter((n): n is string => !!n))];
  const voice: VoicePeer[] = sockets
    .filter((s) => s.data.inVoice)
    .map((s) => ({ socketId: s.id, name: nameOf(code, s.data), playerId: s.data.playerId ?? null }));
  io.to(code).emit('meta', { spectators, voice });
}

function schedule(room: Room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  const deadline = nextDeadline(room.state);
  if (deadline === null) return;
  room.timer = setTimeout(
    () => {
      room.timer = null;
      const now = Date.now();
      update(room, (s) => applyAction(s, null, { type: 'tick' }, now), { t: 'a', pid: null, action: { type: 'tick' }, now });
    },
    Math.max(0, deadline - Date.now()) + 15,
  );
}

function update(room: Room, fn: (s: GameState) => GameState, event?: ReplayEvent) {
  const before = room.state;
  const next = fn(before);
  if (next === before) return;
  if (event) {
    if (before.phase === 'lobby' && next.phase === 'playing') room.replay = { initial: before, events: [] };
    if (room.replay.initial && before.phase !== 'ended') room.replay.events.push(event);
  }
  room.state = next;
  schedule(room);
  broadcast(room);
  saveSoon();
}

function errorOf(e: unknown): string {
  if (e instanceof GameError) return e.message;
  console.error(e);
  return 'Something went wrong';
}

function safeAck<T>(ack: unknown): (res: T) => void {
  return typeof ack === 'function' ? (ack as (res: T) => void) : () => {};
}

function roomOf(socket: GameSocket): Room | undefined {
  return socket.data.code ? rooms.get(socket.data.code) : undefined;
}

io.on('connection', (socket: GameSocket) => {
  function enter(room: Room) {
    socket.data.code = room.state.code;
    socket.join(room.state.code);
    socket.emit('state', { state: toPublic(room.state, socket.data.playerId ?? null), serverTime: Date.now() });
    socket.emit('chat:history', room.chat);
    void sendMeta(room.state.code);
  }

  function seat(room: Room, playerId: string) {
    socket.data.playerId = playerId;
    socket.data.spectator = undefined;
    const now = Date.now();
    update(room, (s) => setConnected(s, playerId, true, now), { t: 'c', pid: playerId, connected: true, now });
    enter(room);
  }

  socket.on('room:create', (input, rawAck) => {
    const ack = safeAck<Ack>(rawAck);
    try {
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      const playerId = nanoid(10);
      const token = nanoid(24);
      const state = createGame(code, { id: playerId, name: input?.name, color: input?.color }, (Math.random() * 2 ** 31) | 0);
      const room: Room = {
        state,
        tokens: new Map([[token, playerId]]),
        timer: null,
        idleSince: null,
        chat: [],
        chatSeq: 0,
        replay: { initial: null, events: [] },
      };
      rooms.set(code, room);
      seat(room, playerId);
      saveSoon();
      ack({ ok: true, code, token, playerId });
    } catch (e) {
      ack({ ok: false, error: errorOf(e) });
    }
  });

  socket.on('room:join', (input, rawAck) => {
    const ack = safeAck<Ack>(rawAck);
    try {
      const code = String(input?.code ?? '').toLowerCase();
      const room = rooms.get(code);
      if (!room) return ack({ ok: false, error: 'Room not found' });
      const known = input?.token ? room.tokens.get(input.token) : undefined;
      if (known && room.state.players.some((p) => p.id === known)) {
        seat(room, known);
        return ack({ ok: true, code, token: input.token!, playerId: known });
      }
      if (input?.spectate || (input?.name && room.state.phase !== 'lobby')) {
        if (!input?.name) return ack({ ok: false, error: 'need-name' });
        if (room.state.settings.roomLock) return ack({ ok: false, error: 'The host locked this room' });
        if (!room.state.settings.spectators) return ack({ ok: false, error: 'This room does not allow spectators' });
        socket.data.playerId = undefined;
        socket.data.spectator = String(input.name).trim().slice(0, 16) || 'Spectator';
        enter(room);
        return ack({ ok: true, code, spectator: true });
      }
      if (!input?.name) return ack({ ok: false, error: room.state.phase === 'lobby' ? 'need-name' : 'need-name-spectate' });
      const playerId = nanoid(10);
      const token = nanoid(24);
      room.state = addPlayer(room.state, { id: playerId, name: input.name, color: input.color ?? '' });
      room.tokens.set(token, playerId);
      seat(room, playerId);
      broadcast(room);
      saveSoon();
      ack({ ok: true, code, token, playerId });
    } catch (e) {
      ack({ ok: false, error: errorOf(e) });
    }
  });

  function leaveVoice() {
    if (!socket.data.inVoice || !socket.data.code) return;
    socket.data.inVoice = false;
    void sendMeta(socket.data.code);
  }

  socket.on('room:leave', () => {
    const room = roomOf(socket);
    if (!room) return;
    leaveVoice();
    const id = socket.data.playerId;
    const code = room.state.code;
    socket.leave(code);
    socket.data.code = undefined;
    socket.data.playerId = undefined;
    socket.data.spectator = undefined;
    if (id) {
      if (room.state.phase === 'lobby') {
        for (const [t, pid] of room.tokens) if (pid === id) room.tokens.delete(t);
        update(room, (s) => removePlayer(s, id));
      } else {
        const now = Date.now();
        update(room, (s) => setConnected(s, id, false, now), { t: 'c', pid: id, connected: false, now });
      }
    }
    void sendMeta(code);
  });

  socket.on('game:action', (action: Action, rawAck) => {
    const ack = safeAck<Ack>(rawAck);
    const room = roomOf(socket);
    const pid = socket.data.playerId;
    if (!room || !pid) return ack({ ok: false, error: socket.data.spectator ? 'Spectators can only watch' : 'Join a room first' });
    if (!action || typeof action !== 'object' || action.type === 'tick') return ack({ ok: false, error: 'Bad action' });
    try {
      const now = Date.now();
      update(room, (s) => applyAction(s, pid, action, now), { t: 'a', pid, action, now });
      if (action.type === 'kick' && room.state.phase === 'lobby') {
        for (const [t, id] of room.tokens) if (id === action.playerId) room.tokens.delete(t);
      }
      ack({ ok: true });
    } catch (e) {
      ack({ ok: false, error: errorOf(e) });
    }
  });

  socket.on('chat:send', (raw) => {
    const room = roomOf(socket);
    if (!room || (!socket.data.playerId && !socket.data.spectator)) return;
    if (!socket.data.playerId && !room.state.settings.spectatorChat) return;
    const now = Date.now();
    if (now - (socket.data.lastChat ?? 0) < 400) return;
    socket.data.lastChat = now;
    const text = String(raw ?? '').trim().slice(0, 300);
    if (!text) return;
    const p = room.state.players.find((x) => x.id === socket.data.playerId);
    const msg: ChatMessage = {
      id: ++room.chatSeq,
      name: p?.name ?? socket.data.spectator ?? 'Someone',
      color: p?.color ?? '#94a3b8',
      text,
      at: now,
      spectator: !p,
    };
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    io.to(room.state.code).emit('chat', msg);
    saveSoon();
  });

  socket.on('react', (emoji) => {
    const room = roomOf(socket);
    if (!room || !(REACTIONS as readonly string[]).includes(emoji)) return;
    const now = Date.now();
    if (now - (socket.data.lastReact ?? 0) < 600) return;
    socket.data.lastReact = now;
    io.to(room.state.code).emit('reaction', {
      id: now + Math.random(),
      playerId: socket.data.playerId ?? null,
      name: nameOf(room.state.code, socket.data),
      emoji,
    });
  });

  // voice is a WebRTC mesh; the server only relays the handshake between peers in the same room
  socket.on('voice:join', async () => {
    const room = roomOf(socket);
    if (!room || socket.data.inVoice) return;
    const sockets = await io.in(room.state.code).fetchSockets();
    const peers: VoicePeer[] = sockets
      .filter((s) => s.data.inVoice && s.id !== socket.id)
      .map((s) => ({ socketId: s.id, name: nameOf(room.state.code, s.data), playerId: s.data.playerId ?? null }));
    socket.data.inVoice = true;
    socket.emit('voice:peers', peers);
    void sendMeta(room.state.code);
  });

  socket.on('voice:leave', leaveVoice);

  socket.on('voice:signal', async (msg) => {
    const room = roomOf(socket);
    if (!room || !socket.data.inVoice || !msg?.to) return;
    const target = (await io.in(room.state.code).fetchSockets()).find((s) => s.id === msg.to && s.data.inVoice);
    target?.emit('voice:signal', { from: socket.id, data: msg.data });
  });

  socket.on('replay:get', (rawAck) => {
    const ack = safeAck<{ ok: true; data: ReplayData } | { ok: false; error: string }>(rawAck);
    const room = roomOf(socket);
    if (!room) return ack({ ok: false, error: 'Join a room first' });
    if (room.state.phase !== 'ended') return ack({ ok: false, error: 'Replays unlock when the game ends' });
    if (!room.replay.initial) return ack({ ok: false, error: 'No replay was recorded for this game' });
    ack({ ok: true, data: { initial: room.replay.initial, events: room.replay.events } });
  });

  socket.on('disconnect', async () => {
    const { code, playerId, inVoice, spectator } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    if (!room || !code) return;
    if (inVoice || spectator) void sendMeta(code);
    if (!playerId) return;
    const others = await io.in(code).fetchSockets();
    if (others.some((s) => s.data.playerId === playerId)) return;
    const now = Date.now();
    update(room, (s) => setConnected(s, playerId, false, now), { t: 'c', pid: playerId, connected: false, now });
  });
});

// drop rooms nobody has been connected to for an hour
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.state.players.some((p) => p.connected);
    if (anyone) room.idleSince = null;
    else if (room.idleSince === null) room.idleSince = now;
    else if (now - room.idleSince > ROOM_IDLE_MS) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(code);
      saveSoon();
    }
  }
}, 60_000).unref();

loadSnapshot();
for (const room of rooms.values()) schedule(room);

http.listen(PORT, () => console.log(`game server on :${PORT}`));
