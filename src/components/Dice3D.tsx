import { useEffect, useRef, useState } from 'react';

// Cube rotation that brings face n to the front (faces laid out in .die3d CSS).
const FACE: Record<number, [number, number]> = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, spins, delay }: { value: number; spins: number; delay: number }) {
  const [x, y] = FACE[value] ?? FACE[1];
  // each roll adds whole turns so the cube tumbles before landing on the value
  const turn = spins * 720;
  return (
    <div className="die3d-wrap">
      <div
        className="die3d"
        style={{
          transform: `rotateX(${x + turn}deg) rotateY(${y + turn}deg)`,
          transitionDelay: `${delay}ms`,
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <div key={f} className={`face f${f}`}>
            {Array.from({ length: 9 }, (_, k) => (
              <span key={k} className={PIPS[f].includes(k) ? 'pip' : ''} />
            ))}
          </div>
        ))}
      </div>
      <div className="die-shadow" />
    </div>
  );
}

export function Dice3D({ dice, rollId }: { dice: [number, number] | null; rollId: number }) {
  const [spins, setSpins] = useState(0);
  const last = useRef(rollId);
  useEffect(() => {
    if (rollId !== last.current) {
      last.current = rollId;
      setSpins((s) => s + 1);
    }
  }, [rollId]);
  const [a, b] = dice ?? [5, 3];
  return (
    <div className="dice3d">
      <Die value={a} spins={spins} delay={0} />
      <Die value={b} spins={spins} delay={60} />
    </div>
  );
}
