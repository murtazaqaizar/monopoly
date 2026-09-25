// Dev helper: a dumb player that joins a room and plays its turns.
// usage: node scripts/bot.mjs <roomCode> [name] [serverUrl]
import { io } from 'socket.io-client';

const [code, name = 'Bot', url = 'http://localhost:5173'] = process.argv.slice(2);
if (!code) {
  console.log('usage: node scripts/bot.mjs <roomCode> [name] [serverUrl]');
  process.exit(1);
}

const s = io(url, { transports: ['websocket'] });
let me = null;
let busy = false;

const act = (action) =>
  new Promise((resolve) =>
    s.emit('game:action', action, (res) => {
      if (!res.ok) console.log(`${action.type}: ${res.error}`);
      resolve(res.ok);
    }),
  );

s.on('connect', () =>
  s.emit('room:join', { code, name, color: '#22c55e' }, (res) => {
    if (!res.ok) {
      console.log('join failed:', res.error);
      process.exit(1);
    }
    me = res.playerId;
    console.log(`${name} joined ${code}`);
  }),
);

let latest = null;
s.on('state', ({ state }) => {
  latest = state;
  play();
});

// state can arrive while an action is in flight, so always act on the newest one
async function play() {
  if (busy) return;
  busy = true;
  while (latest) {
    const state = latest;
    const p = state.players.find((x) => x.id === me);
    const turn = state.turn;
    // accept anything offered to the bot, so deals can be tested solo
    const offer = state.offers?.find((o) => o.to === me);
    if (offer) {
      (await act({ type: 'respondOffer', id: offer.id, accept: true })) || (await act({ type: 'respondOffer', id: offer.id, accept: false }));
      if (latest === state) break;
      continue;
    }
    if (!me || state.phase !== 'playing' || !p || p.bankrupt) break;
    // always collect rent we're owed (Owner must call rent)
    const claim = state.rentClaims?.find((c) => c.owner === me);
    if (claim) {
      await act({ type: 'collectRent', id: claim.id });
      if (latest === state) break;
      continue;
    }
    if (turn.playerId !== me || state.auction) break;
    await new Promise((r) => setTimeout(r, 700));
    if (latest !== state) continue;
    if (p.cash < 0) await act({ type: 'bankrupt' });
    else if (turn.stage === 'roll') await act({ type: 'roll' });
    else if (turn.stage === 'buy') (await act({ type: 'buy' })) || (await act({ type: 'decline' }));
    else if (['sabotage', 'stocks', 'minigame'].includes(turn.stage)) await act({ type: 'skipSpecial' });
    else if (turn.stage === 'bus') await act({ type: 'busChoice', pick: 2 });
    else if (turn.stage === 'travel') await act({ type: 'skipSpecial' });
    else if (turn.stage === 'bribe') await act({ type: 'bribe', offer: Math.random() < 0.5 });
    else if (turn.stage === 'teleport') await act({ type: 'teleportTo', tile: (p.position + 5) % state.size });
    else if (turn.stage === 'end') await act({ type: 'endTurn' });
    if (latest === state) break;
  }
  busy = false;
}
