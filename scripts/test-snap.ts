// ---------------------------------------------------------------------------
// Smart-guide geometry checks.
//
// The snap engine is pure screen-space math, so these exercise the interaction
// rules without a browser or a test framework.
// ---------------------------------------------------------------------------

import { computeResizeSnap, computeSnap, makeSnapRect } from "../lib/canvas/snap-engine.ts"

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail = "") {
  if (condition) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

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

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const failure of failures) console.error("  ✗ " + failure)
  process.exit(1)
}
console.log(`✓ ${passed} smart-guide checks passed`)
