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
 * Pieces are spliced in at the component's own place in the z-order, so a
 * broken-apart block doesn't leap in front of everything that used to cover it.
 * Non-component nodes in the selection are left completely alone.
 */
export function breakApartAll(ids: string[]): void {
  const s = useSquig.getState()
  const targets = ids.map((id) => s.nodes[id]).filter(canBreakApart)
  if (!targets.length) return

  const pieces = new Map<string, SquigNode[]>()
  let total = 0
  for (const c of targets) {
    const out = breakApart(c)
    total += out.length
    if (total > PIECE_CEILING) break
    pieces.set(c.id, out)
  }
  if (!pieces.size) return

  const nodes = { ...s.nodes }
  const order: string[] = []
  const produced: string[] = []

  s.checkpoint()

  for (const id of s.order) {
    const parts = pieces.get(id)
    if (!parts) {
      order.push(id)
      continue
    }
    delete nodes[id]
    for (const part of parts) {
      nodes[part.id] = part
      order.push(part.id)
      produced.push(part.id)
    }
  }

  // whatever wasn't a component stays selected alongside the new pieces
  const untouched = s.selection.filter((id) => !pieces.has(id) && nodes[id])

  useSquig.setState({
    nodes,
    order,
    selection: order.filter((id) => produced.includes(id) || untouched.includes(id)),
    editingId: null,
  })
}
