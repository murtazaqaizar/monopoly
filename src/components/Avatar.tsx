import { Anchor, Bike, Car, Cat, Crown, Dog, Gem, Ghost, Plane, Rocket, Ship, Star, type LucideIcon } from 'lucide-react';
import type { Player } from '../../shared/types';

const PIECE_ICONS: Record<string, LucideIcon> = {
  car: Car,
  plane: Plane,
  crown: Crown,
  ship: Ship,
  rocket: Rocket,
  cat: Cat,
  dog: Dog,
  gem: Gem,
  anchor: Anchor,
  bike: Bike,
  ghost: Ghost,
  star: Star,
};

export function PieceIcon({ piece, className }: { piece: string; className?: string }) {
  const Icon = PIECE_ICONS[piece] ?? Car;
  return <Icon className={className} strokeWidth={2.4} />;
}

/** Glossy round token: the player's colour with their board piece (or initial as a fallback). */
export function Avatar({ player, size }: { player: Pick<Player, 'name' | 'color'> & { piece?: string }; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ ['--c' as string]: player.color, ...(size ? { width: size, height: size, fontSize: size * 0.45 } : {}) }}
      title={player.name}
    >
      {player.piece && PIECE_ICONS[player.piece] ? <PieceIcon piece={player.piece} className="piece" /> : player.name[0]?.toUpperCase()}
    </span>
  );
}
