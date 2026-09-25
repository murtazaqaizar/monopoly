import { useState } from 'react';
import { capitalOf, mapOf, specialOn, tileOf } from '../../shared/engine';
import type { Player, PublicState } from '../../shared/types';
import { send, useNow, useSnapshot } from '../net';
import { GroupMark } from './Mark';

const groupName = (state: PublicState, g: string) => mapOf(state).groups[g]?.name ?? g;

/** Chips for every map special currently in effect. */
export function SpecialStatus({ state, me }: { state: PublicState; me: string | null }) {
  const sp = state.special;
  const chips: { text: string; tone?: string }[] = [];
  const on = (id: string) => specialOn(state, id);
  if (on('world.war') && sp.war) chips.push({ text: `⚔️ ${groupName(state, sp.war.a)} vs ${groupName(state, sp.war.b)}`, tone: 'hot' });
  if (on('world.embargo') && sp.embargo) chips.push({ text: `🚫 Embargo: ${groupName(state, sp.embargo.group)}` });
  if (on('world.olympics') && sp.olympics) chips.push({ text: `🏅 Olympics: ${groupName(state, sp.olympics.group)} x3`, tone: 'gold' });
  if (on('world.oil') && sp.oil > 0) chips.push({ text: '🛢️ Oil crisis', tone: 'hot' });
  if (on('world.lockdown') && sp.lockdown) chips.push({ text: `😷 Lockdown: side ${sp.lockdown.side + 1}`, tone: 'hot' });
  if (on('pk.loadshedding') && sp.blackout) chips.push({ text: `🔌 Load-shedding: ${groupName(state, sp.blackout.group)}`, tone: 'hot' });
  if (on('pk.ups') && me && (sp.ups[me] ?? 0) > 0) chips.push({ text: `🔋 UPS ${sp.ups[me]} turns` });
  if (on('pk.cricket') && sp.cricket) chips.push({ text: `🏏 Match day: ${groupName(state, sp.cricket.group)} x2`, tone: 'gold' });
  if (on('pk.traffic') && me && sp.traffic[me]) chips.push({ text: '🚗 Stuck in traffic (−2)', tone: 'hot' });
  if (on('eu.strike') && sp.strike > 0) chips.push({ text: '🪧 Train strike', tone: 'hot' });
  if (on('eu.seasons')) chips.push({ text: sp.season === 'summer' ? '☀️ Summer' : '❄️ Winter', tone: 'event' });
  if (on('eu.exit') && sp.exited) chips.push({ text: `🗳️ ${groupName(state, sp.exited)} left (+50%)` });
  if (!chips.length) return null;
  return (
    <div className="status-strip">
      {chips.map((c) => (
        <span key={c.text} className={`chip-pill${c.tone ? ` ${c.tone}` : ''}`}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

/** Connecting flight (World) or rail pass (Euro Trip) after landing on an airport. */
export function TravelChoice({ state, me }: { state: PublicState; me: Player }) {
  const map = mapOf(state);
  const cost = state.turn?.travel?.cost ?? 0;
  const rail = state.settings.mapId === 'europe';
  return (
    <div className="actions">
      <p className="hint">
        {rail ? '🚆' : '✈️'} {rail ? 'Take the train' : 'Catch a connecting flight'} {cost ? `for $${cost}` : '(free night train)'}?
      </p>
      <div className="row">
        {map.airports
          .filter((i) => i !== me.position)
          .map((i) => (
            <button key={i} className="btn" disabled={me.cash < cost} onClick={() => send({ type: 'travel', tile: i })}>
              {map.tiles[i].name}
            </button>
          ))}
        <button className="btn ghost" onClick={() => send({ type: 'skipSpecial' })}>
          Stay
        </button>
      </div>
    </div>
  );
}

/** Chai-pani: bribe your way past a tax or Prison. */
export function BribeChoice({ state }: { state: PublicState }) {
  const b = state.turn?.bribe;
  if (!b) return null;
  const jail = b.kind === 'jail';
  return (
    <div className="actions">
      <p className="hint">☕ {jail ? 'The police want to take you to Prison.' : `${tileOf(state, b.tile).name} is due.`} Chai-pani?</p>
      <p className="muted small">$50 bribe: 70% you walk away, 30% you're caught and {jail ? 'still go to Prison' : 'pay double'}.</p>
      <div className="row">
        <button className="btn primary big" onClick={() => send({ type: 'bribe', offer: true })}>
          Offer $50
        </button>
        <button className="btn big" onClick={() => send({ type: 'bribe', offer: false })}>
          {jail ? 'Go quietly' : 'Pay normally'}
        </button>
      </div>
    </div>
  );
}

/** Schengen hop: +1 or +2 on this roll, once per lap. */
export function SchengenButtons({ state, me }: { state: PublicState; me: Player }) {
  if (!specialOn(state, 'eu.schengen') || me.inJail) return null;
  const lap = state.stats[me.id]?.laps ?? 0;
  if (state.special.schengen[me.id] === lap) return null;
  if (state.turn?.bonus) return <p className="muted small">🛤️ Schengen hop: +{state.turn.bonus} on this roll</p>;
  return (
    <div className="row">
      <span className="muted small">🛤️ Schengen hop:</span>
      <button className="btn small" onClick={() => send({ type: 'schengen', extra: 1 })}>
        +1
      </button>
      <button className="btn small" onClick={() => send({ type: 'schengen', extra: 2 })}>
        +2
      </button>
    </div>
  );
}

/** World War: attack a rival city in the enemy country. */
export function WarPanel({ state, me }: { state: PublicState; me: Player }) {
  const war = state.special.war;
  const [open, setOpen] = useState(false);
  if (!specialOn(state, 'world.war') || !war || state.turn?.playerId !== me.id || state.turn.attacked || state.auction) return null;
  const map = mapOf(state);
  const mineIn = (g: string) => map.groups[g].tiles.some((i) => state.properties[i]?.owner === me.id);
  const targets = [war.a, war.b]
    .filter((g) => mineIn(g === war.a ? war.b : war.a))
    .flatMap((g) => map.groups[g].tiles)
    .filter((i) => state.properties[i] && state.properties[i].owner !== me.id);
  if (!targets.length) return null;
  return (
    <div className="actions">
      <button className="btn danger" onClick={() => setOpen((v) => !v)}>
        ⚔️ Attack ($100)
      </button>
      {open && (
        <div className="row">
          {targets.map((i) => {
            const owner = state.players.find((p) => p.id === state.properties[i].owner);
            return (
              <button key={i} className="btn small" disabled={me.cash < 100} onClick={() => send({ type: 'attack', tile: i }).then(() => setOpen(false))}>
                {map.tiles[i].name} · {owner?.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Eurovision voting and Champions League betting: open to every player. */
export function Showtime({ state, me }: { state: PublicState; me: string | null }) {
  const { offset } = useSnapshot();
  const sp = state.special;
  const now = useNow(250, !!(sp.vote || sp.match)) + offset;
  const [amount, setAmount] = useState(100);
  const map = mapOf(state);
  const canAct = !!me && !state.players.find((p) => p.id === me)?.bankrupt;

  const vote = sp.vote && now < sp.vote.endsAt ? sp.vote : null;
  const match = sp.match && now < sp.match.endsAt ? sp.match : null;
  if (!vote && !match) return null;

  return (
    <div className="showtime">
      {vote && (
        <div className="show-card">
          <p className="hint">
            🎤 Eurovision · {Math.ceil((vote.endsAt - now) / 1000)}s
          </p>
          {canAct && me && vote.votes[me] ? (
            <p className="muted small">You voted for {groupName(state, vote.votes[me])}</p>
          ) : (
            canAct && (
              <div className="row">
                {vote.groups.map((g) => (
                  <button key={g} className="btn small" onClick={() => send({ type: 'vote', group: g })}>
                    <GroupMark group={map.groups[g]} /> {map.groups[g].name}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
      {match && (
        <div className="show-card">
          <p className="hint">
            ⚽ Final: {groupName(state, match.a)} vs {groupName(state, match.b)} · {Math.ceil((match.endsAt - now) / 1000)}s
          </p>
          {canAct && me && match.bets[me] ? (
            <p className="muted small">
              You bet ${match.bets[me].amount} on {groupName(state, match.bets[me].group)}
            </p>
          ) : (
            canAct && (
              <div className="row">
                <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Bet amount">
                  {[50, 100, 150, 200].map((v) => (
                    <option key={v} value={v}>
                      ${v}
                    </option>
                  ))}
                </select>
                {[match.a, match.b].map((g) => (
                  <button key={g} className="btn small primary" onClick={() => send({ type: 'bet', group: g, amount })}>
                    <GroupMark group={map.groups[g]} /> {map.groups[g].name}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Per-tile effect classes for the board (dark, boosted, blocked, capital). */
export function tileEffects(state: PublicState, index: number): string[] {
  const sp = state.special;
  if (!sp) return [];
  const tile = tileOf(state, index);
  const g = tile.group;
  const out: string[] = [];
  const on = (id: string) => specialOn(state, id);
  if (on('pk.loadshedding') && sp.blackout && g === sp.blackout.group) out.push('fx-dark');
  if (on('eu.strike') && sp.strike > 0 && tile.kind === 'airport') out.push('fx-dark');
  if (on('world.embargo') && sp.embargo && g === sp.embargo.group) out.push('fx-blocked');
  if (on('eu.exit') && sp.exited && g === sp.exited) out.push('fx-blocked');
  if (on('world.war') && sp.war && g && [sp.war.a, sp.war.b].includes(g)) out.push('fx-war');
  const boosted =
    !!g &&
    ((on('world.olympics') && sp.olympics?.group === g) ||
      (on('pk.cricket') && sp.cricket?.group === g) ||
    (on('eu.seasons') && g && (sp.season === 'summer' ? ['brown', 'lightblue', 'orange', 'violet'] : ['green', 'yellow', 'red', 'teal']).includes(g)));
  if (boosted) out.push('fx-boost');
  if (on('world.lockdown') && sp.lockdown) {
    const q = mapOf(state).side + 1;
    if (index % q !== 0 && Math.floor(index / q) === sp.lockdown.side) out.push('fx-lock');
  }
  if ((on('eu.heritage') || on('world.wonders')) && g && capitalOf(state, g) === index) out.push('fx-capital');
  return out;
}

/** Exchange rate label for a set (World Tour), e.g. "+12%". */
export function rateLabel(state: PublicState, group: string | undefined): string | null {
  if (!group || !specialOn(state, 'world.fx')) return null;
  const r = state.special.rates[group] ?? 1;
  if (Math.abs(r - 1) < 0.005) return null;
  const pct = Math.round((r - 1) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
