import { bouncy } from './bouncy';
import { breathe } from './breathe';
import { float } from './float';
import { snooze } from './snooze';
import { sway } from './sway';
import type { IdleMotion } from './types';

export type { IdleMotion, IdleContext } from './types';

/** Idle loops for characters. To add one, create a file in this folder and list it here. */
export const IDLE_MOTIONS: readonly IdleMotion[] = [breathe, float, bouncy, snooze, sway];

const byId = new Map(IDLE_MOTIONS.map((m) => [m.id, m]));

export function getIdleMotion(id: string | undefined | null): IdleMotion | undefined {
  return id ? byId.get(id) : undefined;
}
