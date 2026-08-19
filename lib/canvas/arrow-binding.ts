// ---------------------------------------------------------------------------
// Arrows that stick to the boxes they point at — pure.
//
// An arrow's two ends may each be bound to a node. A bound end doesn't
// remember a spot on that node; it remembers only which node, and the line is
// aimed centre-to-centre and cut off where it leaves the outline. Move either
// box and the answer changes, which is the point: a napkin gets rearranged,
// and an anchor pinned to the left edge is a promise about a layout that stops
// being true the moment you drag the box past the thing it points at.
//
// That inverts the usual arrangement. Everywhere else in squig the box is the
// truth and `points` ride along inside it; for a bound arrow the two world
// endpoints are the truth and the box is derived from them. `settleBinds` is
// where that derivation happens, and the store runs it after every write, so
// nothing downstream — drag, resize, nudge, align, undo, paste — has to know
// bindings exist.
//
// Deliberately not here: elbows, waypoints, curves, self-loops. A straight
// line between two boxes is the whole vocabulary.
// ---------------------------------------------------------------------------

import type { ArrowBind, ArrowNode, SquigNode } from "../types"
import { hitsInterior, hitsPoint } from "./hit-test"

/**
 * How far short of a box the line stops, in world units.
 *
 * Zero would land the arrowhead on the outline, where two hand-drawn strokes
 * wobbling across each other read as a mistake rather than a connection. A
 * few units of daylight is what makes it look aimed.
 */
export const EDGE_GAP = 6

/**
 * The shortest run of line we'll leave between the two trimmed ends.
 *
 * Boxes that overlap ask for more room than there is between their centres.
 * Rather than let the arrow turn inside out and point backwards, it collapses
 * to a short mark at the midpoint, still facing the right way — enough to see
 * and grab, and an honest picture of "these two are on top of each other".
 */
const MIN_RUN = 10

const EPS = 1e-6

type Point = [number, number]

const NO_BIND: ArrowBind = [null, null]

/** An arrow's bindings, with the absent-means-neither case spelled out. */
export function bindOf(n: ArrowNode): ArrowBind {
  return n.bind ?? NO_BIND
}

/**
 * Can an arrow end stick to this?
 *
 * Everything with a box can, except another arrow. Not because an arrow has
 * no box — it does — but because arrows are the only nodes that get routed,
 * and letting one bind to another opens a cycle that would need iterating to
 * a fixed point. A napkin has no use for the feature that costs that.
 */
export function bindable(n: SquigNode | undefined | null): n is SquigNode {
  return !!n && n.type !== "arrow"
}

/**
 * The two ends in world space.
 *
 * Flips live in the renderer rather than the model, so the stored points still
 * describe the unmirrored line and have to be mirrored here — the same reason
 * `polylineOf` does it in hit-test.
 */
export function arrowEnds(n: ArrowNode): [Point, Point] {
  return n.points.map(([px, py]) => [
    n.x + (n.flipX ? n.w - px : px),
    n.y + (n.flipY ? n.h - py : py),
  ]) as [Point, Point]
}

/**
 * The patch that puts an arrow's ends at two world points.
 *
 * The flips come off. Mirroring an arrow only ever meant swapping its two
 * points about its own box, and `arrowEnds` has already read them through the
 * mirror, so writing the ends straight down loses nothing — and leaving a flip
 * on would make the renderer mirror the answer a second time.
 */
export function endsPatch(a: Point, b: Point): Partial<ArrowNode> {
  const x = Math.min(a[0], b[0])
  const y = Math.min(a[1], b[1])
  return {
    x,
    y,
    w: Math.abs(b[0] - a[0]),
    h: Math.abs(b[1] - a[1]),
    points: [
      [a[0] - x, a[1] - y],
      [b[0] - x, b[1] - y],
    ],
    flipX: undefined,
    flipY: undefined,
  }
}

/**
 * Two targets as a binding, or undefined when neither end is stuck to
 * anything. Absent is the only spelling of "free", so a `[null, null]` never
 * reaches the document and nothing downstream has to check for two of them.
 */
export function bindPair(a: string | null, b: string | null): ArrowBind | undefined {
  return a || b ? [a, b] : undefined
}

/** Set one end's binding, leaving the other alone. */
export function withBind(bind: ArrowBind, end: 0 | 1, target: string | null): ArrowBind | undefined {
  return end === 0 ? bindPair(target, bind[1]) : bindPair(bind[0], target)
}

// -- the geometry -----------------------------------------------------------

/**
 * One axis' share of the distance to the outline, in units of "how much of
 * this radius does a unit step eat".
 *
 * A node with no extent on an axis is the case that would otherwise produce
 * 0/0: its outline *is* its centre line there, so any movement along that axis
 * leaves it instantly (Infinity), and movement purely across it costs nothing.
 */
function axisLoad(u: number, r: number): number {
  if (r > EPS) return u / r
  return u > EPS ? Infinity : 0
}

/**
 * How far the centre of a node is from its own outline, along a unit
 * direction.
 *
 * Both shapes are the same sum in normalised coordinates, under two different
 * norms: a rectangle runs out when *either* axis reaches its radius, an
 * ellipse when the two together do. That's L∞ against L2, one `Math.max`
 * versus one `Math.hypot`, and it's why the oval case costs nothing extra
 * rather than needing its own quadratic.
 *
 * Everything that isn't an oval answers as a box, and that is the right call
 * for all of them: a text layer, a component and a picture genuinely are
 * rectangles, and a freehand scribble has no outline anyone could name.
 */
export function edgeDistance(n: SquigNode, ux: number, uy: number): number {
  const ax = axisLoad(Math.abs(ux), n.w / 2)
  const ay = axisLoad(Math.abs(uy), n.h / 2)
  const round = n.type === "shape" && n.shape === "ellipse"
  const d = round ? Math.hypot(ax, ay) : Math.max(ax, ay)
  // an infinite load is a node with no width or height being crossed: the ray
  // leaves at the centre, which is a distance of zero, not a NaN
  return Number.isFinite(d) && d > EPS ? 1 / d : 0
}

const centreOf = (n: SquigNode): Point => [n.x + n.w / 2, n.y + n.h / 2]

/**
 * Where a bound arrow's ends belong, given where its boxes are now.
 *
 * A bound end aims from its node's centre; a free end stays exactly where the
 * user last put it and does the aiming for the other one. Both ends are then
 * pulled back to their own outline plus the gap.
 */
export function routeEnds(n: ArrowNode, nodes: Record<string, SquigNode>): [Point, Point] | null {
  const [ba, bb] = bindOf(n)
  const a = ba ? nodes[ba] : undefined
  const b = bb ? nodes[bb] : undefined
  if (!bindable(a) && !bindable(b)) return null

  const ends = arrowEnds(n)
  const from: Point = a ? centreOf(a) : ends[0]
  const to: Point = b ? centreOf(b) : ends[1]

  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const d = Math.hypot(dx, dy)
  // Two boxes stacked dead centre on each other give no direction to point in.
  // Lying the arrow down pointing right is arbitrary, but it is finite, and a
  // NaN here would be autosaved and take the document with it.
  const ux = d > EPS ? dx / d : 1
  const uy = d > EPS ? dy / d : 0

  const ta = a ? edgeDistance(a, ux, uy) + EDGE_GAP : 0
  const tb = b ? edgeDistance(b, ux, uy) + EDGE_GAP : 0

  if (d - ta - tb >= MIN_RUN) {
    return [
      [from[0] + ux * ta, from[1] + uy * ta],
      [to[0] - ux * tb, to[1] - uy * tb],
    ]
  }

  // no room left between the boxes — see MIN_RUN
  const mx = (from[0] + to[0]) / 2
  const my = (from[1] + to[1]) / 2
  const half = MIN_RUN / 2
  return [
    [mx - ux * half, my - uy * half],
    [mx + ux * half, my + uy * half],
  ]
}

// -- keeping a document honest ----------------------------------------------

/** A binding with the ends that name nothing bindable let go. */
function livingBind(bind: ArrowBind, nodes: Record<string, SquigNode>): ArrowBind | undefined {
  const alive = (id: string | null) => (id && bindable(nodes[id]) ? id : null)
  const a = alive(bind[0])
  const b = alive(bind[1])
  if (a === bind[0] && b === bind[1]) return bind
  return bindPair(a, b)
}

const moved = (p: Point, q: Point) => Math.abs(p[0] - q[0]) > EPS || Math.abs(p[1] - q[1]) > EPS

/**
 * Bindings honoured across a whole document: ends that point at nothing let
 * go, and every arrow still bound is re-routed to where its boxes are now.
 *
 * The store calls this on every write, which sounds expensive and isn't: it's
 * one pass that skips anything that isn't a bound arrow, next to the copy of
 * the node map that every write already makes. Nothing is rewritten unless it
 * actually moved, and an unchanged document comes back as the very same object
 * — so a colour change doesn't quietly re-render every connector on the board.
 *
 * Deleting a node lands here too. The binding goes, and because a released end
 * is read back out of the arrow's own points, the arrow stays exactly where it
 * was last drawn rather than snapping to the origin or collapsing.
 */
export function settleBinds(nodes: Record<string, SquigNode>): Record<string, SquigNode> {
  let out = nodes
  for (const id in nodes) {
    const n = nodes[id]
    if (n?.type !== "arrow" || !n.bind) continue

    const bind = livingBind(n.bind, nodes)
    let next: ArrowNode = bind === n.bind ? n : { ...n, bind }
    if (bind) {
      const ends = routeEnds(next, nodes)
      const was = arrowEnds(next)
      if (ends && (moved(ends[0], was[0]) || moved(ends[1], was[1]) || next.flipX || next.flipY)) {
        next = { ...next, ...endsPatch(ends[0], ends[1]) }
      }
    }
    if (next === n) continue
    if (out === nodes) out = { ...nodes }
    out[id] = next
  }
  return out
}

/**
 * Point copied arrows at the copies of their targets.
 *
 * The same remapping `cloneNodes` does for group ids, and for the same reason:
 * copying two boxes and the arrow between them has to give a second, separate
 * pair with its own arrow, not a second arrow tethered to the originals. An
 * end whose target wasn't part of the copy has nothing to point at and is
 * simply let go — copying an arrow on its own gives you a loose arrow.
 */
export function remapBinds(clones: readonly SquigNode[], idMap: ReadonlyMap<string, string>): void {
  for (const c of clones) {
    if (c.type !== "arrow" || !c.bind) continue
    const [a, b] = c.bind
    const na = a ? (idMap.get(a) ?? null) : null
    const nb = b ? (idMap.get(b) ?? null) : null
    c.bind = na || nb ? [na, nb] : undefined
  }
}

// -- aiming at a box --------------------------------------------------------

/**
 * The node an endpoint dropped here would grab, or null.
 *
 * The whole box counts, hollow middle included — "point at the box" has to
 * mean the box, or binding to an empty rectangle would mean hitting its 1px
 * outline. That's a deliberate divergence from `pickAt`, which keeps hollow
 * shapes see-through so a marquee can start inside one; there's no marquee to
 * protect in the middle of an endpoint drag.
 */
export function bindTargetAt(
  nodes: Record<string, SquigNode>,
  order: readonly string[],
  x: number,
  y: number,
  zoom: number,
  skip: readonly (string | null | undefined)[] = []
): string | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    if (skip.includes(id)) continue
    const n = nodes[id]
    if (!bindable(n)) continue
    if (hitsPoint(n, x, y, zoom) || hitsInterior(n, x, y)) return id
  }
  return null
}
