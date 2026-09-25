import { useCallback, useEffect, useRef, useState } from 'react';
import { ProfileForm } from '../components/ProfileForm';
import { Logo, Table } from '../components/Table';
import { clearState, joinRoom, loadSeat, navigate, saveSeat, socket, useConnected, useSnapshot } from '../net';

type Status =
  | { kind: 'joining' }
  | { kind: 'need-name'; started: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'in'; playerId: string | null };

export function Room({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'joining' });
  const [busy, setBusy] = useState(false);
  const { state } = useSnapshot();
  const connected = useConnected();
  // spectators re-join by name after a reconnect
  const spectatorName = useRef<string | null>(null);

  const rejoin = useCallback(async () => {
    const seat = loadSeat(code);
    const res = spectatorName.current
      ? await joinRoom({ code, name: spectatorName.current, spectate: true })
      : await joinRoom({ code, token: seat?.token });
    if (res.ok) return setStatus({ kind: 'in', playerId: res.spectator ? null : res.playerId! });
    if (res.error === 'need-name') return setStatus({ kind: 'need-name', started: false });
    if (res.error === 'need-name-spectate') return setStatus({ kind: 'need-name', started: true });
    setStatus({ kind: 'error', message: res.error });
  }, [code]);

  useEffect(() => {
    clearState();
    rejoin();
    socket.on('connect', rejoin);
    return () => {
      socket.off('connect', rejoin);
    };
  }, [rejoin]);

  if (status.kind === 'error') {
    return (
      <main className="home">
        <div className="home-card">
          <h2>{status.message}</h2>
          <button className="btn primary" onClick={() => navigate('/')}>
            Back to start
          </button>
        </div>
      </main>
    );
  }

  if (status.kind === 'need-name') {
    return (
      <main className="home">
        <div className="home-card">
          <h1>
            <Logo />
          </h1>
          <p className="tagline">
            {status.started ? `The game in room ${code} has already started. You can watch it live.` : `You've been invited to room ${code}.`}
          </p>
          <ProfileForm
            submitLabel={status.started ? 'Watch the game' : 'Join room'}
            busy={busy}
            onSubmit={async (p) => {
              setBusy(true);
              const res = await joinRoom({ code, name: p.name, color: p.color, spectate: status.started });
              setBusy(false);
              if (!res.ok) return setStatus({ kind: 'error', message: res.error.startsWith('need-name') ? 'Pick a nickname' : res.error });
              if (res.spectator) {
                spectatorName.current = p.name;
                return setStatus({ kind: 'in', playerId: null });
              }
              saveSeat(code, { token: res.token!, playerId: res.playerId! });
              setStatus({ kind: 'in', playerId: res.playerId! });
            }}
          />
          {!status.started && (
            <button
              className="btn ghost"
              onClick={async () => {
                const name = prompt('Your name while watching?')?.trim();
                if (!name) return;
                const res = await joinRoom({ code, name, spectate: true });
                if (res.ok) {
                  spectatorName.current = name;
                  setStatus({ kind: 'in', playerId: null });
                }
              }}
            >
              Just watch
            </button>
          )}
        </div>
      </main>
    );
  }

  if (status.kind === 'joining' || !state || state.code !== code) {
    return <div className="center-note">Connecting…</div>;
  }

  return (
    <>
      {!connected && <div className="offline-bar">Connection lost. Reconnecting…</div>}
      <Table state={state} me={status.playerId} />
    </>
  );
}
