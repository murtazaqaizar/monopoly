import { useState } from 'react';
import { PLAYER_COLORS } from '../../shared/engine';
import { loadProfile, saveProfile, type Profile } from '../net';

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

  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const p = { name: name.trim(), color };
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
      <button className="btn primary big" disabled={!name.trim() || busy}>
        {busy ? 'Connecting…' : submitLabel}
      </button>
    </form>
  );
}
