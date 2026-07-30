// ---------------------------------------------------------------------------
// The step ⌘D repeats — pure.
//
// squig remembers the last copies it made and where each one started, which is
// enough to answer the only question ⌘D really has: how far did you move the
// copy after making it? Repeat that, and an ⌥-drag becomes a stride you can
// walk across the board.
// ---------------------------------------------------------------------------

import type { SquigNode } from "../types"

/** The copies from the last duplicate, and where each of them came from. */
export interface DupTrail {
  ids: string[]
  from: Record<string, { x: number; y: number }>
}

/**
 * The offset to repeat, or null when there is nothing to repeat.
 *
 * The trail only counts while the copies it made are still exactly what's
 * selected: click away, or add a node to the selection, and ⌘D goes back to
 * its own polite nudge. A copy dropped straight back where it came from gives
 * a zero step, which would stack the next one invisibly, so that doesn't
 * count either.
 */
export function repeatStep(
  trail: DupTrail | null,
  selection: string[],
  nodes: Record<string, SquigNode>
): { dx: number; dy: number } | null {
  if (!trail || trail.ids.length !== selection.length) return null
  const sel = new Set(selection)
  if (!trail.ids.every((id) => sel.has(id) && nodes[id])) return null
  // the copies move as one, so any of them measures the same distance
  const head = nodes[trail.ids[0]]
  const origin = trail.from[trail.ids[0]]
  if (!origin) return null
  const dx = head.x - origin.x
  const dy = head.y - origin.y
  return dx === 0 && dy === 0 ? null : { dx, dy }
}
