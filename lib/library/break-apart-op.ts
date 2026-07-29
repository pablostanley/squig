// ---------------------------------------------------------------------------
// Break apart, as a document operation rather than a button handler — the
// inspector and the context menu both need exactly this, and drifting copies
// of it would be two different undo stories.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import type { ComponentNode, SquigNode } from "@/lib/types"
import { breakApart } from "./break-apart"

/**
 * Icons come back out of `breakApart` as icon components, because a glyph has
 * no primitive equivalent. Offering to break one is offering a no-op.
 */
export function canBreakApart(n: SquigNode): n is ComponentNode {
  return n.type === "component" && n.kind !== "icon"
}

/** A template can emit hundreds of nodes; a selection of them, thousands. */
const PIECE_CEILING = 4000

/**
 * Replace each component with its primitives, in one undo step.
 *
 * The actual swap goes through the store's `replaceNodes`, which keeps each
 * component's place in the z-order, takes a single checkpoint, and — the part
 * a raw `setState` here quietly skipped — schedules the save, so the result
 * survives a reload.
 */
export function breakApartAll(ids: string[]): void {
  const s = useSquig.getState()
  const targets = ids.map((id) => s.nodes[id]).filter(canBreakApart)
  if (!targets.length) return

  const insert: Record<string, SquigNode[]> = {}
  let total = 0
  for (const c of targets) {
    const out = breakApart(c)
    total += out.length
    if (total > PIECE_CEILING) break
    insert[c.id] = out
  }
  if (!Object.keys(insert).length) return

  // whatever wasn't a component stays selected alongside the new pieces
  const untouched = s.selection.filter((id) => !insert[id] && s.nodes[id])
  const produced = Object.values(insert).flatMap((parts) => parts.map((p) => p.id))

  useSquig.getState().replaceNodes({
    remove: [],
    insert,
    select: [...produced, ...untouched],
  })
}
