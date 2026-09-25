import { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowLeftRight, Check, Flag, Handshake, Landmark, LogOut, Shield, ShieldCheck, UserX, X } from 'lucide-react';
import { specialOn, allianceBetween, bankLoanLimit, describeSide, INSURANCE_COST, INSURANCE_TURNS, netWorth, mapOf } from '../../shared/engine';
import type { Offer, Player, PublicState, TradeOffer } from '../../shared/types';
import { forgetSeat, leaveRoom, navigate, send } from '../net';
import { Avatar } from './Avatar';
import { TradeModal } from './TradeModal';

/** Cash as this viewer may see it: exact, a range, or hidden. */
export function cashLabel(p: Player): string {
  if (p.cashMask === 'hidden') return '$???';
  if (Array.isArray(p.cashMask)) return `$${p.cashMask[0] / 1000}k–${p.cashMask[1] / 1000}k`;
  return `$${p.cash}`;
}

export function Players({ state, me }: { state: PublicState; me: string | null }) {
  const playing = state.phase === 'playing';
  const mine = state.players.find((p) => p.id === me);
  const [dealWith, setDealWith] = useState<string | null>(null);
  const isHost = state.hostId === me;

  return (
    <section className="panel players">
      {state.players.map((p) => {
        const count = Object.values(state.properties).filter((o) => o.owner === p.id).length;
        const ally = me && allianceBetween(state, me, p.id);
        const cls = [
          'player',
          state.turn?.playerId === p.id && playing ? 'turn' : '',
          p.bankrupt ? 'out' : '',
          p.connected ? '' : 'away',
        ].join(' ');
        return (
          <div key={p.id} className={cls}>
            <Avatar player={p} size={30} />
            <div className="who">
              <span className="name">
                {p.name}
                {p.id === state.hostId && <span className="tag host">host</span>}
                {p.id === me && <span className="tag you">you</span>}
                {ally && <span className="tag ally">ally</span>}
                {!p.connected && !p.bankrupt && <span className="tag">offline</span>}
              </span>
              {state.phase !== 'lobby' && (
                <span className="meta">
                  {p.bankrupt ? 'bankrupt' : p.cashMask ? `${count} cities` : `${count} cities · worth $${netWorth(state, p)}`}
                  {p.revived && !p.bankrupt && ' · 2nd life'}
                  {p.inJail && ' · in prison'}
                  {p.frozenTurns > 0 && ' · frozen'}
                  {p.insuredTurns > 0 && ' · insured'}
                </span>
              )}
            </div>
            {state.phase !== 'lobby' && <span className={`cash${p.cash < 0 && !p.cashMask ? ' neg' : ''}`}>{cashLabel(p)}</span>}
            {isHost && state.phase === 'lobby' && state.settings.turnOrder === 'host' && (
              <span className="order-btns">
                <button className="icon-btn" aria-label={`Move ${p.name} up`} onClick={() => send({ type: 'movePlayer', playerId: p.id, dir: -1 })}>
                  <ChevronUp size={14} />
                </button>
                <button className="icon-btn" aria-label={`Move ${p.name} down`} onClick={() => send({ type: 'movePlayer', playerId: p.id, dir: 1 })}>
                  <ChevronDown size={14} />
                </button>
              </span>
            )}
            {playing && mine && !mine.bankrupt && p.id !== me && !p.bankrupt && (
              <button className="icon-btn" title={`Deal with ${p.name}`} aria-label={`Deal with ${p.name}`} onClick={() => setDealWith(p.id)}>
                <ArrowLeftRight size={15} />
              </button>
            )}
            {isHost && p.id !== me && (state.phase === 'lobby' || (playing && !p.connected && !p.bankrupt)) && (
              <button
                className="icon-btn danger"
                title="Remove player"
                aria-label={`Remove ${p.name}`}
                onClick={() => confirm(`Remove ${p.name}?`) && send({ type: 'kick', playerId: p.id })}
              >
                <UserX size={15} />
              </button>
            )}
          </div>
        );
      })}
      <div className="players-foot">
        {state.phase === 'lobby' && me && (
          <button
            className="btn ghost small"
            onClick={() => {
              leaveRoom();
              forgetSeat(state.code);
              navigate('/');
            }}
          >
            <LogOut size={14} /> Leave room
          </button>
        )}
        {playing && mine && !mine.bankrupt && (
          <button
            className="btn ghost danger small"
            onClick={() => {
              if (confirm('Declare bankruptcy and leave the game? Your cities go to whoever you owe.')) send({ type: 'bankrupt' });
            }}
          >
            <Flag size={14} /> Bankrupt
          </button>
        )}
      </div>
      {dealWith && me && <TradeModal state={state} me={me} target={dealWith} onClose={() => setDealWith(null)} />}
    </section>
  );
}

function offerText(state: PublicState, o: Offer, me: string): string {
  const name = (id: string) => (id === me ? 'you' : state.players.find((p) => p.id === id)?.name ?? '?');
  if (o.kind === 'trade') return `${describeSide(state, o.give)} ⇄ ${describeSide(state, o.get)}`;
  if (o.kind === 'loan') return `${name(o.lender)} lends ${name(o.borrower)} $${o.amount}, repay $${o.repay} in ${o.turns} turns`;
  return `Alliance: no rent between ${name(o.from)} and ${name(o.to)}`;
}

export function Offers({ state, me }: { state: PublicState; me: string }) {
  const [counter, setCounter] = useState<TradeOffer | null>(null);
  const incoming = state.offers.filter((o) => o.to === me);
  const outgoing = state.offers.filter((o) => o.from === me);
  if (!incoming.length && !outgoing.length) return null;
  const who = (id: string) => state.players.find((p) => p.id === id)!;

  return (
    <section className="panel offers">
      <h2 className="panel-title">Offers</h2>
      {incoming.map((o) => (
        <div key={o.id} className="offer incoming">
          <div className="offer-top">
            <Avatar player={who(o.from)} size={20} />
            <b>{who(o.from).name}</b>
            <span className="muted small">wants to {o.kind === 'trade' ? 'trade' : o.kind === 'loan' ? 'make a loan' : 'ally'}</span>
          </div>
          <p>{offerText(state, o, me)}</p>
          <div className="row left">
            <button className="btn primary small" onClick={() => send({ type: 'respondOffer', id: o.id, accept: true })}>
              <Check size={14} /> Accept
            </button>
            {o.kind === 'trade' && (
              <button className="btn small" onClick={() => setCounter(o)}>
                Counter
              </button>
            )}
            <button className="btn ghost small" onClick={() => send({ type: 'respondOffer', id: o.id, accept: false })}>
              <X size={14} /> Decline
            </button>
          </div>
        </div>
      ))}
      {outgoing.map((o) => (
        <div key={o.id} className="offer">
          <div className="offer-top">
            <span className="muted small">You → {who(o.to).name}</span>
          </div>
          <p>{offerText(state, o, me)}</p>
          <button className="btn ghost small" onClick={() => send({ type: 'cancelOffer', id: o.id })}>
            Cancel
          </button>
        </div>
      ))}
      {counter && <TradeModal state={state} me={me} target={counter.from} counter={counter} onClose={() => setCounter(null)} />}
    </section>
  );
}

export function Deals({ state, me }: { state: PublicState; me: string }) {
  const mine = state.players.find((p) => p.id === me);
  const [amount, setAmount] = useState(100);
  if (!mine || mine.bankrupt) return null;
  const s = state.settings;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const loans = state.loans.filter((l) => l.borrower === me || l.lender === me);
  const immunities = state.immunities.filter((im) => im.holder === me || im.owner === me);
  const ally = state.alliances.find((a) => a.a === me || a.b === me);
  const map = mapOf(state);
  const myShares = Object.entries(state.shares)
    .map(([g, h]) => [g, h[me] ?? 0] as const)
    .filter(([, n]) => n > 0);
  const room = bankLoanLimit(state) - mine.bankLoan;
  const myTurn = state.turn?.playerId === me;

  return (
    <div className="deals">
      {ally && (
        <div className="deal">
          <Handshake size={16} className="gold-ico" />
          <span>
            Allied with <b>{name(ally.a === me ? ally.b : ally.a)}</b>
          </span>
          <button className="btn ghost danger small" onClick={() => confirm('Betray your ally?') && send({ type: 'breakAlliance', id: ally.id })}>
            Betray
          </button>
        </div>
      )}
      {loans.map((l) => (
        <div key={l.id} className="deal">
          <span>
            {l.borrower === me ? (
              <>
                You owe <b>{name(l.lender)}</b> ${l.repay}
              </>
            ) : (
              <>
                <b>{name(l.borrower)}</b> owes you ${l.repay}
              </>
            )}{' '}
            <span className="muted small">in {l.turnsLeft} turns</span>
          </span>
          {l.borrower === me && (
            <button className="btn small" disabled={mine.cash < l.repay} onClick={() => send({ type: 'repayLoan', id: l.id })}>
              Repay
            </button>
          )}
        </div>
      ))}
      {immunities.map((im) => (
        <div key={im.id} className="deal">
          <ShieldCheck size={16} />
          <span>
            {im.holder === me ? 'You skip rent on ' : `${name(im.holder)} skips rent on `}
            {im.tiles.map((t) => map.tiles[t].name).join(', ')} <span className="muted small">· {im.turnsLeft} turns</span>
          </span>
        </div>
      ))}
      {myShares.map(([g, n]) => (
        <div key={g} className="deal">
          <span>
            {n} share{n > 1 ? 's' : ''} in <b>{map.groups[g].name}</b>
          </span>
        </div>
      ))}
      {s.bankLoans && (
        <div className="deal bank">
          <Landmark size={16} />
          <span>
            Bank loan <b>${mine.bankLoan}</b> <span className="muted small">· ${Math.max(0, room)} available</span>
          </span>
          <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Loan amount">
            {[50, 100, 200, 300, 500].map((v) => (
              <option key={v} value={v}>
                ${v}
              </option>
            ))}
          </select>
          <button className="btn small" disabled={room < amount} onClick={() => send({ type: 'bankBorrow', amount })}>
            Borrow
          </button>
          <button
            className="btn small"
            disabled={mine.bankLoan === 0 || mine.cash < Math.min(amount, mine.bankLoan)}
            onClick={() => send({ type: 'bankRepay', amount })}
          >
            Repay
          </button>
        </div>
      )}
      {specialOn(state, 'pk.ups') && (
        <div className="deal">
          <span>🔋</span>
          <span>
            {(state.special.ups[me] ?? 0) > 0 ? (
              <>
                UPS running · <b>{state.special.ups[me]} turns</b>
              </>
            ) : (
              <>UPS keeps your cities earning through load-shedding for 5 turns</>
            )}
          </span>
          {!(state.special.ups[me] > 0) && (
            <button className="btn small" disabled={mine.cash < 150} onClick={() => send({ type: 'buyUps' })}>
              Buy $150
            </button>
          )}
        </div>
      )}
      {s.insurance && (
        <div className="deal">
          <Shield size={16} />
          <span>
            {mine.insuredTurns > 0 ? (
              <>
                Insured · <b>{mine.insuredTurns} turns</b> left
              </>
            ) : (
              <>Half of rents over $100 covered for {INSURANCE_TURNS} turns</>
            )}
          </span>
          {mine.insuredTurns === 0 && (
            <button
              className="btn small"
              disabled={!myTurn || mine.cash < INSURANCE_COST}
              title={!myTurn ? 'Only on your turn' : ''}
              onClick={() => send({ type: 'buyInsurance' })}
            >
              Buy ${INSURANCE_COST}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
