// ---------------------------------------------------------------------------
// Pinch maths — the point between the fingers, and the distance between them.
//
//   node --experimental-strip-types scripts/test-pinch.ts
//
// The gesture itself can only be judged with two fingers on a screen, which
// this file has none of. What it can pin down is the arithmetic underneath:
// that the paper stays under the fingers, that the clamps hold, and above all
// that a collapsed pinch never puts a NaN in the viewport — one of those and
// every node renders at NaN with no gesture left that could undo it.
// ---------------------------------------------------------------------------

import { pinchViewport, type Pt, type ZoomRange } from "../lib/canvas/pinch.ts"
import { screenToWorld, type Viewport } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

const RANGE: ZoomRange = { min: 0.1, max: 4 }

const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]

/**
 * The one promise a pinch makes: whatever was under the midpoint of the
 * fingers when they landed is still under the midpoint of the fingers now.
 * Every case below is really a restatement of this, so it gets its own check.
 */
function midpointHolds(name: string, v0: Viewport, a0: Pt, b0: Pt, a1: Pt, b1: Pt) {
  const v1 = pinchViewport({ viewport: v0, a: a0, b: b0 }, a1, b1, RANGE)
  const m0 = mid(a0, b0)
  const m1 = mid(a1, b1)
  const wasUnder = screenToWorld(v0, m0[0], m0[1])
  const isUnder = screenToWorld(v1, m1[0], m1[1])
  check(
    name,
    close(wasUnder[0], isUnder[0], 1e-6) && close(wasUnder[1], isUnder[1], 1e-6),
    `started over ${wasUnder.map((n) => +n.toFixed(3))}, ended over ${isUnder.map((n) => +n.toFixed(3))}`
  )
  return v1
}

const IDENTITY: Viewport = { x: 0, y: 0, zoom: 1 }

// -- pinch out --------------------------------------------------------------
{
  // fingers 100px apart, spread to 200 about the same middle
  const v = midpointHolds("pinch out: the paper stays under the fingers", IDENTITY, [350, 300], [450, 300], [300, 300], [500, 300])
  check("pinch out: doubles the zoom", close(v.zoom, 2), `got ${v.zoom}`)

  // and off a viewport that isn't the identity, because that's the real case
  const off: Viewport = { x: -120, y: 64, zoom: 0.8 }
  // 100px apart to 200px apart, and the middle drifts too — a real pinch is
  // never a clean spread about a pinned centre
  const w = midpointHolds("pinch out: …from an already-panned viewport", off, [200, 400], [280, 460], [190, 350], [350, 470])
  check("pinch out: …scales by the finger ratio", close(w.zoom, 0.8 * 2), `got ${w.zoom}`)
}

// -- pinch in ---------------------------------------------------------------
{
  const v = midpointHolds("pinch in: the paper stays under the fingers", { x: 40, y: -30, zoom: 2 }, [200, 200], [400, 400], [250, 250], [350, 350])
  check("pinch in: halves the zoom", close(v.zoom, 1), `got ${v.zoom}`)
}

// -- pure two-finger pan ----------------------------------------------------
{
  // both fingers travel the same way, so the distance between them never
  // changes: this must be a translation and nothing else
  const v0: Viewport = { x: 12, y: -8, zoom: 1.75 }
  const [dx, dy] = [40, -25]
  const a0: Pt = [180, 220]
  const b0: Pt = [300, 260]
  const v = midpointHolds(
    "two-finger pan: the paper stays under the fingers",
    v0,
    a0,
    b0,
    [a0[0] + dx, a0[1] + dy],
    [b0[0] + dx, b0[1] + dy]
  )
  check("two-finger pan: zoom is untouched", close(v.zoom, v0.zoom), `got ${v.zoom}`)
  check(
    "two-finger pan: moves exactly as far as the fingers did",
    close(v.x, v0.x + dx) && close(v.y, v0.y + dy),
    `got ${v.x},${v.y}, want ${v0.x + dx},${v0.y + dy}`
  )
}

// -- the clamps -------------------------------------------------------------
{
  // spreading past the top of the range: the zoom stops, and the pan has to
  // stop with it or the paper creeps out from under the fingers at the stop
  const v0: Viewport = { x: 0, y: 0, zoom: 3 }
  const v = midpointHolds("clamp high: the paper still stays under the fingers", v0, [400, 300], [500, 300], [200, 300], [700, 300])
  check("clamp high: stops at MAX_ZOOM", close(v.zoom, RANGE.max), `got ${v.zoom}`)

  // squeezing past the bottom
  const u0: Viewport = { x: 0, y: 0, zoom: 0.2 }
  const u = midpointHolds("clamp low: the paper still stays under the fingers", u0, [200, 200], [600, 600], [395, 395], [405, 405])
  check("clamp low: stops at MIN_ZOOM", close(u.zoom, RANGE.min), `got ${u.zoom}`)

  // already at a stop and pushing further: nothing moves the zoom, and the
  // gesture degrades into a pan rather than sticking
  const capped = pinchViewport({ viewport: { x: 5, y: 5, zoom: RANGE.max }, a: [100, 100], b: [200, 100] }, [50, 140], [250, 140], RANGE)
  check("clamp high: pushing past the stop still pans", close(capped.zoom, RANGE.max) && close(capped.y, 45), `got ${JSON.stringify(capped)}`)
}

// -- degenerate: two fingers on the same pixel -------------------------------
{
  const v0: Viewport = { x: 30, y: 30, zoom: 1.5 }
  const same: Pt = [200, 200]

  // landed on top of each other, then moved apart. There is no starting
  // distance to scale against, so this is a pan — and above all it is not NaN.
  const v = pinchViewport({ viewport: v0, a: same, b: same }, [150, 260], [250, 260], RANGE)
  check("zero span at start: every number is finite", Number.isFinite(v.zoom) && Number.isFinite(v.x) && Number.isFinite(v.y), JSON.stringify(v))
  check("zero span at start: zoom is left alone", close(v.zoom, v0.zoom), `got ${v.zoom}`)
  check("zero span at start: pans by the midpoint's travel", close(v.x, v0.x) && close(v.y, v0.y + 60), `got ${v.x},${v.y}`)

  // and the other way round — fingers that started apart and collapsed onto
  // one pixel, which is what happens at the very end of a hard squeeze
  const w = pinchViewport({ viewport: v0, a: [100, 100], b: [300, 300] }, same, same, RANGE)
  check("zero span now: every number is finite", Number.isFinite(w.zoom) && Number.isFinite(w.x) && Number.isFinite(w.y), JSON.stringify(w))
  check("zero span now: zoom is left alone", close(w.zoom, v0.zoom), `got ${w.zoom}`)

  // both ends collapsed: a whole gesture that says nothing at all
  const z = pinchViewport({ viewport: v0, a: same, b: same }, same, same, RANGE)
  check("zero span throughout: the viewport is unchanged", close(z.zoom, v0.zoom) && close(z.x, v0.x) && close(z.y, v0.y), JSON.stringify(z))
}

// -- garbage in -------------------------------------------------------------
{
  // a pointer event with a NaN in it should cost the frame, not the canvas
  const v0: Viewport = { x: 10, y: 20, zoom: 1.25 }
  const bad = pinchViewport({ viewport: v0, a: [100, 100], b: [200, 200] }, [NaN, 100], [200, 200], RANGE)
  check("a NaN finger leaves the viewport alone", bad.x === v0.x && bad.y === v0.y && bad.zoom === v0.zoom, JSON.stringify(bad))

  const worse = pinchViewport({ viewport: v0, a: [100, 100], b: [200, 200] }, [Infinity, 100], [200, 200], RANGE)
  check("an infinite finger leaves the viewport alone", worse.x === v0.x && worse.y === v0.y && worse.zoom === v0.zoom, JSON.stringify(worse))
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} pinch checks passed`)
