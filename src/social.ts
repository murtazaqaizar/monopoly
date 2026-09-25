import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ChatMessage, Reaction, RoomMeta, VoicePeer } from '../shared/protocol';
import { socket, toast } from './net';
import { play } from './sound';

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      subs.forEach((s) => s());
    },
    use(): T {
      return useSyncExternalStore(
        (cb) => {
          subs.add(cb);
          return () => subs.delete(cb);
        },
        () => value,
      );
    },
  };
}

// ---------- chat & meta ----------

const chat = store<ChatMessage[]>([]);
const meta = store<RoomMeta>({ spectators: [], voice: [] });
const unread = store(0);

socket.on('chat:history', (msgs) => chat.set(msgs));
socket.on('chat', (msg) => {
  chat.set([...chat.get().slice(-149), msg]);
  play('pop');
  unread.set(unread.get() + 1);
});
socket.on('meta', (m) => meta.set(m));

export const useChat = chat.use;
export const useMeta = meta.use;
export const useUnread = unread.use;
export const clearUnread = () => unread.set(0);
export const sendChat = (text: string) => socket.emit('chat:send', text);

// ---------- reactions ----------

type ReactionListener = (r: Reaction) => void;
const reactionSubs = new Set<ReactionListener>();
socket.on('reaction', (r) => {
  reactionSubs.forEach((l) => l(r));
  play('pop');
});
export function useReactions(ttl = 2200): Reaction[] {
  const [list, setList] = useState<Reaction[]>([]);
  useEffect(() => {
    const l: ReactionListener = (r) => {
      setList((xs) => [...xs.slice(-12), r]);
      setTimeout(() => setList((xs) => xs.filter((x) => x.id !== r.id)), ttl);
    };
    reactionSubs.add(l);
    return () => {
      reactionSubs.delete(l);
    };
  }, [ttl]);
  return list;
}
export const react = (emoji: string) => socket.emit('react', emoji);

// ---------- voice (WebRTC mesh, signalling over the game socket) ----------

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

interface VoiceState {
  joined: boolean;
  muted: boolean;
  /** socket ids currently speaking */
  speaking: string[];
}

const voice = store<VoiceState>({ joined: false, muted: false, speaking: [] });
export const useVoice = voice.use;

let local: MediaStream | null = null;
const peers = new Map<string, { pc: RTCPeerConnection; audio: HTMLAudioElement }>();
let meterTimer: ReturnType<typeof setInterval> | null = null;
const analysers = new Map<string, AnalyserNode>();
let audioCtx: AudioContext | null = null;

function watchLevel(id: string, stream: MediaStream) {
  try {
    audioCtx ??= new AudioContext();
    const src = audioCtx.createMediaStreamSource(stream);
    const an = audioCtx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    analysers.set(id, an);
  } catch {
    /* level meter is cosmetic */
  }
  if (!meterTimer) {
    const buf = new Uint8Array(128);
    meterTimer = setInterval(() => {
      const talking: string[] = [];
      for (const [pid, an] of analysers) {
        an.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        if (avg > 18) talking.push(pid);
      }
      const cur = voice.get();
      if (talking.join() !== cur.speaking.join()) voice.set({ ...cur, speaking: talking });
    }, 200);
  }
}

function peerFor(id: string): RTCPeerConnection {
  const existing = peers.get(id);
  if (existing) return existing.pc;
  const pc = new RTCPeerConnection(ICE);
  const audio = new Audio();
  audio.autoplay = true;
  local?.getTracks().forEach((t) => pc.addTrack(t, local!));
  pc.onicecandidate = (e) => e.candidate && socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } });
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    void audio.play().catch(() => {});
    watchLevel(id, e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState)) dropPeer(id);
  };
  peers.set(id, { pc, audio });
  return pc;
}

function dropPeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  p.pc.close();
  p.audio.srcObject = null;
  peers.delete(id);
  analysers.delete(id);
}

// newcomers call everyone already in the channel
socket.on('voice:peers', async (list: VoicePeer[]) => {
  for (const peer of list) {
    const pc = peerFor(peer.socketId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice:signal', { to: peer.socketId, data: { sdp: pc.localDescription } });
  }
});

socket.on('voice:signal', async ({ from, data }) => {
  if (!voice.get().joined) return;
  const msg = data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
  const pc = peerFor(from);
  try {
    if (msg.sdp) {
      await pc.setRemoteDescription(msg.sdp);
      if (msg.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit('voice:signal', { to: from, data: { sdp: pc.localDescription } });
      }
    } else if (msg.candidate) await pc.addIceCandidate(msg.candidate);
  } catch (e) {
    console.warn('voice signal failed', e);
  }
});

// drop peers who left the channel
socket.on('meta', (m) => {
  const inChannel = new Set(m.voice.map((v) => v.socketId));
  for (const id of peers.keys()) if (!inChannel.has(id)) dropPeer(id);
});

export async function joinVoice() {
  if (voice.get().joined) return;
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    toast('Microphone blocked. Allow mic access to use voice chat.');
    return;
  }
  if (socket.id) watchLevel(socket.id, local);
  voice.set({ joined: true, muted: false, speaking: [] });
  socket.emit('voice:join');
}

export function leaveVoice() {
  socket.emit('voice:leave');
  for (const id of [...peers.keys()]) dropPeer(id);
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  analysers.clear();
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  voice.set({ joined: false, muted: false, speaking: [] });
}

export function toggleMute() {
  const cur = voice.get();
  local?.getAudioTracks().forEach((t) => (t.enabled = cur.muted));
  voice.set({ ...cur, muted: !cur.muted });
}

socket.on('disconnect', () => {
  if (voice.get().joined) leaveVoice();
});
