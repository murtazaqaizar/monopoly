import type { ReactNode } from 'react';
import {
  ArrowDownUp,
  Banknote,
  Bomb,
  Building2,
  CalendarClock,
  Clock,
  Coins,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Flag,
  Gauge,
  Gavel,
  Gift,
  Hammer,
  HandCoins,
  Handshake,
  HeartPulse,
  Home,
  Landmark,
  LayoutGrid,
  Lock,
  MessageSquare,
  Percent,
  PiggyBank,
  Receipt,
  Scale,
  Shield,
  ShieldCheck,
  Shuffle,
  Siren,
  Snowflake,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  Umbrella,
  UserX,
  Users,
  Vote,
  Wifi,
  Zap,
} from 'lucide-react';
import { boardSizeFor, getMap, MAP_DEFS } from '../../shared/board';
import { PRESETS, SPECIALS, TIME_LIMITS, TURN_TIMERS } from '../../shared/engine';
import type { PublicState, Settings } from '../../shared/types';
import { send } from '../net';
import { GroupMark } from './Mark';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type ChoiceKey = Exclude<keyof Settings, BoolKey | 'mapId'>;

interface SwitchDef {
  kind: 'switch';
  key: BoolKey;
  icon: ReactNode;
  title: string;
  desc: string;
}

interface SelectDef {
  kind: 'select';
  key: ChoiceKey;
  icon: ReactNode;
  title: string;
  desc: string;
  options: [string | number, string][];
  /** only shown when this returns true */
  when?: (s: Settings) => boolean;
}

type Def = SwitchDef | SelectDef;

const sw = (key: BoolKey, icon: ReactNode, title: string, desc: string): SwitchDef => ({ kind: 'switch', key, icon, title, desc });
const sel = (
  key: ChoiceKey,
  icon: ReactNode,
  title: string,
  desc: string,
  options: [string | number, string][],
  when?: (s: Settings) => boolean,
): SelectDef => ({ kind: 'select', key, icon, title, desc, options, when });
const money = (v: number) => [v, `$${v.toLocaleString()}`] as [number, string];
const I = 18;

const SECTIONS: { title: string; rows: Def[] }[] = [
  {
    title: 'Room',
    rows: [
      sel('maxPlayers', <Users size={I} />, 'Maximum players', 'Bigger rooms get a bigger board on Auto', [2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => [v, `${v}`])),
      sel('turnOrder', <ArrowDownUp size={I} />, 'Turn order', 'Who goes first', [
        ['random', 'Random'],
        ['join', 'Join order'],
        ['host', 'Host arranges'],
      ]),
      sw('roomLock', <Lock size={I} />, 'Lock room', 'No new players can join'),
      sw('spectators', <Eye size={I} />, 'Spectators', 'People can watch the game live'),
      sw('spectatorChat', <MessageSquare size={I} />, 'Spectator chat', 'Watchers can post in chat'),
      sel('turnTimer', <Clock size={I} />, 'Turn timer', 'Auto-plays a turn when time runs out', TURN_TIMERS.map((v) => [v, v ? `${v}s` : 'Off'])),
      sel('timeLimit', <CalendarClock size={I} />, 'Time limit', 'Richest player wins when time is up', TIME_LIMITS.map((v) => [v, v ? `${v} min` : 'None'])),
    ],
  },
  {
    title: 'Money',
    rows: [
      sel('startingCash', <Coins size={I} />, 'Starting cash', 'Money each player starts with', [1000, 1500, 2000, 2500, 3000].map(money)),
      sel('startSalary', <Banknote size={I} />, 'Start salary', 'Paid each time you pass Start', [200, 300, 400, 500].map(money)),
      sw('exactStartDouble', <Sparkles size={I} />, 'Double on exact Start', 'Landing right on Start pays double'),
      sel('rentSpeed', <Gauge size={I} />, 'Rent speed', 'Multiplies every rent: shorter or longer games', [
        [0.5, 'x0.5 · relaxed'],
        [1, 'x1 · normal'],
        [1.5, 'x1.5 · fast'],
        [2, 'x2 · blitz'],
      ]),
      sw('jackpot', <Umbrella size={I} />, 'Vacation jackpot', 'Taxes and fines pile up; land on Vacation to win them'),
      sw('idleCashTax', <PiggyBank size={I} />, 'Idle cash tax', 'Cash above 2x starting cash pays 5% of the extra each lap'),
      sel('hiddenCash', <EyeOff size={I} />, 'Hidden cash', 'Poker-style: hide other balances', [
        ['off', 'Off'],
        ['ranges', 'Ranges'],
        ['hidden', 'Hidden'],
      ]),
      sw('upkeep', <Hammer size={I} />, 'Upkeep', 'Each lap pay $10/house, $40/hotel, $80/tower'),
      sw('bankReserve', <Landmark size={I} />, 'Bank reserve', 'Bank holds $5k per player; when it runs dry, Start pays nothing'),
      sw('bankLoans', <Landmark size={I} />, 'Bank loans', 'Borrow up to half your starting cash; 10% interest each lap'),
      sw('playerLoans', <HandCoins size={I} />, 'Player loans', 'Lend to each other; repaid automatically'),
    ],
  },
  {
    title: 'Buildings',
    rows: [
      sw('doubleRentSet', <Coins size={I} />, 'x2 rent on full sets', 'Owning a whole set doubles its base rent'),
      sel('mortgages', <Receipt size={I} />, 'Mortgages', 'Borrow against a city', [
        ['on', 'On'],
        ['interest', 'On + 5% per lap'],
        ['off', 'Off'],
      ]),
      sw('evenBuild', <Scale size={I} />, 'Even building', 'Build and sell evenly across a set'),
      sel('buildingStock', <Home size={I} />, 'Building shortage', 'Limit houses and hotels in the bank', [
        ['unlimited', 'Unlimited'],
        ['classic', 'Classic (32/12)'],
        ['tight', 'Tight'],
        ['scarce', 'Scarce'],
      ]),
      sw('firstHouseFree', <Gift size={I} />, 'First house free', 'Completing a set gives a free house'),
      sw('megaBuildings', <Building2 size={I} />, 'Skyscrapers & landmarks', 'Two building tiers past the hotel'),
    ],
  },
  {
    title: 'Auctions & trading',
    rows: [
      sw('auctions', <Gavel size={I} />, 'Auctions', 'A skipped city goes to the highest bidder'),
      sel('auctionTimer', <Timer size={I} />, 'Auction timer', 'Seconds added after each bid', [5, 10, 20].map((v) => [v, `${v}s`]), (s) => s.auctions),
      sel('auctionOpening', <Coins size={I} />, 'Opening bid', 'Lowest first bid', [
        ['one', '$1'],
        ['half', '50% of price'],
      ], (s) => s.auctions),
      sel('auctionMode', <EyeOff size={I} />, 'Auction style', 'Sealed: one secret bid, winner pays 2nd price +$1', [
        ['open', 'Open'],
        ['sealed', 'Sealed'],
      ], (s) => s.auctions),
      sel('tradeFreeze', <Snowflake size={I} />, 'Trade freeze', 'No trades in the opening rounds', [
        [0, 'None'],
        [1, '1 round'],
        [2, '2 rounds'],
        [3, '3 rounds'],
      ]),
      sw('offersOnTurnOnly', <Clock size={I} />, 'Offers on your turn only', 'Cuts offer spam in big rooms'),
      sw('tradeVeto', <Vote size={I} />, 'Trade veto', 'Other players get 10s to veto a trade by majority'),
      sel('cityCap', <LayoutGrid size={I} />, 'City cap', 'Most cities one player may own', [
        [0, 'None'],
        [6, '6'],
        [8, '8'],
        [10, '10'],
      ]),
      sw('immunity', <ShieldCheck size={I} />, 'Rent immunity deals', 'Trade "no rent on my cities for N turns"'),
      sw('alliances', <Handshake size={I} />, 'Alliances', 'Allies pay no rent to each other, until one betrays'),
    ],
  },
  {
    title: 'Prison, dice & cards',
    rows: [
      sel('jailFine', <Siren size={I} />, 'Prison fine', 'Cost to walk out', [50, 100, 200].map(money)),
      sel('jailTries', <Dices size={I} />, 'Tries for doubles', 'Rolls in Prison before you must pay', [1, 2, 3].map((v) => [v, `${v}`])),
      sw('tripleDoublesJail', <Siren size={I} />, 'Three doubles = Prison', 'Rolling doubles three times sends you to Prison'),
      sw('noRentInJail', <Lock size={I} />, 'No rent while in Prison', "Owners in Prison don't collect"),
      sw('speedDie', <Zap size={I} />, 'Speed die', 'Third die after lap 1: numbers, Bus, Rocket; triples teleport'),
      sw('fairDice', <Shuffle size={I} />, 'Fair dice', 'Every dice combo comes up once per 36 rolls'),
      sel('doublesBonus', <Banknote size={I} />, 'Doubles bonus', 'Cash for rolling doubles', [
        [0, 'Off'],
        [25, '$25'],
        [50, '$50'],
      ]),
      sel('deck', <Sparkles size={I} />, 'Card deck', 'Party: big swings. Chaos: swaps, steals, reverse', [
        ['classic', 'Classic'],
        ['party', 'Party'],
        ['chaos', 'Chaos'],
      ]),
    ],
  },
  {
    title: 'Fairness & flow',
    rows: [
      sw('callRent', <HandCoins size={I} />, 'Owner must call rent', 'Click Collect before the next roll, or miss it'),
      sw('catchUp', <HeartPulse size={I} />, 'Catch-up discount', 'Last place pays 25% less rent'),
      sw('leaderBounty', <Crown size={I} />, 'Leader bounty', 'Leader gets half pay at Start; last place +$100'),
      sel('offline', <Wifi size={I} />, 'Offline players', 'After 30s offline on their turn', [
        ['auto', 'Auto-play'],
        ['skip', 'Skip turn'],
        ['bankrupt', 'Out after 3'],
      ]),
    ],
  },
  {
    title: 'Start & end',
    rows: [
      sel('startingCities', <LayoutGrid size={I} />, 'Starting cities', 'Random cities dealt at start (never a full set)', [0, 1, 2, 3].map((v) => [v, v ? `${v}` : 'None'])),
      sel('bankruptcy', <UserX size={I} />, 'Bankruptcy', 'Where a bankrupt player’s cities go', [
        ['creditor', 'To creditor'],
        ['auction', 'Auction all'],
        ['bank', 'Back to bank'],
      ]),
      sw('secondChance', <HeartPulse size={I} />, 'Second chance', 'First bankruptcy wipes debt and restarts you with $300'),
      sel('winCondition', <Trophy size={I} />, 'Win condition', 'How the game ends', [
        ['last', 'Last standing'],
        ['worth', 'Net worth target'],
        ['sets', 'Full sets'],
      ]),
      sel('winWorth', <Flag size={I} />, 'Net worth target', 'First to reach it wins', [5000, 10000, 20000].map(money), (s) => s.winCondition === 'worth'),
      sel('winSets', <Flag size={I} />, 'Sets to win', 'First to own this many full sets wins', [
        [2, '2 sets'],
        [3, '3 sets'],
      ], (s) => s.winCondition === 'sets'),
    ],
  },
  {
    title: 'Party rules',
    rows: [
      sw('randomEvents', <Sparkles size={I} />, 'Random events', 'Booms, crashes and earthquakes every 3 rounds'),
      sw('powerUps', <Zap size={I} />, 'Power-up cards', 'Pick one up at Start: Shield, Jet, Rent Freeze, Heist'),
      sw('sabotage', <Bomb size={I} />, 'Sabotage tile', 'A Surprise tile lets you freeze or demolish a rival'),
      sw('stockMarket', <TrendingUp size={I} />, 'Stock exchange', 'Buy shares; earn dividends on a set’s rent'),
      sw('insurance', <Shield size={I} />, 'Insurance', '$100 covers half of big rents for 5 turns'),
      sw('miniGames', <Dices size={I} />, 'Arcade', 'A Treasure tile becomes a higher-or-lower game'),
      sw('wealthTax', <Percent size={I} />, 'Wealth tax', 'Taxes charge 5-15% of net worth'),
    ],
  },
];

function Row({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-icon">{icon}</span>
      <span className="set-text">
        <b>{title}</b>
        <small>{desc}</small>
      </span>
      <span className="set-control">{children}</span>
    </div>
  );
}

export function Switch({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

export function SettingsPanel({ state, me }: { state: PublicState; me: string }) {
  const isHost = state.hostId === me;
  const s = state.settings;
  const change = (patch: Partial<Settings>) => send({ type: 'settings', settings: patch });
  const size = boardSizeFor(s.boardSize, state.players.length);
  const cityCount = getMap(s.mapId, size).tiles.filter((t) => t.kind === 'property').length;

  return (
    <section className="panel settings-panel">
      <h2 className="panel-title">Game settings {!isHost && <em>· host only</em>}</h2>

      {isHost && (
        <div className="presets">
          {Object.entries(PRESETS).map(([id, p]) => (
            <button key={id} className="preset" title={p.blurb} onClick={() => change(p.settings)}>
              <b>{p.name}</b>
              <small>{p.blurb}</small>
            </button>
          ))}
        </div>
      )}

      <h3 className="set-section">Board</h3>
      <div className="maps">
        {Object.values(MAP_DEFS).map((m) => {
          const marks = Object.values(getMap(m.id, 40).groups).slice(0, 4);
          return (
            <button key={m.id} className={`map-card${m.id === s.mapId ? ' on' : ''}`} disabled={!isHost} onClick={() => change({ mapId: m.id })}>
              <span className="map-marks">
                {marks.map((g) => (
                  <GroupMark key={g.id} group={g} />
                ))}
              </span>
              <b>{m.name}</b>
              <small>{m.blurb}</small>
            </button>
          );
        })}
      </div>
      <Row icon={<LayoutGrid size={I} />} title="Board size" desc={`Now ${size} tiles · ${cityCount} cities`}>
        <select disabled={!isHost} value={s.boardSize} onChange={(e) => change({ boardSize: e.target.value as Settings['boardSize'] })}>
          <option value="auto">Auto</option>
          <option value="standard">Standard 40</option>
          <option value="large">Large 48</option>
          <option value="mega">Mega 56</option>
        </select>
      </Row>

      <MapSpecials settings={s} isHost={isHost} onChange={change} />

      {SECTIONS.map((sec) => (
        <div key={sec.title}>
          <h3 className="set-section">{sec.title}</h3>
          {sec.rows.map((r) =>
            r.kind === 'switch' ? (
              <Row key={r.key} icon={r.icon} title={r.title} desc={r.desc}>
                <Switch label={r.title} on={s[r.key]} disabled={!isHost} onChange={(v) => change({ [r.key]: v })} />
              </Row>
            ) : r.when && !r.when(s) ? null : (
              <Row key={r.key} icon={r.icon} title={r.title} desc={r.desc}>
                <select
                  disabled={!isHost}
                  value={String(s[r.key])}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const opt = r.options.find(([v]) => String(v) === raw);
                    if (opt) change({ [r.key]: opt[0] });
                  }}
                >
                  {r.options.map(([v, label]) => (
                    <option key={String(v)} value={String(v)}>
                      {label}
                    </option>
                  ))}
                </select>
              </Row>
            ),
          )}
        </div>
      ))}
    </section>
  );
}

/** The chosen map's own rules; every one can be switched off. */
function MapSpecials({ settings, isHost, onChange }: { settings: Settings; isHost: boolean; onChange: (p: Partial<Settings>) => void }) {
  const list = SPECIALS.filter((x) => x.map === settings.mapId);
  if (!list.length) return null;
  const off = new Set(settings.specialsOff);
  const allOn = list.every((x) => !off.has(x.id));
  const setOff = (ids: string[]) => onChange({ specialsOff: ids });
  return (
    <div>
      <h3 className="set-section">Map specials</h3>
      <Row icon={<Sparkles size={I} />} title="All map specials" desc={`${list.filter((x) => !off.has(x.id)).length} of ${list.length} on`}>
        <Switch
          label="All map specials"
          on={allOn}
          disabled={!isHost}
          onChange={(v) => setOff(v ? settings.specialsOff.filter((id) => !list.some((x) => x.id === id)) : [...new Set([...settings.specialsOff, ...list.map((x) => x.id)])])}
        />
      </Row>
      {list.map((x) => (
        <Row key={x.id} icon={<span className="special-icon">{x.icon}</span>} title={x.name} desc={x.desc}>
          <Switch
            label={x.name}
            on={!off.has(x.id)}
            disabled={!isHost}
            onChange={(v) => setOff(v ? settings.specialsOff.filter((id) => id !== x.id) : [...settings.specialsOff, x.id])}
          />
        </Row>
      ))}
    </div>
  );
}
