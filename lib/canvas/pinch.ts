// ---------------------------------------------------------------------------
// Pinch maths — pure.
//
// Two fingers on the paper are one gesture, not two: the point between them
// stays under them, and the distance between them sets the scale. That is the
// contract every map on every phone keeps, and it's the whole reason a pinch
// feels like moving paper rather than driving a zoom slider — you never think
// about pan and zoom separately because they were never separate.
//
// Which makes it one calculation with one answer, and the answer is a whole
// viewport rather than a delta. Every frame is computed from the positions the
// fingers had when they both landed, never from the frame before, so a pinch
// out and back leaves the canvas exactly where it started — the same rule the
// pointer gestures in components/canvas/canvas.tsx follow, for the same reason.
//
// The clamp is the part worth being careful about. Zoom stops at the ends of
// its range, but the *pan* has to stop with it: if the fingers keep spreading
// past MAX_ZOOM and the pan carries on using the raw finger ratio, the paper
// creeps out from under them at the stop. So the applied scale is read back
// out of the clamped zoom and used for both.
//
// And the degenerate case is not theoretical. Two fingers can land on the same
// pixel, and a division by that distance is a NaN — which would go straight
// into the viewport, and from there into every node's transform, and the
// canvas would be gone with no gesture left that could bring it back. So a
// span too small to mean anything scales by 1 (a pure pan), and the result is
// checked for finiteness before it's handed back at all.
// ---------------------------------------------------------------------------

import type { Viewport } from "../types"

/** a point in canvas-local screen px — the same space the viewport maps from */
export type Pt = [number, number]

export interface PinchStart {
  /** the viewport at the moment the second finger landed */
  viewport: Viewport
  /** where the two fingers were at that moment */
  a: Pt
  b: Pt
}

export interface ZoomRange {
  min: number
  max: number
}

/**
 * Below this the two fingers are one point as far as the arithmetic is
 * concerned. A pixel of separation is already far more than a real hand can
 * hold still, so nothing legible is being thrown away here — this only catches
 * the collapsed case that would otherwise divide by ~0 and blow up the scale.
 */
const MIN_SPAN = 1e-3

const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
const span = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1])
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

const isFinitePt = (p: Pt) => Number.isFinite(p[0]) && Number.isFinite(p[1])

/**
 * The viewport two fingers are asking for.
 *
 * `start` is the snapshot taken when the second finger landed; `a` and `b` are
 * where those same two fingers are now, in the same order.
 */
export function pinchViewport(start: PinchStart, a: Pt, b: Pt, range: ZoomRange): Viewport {
  const v0 = start.viewport
  const d0 = span(start.a, start.b)
  const d1 = span(a, b)

  // fingers with no distance between them can't say anything about scale, so
  // they say nothing — the gesture is a plain two-finger pan until they part
  const factor = d0 > MIN_SPAN && d1 > MIN_SPAN ? d1 / d0 : 1

  const zoom = clamp(v0.zoom * factor, range.min, range.max)
  // the scale that actually happened, clamp included — see the note above
  const k = v0.zoom !== 0 ? zoom / v0.zoom : 1

  const m0 = mid(start.a, start.b)
  const m1 = mid(a, b)

  // the world point that was under the old midpoint has to end up under the
  // new one: w = (m0 - v0) / v0.zoom, and we want w * zoom + v = m1
  const next: Viewport = {
    zoom,
    x: m1[0] - (m0[0] - v0.x) * k,
    y: m1[1] - (m0[1] - v0.y) * k,
  }

  // last line of defence. Anything non-finite that got this far leaves the
  // viewport exactly where it was rather than poisoning it — a wedged canvas
  // is a far worse outcome than a pinch that didn't take.
  if (!isFinitePt(a) || !isFinitePt(b) || !Number.isFinite(next.zoom) || !isFinitePt([next.x, next.y])) {
    return v0
  }
  return next
}
