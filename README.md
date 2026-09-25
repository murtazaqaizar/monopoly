# Richlands

A Richup-style online property-trading game for playing with friends. Create a room, share the link, play in the browser.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. The Vite client proxies the WebSocket to the game server on port 3001.

To test on your own, create a room and add bots from another terminal:

```bash
node scripts/bot.mjs <roomCode> Bano
```

The bot plays its turns and accepts every offer. `node scripts/spectate.mjs <roomCode>` joins as a spectator.

## How it fits together

- `shared/board.ts` builds each map at 40, 48 or 56 tiles (22, 28 or 36 cities). The 40-tile board uses the classic price table. Bigger boards price their cities by interpolating that table, so rent always rises with price. On Auto, the size is picked by player count: 2–5 players get 40 tiles, 6–8 get 48, 9–10 get 56.
- There are 4 maps: Classic (the default, Richup-style countries, no specials), World Tour, Pakistan and Euro Trip. Each map has its own layout in `shared/board.ts` (a pattern string per side), so the themed maps have different tiles, not renamed ones:
  - World Tour: 6 airports on a flight network (routes drawn across the board), shipping ports, World News headlines, Customs, Duty-Free and Deported corners.
  - Pakistan: 2 airports, motorway toll plazas (drive-past tolls, and a motorway ride between them), stadiums, Committee, Bazaar (with haggling), Shaadi Hall, plot files at the Property Dealer, the Thana (sifarish), Northern Areas trip and the Naka checkpoint.
  - Euro Trip: 6 stations on 3 rail lines, EU borders, floating currencies, museums and a culture prize, a festival, hostels and an EU Parliament whose laws everyone votes on.
- Map rules that can be switched off live in `SPECIALS` in `shared/engine.ts`. They hook into rent (`specialRentFactor`), landing, laps, round starts and timed votes and bets. Map tile effects are in `mapTile` in the same file; `shared/maps.test.ts` covers them.
- `shared/engine.ts` holds every rule, including the 30 general settings (see `DEFAULT_SETTINGS`, `SETTING_CHOICES` and `PRESETS`). It is pure and deterministic (seeded dice), so the server, the tests and the replay viewer all run the same code.
- `server/index.ts` is one Node process with Express and Socket.io. Rooms live in memory. Every change is saved to `.data/rooms.json`, so a restart keeps games going. The server also relays chat, reactions and the voice-call handshake, and records each game's events for replays.
- `src/` is the React client built with Vite.
- `src/sound.ts` synthesises every sound effect with Web Audio, so there are no audio files. The engine records an `fx` entry for each sound-worthy moment (dice, buy, rent, cards, hotel and so on). Each browser plays the new entries in order, and landing sounds wait for the token to finish hopping. The speaker button next to the logo mutes sound or changes the volume.

## Tests

```bash
npm run check
```

This type-checks and runs every engine test. `npm test` runs only the tests. The production build (`npm run build`) skips the type check so hosts don't need the TypeScript compiler.

## Deploy

Deploy it as one long-running Node service (Fly.io, Railway or Render). Vercel won't work, because it can't hold WebSockets open. Pick a Singapore or Mumbai region for players in Pakistan.

```bash
npm run build
npm start
```

`npm start` serves the built client and the game on `$PORT`. `railway.json` already holds these commands for Railway. To keep saved games across deploys, mount a volume at `.data/`.

Voice chat uses free public STUN servers. Players on strict mobile or office networks may also need a TURN server.
