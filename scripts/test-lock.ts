// ---------------------------------------------------------------------------
// Locking — the layer the pointer walks past.
//
//   node --experimental-strip-types scripts/test-lock.ts
//
// Two halves, matching the two halves of the feature. The pickers are what
// stop a locked layer being offered to the selection in the first place; the
// filter in lib/selection is what stops it sneaking in by any other door. The
// store composes the pair, and everything a store action can do to a node —
// move, resize, delete, nudge, align, flip — it does to the selection, so
// these two are the whole rule.
//
// Both files are pure, so this runs with no bundler and no browser.
// ---------------------------------------------------------------------------

import { hitsPoint, pickAt, pickInRect, pickSoftAt } from "../lib/canvas/hit-test.ts"
import { isLocked, lockedIds, selectable } from "../lib/selection.ts"
import type { SquigNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

/** A filled rectangle — solid to the pointer everywhere inside it. */
function rect(id: string, x: number, y: number, w: number, h: number, locked?: boolean): SquigNode {
  return { id, type: "shape", shape: "rect", x, y, w, h, fill: "strong", seed: 1, locked }
}

/** An unfilled one — see-through in the middle, which is pickSoftAt's business. */
function hollow(id: string, x: number, y: number, w: number, h: number, locked?: boolean): SquigNode {
  return { id, type: "shape", shape: "rect", x, y, w, h, fill: "none", seed: 1, locked }
}

function doc(list: SquigNode[]): { nodes: Record<string, SquigNode>; order: string[] } {
  return { nodes: Object.fromEntries(list.map((n) => [n.id, n])), order: list.map((n) => n.id) }
}

// -- the flag ----------------------------------------------------------------

check("an ordinary layer is loose", !isLocked(rect("a", 0, 0, 10, 10)))
check("the flag reads as locked", isLocked(rect("a", 0, 0, 10, 10, true)))
check("nothing at all isn't locked", !isLocked(undefined) && !isLocked(null))

// -- point picking -----------------------------------------------------------

{
  // one locked sheet with a loose box sitting on top of it, both under (50,50)
  const { nodes, order } = doc([rect("bg", 0, 0, 200, 200, true), rect("box", 40, 40, 40, 40)])

  check("a locked layer is still geometrically under the point", hitsPoint(nodes.bg, 150, 150, 1))
  check("…but a click there finds nothing", pickAt(nodes, order, 150, 150, 1) === null)
  check("the loose box on top is picked as usual", pickAt(nodes, order, 50, 50, 1) === "box")

  // the whole reason the lock is survivable: the right button still reaches it
  check("the right button reaches the locked layer", pickAt(nodes, order, 150, 150, 1, { locked: true }) === "bg")
  check(
    "…and still prefers whatever is in front of it",
    pickAt(nodes, order, 50, 50, 1, { locked: true }) === "box"
  )
}

{
  // locking the front layer hands the click to the one behind — a locked
  // screenshot stops swallowing presses meant for the wireframe under it
  const { nodes, order } = doc([rect("under", 0, 0, 100, 100), rect("over", 0, 0, 100, 100, true)])
  check("a click passes through the locked layer to what's behind", pickAt(nodes, order, 50, 50, 1) === "under")
}

// -- the marquee -------------------------------------------------------------

{
  const { nodes, order } = doc([rect("bg", 0, 0, 200, 200, true), rect("a", 10, 10, 20, 20), rect("b", 60, 60, 20, 20)])
  const hits = pickInRect(nodes, order, { x: -10, y: -10, w: 300, h: 300 }, 1)
  check("a marquee over everything sweeps up only the loose ones", hits.join(",") === "a,b", hits.join(","))
  const all = pickInRect(nodes, order, { x: -10, y: -10, w: 300, h: 300 }, 1, { locked: true })
  check("…and can be told to take the lot", all.join(",") === "bg,a,b", all.join(","))
}

// -- the click-inside-a-hollow-shape fallback --------------------------------

{
  const { nodes, order } = doc([hollow("frame", 0, 0, 200, 200, true)])
  check("a click in a locked hollow shape's middle finds nothing", pickSoftAt(nodes, order, 100, 100) === null)
  check(
    "…and the right button finds it there too",
    pickSoftAt(nodes, order, 100, 100, { locked: true }) === "frame"
  )
}

// -- the selection filter ----------------------------------------------------

{
  const { nodes, order } = doc([rect("bg", 0, 0, 200, 200, true), rect("a", 10, 10, 20, 20), rect("b", 60, 60, 20, 20)])

  // select all, invert, same-kind and Tab all end in this filter, and so does
  // every group expansion — a locked member simply isn't part of the set
  check("select-all leaves the locked layer behind", selectable(order, nodes).join(",") === "a,b")
  check("asking for it by name doesn't help", selectable(["bg"], nodes).length === 0)
  check("ids that aren't in the document drop out too", selectable(["a", "ghost"], nodes).join(",") === "a")

  // delete, nudge, align, flip and drag all read the selection and nothing
  // else, so a selection that can't hold it is a locked layer that survives
  // all five — this is the one assertion the whole feature rests on
  const doomed = selectable(order, nodes)
  check("what delete would take never includes it", !doomed.includes("bg"))

  check("and it can always be found again", lockedIds(nodes, order).join(",") === "bg")
  check("a board with nothing locked reports nothing", lockedIds(doc([rect("a", 0, 0, 1, 1)]).nodes, ["a"]).length === 0)
}

{
  // lockedIds answers in document order, because "Unlock all" hands them back
  // as a selection and every other selection in squig is in that order
  const { nodes, order } = doc([rect("a", 0, 0, 1, 1, true), rect("b", 0, 0, 1, 1), rect("c", 0, 0, 1, 1, true)])
  check("locked layers come back in document order", lockedIds(nodes, order).join(",") === "a,c")
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} lock checks passed`)
