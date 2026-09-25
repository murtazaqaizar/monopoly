import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Bomb, Crown, Gavel, Hourglass, Play, Sparkles, Timer, TrendingUp, Zap } from 'lucide-react';
import { BUILDING_NAMES, describeSide, JET_RANGE, MAX_SHARES, POWER_UPS, sharePrice, tileOf, mapOf } from '../../shared/engine';
import type { Player, PowerUpKind, PublicState } from '../../shared/types';
import { forgetSeat, navigate, send, useNow, useSnapshot } from '../net';
import { Avatar } from './Avatar';
import { Dice3D } from './Dice3D';
import { GroupMark } from './Mark';
import { ReactionBar } from './Social';
import { EndSummary, ReplayViewer } from './Stats';
import { BribeChoice, SchengenButtons, Showtime, SpecialStatus, TravelChoice, WarPanel } from './MapSpecials';
import { play } from '../sound';

export function Center({ state, me }: { state: PublicState; me: string | null }) {
  const turn = state.turn;
  const current = state.players.find((p) => p.id === turn?.playerId);
  const mine = state.players.find((p) => p.id === me);
  const myTurn = !!mine && turn?.playerId === me && state.phase === 'playing';
  const rollId = state.log.findLast((l) => l.text.includes(' rolled '))?.id ?? -1;
  const [replay, setReplay] = useState(false);

  if (state.phase === 'ended') {
    const winner = state.players.find((p) => p.id === state.winner);
    return (
      <div className="center">
        <div className="winner">
          <Crown className="crown" size={40} />
          <h2>
            <span style={{ color: winner?.color }}>{winner?.name}</span> wins!
          </h2>
        </div>
        <EndSummary state={state} onReplay={() => setReplay(true)} />
        <button
          className="btn primary big cta"
          onClick={() => {
            forgetSeat(state.code);
            navigate('/');
          }}
        >
          New game
        </button>
        {replay && <ReplayViewer onClose={() => setReplay(false)} />}
      </div>
    );
  }

  let main;
  if (state.phase === 'lobby') {
    const isHost = state.hostId === me;
    main = isHost ? (
      <button className="btn primary big cta" disabled={state.players.length < 2} onClick={() => send({ type: 'start' })}>
        <Play size={18} fill="currentColor" /> {state.players.length < 2 ? 'Waiting for players' : 'Start game'}
      </button>
    ) : (
      <p className="waiting">{me ? 'Waiting for the host to start…' : 'Watching this room'}</p>
    );
  } else if (state.auction) {
    main = <AuctionPanel state={state} me={me} />;
  } else if (myTurn && mine) {
    main = <MyTurn state={state} me={mine} />;
  } else {
    main = (
      <p className="waiting">
        {current && <Avatar player={current} size={22} />}
        <span>
          <b>{current?.name}</b> is {verb(turn?.stage)}
        </span>
      </p>
    );
  }

  return (
    <div className="center">
      {state.phase === 'playing' && <StatusStrip state={state} me={me} />}
      {state.phase === 'playing' && <SpecialStatus state={state} me={me} />}
      <Dice3D dice={turn?.dice ?? null} rollId={rollId} />
      {turn?.speed != null && state.phase === 'playing' && (
        <span className="speed-face" key={rollId}>
          {turn.speed === 'bus' ? '🚌 Bus' : turn.speed === 'rocket' ? '🚀 Rocket' : `⚡ +${turn.speed}`}
        </span>
      )}
      <div className="center-main">{main}</div>
      {state.phase === 'playing' && <Showtime state={state} me={me} />}
      {myTurn && mine && <WarPanel state={state} me={mine} />}
      {state.phase === 'playing' && <Claims state={state} me={me} />}
      {state.phase === 'playing' && <Vetoes state={state} me={me} />}

      {myTurn && mine && mine.powerUps.length > 0 && !state.auction && <PowerUps state={state} me={mine} />}

      {state.lastCard && state.phase === 'playing' && (
        <div key={state.lastCard.at} className={`card-drawn ${state.lastCard.deck}`}>
          <span className="card-kind">
            {{ chance: 'Surprise', chest: 'Treasure', event: 'World event', arcade: 'Arcade' }[state.lastCard.deck]}
          </span>
          <p>{state.lastCard.text}</p>
        </div>
      )}

      {mine && mine.cash < 0 && state.phase === 'playing' && (
        <div className="debt">
          You owe <b>${-mine.cash}</b>. Sell buildings, mortgage cities (tap them on the board), take a loan, or declare bankruptcy.
        </div>
      )}

      <Feed state={state} />
      {state.phase === 'playing' && <ReactionBar />}
    </div>
  );
}

function StatusStrip({ state, me }: { state: PublicState; me: string | null }) {
  const { offset } = useSnapshot();
  const now = useNow(250) + offset;
  const deadline = state.auction ? null : state.turn?.deadline;
  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const left = state.endsAt ? Math.max(0, state.endsAt - now) : null;
  const mineTicking = secs !== null && secs > 0 && secs <= 5 && state.turn?.playerId === me;
  useEffect(() => {
    if (mineTicking) play('tick');
  }, [secs, mineTicking]);
  const clock = left !== null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : null;
  const goal =
    state.settings.winCondition === 'worth'
      ? `Goal: $${state.settings.winWorth.toLocaleString()}`
      : state.settings.winCondition === 'sets'
        ? `Goal: ${state.settings.winSets} sets`
        : null;
  if (secs === null && !clock && !state.event && !(state.settings.jackpot && state.pot > 0) && !state.stock && state.bank === null && !goal)
    return null;
  return (
    <div className="status-strip">
      {secs !== null && (
        <span className={`chip-pill${secs <= 5 ? ' hot' : ''}`}>
          <Timer size={13} /> {secs}s
        </span>
      )}
      {clock && (
        <span className="chip-pill">
          <Hourglass size={13} /> {clock}
        </span>
      )}
      {state.event && state.event.roundsLeft > 0 && (
        <span className="chip-pill event" title={state.event.text}>
          <Sparkles size={13} /> {state.event.text.split('!')[0]}
        </span>
      )}
      {state.settings.jackpot && state.pot > 0 && <span className="chip-pill gold">Jackpot ${state.pot}</span>}
      {state.stock && (
        <span className="chip-pill" title="Buildings left in the bank">
          🏠 {state.stock.houses} · 🏨 {state.stock.hotels}
          {state.settings.megaBuildings ? ` · 🏙️ ${state.stock.mega}` : ''}
        </span>
      )}
      {state.bank !== null && (
        <span className={`chip-pill${state.bank < 1000 ? ' hot' : ''}`} title="Cash left in the bank">
          🏦 ${state.bank.toLocaleString()}
        </span>
      )}
      {goal && <span className="chip-pill">🏁 {goal}</span>}
    </div>
  );
}

function Feed({ state }: { state: PublicState }) {
  if (state.phase === 'lobby') {
    return (
      <ul className="feed">
        {state.players.map((p) => (
          <li key={p.id}>
            <Avatar player={p} size={16} /> <b>{p.name}</b> joined the room
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="feed">
      {state.log.slice(-4).map((l) => {
        const who = state.players.find((p) => l.text.startsWith(p.name + ' '));
        return (
          <li key={l.id}>
            {who && <Avatar player={who} size={16} />}
            <span>
              {who ? (
                <>
                  <b>{who.name}</b>
                  {l.text.slice(who.name.length)}
                </>
              ) : (
                l.text
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function verb(stage?: string) {
  switch (stage) {
    case 'roll':
      return 'rolling…';
    case 'buy':
      return 'deciding whether to buy…';
    case 'sabotage':
      return 'plotting a sabotage…';
    case 'stocks':
      return 'trading stocks…';
    case 'minigame':
      return 'playing the arcade…';
    case 'bus':
      return 'choosing a bus ride…';
    case 'teleport':
      return 'picking where to teleport…';
    case 'travel':
      return 'deciding whether to travel on…';
    case 'bribe':
      return 'thinking about chai-pani…';
    default:
      return 'finishing their turn…';
  }
}

function MyTurn({ state, me }: { state: PublicState; me: Player }) {
  const turn = state.turn!;
  const inDebt = me.cash < 0;
  const map = mapOf(state);

  if (turn.stage === 'roll') {
    if (me.inJail) {
      return (
        <div className="actions">
          <p className="hint">You're in Prison · try {me.jailTurns + 1} of {state.settings.jailTries}</p>
          <div className="row">
            <button className="btn primary big cta" disabled={inDebt} onClick={() => send({ type: 'roll' })}>
              Roll for doubles
            </button>
            <button className="btn big" disabled={me.cash < state.settings.jailFine} onClick={() => send({ type: 'payJail' })}>
              Pay ${state.settings.jailFine}
            </button>
            {me.jailCards > 0 && (
              <button className="btn big" onClick={() => send({ type: 'useJailCard' })}>
                Use card ({me.jailCards})
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="actions">
        {turn.doubles > 0 && <p className="hint">Doubles! Roll again.</p>}
        <SchengenButtons state={state} me={me} />
        <button className="btn primary big cta" disabled={inDebt} onClick={() => send({ type: 'roll' })}>
          Roll the dice
        </button>
      </div>
    );
  }

  if (turn.stage === 'buy' && turn.pendingTile !== null) {
    const tile = tileOf(state, turn.pendingTile);
    const group = tile.group ? map.groups[tile.group] : null;
    return (
      <div className="actions">
        <p className="hint">
          {group && <GroupMark group={group} />} Buy <b>{tile.name}</b>?
        </p>
        <div className="row">
          <button className="btn primary big cta" disabled={me.cash < tile.price!} onClick={() => send({ type: 'buy' })}>
            Buy for ${tile.price}
          </button>
          <button className="btn big" onClick={() => send({ type: 'decline' })}>
            {state.settings.auctions ? (
              <>
                <Gavel size={16} /> Auction
              </>
            ) : (
              'Skip'
            )}
          </button>
        </div>
      </div>
    );
  }

  if (turn.stage === 'sabotage') {
    const targets = map.tiles.filter((t) => {
      const o = state.properties[t.index];
      return o && o.owner !== me.id && !o.mortgaged;
    });
    return (
      <div className="actions">
        <p className="hint">
          <Bomb size={16} /> Sabotage a rival city
        </p>
        <div className="pick-grid">
          {targets.map((t) => {
            const o = state.properties[t.index];
            const owner = state.players.find((p) => p.id === o.owner)!;
            return (
              <div key={t.index} className="pick-card">
                <span className="pick-title">
                  <GroupMark group={t.group ? map.groups[t.group] : null} /> {t.name}
                </span>
                <span className="muted small">
                  <Avatar player={owner} size={12} /> {owner.name}
                  {o.houses > 0 && ` · ${BUILDING_NAMES[o.houses]}`}
                </span>
                <span className="row left">
                  <button className="btn small" onClick={() => send({ type: 'sabotage', tile: t.index, mode: 'freeze' })}>
                    Freeze
                  </button>
                  {o.houses > 0 && (
                    <button className="btn small" onClick={() => send({ type: 'sabotage', tile: t.index, mode: 'demolish' })}>
                      Demolish
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <button className="btn ghost" onClick={() => send({ type: 'skipSpecial' })}>
          Show mercy
        </button>
      </div>
    );
  }

  if (turn.stage === 'stocks') {
    return (
      <div className="actions">
        <p className="hint">
          <TrendingUp size={16} /> Stock exchange · shares pay 10% of their country's rent
        </p>
        <div className="stocks">
          {Object.values(map.groups).map((g) => {
            const held = state.shares[g.id]?.[me.id] ?? 0;
            const price = sharePrice(state, g.id);
            return (
              <div key={g.id} className="stock">
                <GroupMark group={g} />
                <span className="stock-name">{g.name}</span>
                <b>${price}</b>
                <span className="muted small">{held ? `${held} held` : ''}</span>
                <button className="btn small" disabled={held === 0} onClick={() => send({ type: 'sellShare', group: g.id })}>
                  Sell
                </button>
                <button
                  className="btn small primary"
                  disabled={held >= MAX_SHARES || me.cash < price}
                  onClick={() => send({ type: 'buyShare', group: g.id })}
                >
                  Buy
                </button>
              </div>
            );
          })}
        </div>
        <button className="btn primary" onClick={() => send({ type: 'skipSpecial' })}>
          Done
        </button>
      </div>
    );
  }

  if (turn.stage === 'bus' && turn.dice) {
    const [a, b] = turn.dice;
    return (
      <div className="actions">
        <p className="hint">🚌 Bus: choose how far to move</p>
        <div className="row">
          <button className="btn big" onClick={() => send({ type: 'busChoice', pick: 0 })}>
            Move {a}
          </button>
          <button className="btn big" onClick={() => send({ type: 'busChoice', pick: 1 })}>
            Move {b}
          </button>
          <button className="btn primary big" onClick={() => send({ type: 'busChoice', pick: 2 })}>
            Move {a + b}
          </button>
        </div>
      </div>
    );
  }

  if (turn.stage === 'travel') return <TravelChoice state={state} me={me} />;
  if (turn.stage === 'bribe') return <BribeChoice state={state} />;

  if (turn.stage === 'teleport') {
    return <Teleport state={state} me={me} />;
  }

  if (turn.stage === 'minigame' && turn.mini) {
    return (
      <div className="actions">
        <p className="hint">Arcade: will the next die be higher or lower than {turn.mini.shown}?</p>
        <p className="muted small">Right: win $100 · Wrong: lose $50 · Tie: nothing</p>
        <div className="row">
          <button className="btn primary big" onClick={() => send({ type: 'miniGuess', higher: true })}>
            <ArrowUp size={16} /> Higher
          </button>
          <button className="btn primary big" onClick={() => send({ type: 'miniGuess', higher: false })}>
            <ArrowDown size={16} /> Lower
          </button>
          <button className="btn ghost" onClick={() => send({ type: 'skipSpecial' })}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="actions">
      <button className="btn primary big cta" disabled={inDebt} onClick={() => send({ type: 'endTurn' })}>
        End turn
      </button>
    </div>
  );
}

function PowerUps({ state, me }: { state: PublicState; me: Player }) {
  const [picking, setPicking] = useState<number | null>(null);
  const kind: PowerUpKind | null = picking !== null ? me.powerUps[picking] : null;
  const rivals = state.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const map = mapOf(state);

  return (
    <div className="powerups">
      <div className="row">
        {me.powerUps.map((k, i) => {
          const def = POWER_UPS[k];
          const needsRoll = k === 'jet' && (state.turn!.stage !== 'roll' || me.inJail);
          return (
            <button
              key={i}
              className={`power${picking === i ? ' on' : ''}`}
              title={def.text}
              disabled={needsRoll || (k === 'shield' && me.shield)}
              onClick={() => (def.target ? setPicking(picking === i ? null : i) : send({ type: 'usePowerUp', index: i }))}
            >
              <Zap size={13} /> {def.name}
            </button>
          );
        })}
      </div>
      {kind === 'jet' && picking !== null && (
        <div className="row">
          {Array.from({ length: JET_RANGE }, (_, k) => (me.position + k + 1) % state.size).map((t) => (
            <button
              key={t}
              className="btn small"
              onClick={() => send({ type: 'usePowerUp', index: picking, tile: t }).then(() => setPicking(null))}
            >
              {map.tiles[t].name}
            </button>
          ))}
        </div>
      )}
      {(kind === 'freeze' || kind === 'heist') && picking !== null && (
        <div className="row">
          {rivals.map((p) => (
            <button
              key={p.id}
              className="btn small"
              onClick={() => send({ type: 'usePowerUp', index: picking, target: p.id }).then(() => setPicking(null))}
            >
              <Avatar player={p} size={14} /> {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionPanel({ state, me }: { state: PublicState; me: string | null }) {
  const { offset } = useSnapshot();
  const now = useNow(200) + offset;
  const a = state.auction!;
  const tile = tileOf(state, a.tile);
  const mine = state.players.find((p) => p.id === me);
  const leader = state.players.find((p) => p.id === a.highBidder);
  const msLeft = Math.max(0, a.endsAt - now);
  const [custom, setCustom] = useState('');
  const canBid = mine && !mine.bankrupt;

  if (a.sealed) {
    const mineBid = a.bids.find((b) => b.pid === me);
    const alive = state.players.filter((p) => !p.bankrupt).length;
    return (
      <div className="auction">
        <p className="hint">
          <Gavel size={16} /> Sealed auction · <b>{tile.name}</b> <span className="muted">list ${tile.price}</span>
        </p>
        <p className="muted small">
          One secret bid each. Highest wins and pays the second-highest bid +$1. Minimum ${a.opening}.
        </p>
        <div className="auction-bid">
          <span className="amount">
            {a.bids.length}/{alive}
          </span>
          <span className="muted">bids in</span>
        </div>
        <div className="auction-bar">
          <span style={{ width: `${Math.min(100, (msLeft / 25000) * 100)}%` }} className={msLeft < 3000 ? 'low' : ''} />
        </div>
        {canBid &&
          (mineBid ? (
            <p className="hint">Your sealed bid: ${mineBid.amount}</p>
          ) : (
            <form
              className="custom-bid"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(custom);
                if (n > 0) send({ type: 'bid', amount: n }).then((ok) => ok && setCustom(''));
              }}
            >
              <input
                inputMode="numeric"
                value={custom}
                placeholder={`$${a.opening}+`}
                aria-label="Sealed bid"
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
              />
              <button className="btn primary" disabled={!custom}>
                Seal bid
              </button>
            </form>
          ))}
      </div>
    );
  }

  return (
    <div className="auction">
      <p className="hint">
        <Gavel size={16} /> Auction · <b>{tile.name}</b> <span className="muted">list ${tile.price}</span>
      </p>
      <div className="auction-bid">
        <span className="amount">${a.highBid}</span>
        <span className="muted">{leader ? `by ${leader.name}` : 'no bids yet'}</span>
      </div>
      <div className="auction-bar">
        <span style={{ width: `${Math.min(100, (msLeft / 10000) * 100)}%` }} className={msLeft < 3000 ? 'low' : ''} />
      </div>
      {canBid && a.highBidder === me && <p className="hint leading">You're the highest bidder. Wait for someone to outbid you.</p>}
      {canBid && a.highBidder !== me && (
        <div className="row">
          {[2, 10, 100].map((inc) => (
            <button
              key={inc}
              className="btn"
              disabled={Math.max(a.highBid + inc, a.opening) > mine.cash}
              onClick={() => send({ type: 'bid', amount: Math.max(a.highBid + inc, a.opening) })}
            >
              +${inc}
            </button>
          ))}
          <form
            className="custom-bid"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(custom);
              if (n > 0) send({ type: 'bid', amount: n }).then((ok) => ok && setCustom(''));
            }}
          >
            <input
              inputMode="numeric"
              value={custom}
              placeholder="Bid"
              aria-label="Custom bid"
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn primary" disabled={!custom}>
              Bid
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Teleport({ state, me }: { state: PublicState; me: Player }) {
  const map = mapOf(state);
  const [to, setTo] = useState((me.position + 1) % state.size);
  return (
    <div className="actions">
      <p className="hint">✨ Triples! Teleport to any tile</p>
      <div className="row">
        <select value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="Teleport destination">
          {map.tiles.map((t) => (
            <option key={t.index} value={t.index}>
              {t.name}
              {state.properties[t.index] ? ' (owned)' : t.price ? ` · $${t.price}` : ''}
            </option>
          ))}
        </select>
        <button className="btn primary big" onClick={() => send({ type: 'teleportTo', tile: to })}>
          Teleport
        </button>
      </div>
    </div>
  );
}

/** "Owner must call rent": owners see a Collect button until the next roll. */
function Claims({ state, me }: { state: PublicState; me: string | null }) {
  const mine = state.rentClaims.filter((c) => c.owner === me);
  if (!mine.length) return null;
  return (
    <div className="claims">
      {mine.map((c) => {
        const payer = state.players.find((p) => p.id === c.payer);
        return (
          <button key={c.id} className="btn primary claim-btn" onClick={() => send({ type: 'collectRent', id: c.id })}>
            💰 Collect ${c.amount} from {payer?.name} · {tileOf(state, c.tile).name}
          </button>
        );
      })}
    </div>
  );
}

/** Trade veto window: bystanders can object before an accepted trade goes through. */
function Vetoes({ state, me }: { state: PublicState; me: string | null }) {
  const { offset } = useSnapshot();
  const now = useNow(500, state.vetoQueue.length > 0) + offset;
  if (!state.vetoQueue.length) return null;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  return (
    <div className="vetoes">
      {state.vetoQueue.map((v) => {
        const party = v.offer.from === me || v.offer.to === me;
        const secs = Math.max(0, Math.ceil((v.executeAt - now) / 1000));
        return (
          <div key={v.id} className="veto">
            <span>
              ⚖️ <b>{name(v.offer.from)}</b> ⇄ <b>{name(v.offer.to)}</b>: {describeSide(state, v.offer.give)} for {describeSide(state, v.offer.get)}
            </span>
            <span className="muted small">
              {secs}s · {v.vetoes.length} veto{v.vetoes.length === 1 ? '' : 's'}
            </span>
            {!party && me && !v.vetoes.includes(me) && (
              <button className="btn small danger" onClick={() => send({ type: 'vetoTrade', id: v.id })}>
                Veto
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
