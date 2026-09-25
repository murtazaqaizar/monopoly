import { useState } from 'react';
import { ProfileForm } from '../components/ProfileForm';
import { Logo } from '../components/Table';
import { createRoom, navigate, saveSeat, toast } from '../net';

export function Home() {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  return (
    <main className="home">
      <div className="home-card">
        <h1>
          <Logo />
        </h1>
        <p className="tagline">Buy cities, build hotels, bankrupt your friends.</p>
        <ProfileForm
          submitLabel="Create a private room"
          busy={busy}
          onSubmit={async (p) => {
            setBusy(true);
            const res = await createRoom(p.name, p.color);
            setBusy(false);
            if (!res.ok) return toast(res.error);
            saveSeat(res.code!, { token: res.token!, playerId: res.playerId! });
            navigate(`/room/${res.code}`);
          }}
        />
        <form
          className="join-code"
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim().split('/').pop()!.toLowerCase();
            if (c) navigate(`/room/${c}`);
          }}
        >
          <input value={code} placeholder="Have a room code or link?" onChange={(e) => setCode(e.target.value)} />
          <button className="btn" disabled={!code.trim()}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
