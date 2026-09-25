import { useEffect, useRef, useState } from 'react';
import { Eye, MessageCircle, Mic, MicOff, PhoneOff, ScrollText, Send, Volume2 } from 'lucide-react';
import { REACTIONS } from '../../shared/protocol';
import type { PublicState } from '../../shared/types';
import {
  clearUnread,
  joinVoice,
  leaveVoice,
  react,
  sendChat,
  toggleMute,
  useChat,
  useMeta,
  useUnread,
  useVoice,
} from '../social';
import { socket } from '../net';

/** Left column: chat and the full game log share one panel. */
export function ChatAndLog({ state, canChat }: { state: PublicState; canChat: boolean }) {
  const [tab, setTab] = useState<'chat' | 'log'>('chat');
  const unread = useUnread();
  useEffect(() => {
    if (tab === 'chat') clearUnread();
  }, [tab, unread]);

  return (
    <section className="panel chatlog">
      <nav className="tabs small">
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
          <MessageCircle size={14} /> Chat {tab !== 'chat' && unread > 0 && <span className="count">{unread}</span>}
        </button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
          <ScrollText size={14} /> Game log
        </button>
      </nav>
      {tab === 'chat' ? <Chat canChat={canChat} /> : <GameLog state={state} />}
    </section>
  );
}

function Chat({ canChat }: { canChat: boolean }) {
  const msgs = useChat();
  const [text, setText] = useState('');
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length]);

  return (
    <>
      <ol className="chat-list" ref={ref}>
        {msgs.length === 0 && <li className="muted empty">No messages yet</li>}
        {msgs.map((m) => (
          <li key={m.id}>
            <b style={{ color: m.color }}>{m.name}</b>
            {m.spectator && <span className="tag">watching</span>} <span>{m.text}</span>
          </li>
        ))}
      </ol>
      {canChat && (
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            sendChat(text);
            setText('');
          }}
        >
          <input value={text} maxLength={300} placeholder="Say something…" onChange={(e) => setText(e.target.value)} aria-label="Chat message" />
          <button className="icon-btn" aria-label="Send" disabled={!text.trim()}>
            <Send size={16} />
          </button>
        </form>
      )}
    </>
  );
}

function GameLog({ state }: { state: PublicState }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [state.log.length]);
  return (
    <ol className="log-list" ref={ref}>
      {state.log.length === 0 && <li className="muted empty">Moves will show up here.</li>}
      {state.log.map((l) => (
        <li key={l.id}>{l.text}</li>
      ))}
    </ol>
  );
}

export function ReactionBar() {
  return (
    <div className="reaction-bar" aria-label="Reactions">
      {REACTIONS.map((e) => (
        <button key={e} onClick={() => react(e)} aria-label={`React ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function VoiceBar() {
  const v = useVoice();
  const meta = useMeta();
  const inCall = meta.voice;
  return (
    <section className="panel voice">
      <div className="voice-head">
        <Volume2 size={16} />
        <b>Voice</b>
        <span className="muted small">{inCall.length ? `${inCall.length} in call` : 'nobody yet'}</span>
        {v.joined ? (
          <span className="voice-ctrls">
            <button className={`icon-btn${v.muted ? ' warn' : ''}`} onClick={toggleMute} aria-label={v.muted ? 'Unmute' : 'Mute'}>
              {v.muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button className="icon-btn danger" onClick={leaveVoice} aria-label="Leave voice">
              <PhoneOff size={16} />
            </button>
          </span>
        ) : (
          <button className="btn small" onClick={joinVoice}>
            <Mic size={14} /> Join
          </button>
        )}
      </div>
      {inCall.length > 0 && (
        <div className="voice-people">
          {inCall.map((p) => {
            const talking = v.speaking.includes(p.socketId) || (p.socketId === socket.id && v.speaking.includes(socket.id ?? ''));
            return (
              <span key={p.socketId} className={`voice-chip${talking ? ' talking' : ''}`}>
                {p.name}
                {p.socketId === socket.id && v.muted && <MicOff size={11} />}
              </span>
            );
          })}
        </div>
      )}
      {meta.spectators.length > 0 && (
        <p className="muted small spectators">
          <Eye size={13} /> {meta.spectators.join(', ')} watching
        </p>
      )}
    </section>
  );
}
