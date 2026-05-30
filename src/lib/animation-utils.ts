/** Stagger step presets (ms) */
export const STAGGER_FAST = 30
export const STAGGER_NORMAL = 40
export const STAGGER_SLOW = 50

/** Maximum delay to prevent long entrance waits (ms) */
const MAX_STAGGER_DELAY = 300

/** Returns a CSS-ready animation delay string for staggered entrances. */
export function staggerDelay(
  index: number,
  step = STAGGER_NORMAL,
  max = MAX_STAGGER_DELAY,
): string {
  return `${Math.min(index * step, max)}ms`
}
