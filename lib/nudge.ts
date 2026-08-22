// ---------------------------------------------------------------------------
// Keyboard nudge settings shared by moving and resizing.
// ---------------------------------------------------------------------------

export const SMALL_NUDGE = 1
export const DEFAULT_BIG_NUDGE = 10
export const MIN_BIG_NUDGE = 1
export const MAX_BIG_NUDGE = 1000

/** Storage and number fields are both outside the trust boundary. */
export function normalizeBigNudge(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BIG_NUDGE
  return Math.min(MAX_BIG_NUDGE, Math.max(MIN_BIG_NUDGE, Math.round(value)))
}
