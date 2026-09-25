// Dev helper: join a room as a spectator and print what arrives. usage: node scripts/spectate.mjs <roomCode>
import { io } from 'socket.io-client';

const [code, url = 'http://localhost:5173'] = process.argv.slice(2);
const s = io(url, { transports: ['websocket'] });
s.on('connect', () =>
  s.emit('room:join', { code, name: 'Watcher', spectate: true }, (res) => {
    console.log('join', JSON.stringify(res));
    s.emit('game:action', { type: 'roll' }, (r) => {
      console.log('spectator roll ->', JSON.stringify(r));
      setTimeout(() => process.exit(0), 300);
    });
  }),
);
s.on('state', ({ state }) => console.log('state phase', state.phase, 'players', state.players.length));
s.on('meta', (m) => console.log('meta spectators', JSON.stringify(m.spectators)));
setTimeout(() => process.exit(1), 5000);
