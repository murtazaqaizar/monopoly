import { useEffect, useState } from 'react';
import { ArrowLeftRight, HandCoins, Handshake, X } from 'lucide-react';
import { MAX_IMMUNITY_TURNS, MAX_LOAN_TURNS, mapOf } from '../../shared/engine';
import type { Player, PublicState, TradeOffer, TradeSide } from '../../shared/types';
import { send } from '../net';
import { Avatar } from './Avatar';
import { GroupMark } from './Mark';

type Tab = 'trade' | 'loan' | 'alliance';

const emptySide = (): TradeSide => ({ cash: 0, tiles: [], jailCards: 0, immunity: null });

export function TradeModal({
  state,
  me,
  target,
  counter,
  onClose,
}: {
  state: PublicState;
  me: string;
  target: string;
  counter?: TradeOffer;
  onClose: () => void;
}) {
  const mine = state.players.find((p) => p.id === me)!;
  const them = state.players.find((p) => p.id === target)!;
  const [tab, setTab] = useState<Tab>('trade');
  // a counter-offer starts from the incoming offer with the sides swapped
  const [give, setGive] = useState<TradeSide>(counter ? counter.get : emptySide());
  const [get, setGet] = useState<TradeSide>(counter ? counter.give : emptySide());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (ok: Promise<boolean>) => {
    setBusy(true);
    const done = await ok;
    setBusy(false);
    if (done) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-label={`Deal with ${them.name}`} onClick={(e) => e.stopPropagation()}>
        <header className="trade-head">
          <Avatar player={mine} size={30} />
          <ArrowLeftRight size={18} className="muted" />
          <Avatar player={them} size={30} />
          <h2>{counter ? `Counter ${them.name}'s offer` : `Deal with ${them.name}`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {!counter && (
          <nav className="tabs">
            <button className={tab === 'trade' ? 'on' : ''} onClick={() => setTab('trade')}>
              <ArrowLeftRight size={15} /> Trade
            </button>
            {state.settings.playerLoans && (
              <button className={tab === 'loan' ? 'on' : ''} onClick={() => setTab('loan')}>
                <HandCoins size={15} /> Loan
              </button>
            )}
            {state.settings.alliances && (
              <button className={tab === 'alliance' ? 'on' : ''} onClick={() => setTab('alliance')}>
                <Handshake size={15} /> Alliance
              </button>
            )}
          </nav>
        )}

        {tab === 'trade' && (
          <>
            <div className="trade-cols">
              <SideEditor state={state} owner={mine} label="You give" side={give} onChange={setGive} />
              <SideEditor state={state} owner={them} label={`${them.name} gives`} side={get} onChange={setGet} />
            </div>
            <footer className="modal-foot">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  submit(send({ type: 'proposeTrade', to: them.id, give, get, counterOf: counter?.id }))
                }
              >
                {counter ? 'Send counter-offer' : 'Send offer'}
              </button>
            </footer>
          </>
        )}

        {tab === 'loan' && <LoanForm state={state} mine={mine} them={them} busy={busy} submit={submit} />}

        {tab === 'alliance' && (
          <div className="alliance-pitch">
            <Handshake size={40} className="gold-ico" />
            <p>
              Allies pay <b>no rent</b> on each other's cities. Either of you can betray the alliance at any time.
            </p>
            <button
              className="btn primary big"
              disabled={busy}
              onClick={() => submit(send({ type: 'proposeAlliance', to: them.id }))}
            >
              Propose alliance
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SideEditor({
  state,
  owner,
  label,
  side,
  onChange,
}: {
  state: PublicState;
  owner: Player;
  label: string;
  side: TradeSide;
  onChange: (s: TradeSide) => void;
}) {
  const map = mapOf(state);
  const owned = map.tiles.filter((t) => state.properties[t.index]?.owner === owner.id);
  const hasBuildings = (group?: string) =>
    !!group && map.groups[group].tiles.some((i) => (state.properties[i]?.houses ?? 0) > 0);
  const toggle = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  // with hidden cash the true balance is unknown; the server checks the real amount
  const maxCash = owner.cashMask ? 5000 : Math.max(0, owner.cash);
  const immunityTiles = side.immunity?.tiles ?? [];

  return (
    <div className="side-editor">
      <h3>
        <Avatar player={owner} size={18} /> {label}
      </h3>

      <label className="cash-field">
        <span>Cash</span>
        <input
          type="range"
          min={0}
          max={maxCash}
          step={10}
          value={Math.min(side.cash, maxCash)}
          onChange={(e) => onChange({ ...side, cash: Number(e.target.value) })}
        />
        <input
          className="cash-num"
          inputMode="numeric"
          value={side.cash}
          aria-label={`${label} cash`}
          onChange={(e) => onChange({ ...side, cash: Math.min(maxCash, Number(e.target.value.replace(/\D/g, '')) || 0) })}
        />
      </label>

      <div className="pick-list">
        {owned.length === 0 && <p className="muted small">No cities</p>}
        {owned.map((t) => {
          const locked = hasBuildings(t.group);
          const on = side.tiles.includes(t.index);
          return (
            <button
              key={t.index}
              className={`pick${on ? ' on' : ''}`}
              disabled={locked}
              title={locked ? 'Sell the buildings in this set first' : ''}
              onClick={() => {
                const tiles = toggle(side.tiles, t.index);
                const im = side.immunity ? { ...side.immunity, tiles: side.immunity.tiles.filter((x) => !tiles.includes(x)) } : null;
                onChange({ ...side, tiles, immunity: im && im.tiles.length ? im : null });
              }}
            >
              <GroupMark group={t.group ? map.groups[t.group] : null} />
              <span>{t.name}</span>
              {state.properties[t.index].mortgaged && <small>mortgaged</small>}
            </button>
          );
        })}
      </div>

      {owner.jailCards > 0 && (
        <label className="inline-field">
          <span>Get-out cards</span>
          <select value={side.jailCards} onChange={(e) => onChange({ ...side, jailCards: Number(e.target.value) })}>
            {Array.from({ length: owner.jailCards + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      {state.settings.immunity && owned.some((t) => !side.tiles.includes(t.index)) && (
        <details className="immunity" open={!!side.immunity}>
          <summary>Rent immunity {side.immunity ? `· ${side.immunity.tiles.length} cities` : ''}</summary>
          <p className="muted small">The other player pays no rent on these for a number of their turns.</p>
          <div className="pick-list compact">
            {owned
              .filter((t) => !side.tiles.includes(t.index))
              .map((t) => (
                <button
                  key={t.index}
                  className={`pick${immunityTiles.includes(t.index) ? ' on' : ''}`}
                  onClick={() => {
                    const tiles = toggle(immunityTiles, t.index);
                    onChange({ ...side, immunity: tiles.length ? { tiles, turns: side.immunity?.turns ?? 3 } : null });
                  }}
                >
                  <GroupMark group={t.group ? map.groups[t.group] : null} />
                  <span>{t.name}</span>
                </button>
              ))}
          </div>
          {side.immunity && (
            <label className="inline-field">
              <span>For</span>
              <select
                value={side.immunity.turns}
                onChange={(e) => onChange({ ...side, immunity: { ...side.immunity!, turns: Number(e.target.value) } })}
              >
                {Array.from({ length: MAX_IMMUNITY_TURNS }, (_, n) => (
                  <option key={n + 1} value={n + 1}>
                    {n + 1} turn{n ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </details>
      )}
    </div>
  );
}

function LoanForm({
  state,
  mine,
  them,
  busy,
  submit,
}: {
  state: PublicState;
  mine: Player;
  them: Player;
  busy: boolean;
  submit: (p: Promise<boolean>) => void;
}) {
  const [lend, setLend] = useState(true);
  const [amount, setAmount] = useState(200);
  const [interest, setInterest] = useState(20);
  const [turns, setTurns] = useState(5);
  const repay = Math.round(amount * (1 + interest / 100));
  const lender = lend ? mine : them;
  void state;

  return (
    <div className="loan-form">
      <div className="seg">
        <button className={lend ? 'on' : ''} onClick={() => setLend(true)}>
          Lend to {them.name}
        </button>
        <button className={!lend ? 'on' : ''} onClick={() => setLend(false)}>
          Borrow from {them.name}
        </button>
      </div>
      <label className="inline-field">
        <span>Amount</span>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
        />
      </label>
      <label className="inline-field">
        <span>Interest</span>
        <select value={interest} onChange={(e) => setInterest(Number(e.target.value))}>
          {[0, 10, 20, 30, 50, 75, 100].map((v) => (
            <option key={v} value={v}>
              {v}%
            </option>
          ))}
        </select>
      </label>
      <label className="inline-field">
        <span>Due after</span>
        <select value={turns} onChange={(e) => setTurns(Number(e.target.value))}>
          {Array.from({ length: MAX_LOAN_TURNS }, (_, n) => (
            <option key={n + 1} value={n + 1}>
              {n + 1} turn{n ? 's' : ''} of the borrower
            </option>
          ))}
        </select>
      </label>
      <p className="loan-summary">
        {lender.name} pays <b>${amount}</b> now · {lend ? them.name : 'you'} repay <b>${repay}</b> automatically after {turns}{' '}
        turn{turns > 1 ? 's' : ''}.
      </p>
      <footer className="modal-foot">
        <button
          className="btn primary"
          disabled={busy || amount < 10 || lender.cash < amount}
          onClick={() => submit(send({ type: 'proposeLoan', to: them.id, lend, amount, repay, turns }))}
        >
          {lender.cash < amount ? `${lender.name} can't afford that` : lend ? 'Offer loan' : 'Ask for loan'}
        </button>
      </footer>
    </div>
  );
}
