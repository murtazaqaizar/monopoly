import { useState } from 'react';
import { capitalOf, LAWS, MAX_PLOTS, NAKA_FINE, SHOP_ITEMS, mapOf, sideOf, specialOn, tileOf } from '../../shared/engine';
import type { LawId, Player, PublicState } from '../../shared/types';
import { Avatar } from './Avatar';
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
  if (on('world.timezones')) chips.push({ text: `🌙 Night on side ${sp.night + 1} (rent ½)`, tone: 'event' });
  for (const b of sp.boosts ?? []) chips.push({ text: `📰 ${b.label.replace(/\.$/, '')}`, tone: b.factor >= 1 ? 'gold' : 'hot' });
  if (sp.committee > 0) chips.push({ text: `🤝 Committee pot $${sp.committee}`, tone: 'gold' });
  if (mapOf(state).tiles.some((t) => t.kind === 'plots')) {
    const held = me ? sp.plots.owned[me] ?? 0 : 0;
    chips.push({ text: `📄 Plot file $${sp.plots.value}${held ? ` · you hold ${held}` : ''}` });
  }
  if (sp.law) chips.push({ text: `⚖️ ${LAWS[sp.law.id].name} · ${sp.law.roundsLeft} rounds`, tone: 'event' });
  if (sp.culture > 0) chips.push({ text: `🏛️ Culture prize $${sp.culture + 100}` });
  for (const pid of Object.keys(sp.away ?? {}))
    chips.push({ text: `🏔️ ${state.players.find((p) => p.id === pid)?.name} is up north (rent x2)` });
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

/** A ride along a route: World flights, Euro rail lines, the Pakistan motorway. */
export function TravelChoice({ state, me }: { state: PublicState; me: Player }) {
  const map = mapOf(state);
  const offer = state.turn?.travel;
  if (!offer) return null;
  const icon = offer.via === 'flight' ? '✈️' : offer.via === 'rail' ? '🚆' : '🛣️';
  const verb = offer.via === 'flight' ? 'Fly on' : offer.via === 'rail' ? 'Ride the line' : 'Take the motorway';
  return (
    <div className="actions">
      <p className="hint">
        {icon} {verb}? {offer.cost ? `$${offer.cost} fare, paid to the destination's owner` : 'Free ride'}
      </p>
      <div className="row">
        {offer.to.map((i) => {
          const own = state.properties[i];
          const owner = own && state.players.find((p) => p.id === own.owner);
          const fare = own?.owner === me.id ? 0 : offer.cost;
          const route = map.routes.find((r) => (r.a === i && r.b === me.position) || (r.b === i && r.a === me.position));
          return (
            <button key={i} className="btn" disabled={me.cash < fare} onClick={() => send({ type: 'travel', tile: i })}>
              {owner && <Avatar player={owner} size={14} />} {map.tiles[i].name}
              <small className="muted"> {route?.name} · ${fare}</small>
            </button>
          );
        })}
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
  if (b.kind === 'naka') return <NakaChoice state={state} />;
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

/** Naka checkpoint (Pakistan): pay the fine, try chai-pani, or go to the Thana. */
function NakaChoice({ state }: { state: PublicState }) {
  const me = state.players.find((p) => p.id === state.turn?.playerId);
  const bribe = specialOn(state, 'pk.bribe');
  return (
    <div className="actions">
      <p className="hint">🚧 Naka! The police want your papers, and you have none.</p>
      <div className="row">
        <button className="btn primary big" disabled={(me?.cash ?? 0) < NAKA_FINE} onClick={() => send({ type: 'bribe', offer: false, fine: true })}>
          Pay ${NAKA_FINE} fine
        </button>
        {bribe && (
          <button className="btn big" disabled={(me?.cash ?? 0) < 50} onClick={() => send({ type: 'bribe', offer: true })}>
            Chai-pani $50
          </button>
        )}
        <button className="btn big ghost" onClick={() => send({ type: 'bribe', offer: false })}>
          Go to the Thana
        </button>
      </div>
      {bribe && <p className="muted small">Chai-pani works 70% of the time. Caught, and it's the Thana anyway.</p>}
    </div>
  );
}

/** Duty-Free counter (World) or a bazaar stall with haggling (Pakistan). */
export function ShopChoice({ state, me }: { state: PublicState; me: Player }) {
  const shop = state.turn?.shop;
  if (!shop) return null;
  const bazaar = shop.kind === 'bazaar';
  return (
    <div className="actions">
      <p className="hint">
        {bazaar ? '🧺 Bazaar stall' : '🛍️ Duty-Free'}
        {bazaar ? ` · haggles left ${2 - shop.haggles}` : ' · buy one item'}
      </p>
      <div className="shop">
        {shop.items.map((it, i) => (
          <div key={it.item} className="shop-item">
            <b>{SHOP_ITEMS[it.item].name}</b>
            <span className="muted small">{SHOP_ITEMS[it.item].text}</span>
            <button className="btn primary small" disabled={me.cash < it.price} onClick={() => send({ type: 'shopBuy', index: i })}>
              Buy ${it.price}
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        {bazaar && shop.haggles < 2 && (
          <button className="btn" onClick={() => send({ type: 'haggle' })} title="Roll: 3-6 knocks 15-30% off, 2 raises it, 1 gets you thrown out">
            🎲 Haggle
          </button>
        )}
        <button className="btn ghost" onClick={() => send({ type: 'skipSpecial' })}>
          Walk away
        </button>
      </div>
    </div>
  );
}

/** Property dealer (Pakistan): buy plot files that float in value. */
export function PlotsChoice({ state, me }: { state: PublicState; me: Player }) {
  const plots = state.special.plots;
  const held = plots.owned[me.id] ?? 0;
  return (
    <div className="actions">
      <p className="hint">📄 Property dealer · a plot file costs ${plots.value} today</p>
      <p className="muted small">
        Its value moves every round (x0.8 to x1.3). Sell any time on your turn. You hold {held} of {MAX_PLOTS}.
      </p>
      <div className="row">
        <button className="btn primary" disabled={held >= MAX_PLOTS || me.cash < plots.value} onClick={() => send({ type: 'buyPlot' })}>
          Buy a file ${plots.value}
        </button>
        <button className="btn ghost" onClick={() => send({ type: 'skipSpecial' })}>
          Done
        </button>
      </div>
    </div>
  );
}

/** EU Parliament (Euro Trip): table a law for everyone to vote on. */
export function ParliamentChoice() {
  return (
    <div className="actions">
      <p className="hint">⚖️ EU Parliament · propose a law. Everyone votes; it needs more yes than no.</p>
      <div className="pick-grid">
        {(Object.keys(LAWS) as LawId[]).map((id) => (
          <button key={id} className="pick-card law" onClick={() => send({ type: 'propose', law: id })}>
            <span className="pick-title">{LAWS[id].name}</span>
            <span className="muted small">{LAWS[id].text}</span>
          </button>
        ))}
      </div>
      <button className="btn ghost" onClick={() => send({ type: 'skipSpecial' })}>
        Skip
      </button>
    </div>
  );
}

/** Northern Areas (Pakistan): go on a trip and let your cities earn double. */
export function TripChoice() {
  return (
    <div className="actions">
      <p className="hint">🏔️ Northern Areas trip?</p>
      <p className="muted small">Skip your next turn, but every city you own earns double rent while you're away.</p>
      <div className="row">
        <button className="btn primary big" onClick={() => send({ type: 'trip', go: true })}>
          Go north
        </button>
        <button className="btn big" onClick={() => send({ type: 'trip', go: false })}>
          Stay
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
  const now = useNow(250, !!(sp.vote || sp.match || sp.bill)) + offset;
  const [amount, setAmount] = useState(100);
  const map = mapOf(state);
  const canAct = !!me && !state.players.find((p) => p.id === me)?.bankrupt;

  const vote = sp.vote && now < sp.vote.endsAt ? sp.vote : null;
  const match = sp.match && now < sp.match.endsAt ? sp.match : null;
  const bill = sp.bill && now < sp.bill.endsAt ? sp.bill : null;
  if (!vote && !match && !bill) return null;

  return (
    <div className="showtime">
      {bill && (
        <div className="show-card">
          <p className="hint">
            ⚖️ Vote: {LAWS[bill.law].name} · {Math.ceil((bill.endsAt - now) / 1000)}s
          </p>
          <p className="muted small">{LAWS[bill.law].text}</p>
          {canAct && me && bill.votes[me] !== undefined ? (
            <p className="muted small">You voted {bill.votes[me] ? 'yes' : 'no'}</p>
          ) : (
            canAct && (
              <div className="row">
                <button className="btn small primary" onClick={() => send({ type: 'billVote', yes: true })}>
                  Yes
                </button>
                <button className="btn small" onClick={() => send({ type: 'billVote', yes: false })}>
                  No
                </button>
              </div>
            )
          )}
        </div>
      )}
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
  if (on('world.timezones') && sideOf(state, index) === sp.night) out.push('fx-night');
  for (const b of sp.boosts ?? []) {
    if ((b.group && b.group === g) || (b.kind && b.kind === tile.kind)) out.push(b.factor >= 1 ? 'fx-boost' : 'fx-dim');
  }
  if (on('eu.seasons') && sp.season === 'winter' && g && ['red', 'green'].includes(g)) out.push('fx-snow');
  return out;
}

/** Exchange rate label for a set (World Tour), e.g. "+12%". */
export function rateLabel(state: PublicState, group: string | undefined): string | null {
  if (!group) return null;
  const floating = specialOn(state, 'eu.currency') && !!mapOf(state).groups[group]?.currency;
  if (!specialOn(state, 'world.fx') && !floating) return null;
  const r = state.special.rates[group] ?? 1;
  if (Math.abs(r - 1) < 0.005) return null;
  const pct = Math.round((r - 1) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
