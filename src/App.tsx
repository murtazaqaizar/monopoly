import { useEffect, useState } from 'react';
import { onToast, usePath } from './net';
import { Home } from './pages/Home';
import { Room } from './pages/Room';

export function App() {
  const path = usePath();
  const match = path.match(/^\/room\/([a-z0-9]+)\/?$/i);
  return (
    <>
      {match ? <Room key={match[1]} code={match[1].toLowerCase()} /> : <Home />}
      <Toasts />
    </>
  );
}

function Toasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(
    () =>
      onToast((msg) => {
        const id = Math.random();
        setItems((xs) => [...xs.slice(-2), { id, msg }]);
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
      }),
    [],
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.msg}
        </div>
      ))}
    </div>
  );
}
