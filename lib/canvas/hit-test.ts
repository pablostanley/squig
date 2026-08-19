// ---------------------------------------------------------------------------
// Hit testing — one definition of "what's under there", shared by clicking,
// hovering, right-clicking and the marquee.
//
// The point of doing this in world space instead of letting the DOM answer it:
// an unfilled rectangle should be grabbable by its outline and transparent in
// the middle. Otherwise a big empty box swallows every press inside it and you
// can't start a marquee anywhere on the board.
// ---------------------------------------------------------------------------

import { normalizeFill, type SquigNode } from "../types"
import type { Bounds } from "../selection"

/**
 * How far off a stroke the pointer may be and still count, in screen px.
 *
 * A 1px outline is not a target anyone can aim at, so the collar does the
 * aiming for you. 8px is about a fingertip's worth of slop at 1:1 and matches
 * what other design tools give you.
 */
const SLOP_PX = 8

/**
 * The collar can't grow without bound as you zoom out: at 0.1 zoom an
 * unclamped 8px halo would be 80 world units, wide enough that every node's
 * collar overlaps its neighbour's and no gap is left to start a marquee from.
 */
const MAX_SLOP_WORLD = 14

/** Forgiveness, in world units, for a pointer aimed at a stroke. */
export function pickTolerance(zoom: number, n?: SquigNode): number {
  const base = Math.min(SLOP_PX / Math.max(zoom, 0.01), MAX_SLOP_WORLD)
  if (!n) return base
  // Lines are thin on purpose. A horizontal arrow is ~2 units tall, and
  // shrinking its collar to match would leave a 2px-tall target you can
  // basically never hit — the collar exists precisely for this case.
  if (n.type === "arrow" || n.type === "draw") return base
  // For areas, never let the collar swallow the node it belongs to: a hollow
  // shape has to keep a see-through core, or you can't marquee inside it.
  return Math.min(base, Math.max(1, 0.35 * Math.min(n.w, n.h)))
}

function inBox(x: number, y: number, b: Bounds, tol: number): boolean {
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol
}

function boxOf(n: SquigNode): Bounds {
  return { x: n.x, y: n.y, w: n.w, h: n.h }
}

/** Distance from a point to a segment, both in world units. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Does a segment come within `tol` of an axis-aligned rect? */
function segmentNearRect(ax: number, ay: number, bx: number, by: number, r: Bounds, tol: number): boolean {
  const x1 = r.x - tol
  const y1 = r.y - tol
  const x2 = r.x + r.w + tol
  const y2 = r.y + r.h + tol

  // trivially inside
  if (ax >= x1 && ax <= x2 && ay >= y1 && ay <= y2) return true
  if (bx >= x1 && bx <= x2 && by >= y1 && by <= y2) return true

  // Liang–Barsky against the padded rect
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay
  const tests: [number, number][] = [
    [-dx, ax - x1],
    [dx, x2 - ax],
    [-dy, ay - y1],
    [dy, y2 - ay],
  ]
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

/**
 * World-space polyline for the nodes that have one.
 *
 * Flips live in the renderer, not the model, so the stored points still
 * describe the unmirrored line — mirror them here or clicking a flipped arrow
 * misses by the width of its own box.
 */
function polylineOf(n: SquigNode): [number, number][] | null {
  if (n.type !== "draw" && n.type !== "arrow") return null
  return (n.points as [number, number][]).map(([px, py]) => [
    n.x + (n.flipX ? n.w - px : px),
    n.y + (n.flipY ? n.h - py : py),
  ])
}

/** Shapes are only solid to the pointer when they're actually filled. */
function isSolid(n: SquigNode): boolean {
  if (n.type === "shape") return normalizeFill(n.fill) !== "none"
  return n.type === "component" || n.type === "text" || n.type === "image"
}

// ---------------------------------------------------------------------------

/** Is this node under the given world point? */
export function hitsPoint(n: SquigNode, x: number, y: number, zoom: number): boolean {
  const tol = pickTolerance(zoom, n)
  const b = boxOf(n)
  if (!inBox(x, y, b, tol)) return false
  if (isSolid(n)) return true

  const line = polylineOf(n)
  if (line) {
    for (let i = 1; i < line.length; i++) {
      if (distToSegment(x, y, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]) <= tol) return true
    }
    // a two-point arrow that has collapsed to a dot still deserves a grab
    return line.length === 1 && Math.hypot(x - line[0][0], y - line[0][1]) <= tol
  }

  if (n.type === "shape" && n.shape === "ellipse") {
    const rx = n.w / 2
    const ry = n.h / 2
    if (rx <= 0 || ry <= 0) return true
    const cx = n.x + rx
    const cy = n.y + ry
    const nx = (x - cx) / rx
    const ny = (y - cy) / ry
    const r = Math.hypot(nx, ny)
    // dead centre of a squashed ellipse: nearest ink is the short radius away
    if (r < 1e-6) return Math.min(rx, ry) <= tol
    // Project onto the ring along the ray from the centre and measure in world
    // units. Measuring in normalised units instead would stretch the collar by
    // rx/ry, so a 400×40 ellipse would answer to clicks 80 units off its end.
    const d = Math.hypot((x - cx) * (1 - 1 / r), (y - cy) * (1 - 1 / r))
    return d <= tol
  }

  // unfilled rect — the outline is the target, the middle is see-through
  const inner = x > b.x + tol && x < b.x + b.w - tol && y > b.y + tol && y < b.y + b.h - tol
  return !inner
}

/** Does this node fall inside/across a marquee rect (world units)? */
export function hitsRect(n: SquigNode, r: Bounds, zoom: number): boolean {
  const b = boxOf(n)
  // bounding boxes must at least touch — `>=` so a tangent marquee counts
  if (!(b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y)) return false
  if (isSolid(n)) return true

  // for hollow things, require the marquee to actually reach the ink, so a box
  // drawn inside a big empty rectangle grabs what's in it and not the rectangle
  const tol = pickTolerance(zoom, n) * 0.5

  const line = polylineOf(n)
  if (line) {
    if (line.length === 1) return inBox(line[0][0], line[0][1], r, tol)
    for (let i = 1; i < line.length; i++) {
      if (segmentNearRect(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], r, tol)) return true
    }
    return false
  }

  // hollow shape: the marquee has to touch the outline, i.e. it must not sit
  // entirely within the interior
  const interior = {
    x: b.x + tol,
    y: b.y + tol,
    w: Math.max(0, b.w - tol * 2),
    h: Math.max(0, b.h - tol * 2),
  }
  const insideInterior =
    r.x >= interior.x && r.y >= interior.y && r.x + r.w <= interior.x + interior.w && r.y + r.h <= interior.y + interior.h
  if (insideInterior) return false

  if (n.type === "shape" && n.shape === "ellipse") {
    // cheap and good enough: the corners of an ellipse's bbox are empty, so
    // reject a marquee that only reaches one of them
    const rx = n.w / 2
    const ry = n.h / 2
    if (rx <= 0 || ry <= 0) return true
    const cx = n.x + rx
    const cy = n.y + ry
    const nearestX = Math.max(r.x, Math.min(cx, r.x + r.w))
    const nearestY = Math.max(r.y, Math.min(cy, r.y + r.h))
    const farX = Math.abs(r.x - cx) > Math.abs(r.x + r.w - cx) ? r.x : r.x + r.w
    const farY = Math.abs(r.y - cy) > Math.abs(r.y + r.h - cy) ? r.y : r.y + r.h
    const near = Math.hypot((nearestX - cx) / rx, (nearestY - cy) / ry)
    const far = Math.hypot((farX - cx) / rx, (farY - cy) / ry)
    const band = tol / Math.max(1e-6, Math.min(rx, ry))
    // the ring is crossed when the rect spans radius 1
    return near <= 1 + band && far >= 1 - band
  }

  return true
}

// ---------------------------------------------------------------------------

/**
 * Is the point inside a hollow node's see-through middle?
 *
 * The middle stays transparent to `hitsPoint` so that presses inside a big
 * empty box can still become a marquee — but a *click* that lands there and
 * never turns into a drag was almost certainly aimed at the shape. This is
 * the test for that second reading: consulted only after `hitsPoint` has
 * missed everything, so borders and filled shapes have already had their say.
 *
 * Arrows don't take part. A diagonal arrow's box is mostly empty air over
 * whatever it happens to cross, and treating all of it as a target would make
 * connectors swallow clicks meant for the space between things.
 */
export function hitsInterior(n: SquigNode, x: number, y: number): boolean {
  const hollowShape = n.type === "shape" && normalizeFill(n.fill) === "none"
  if (!hollowShape && n.type !== "draw") return false
  if (!inBox(x, y, boxOf(n), 0)) return false
  if (n.type === "shape" && n.shape === "ellipse") {
    // inside the oval means inside the disc — the corners of its box stay
    // empty, same as they do for the hard test
    const rx = n.w / 2
    const ry = n.h / 2
    if (rx <= 0 || ry <= 0) return false
    const nx = (x - (n.x + rx)) / rx
    const ny = (y - (n.y + ry)) / ry
    return Math.hypot(nx, ny) <= 1
  }
  // rects and doodles answer by their whole box
  return true
}

// ---------------------------------------------------------------------------

/**
 * A locked layer is invisible to the pointer.
 *
 * This is the lever the whole lock feature hangs off: the three pickers below
 * are what clicking, hovering, marqueeing and double-clicking all ask, so
 * dropping locked layers here stops every one of them at once — no click
 * selects it, no marquee sweeps it up, no double-click steps into it.
 *
 * The geometry predicates above stay honest about it, because "is the pointer
 * over this box" and "may the pointer have it" are different questions and
 * only the second one has an opinion about locks.
 *
 * `locked: true` is the way back in. The right button passes it, so a menu can
 * be opened on a locked layer and offer to unlock it — right-clicking is a
 * deliberate act, which is exactly the kind of press a lock has no business
 * refusing. See components/canvas/canvas's onContextMenu.
 */
export interface PickOpts {
  /** reach locked layers too — for the right button, and nothing else */
  locked?: boolean
}

const reachable = (n: SquigNode | undefined, opts?: PickOpts): n is SquigNode =>
  !!n && (opts?.locked === true || !n.locked)

/**
 * Topmost hollow node whose interior holds the point, or null.
 *
 * The click-only fallback behind `pickAt`: call it when the hard pick came up
 * empty and the press turned out to be a click rather than a drag. Because it
 * only runs after a full miss, anything filled has already won, and walking
 * front-to-back settles overlapping hollow shapes by z-order.
 */
export function pickSoftAt(
  nodes: Record<string, SquigNode>,
  order: readonly string[],
  x: number,
  y: number,
  opts?: PickOpts
): string | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const n = nodes[order[i]]
    if (reachable(n, opts) && hitsInterior(n, x, y)) return order[i]
  }
  return null
}

/** Topmost node under a world point, or null. Walks front-to-back. */
export function pickAt(
  nodes: Record<string, SquigNode>,
  order: readonly string[],
  x: number,
  y: number,
  zoom: number,
  opts?: PickOpts
): string | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const n = nodes[order[i]]
    if (reachable(n, opts) && hitsPoint(n, x, y, zoom)) return order[i]
  }
  return null
}

/** Every node touching a marquee rect, in document order. */
export function pickInRect(
  nodes: Record<string, SquigNode>,
  order: readonly string[],
  rect: Bounds,
  zoom: number,
  opts?: PickOpts
): string[] {
  const out: string[] = []
  for (const id of order) {
    const n = nodes[id]
    if (reachable(n, opts) && hitsRect(n, rect, zoom)) out.push(id)
  }
  return out
}
