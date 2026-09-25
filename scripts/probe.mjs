// Quick check that the game server answers through the Vite proxy: node scripts/probe.mjs
import { io } from 'socket.io-client';

const s = io(process.argv[2] ?? 'http://localhost:5173', { transports: ['websocket'] });
s.on('connect_error', (e) => {
  console.log('connect_error', e.message);
  process.exit(1);
});
s.on('connect', () =>
  s.emit('room:create', { name: 'Probe', color: '#3b82f6' }, (r) => {
    console.log(JSON.stringify(r));
    process.exit(0);
  }),
);
setTimeout(() => {
  console.log('timeout');
  process.exit(1);
}, 5000);
