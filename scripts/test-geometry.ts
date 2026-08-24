// ---------------------------------------------------------------------------
// Geometry checks for the multi-select transform and hit-test maths.
//
//   node --experimental-strip-types scripts/test-geometry.ts
//
// Both modules under test import only types, so they run standalone with no
// bundler and no test framework.
// ---------------------------------------------------------------------------

import { resizeBounds, resizeNodesBy, scaleNodes, MIN_SIZE, type Handle } from "../lib/canvas/transform.ts"
import { hitsInterior, hitsPoint, hitsRect, pickAt, pickInRect, pickSoftAt, pickTolerance } from "../lib/canvas/hit-test.ts"
import { repeatStep } from "../lib/canvas/duplicate.ts"
import { constrainMoveTo45, constrainSnapToDirection } from "../lib/canvas/move.ts"
import type { SquigNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

function close(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps
}

// -- fixtures ---------------------------------------------------------------

const rect = (id: string, x: number, y: number, w: number, h: number, filled = false): SquigNode => ({
  id,
  type: "shape",
  shape: "rect",
  x,
  y,
  w,
  h,
  fill: filled ? "strong" : "none",
  seed: 1,
})

const ellipse = (id: string, x: number, y: number, w: number, h: number): SquigNode => ({
  id,
  type: "shape",
  shape: "ellipse",
  x,
  y,
  w,
  h,
  fill: "none",
  seed: 1,
})

const arrow = (id: string, x: number, y: number, w: number, h: number): SquigNode => ({
  id,
  type: "arrow",
  x,
  y,
  w,
  h,
  head: true,
  points: [
    [0, 0],
    [w, h],
  ],
  seed: 1,
})

const text = (id: string, x: number, y: number, w: number, h: number, fontSize = 18): SquigNode => ({
  id,
  type: "text",
  x,
  y,
  w,
  h,
  text: "hi",
  fontSize,
  seed: 1,
})

const component = (id: string, x: number, y: number, w: number, h: number): SquigNode => ({
  id,
  type: "component",
  kind: "button",
  props: { label: "Go" },
  x,
  y,
  w,
  h,
  seed: 1,
})

const bounds = (ns: SquigNode[]) => {
  const minX = Math.min(...ns.map((n) => n.x))
  const minY = Math.min(...ns.map((n) => n.y))
  const maxX = Math.max(...ns.map((n) => n.x + n.w))
  const maxY = Math.max(...ns.map((n) => n.y + n.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

const apply = (ns: SquigNode[], patches: Record<string, Partial<SquigNode>>): SquigNode[] =>
  ns.map((n) => ({ ...n, ...patches[n.id] }) as SquigNode)

// -- move constraints -------------------------------------------------------

{
  const still = constrainMoveTo45(0, 0)
  check(
    "shift-move at the origin stays finite and still",
    still.dx === 0 && still.dy === 0 && still.direction.x === 0 && still.direction.y === 0,
    JSON.stringify(still)
  )

  const horizontal = constrainMoveTo45(100, 20)
  check(
    "shift-move locks a near-horizontal drag to 0 degrees",
    close(horizontal.dx, 100) && close(horizontal.dy, 0) && horizontal.direction.x === 1 && horizontal.direction.y === 0,
    JSON.stringify(horizontal)
  )

  const vertical = constrainMoveTo45(-10, -80)
  check(
    "shift-move locks a near-vertical drag to 90 degrees",
    close(vertical.dx, 0) && close(vertical.dy, -80) && vertical.direction.x === 0 && vertical.direction.y === -1,
    JSON.stringify(vertical)
  )

  const diagonal = constrainMoveTo45(50, 40)
  check(
    "shift-move projects onto the nearest 45-degree diagonal",
    close(diagonal.dx, 45) && close(diagonal.dy, 45) && diagonal.direction.x === 1 && diagonal.direction.y === 1,
    JSON.stringify(diagonal)
  )

  const reverseDiagonal = constrainMoveTo45(-60, 40)
  check(
    "all diagonal quadrants keep equal absolute deltas",
    close(reverseDiagonal.dx, -50) && close(reverseDiagonal.dy, 50) && reverseDiagonal.direction.x === -1 && reverseDiagonal.direction.y === 1,
    JSON.stringify(reverseDiagonal)
  )

  const snapped = constrainSnapToDirection(diagonal.direction, { dx: 2, dy: -5 }, { x: true, y: true })
  check(
    "smart guides cannot pull a diagonal move off 45 degrees",
    close(snapped.dx, 2) && close(snapped.dy, 2) && snapped.useX && !snapped.useY,
    JSON.stringify(snapped)
  )

  const verticalSnap = constrainSnapToDirection(vertical.direction, { dx: 1, dy: 3 }, { x: true, y: true })
  check(
    "a vertical lock only accepts vertical travel from smart guides",
    close(verticalSnap.dx, 0) && close(verticalSnap.dy, 3) && !verticalSnap.useX && verticalSnap.useY,
    JSON.stringify(verticalSnap)
  )

  const cornerSnap = constrainSnapToDirection(diagonal.direction, { dx: 3, dy: 3 }, { x: true, y: true })
  check(
    "one diagonal correction can satisfy both smart guides",
    close(cornerSnap.dx, 3) && close(cornerSnap.dy, 3) && cornerSnap.useX && cornerSnap.useY,
    JSON.stringify(cornerSnap)
  )
}

// -- resizeBounds -----------------------------------------------------------

{
  const b = { x: 0, y: 0, w: 100, h: 50 }

  const se = resizeBounds(b, "se", 20, 10)
  check("se grows both axes from the nw anchor", close(se.x, 0) && close(se.y, 0) && close(se.w, 120) && close(se.h, 60))

  const nw = resizeBounds(b, "nw", 20, 10)
  check("nw moves the origin and pins the se corner", close(nw.x, 20) && close(nw.y, 10) && close(nw.w, 80) && close(nw.h, 40))

  const e = resizeBounds(b, "e", 20, 999)
  check("a side handle ignores the perpendicular axis", close(e.h, 50) && close(e.w, 120))

  const aspect = resizeBounds(b, "se", 100, 0, { aspect: true })
  check("aspect lock keeps the starting ratio", close(aspect.w / aspect.h, 2), `${aspect.w}x${aspect.h}`)

  const centre = resizeBounds(b, "e", 20, 0, { fromCenter: true })
  check("alt grows symmetrically about the centre", close(centre.x, -20) && close(centre.w, 140))

  const clampW = resizeBounds(b, "e", -500, 0)
  check("dragging past the anchor clamps instead of flipping", clampW.w === MIN_SIZE && clampW.w > 0)

  const clampNW = resizeBounds(b, "nw", 500, 500)
  check(
    "clamping from nw keeps the far edge pinned",
    close(clampNW.x + clampNW.w, 100) && close(clampNW.y + clampNW.h, 50),
    JSON.stringify(clampNW)
  )

  // the invariant the whole gesture rests on: every frame is computed from the
  // start snapshot, so going out and coming back is lossless
  const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
  let reversible = true
  for (const h of HANDLES) {
    resizeBounds(b, h, 300, -220)
    const back = resizeBounds(b, h, 0, 0)
    if (!close(back.x, b.x) || !close(back.y, b.y) || !close(back.w, b.w) || !close(back.h, b.h)) reversible = false
  }
  check("out-and-back on every handle restores the original box", reversible)

  // dragging a corner back THROUGH the anchor used to mirror the box and start
  // growing it again, because the aspect branch took Math.abs of a negative span
  const past = resizeBounds(b, "se", -350, -350, { aspect: true })
  check(
    "shift+resize past the anchor clamps instead of rebounding",
    past.w === MIN_SIZE && past.h === MIN_SIZE,
    JSON.stringify(past)
  )
  const pastSide = resizeBounds(b, "e", -300, 0, { aspect: true })
  check(
    "shift+resize past the anchor on a side handle clamps too",
    pastSide.w === MIN_SIZE && pastSide.h <= b.h,
    JSON.stringify(pastSide)
  )
  let monotone = true
  let prev = Infinity
  for (const dx of [-40, -80, -120, -200, -300, -400]) {
    const r = resizeBounds(b, "se", dx, dx, { aspect: true })
    if (r.w > prev + 1e-9) monotone = false
    prev = r.w
  }
  check("width never grows again as you keep dragging inward", monotone)
}

// -- scaleNodes -------------------------------------------------------------

{
  const ns = [rect("a", 0, 0, 40, 20), rect("b", 60, 30, 40, 20)]
  const from = bounds(ns)
  const to = { x: 0, y: 0, w: 200, h: 100 }
  const out = apply(ns, scaleNodes(ns, from, to))
  const after = bounds(out)
  check(
    "the resized children exactly refill the target box",
    close(after.x, to.x) && close(after.y, to.y) && close(after.w, to.w) && close(after.h, to.h),
    JSON.stringify(after)
  )
  check("relative layout is preserved", close(out[1].x / out[1].w, ns[1].x / ns[1].w))
}

{
  // a perfectly horizontal arrow has zero height — the classic divide-by-zero
  const flat = [arrow("h", 0, 0, 100, 0)]
  const out = apply(flat, scaleNodes(flat, bounds(flat), { x: 0, y: 0, w: 200, h: 0 }))
  const ok = Number.isFinite(out[0].x) && Number.isFinite(out[0].y) && Number.isFinite(out[0].w) && Number.isFinite(out[0].h)
  check("a zero-height selection scales without producing NaN", ok, JSON.stringify(out[0]))
}

{
  const single = [rect("only", 10, 10, 0, 0)]
  const out = apply(single, scaleNodes(single, bounds(single), { x: 5, y: 5, w: 8, h: 8 }))
  check("a degenerate node still translates to the new origin", close(out[0].x, 5) && close(out[0].y, 5))
}

{
  const t = [text("t", 0, 0, 100, 20, 18)]
  const out = apply(t, scaleNodes(t, bounds(t), { x: 0, y: 0, w: 100, h: 40 })) as [SquigNode & { fontSize: number }]
  check("text size follows the vertical scale", close(out[0].fontSize, 36))

  const wideOnly = apply(t, scaleNodes(t, bounds(t), { x: 0, y: 0, w: 300, h: 20 })) as [SquigNode & { fontSize: number }]
  check("widening alone leaves the type size alone", close(wideOnly[0].fontSize, 18))
}

{
  const a = [arrow("a", 0, 0, 10, 10)]
  const out = apply(a, scaleNodes(a, bounds(a), { x: 0, y: 0, w: 20, h: 40 })) as [SquigNode & { points: number[][] }]
  check("arrow points scale with the box", close(out[0].points[1][0], 20) && close(out[0].points[1][1], 40))
}

// -- keyboard resize nudges -------------------------------------------------

{
  const n = rect("r", 20, 30, 100, 50)
  const wider = apply([n], resizeNodesBy([n], bounds([n]), "width", 1))[0]
  check(
    "a right resize nudge adds exactly one pixel and pins the top-left",
    wider.x === 20 && wider.y === 30 && wider.w === 101 && wider.h === 50,
    JSON.stringify(wider)
  )

  const shorter = apply([n], resizeNodesBy([n], bounds([n]), "height", -1))[0]
  check(
    "an up resize nudge removes exactly one pixel from height",
    shorter.x === 20 && shorter.y === 30 && shorter.w === 100 && shorter.h === 49,
    JSON.stringify(shorter)
  )

  const big = apply([n], resizeNodesBy([n], bounds([n]), "width", 10))[0]
  check("the default big resize nudge adds ten pixels", close(big.w, 110), `${big.w}`)
}

{
  const group = [
    { ...rect("a", 10, 20, 40, 20), groupIds: ["g"] },
    { ...component("b", 70, 20, 40, 20), groupIds: ["g"] },
  ] as SquigNode[]
  const from = bounds(group)
  const resized = apply(group, resizeNodesBy(group, from, "width", 10))
  const after = bounds(resized)
  check(
    "a group resize nudge changes the whole selection width by the requested step",
    after.x === from.x && after.y === from.y && close(after.w, from.w + 10) && after.h === from.h,
    JSON.stringify(after)
  )
  check(
    "group members keep their relative layout while resizing",
    close((resized[1].x - after.x) / after.w, (group[1].x - from.x) / from.w)
  )
}

{
  const n = component("component", 0, 0, 80, 32)
  const taller = apply([n], resizeNodesBy([n], bounds([n]), "height", 10))[0]
  check("a component accepts the big height nudge", taller.w === 80 && taller.h === 42, JSON.stringify(taller))
}

{
  const n = rect("minimum", 0, 0, MIN_SIZE, 20)
  check(
    "a resize nudge at the minimum is a no-op",
    Object.keys(resizeNodesBy([n], bounds([n]), "width", -1)).length === 0
  )
}

{
  const n = text("text", 5, 6, 100, 24)
  const wider = apply([n], resizeNodesBy([n], bounds([n]), "width", 1))[0] as SquigNode & {
    fixedW?: boolean
    fontSize: number
  }
  check(
    "a lone text resize uses its container width without scaling the type",
    wider.x === n.x && wider.y === n.y && wider.w === 101 && wider.fixedW === true && wider.fontSize === 18,
    JSON.stringify(wider)
  )
}

// -- hit testing ------------------------------------------------------------

{
  const hollow = rect("hollow", 0, 0, 400, 300, false)
  const solid = rect("solid", 0, 0, 400, 300, true)

  check("an unfilled rect is transparent in the middle", !hitsPoint(hollow, 200, 150, 1))
  check("an unfilled rect is grabbable on its edge", hitsPoint(hollow, 0, 150, 1))
  check("a filled rect is solid all the way through", hitsPoint(solid, 200, 150, 1))
  check("nothing outside the box registers", !hitsPoint(hollow, 500, 150, 1))

  // the one that makes a real board usable: you can rubber-band inside a big
  // empty rectangle without dragging the rectangle into the selection
  check(
    "a marquee inside an unfilled rect doesn't grab it",
    !hitsRect(hollow, { x: 100, y: 100, w: 50, h: 50 }, 1)
  )
  check("a marquee crossing its outline does grab it", hitsRect(hollow, { x: -10, y: 100, w: 50, h: 50 }, 1))
  check("a marquee inside a filled rect grabs it", hitsRect(solid, { x: 100, y: 100, w: 50, h: 50 }, 1))
}

{
  // the thing this whole collar exists for: aiming at a 1px outline
  const hollow = rect("hollow", 0, 0, 400, 300)
  check("an unfilled rect answers to a click just outside its edge", hitsPoint(hollow, -6, 150, 1))
  check("and to one just inside", hitsPoint(hollow, 6, 150, 1))
  check("but the middle is still see-through", !hitsPoint(hollow, 40, 150, 1))

  // a small shape keeps a see-through core rather than going solid
  const small = rect("small", 0, 0, 30, 30)
  check("a small unfilled rect still has a transparent middle", !hitsPoint(small, 15, 15, 1))
}

{
  const ring = ellipse("ring", 0, 0, 200, 200)
  check("an ellipse is grabbable a few px off its ring", hitsPoint(ring, 100, 6, 1))
  check("an ellipse is hollow in the middle", !hitsPoint(ring, 100, 100, 1))
  check("the corner of an ellipse's box is empty", !hitsPoint(ring, 4, 4, 1))

  // the collar is measured in world units, not in the ellipse's own squashed
  // space — otherwise a wide, flat ellipse answers to clicks a long way past
  // the end of its major axis
  const flat = ellipse("flat", 0, 0, 400, 40)
  check("a squashed ellipse is grabbable at the end of its major axis", hitsPoint(flat, 398, 20, 1))
  check("but not far past it", !hitsPoint(flat, 460, 20, 1))
  check("its flat side is grabbable too", hitsPoint(flat, 200, 44, 1))
}

{
  const diag = arrow("d", 0, 0, 200, 200)
  check("the empty corner of a diagonal arrow's box is not a hit", !hitsPoint(diag, 190, 10, 1))
  check("the arrow's own line is a hit", hitsPoint(diag, 100, 100, 1))
  check(
    "a marquee over the empty corner misses the arrow",
    !hitsRect(diag, { x: 170, y: 5, w: 20, h: 20 }, 1)
  )
  check("a marquee across the line catches it", hitsRect(diag, { x: 90, y: 90, w: 20, h: 20 }, 1))
}

{
  const nodes: Record<string, SquigNode> = {
    back: rect("back", 0, 0, 100, 100, true),
    front: rect("front", 20, 20, 40, 40, true),
  }
  const order = ["back", "front"]
  check("overlapping picks resolve to the topmost node", pickAt(nodes, order, 30, 30, 1) === "front")
  check("outside the front one falls through to the back", pickAt(nodes, order, 90, 90, 1) === "back")
  check("empty space picks nothing", pickAt(nodes, order, 300, 300, 1) === null)
  check(
    "a rect probe returns document order",
    JSON.stringify(pickInRect(nodes, order, { x: -5, y: -5, w: 200, h: 200 }, 1)) === JSON.stringify(order)
  )
}

{
  // the halo has to stay bounded, or at survey zoom every node's collar
  // overlaps its neighbour's and there is no gap left to marquee from
  const n = rect("n", 0, 0, 100, 100, true)
  check("the pick halo stays bounded at very low zoom", !hitsPoint(n, -20, 50, 0.1))
}

{
  // a horizontal arrow is ~2 units tall; clamping its collar to a quarter of
  // that leaves a target nobody can hit
  const flat: SquigNode = {
    id: "flat", type: "arrow", head: true, x: 0, y: 0, w: 300, h: 2,
    points: [[0, 0], [300, 2]], seed: 1,
  }
  check("a near-horizontal arrow is grabbable a few px off its line", hitsPoint(flat, 150, 4, 1))
  check("but not from far away", !hitsPoint(flat, 150, 40, 1))
  check("tolerance for lines ignores their thickness", pickTolerance(1, flat) === pickTolerance(1))
}

// -- soft picking: what a mere click in a hollow middle means ----------------

{
  const hollow = rect("hollow", 0, 0, 400, 300)
  const solid = rect("solid", 0, 0, 400, 300, true)

  check("a hollow rect's middle is a soft target", hitsInterior(hollow, 200, 150))
  check("but nothing outside its box is", !hitsInterior(hollow, 500, 150))
  check("a filled rect is never a soft target — the hard pick already owns it", !hitsInterior(solid, 200, 150))

  const ring = ellipse("ring", 0, 0, 200, 200)
  check("a hollow ellipse's disc is a soft target", hitsInterior(ring, 100, 100))
  check("the empty corner of its box is not", !hitsInterior(ring, 8, 8))

  const doodle: SquigNode = {
    id: "doodle", type: "draw", x: 0, y: 0, w: 100, h: 100,
    points: [[0, 100], [50, 0], [100, 100]], seed: 1,
  }
  check("a doodle's box is a soft target", hitsInterior(doodle, 50, 90))
  check("an arrow's box never is", !hitsInterior(arrow("a", 0, 0, 200, 200), 190, 10))
}

{
  // two hollow rects sharing a middle: the one on top takes the click
  const nodes: Record<string, SquigNode> = {
    below: rect("below", 0, 0, 300, 300),
    above: rect("above", 50, 50, 300, 300),
  }
  const order = ["below", "above"]
  check("overlapping soft picks resolve to the topmost node", pickSoftAt(nodes, order, 150, 150) === "above")
  check("outside the top one falls through to the one below", pickSoftAt(nodes, order, 20, 20) === "below")
  check("empty space soft-picks nothing", pickSoftAt(nodes, order, 500, 500) === null)
}

{
  // a border always beats a hollow middle, even a middle stacked above it:
  // the hard pick answers first and the soft pick is never consulted
  const nodes: Record<string, SquigNode> = {
    small: rect("small", 0, 0, 100, 100),
    big: rect("big", -50, -50, 200, 200),
  }
  // big sits on top of small in z, and its hollow middle covers all of small
  const order = ["small", "big"]
  check("a border below beats a hollow middle above", pickAt(nodes, order, 0, 50, 1) === "small")
  check("where no ink answers, the topmost middle takes it", pickSoftAt(nodes, order, 50, 50) === "big")
}

// -- the step ⌘D repeats ----------------------------------------------------

{
  const byId = (list: SquigNode[]) => Object.fromEntries(list.map((n) => [n.id, n]))

  // a copy dragged 120 to the right and 40 down
  const copy = rect("copy", 120, 40, 40, 20)
  const trail = { ids: ["copy"], from: { copy: { x: 0, y: 0 } } }
  const nodes = byId([rect("src", 0, 0, 40, 20), copy])

  const step = repeatStep(trail, ["copy"], nodes)
  check("the drag that made the copy is the step", step?.dx === 120 && step?.dy === 40)

  check("nothing to repeat without a trail", repeatStep(null, ["copy"], nodes) === null)
  check("a different selection forgets the step", repeatStep(trail, ["src"], nodes) === null)
  check(
    "widening the selection forgets it too",
    repeatStep(trail, ["copy", "src"], nodes) === null
  )
  check(
    "a deleted copy leaves nothing to measure",
    repeatStep(trail, ["copy"], byId([rect("src", 0, 0, 40, 20)])) === null
  )

  // dropped back where it started: repeating zero would stack copies invisibly
  const inPlace = byId([rect("copy", 0, 0, 40, 20)])
  check("a copy left on its original gives no step", repeatStep(trail, ["copy"], inPlace) === null)

  // moving the copy after the fact grows the step — duplicate, nudge, ⌘D
  const nudged = byId([rect("copy", 150, 40, 40, 20)])
  const grown = repeatStep(trail, ["copy"], nudged)
  check("moving the copy afterwards updates the step", grown?.dx === 150 && grown?.dy === 40)

  // several copies march as one, so the first of them measures for all
  const pair = { ids: ["c1", "c2"], from: { c1: { x: 0, y: 0 }, c2: { x: 50, y: 0 } } }
  const pairNodes = byId([rect("c1", 0, 90, 40, 20), rect("c2", 50, 90, 40, 20)])
  const pairStep = repeatStep(pair, ["c2", "c1"], pairNodes)
  check("selection order doesn't matter", pairStep?.dx === 0 && pairStep?.dy === 90)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} geometry checks passed`)
