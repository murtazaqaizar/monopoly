import { useEffect } from 'react';
import { BUILDING_NAMES, buildCost, maxBuildings, mortgageValue, ownsGroup, tileOf, unmortgageCost, mapOf } from '../../shared/engine';
import type { PublicState } from '../../shared/types';
import { send } from '../net';
import { GroupMark } from './Mark';
import { rentInfo } from './rentInfo';

export function PropertyModal({
  state,
  me,
  index,
  onClose,
}: {
  state: PublicState;
  me: string;
  index: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const map = mapOf(state);
  const tile = tileOf(state, index);
  const group = tile.group ? map.groups[tile.group] : null;
  const own = state.properties[index];
  const owner = own ? state.players.find((p) => p.id === own.owner) : null;
  const isMine = own?.owner === me && state.phase === 'playing';
  const myTurn = state.turn?.playerId === me;
  const fullSet = own && tile.group ? ownsGroup(state, own.owner, tile.group) : false;
  const setHasBuildings = group ? group.tiles.some((i) => (state.properties[i]?.houses ?? 0) > 0) : false;
  const info = rentInfo(state, tile);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={tile.name} onClick={(e) => e.stopPropagation()}>
        <header className="deed-head" style={{ background: group?.color ?? '#334155' }}>
          {group && <GroupMark group={group} className="deed-flag" />}
          <small>{info.label}</small>
          <h2>{tile.name}</h2>
        </header>

        <div className="deed-body">
          {info.rows.length > 0 && (
            <table className="rents">
              <tbody>
                {info.rows.map(([label, value], i) => (
                  <tr key={i} className={tile.kind === 'property' && own && !own.mortgaged && own.houses === i ? 'current' : ''}>
                    <td>{label}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {info.note && <p className="muted small">{info.note}</p>}

          <dl className="deed-facts">
            <div>
              <dt>Price</dt>
              <dd>${tile.price}</dd>
            </div>
            {tile.houseCost && (
              <div>
                <dt>Building cost</dt>
                <dd>${tile.houseCost} each</dd>
              </div>
            )}
            <div>
              <dt>Mortgage value</dt>
              <dd>${mortgageValue(tile)}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>
                {owner ? (
                  <>
                    <span className="dot" style={{ background: owner.color }} /> {owner.name}
                    {own?.mortgaged && ' (mortgaged)'}
                    {own?.frozen ? ' (sabotaged)' : ''}
                  </>
                ) : (
                  'For sale'
                )}
              </dd>
            </div>
          </dl>

          {isMine && own && (
            <div className="deed-actions">
              {tile.kind === 'property' && (
                <>
                  <button
                    className="btn primary"
                    disabled={!myTurn || !fullSet || own.houses >= maxBuildings(state) || own.mortgaged}
                    title={!myTurn ? 'Only on your turn' : !fullSet ? `Own all of ${group?.name} first` : ''}
                    onClick={() => send({ type: 'build', tile: index })}
                  >
                    {own.houses >= maxBuildings(state)
                      ? 'Fully built'
                      : `Build ${BUILDING_NAMES[own.houses + 1].replace(/^\d /, '').replace(/s$/, '').toLowerCase()} ($${buildCost(tile, own.houses)})`}
                  </button>
                  <button className="btn" disabled={own.houses === 0} onClick={() => send({ type: 'sellHouse', tile: index })}>
                    Sell building (+${Math.floor(buildCost(tile, Math.max(0, own.houses - 1)) / 2)})
                  </button>
                </>
              )}
              {own.mortgaged ? (
                <button className="btn" disabled={!myTurn} onClick={() => send({ type: 'unmortgage', tile: index })}>
                  Unmortgage (${unmortgageCost(tile)})
                </button>
              ) : (
                <button className="btn" disabled={setHasBuildings} onClick={() => send({ type: 'mortgage', tile: index })}>
                  Mortgage (+${mortgageValue(tile)})
                </button>
              )}
            </div>
          )}
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  );
}
