import { routesFrom } from '../../shared/board';
import { mapOf, maxBuildings, rentTable } from '../../shared/engine';
import type { PublicState, Tile } from '../../shared/types';

export const RENT_LABELS = ['Rent', 'With 1 house', 'With 2 houses', 'With 3 houses', 'With 4 houses', 'With a hotel', 'With a skyscraper', 'With a landmark'];

export const KIND_LABELS: Partial<Record<Tile['kind'], string>> = {
  airport: 'Airport',
  utility: 'Utility',
  port: 'Shipping port',
  toll: 'Motorway toll plaza',
  stadium: 'Cricket stadium',
};

/** Rent rows and a note for any buyable tile, shared by the deed and the hover card. */
export function rentInfo(state: PublicState, tile: Tile): { rows: [string, string][]; note?: string; label: string } {
  const map = mapOf(state);
  if (tile.kind === 'property') {
    return {
      label: tile.group ? map.groups[tile.group].name : 'City',
      rows: rentTable(tile)
        .slice(0, maxBuildings(state) + 1)
        .map((r, i) => [RENT_LABELS[i] + (i === 0 ? ' (x2 with full set)' : ''), `$${r}`]),
    };
  }
  if (tile.kind === 'airport') {
    if (map.id === 'world') {
      const routes = routesFrom(map, tile.index);
      return {
        label: 'Airport',
        rows: [0, 1, 2].map((n) => [`Owner also runs ${n} of its routes`, `$${40 + 60 * n}`]),
        note: `Routes: ${routes.map((r) => map.tiles[r.to].name).join(', ')}`,
      };
    }
    const table =
      map.id === 'europe' ? [25, 50, 100, 150, 200, 250] : map.id === 'pakistan' ? [50, 125] : [25, 50, 100, 200];
    const noun = map.id === 'europe' ? 'station' : 'airport';
    const line = routesFrom(map, tile.index)[0];
    return {
      label: map.id === 'europe' ? 'Station' : 'Airport',
      rows: table.map((r, i) => [`Owner has ${i + 1} ${noun}${i ? 's' : ''}`, `$${r}`]),
      note: line ? `${line.route.name} to ${map.tiles[line.to].name}` : undefined,
    };
  }
  if (tile.kind === 'utility') return { label: 'Utility', rows: [], note: 'Rent is 4x the dice roll, or 10x if the owner has both utilities.' };
  if (tile.kind === 'port')
    return {
      label: 'Shipping port',
      rows: [
        ['Base', '$25'],
        ['Per city the owner holds on this side', '+$20'],
        ['Owner has both ports', 'x2'],
      ],
    };
  if (tile.kind === 'toll')
    return {
      label: 'Motorway toll plaza',
      rows: [
        ['Driving past', '$20 ($40 with both)'],
        ['Stopping here', '$40 ($80 with both)'],
      ],
      note: 'Land here to take the motorway across the country.',
    };
  if (tile.kind === 'stadium')
    return {
      label: 'Cricket stadium',
      rows: [
        ['Normal day', '$15 per stadium owned'],
        ['Match day', '$120 per stadium owned'],
      ],
    };
  return { label: tile.name, rows: [] };
}
