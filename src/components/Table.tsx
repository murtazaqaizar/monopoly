import { useState } from 'react';
import { BarChart3, Building2, Check, Copy, Eye, Handshake, Volume2, VolumeX } from 'lucide-react';
import { BUILDING_NAMES, mapOf } from '../../shared/engine';
import type { Player, PublicState } from '../../shared/types';
import { Board } from './Board';
import { Center } from './Center';
import { GroupMark } from './Mark';
import { Deals, Offers, Players } from './Players';
import { PropertyModal } from './PropertyModal';
import { SettingsPanel } from './SettingsPanel';
import { ChatAndLog, VoiceBar } from './Social';
import { NetWorthChart } from './Stats';
import { setSoundPrefs, useGameSounds, useSoundPrefs } from '../sound';

export function Logo() {
  return (
    <span className="logo">
      RICH<span>LANDS</span>
    </span>
  );
}

/** The whole room: lobby and game share one layout, like Richup. `me` is null for spectators. */
export function Table({ state, me }: { state: PublicState; me: string | null }) {
  const [openTile, setOpenTile] = useState<number | null>(null);
  const mine = state.players.find((p) => p.id === me);
  useGameSounds(state, me);

  return (
    <main className="table">
      <aside className="side left">
        <div className="brand">
          <Logo />
          {!me && (
            <span className="tag watch">
              <Eye size={12} /> spectating
            </span>
          )}
          <SoundToggle />
        </div>
        <Share code={state.code} />
        <VoiceBar />
        <ChatAndLog state={state} canChat />
      </aside>

      <div className="board-wrap">
        <Board state={state} onTile={setOpenTile}>
          <Center state={state} me={me} />
        </Board>
      </div>

      <aside className="side right">
        <Players state={state} me={me} />
        {state.phase === 'playing' && me && <Offers state={state} me={me} />}
        {state.phase === 'lobby' ? (
          <SettingsPanel state={state} me={me ?? ''} />
        ) : (
          <SideTabs state={state} mine={mine} onOpen={setOpenTile} />
        )}
      </aside>

      {openTile !== null && <PropertyModal state={state} me={me ?? ''} index={openTile} onClose={() => setOpenTile(null)} />}
    </main>
  );
}

function SoundToggle() {
  const { muted, volume } = useSoundPrefs();
  return (
    <span className="sound-toggle">
      <button
        className="icon-btn"
        onClick={() => setSoundPrefs({ muted: !muted })}
        aria-label={muted ? 'Turn sound on' : 'Mute sound'}
        title={muted ? 'Sound off' : 'Sound on'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        aria-label="Volume"
        onChange={(e) => setSoundPrefs({ volume: Number(e.target.value), muted: Number(e.target.value) === 0 })}
      />
    </span>
  );
}

function SideTabs({ state, mine, onOpen }: { state: PublicState; mine?: Player; onOpen: (i: number) => void }) {
  const [tab, setTab] = useState<'cities' | 'deals' | 'stats'>(mine && !mine.bankrupt ? 'cities' : 'stats');
  return (
    <section className="panel side-tabs">
      <nav className="tabs small">
        {mine && !mine.bankrupt && (
          <>
            <button className={tab === 'cities' ? 'on' : ''} onClick={() => setTab('cities')}>
              <Building2 size={14} /> Cities
            </button>
            <button className={tab === 'deals' ? 'on' : ''} onClick={() => setTab('deals')}>
              <Handshake size={14} /> Deals
            </button>
          </>
        )}
        <button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
          <BarChart3 size={14} /> Stats
        </button>
      </nav>
      <div className="tab-body">
        {tab === 'cities' && mine && <MyCities state={state} me={mine} onOpen={onOpen} />}
        {tab === 'deals' && mine && <Deals state={state} me={mine.id} />}
        {tab === 'stats' && <NetWorthChart state={state} />}
      </div>
    </section>
  );
}

function Share({ code }: { code: string }) {
  const link = `${location.origin}/room/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel share">
      <h2 className="panel-title">Share this game</h2>
      <div className="share-row">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked; the input is selectable */
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}

function MyCities({ state, me, onOpen }: { state: PublicState; me: Player; onOpen: (i: number) => void }) {
  const map = mapOf(state);
  const owned = map.tiles.filter((t) => state.properties[t.index]?.owner === me.id);
  return (
    <div className="my-props">
      {owned.length === 0 && <p className="muted empty">Nothing yet. Land on a city to buy it.</p>}
      <ul>
        {owned.map((t) => {
          const own = state.properties[t.index];
          return (
            <li key={t.index}>
              <button className={own.mortgaged ? 'mortgaged' : ''} onClick={() => onOpen(t.index)}>
                <GroupMark group={t.group ? map.groups[t.group] : null} />
                <span className="name">{t.name}</span>
                <span className="muted">
                  {own.mortgaged ? 'mortgaged' : own.frozen ? 'sabotaged' : BUILDING_NAMES[own.houses]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
