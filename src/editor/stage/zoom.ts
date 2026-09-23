export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Next preset zoom level above/below the current scale. */
export function stepZoom(current: number, dir: 1 | -1): number {
  if (dir > 0)
    return ZOOM_STEPS.find((z) => z > current + 1e-3) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 1e-3) ?? ZOOM_STEPS[0]!;
}
