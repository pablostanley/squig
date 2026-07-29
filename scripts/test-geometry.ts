// ---------------------------------------------------------------------------
// Geometry checks for the multi-select transform and hit-test maths.
//
//   node --experimental-strip-types scripts/test-geometry.ts
//
// Both modules under test import only types, so they run standalone with no
// bundler and no test framework.
// ---------------------------------------------------------------------------

import { resizeBounds, scaleNodes, MIN_SIZE, type Handle } from "../lib/canvas/transform.ts"
import { hitsPoint, hitsRect, pickAt, pickInRect, pickTolerance } from "../lib/canvas/hit-test.ts"
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

const rect = (id: string, x: number, y: number, w: number, h: number, fill = false): SquigNode => ({
  id,
  type: "shape",
  shape: "rect",
  x,
  y,
  w,
  h,
  fill,
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

const bounds = (ns: SquigNode[]) => {
  const minX = Math.min(...ns.map((n) => n.x))
  const minY = Math.min(...ns.map((n) => n.y))
  const maxX = Math.max(...ns.map((n) => n.x + n.w))
  const maxY = Math.max(...ns.map((n) => n.y + n.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

const apply = (ns: SquigNode[], patches: Record<string, Partial<SquigNode>>): SquigNode[] =>
  ns.map((n) => ({ ...n, ...patches[n.id] }) as SquigNode)

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

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} geometry checks passed`)
