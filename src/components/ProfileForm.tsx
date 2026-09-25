import { useState } from 'react';
import { PIECES, PLAYER_COLORS } from '../../shared/engine';
import { loadProfile, saveProfile, type Profile } from '../net';
import { PieceIcon } from './Avatar';

interface Props {
  submitLabel: string;
  takenColors?: string[];
  busy?: boolean;
  onSubmit: (p: Profile) => void;
}

export function ProfileForm({ submitLabel, takenColors = [], busy, onSubmit }: Props) {
  const saved = loadProfile();
  const firstFree = PLAYER_COLORS.find((c) => !takenColors.includes(c)) ?? PLAYER_COLORS[0];
  const [name, setName] = useState(saved?.name ?? '');
  const [color, setColor] = useState(saved && !takenColors.includes(saved.color) ? saved.color : firstFree);
  const [piece, setPiece] = useState<string>(saved?.piece ?? 'car');

  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const p = { name: name.trim(), color, piece };
        saveProfile(p);
        onSubmit(p);
      }}
    >
      <label className="field">
        <span>Nickname</span>
        <input
          autoFocus
          maxLength={16}
          value={name}
          placeholder="e.g. Murtaza"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="field">
        <span>Token colour</span>
        <div className="swatches">
          {PLAYER_COLORS.map((c) => {
            const taken = takenColors.includes(c);
            return (
              <button
                type="button"
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ background: c }}
                disabled={taken}
                aria-label={taken ? 'Colour taken' : 'Pick colour'}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            );
          })}
        </div>
      </div>
      <div className="field">
        <span>Board piece</span>
        <div className="pieces">
          {PIECES.map((k) => (
            <button
              type="button"
              key={k}
              className={`piece-pick${k === piece ? ' on' : ''}`}
              style={{ ['--c' as string]: color }}
              aria-label={k}
              aria-pressed={k === piece}
              onClick={() => setPiece(k)}
            >
              <PieceIcon piece={k} />
            </button>
          ))}
        </div>
      </div>
      <button className="btn primary big" disabled={!name.trim() || busy}>
        {busy ? 'Connecting…' : submitLabel}
      </button>
    </form>
  );
}
