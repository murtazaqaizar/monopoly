import type { Player } from '../../shared/types';

/** Glossy round token: the player's colour with their initial. */
export function Avatar({ player, size }: { player: Pick<Player, 'name' | 'color'>; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ ['--c' as string]: player.color, ...(size ? { width: size, height: size, fontSize: size * 0.45 } : {}) }}
    >
      {player.name[0]?.toUpperCase()}
    </span>
  );
}
