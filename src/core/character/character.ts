import { newId } from '../ids';
import type { AssetRef, Character } from '../schema/types';
import { defaultPivot } from './pivot';

export const DEFAULT_IDLE = 'breathe';

/** A new character from an image: pivot at its feet, soft shadow, gentle breathing. */
export function createCharacter(
  asset: Pick<AssetRef, 'id' | 'name' | 'opaqueBounds'>,
  name?: string,
): Character {
  return {
    id: newId('ch'),
    name:
      (name ?? asset.name?.replace(/\.[a-z0-9]+$/i, '') ?? 'Character').slice(0, 60) || 'Character',
    assetId: asset.id,
    pivot: defaultPivot(asset.opaqueBounds),
    facing: 'right',
    shadow: { enabled: true, opacity: 0.35, size: 1 },
    idle: { preset: DEFAULT_IDLE, intensity: 1 },
    warp: false,
    poses: [],
  };
}
