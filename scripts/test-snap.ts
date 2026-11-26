// ---------------------------------------------------------------------------
// Smart-guide geometry checks.
//
// The snap engine is pure screen-space math, so these exercise the interaction
// rules without a browser or a test framework.
// ---------------------------------------------------------------------------

import { computeResizeSnap, computeSnap, makeSnapRect } from "../lib/canvas/snap-engine.ts"
import { check, report } from "./harness.ts"

const rect = (id: string, x: number, y: number, w = 40, h = 40) => makeSnapRect(id, x, y, w, h)

// -- ordinary alignment ----------------------------------------------------

{
  const snap = computeSnap(rect("drag", 97, 10, 20, 20), [rect("target", 0, 0, 100, 40)], 6)
  check("a nearby edge snaps exactly onto its target", snap.dx === 3)
  check("edge alignment emits the matching vertical guide", snap.guides.some((g) => g.axis === "x" && g.position === 100))
}

{
  const snap = computeSnap(rect("drag", 39, 80, 20, 20), [rect("target", 0, 0, 100, 40)], 6)
  check("centres participate in snapping", snap.dx === 1)
  check("a target outside the magnetic zone is left alone", computeSnap(rect("far", 70, 80, 20, 20), [rect("target", 0, 0, 100, 40)], 6).dx === 0)
}

{
  const row = Array.from({ length: 256 }, (_, index) => rect(`row-${index}`, 100, index * 10))
  const duplicate = rect("row-0", 100, -500)
  const snap = computeSnap(rect("drag", 96, 48, 8, 8), [...row, duplicate], 6)
  const guide = snap.guides.find((g) => g.axis === "x" && g.position === 100)
  check("a crowded alignment extends across all unique matches using the first rectangle for each id",
    snap.dx === 0 && guide?.start === 0 && guide.end === 2590)
}

{
  const drag = rect("drag", 100, 85, 30, 20)
  const before = rect("before", 98, -40, 50, 20)
  const after = rect("after", 102, 160, 80, 20)
  check("equal and opposite alignment deltas still prefer the first candidate",
    computeSnap(drag, [before, after], 3).dx === -2 && computeSnap(drag, [after, before], 3).dx === 2)
}

// -- equal-spacing insertion ----------------------------------------------

{
  const candidates = [rect("a", 0, 0), rect("b", 160, 0)]
  const snap = computeSnap(rect("drag", 78, 0), candidates, 6)
  check("an item snaps midway between two neighbours", snap.dx === 2)
  check(
    "midpoint snapping reports both equal gaps",
    snap.distances.length === 2 && snap.distances.every((d) => d.axis === "x" && d.distance === 40),
    JSON.stringify(snap.distances)
  )
}

// -- equal-spacing extension ----------------------------------------------

{
  const candidates = [rect("a", 0, 0), rect("b", 80, 0)]
  const snap = computeSnap(rect("drag", 158, 0), candidates, 6)
  check("an existing horizontal rhythm extends after the pair", snap.dx === 2)
  check("the extension shows both repeated gaps", snap.distances.length === 2 && snap.distances.every((d) => d.distance === 40))
}

{
  const candidates = [rect("a", 0, 0), rect("b", 0, 80)]
  const snap = computeSnap(rect("drag", 0, 158), candidates, 6)
  check("the same spacing rule works vertically", snap.dy === 2)
  check("vertical spacing indicators stay on the y axis", snap.distances.length === 2 && snap.distances.every((d) => d.axis === "y"))
}

{
  const candidates = [rect("a", 0, 0), rect("b", 160, 100)]
  const snap = computeSnap(rect("drag", 78, 0), candidates, 6)
  check("objects in unrelated rows do not create a spacing magnet", snap.dx === 0 && snap.distances.length === 0)
}

{
  const candidates = [rect("a", 0, 0), rect("b", 160, 0)]
  const snap = computeSnap(rect("drag", 78, 0), candidates, 6, undefined, 2)
  check("measurement labels stay in design units at any zoom", snap.distances.every((d) => d.distance === 20))
}

// -- resize stays edge-only ------------------------------------------------

{
  const snap = computeResizeSnap(rect("drag", 0, 0, 97, 40), "e", [rect("target", 100, 0)], 6)
  check("a moving resize edge snaps without shifting the fixed edge", snap.dx === 3 && snap.dy === 0)
  check("resize feedback remains an alignment guide", snap.guides.some((g) => g.axis === "x" && g.position === 100))
}

// ---------------------------------------------------------------------------

report("smart-guide checks passed")
