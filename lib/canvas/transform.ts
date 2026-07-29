// ---------------------------------------------------------------------------
// Resize maths — pure. One code path for "resize this node" and "resize these
// twelve nodes", because a single node is just a selection of one.
//
// Everything is computed from the gesture-start snapshot, never from live
// state, so dragging back and forth is lossless instead of drifting.
// ---------------------------------------------------------------------------

import type { SquigNode } from "../types"
import type { Bounds } from "../selection"

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
export type Handle = (typeof HANDLES)[number]

/** Smallest a selection bounding box may get. */
export const MIN_SIZE = 8

const EPS = 1e-6

export interface ResizeOpts {
  /** Shift — lock the original aspect ratio. */
  aspect?: boolean
  /** Alt — grow/shrink around the centre instead of the opposite edge. */
  fromCenter?: boolean
}

/**
 * Where the bounding box ends up after dragging `handle` by (dx, dy) in world
 * units. Clamps rather than flipping — squig has never supported mirrored
 * nodes and a surprise flip mid-drag is worse than a hard stop.
 */
export function resizeBounds(orig: Bounds, handle: Handle, dx: number, dy: number, opts: ResizeOpts = {}): Bounds {
  const movesW = handle.includes("w")
  const movesE = handle.includes("e")
  const movesN = handle.includes("n")
  const movesS = handle.includes("s")

  let left = orig.x
  let right = orig.x + orig.w
  let top = orig.y
  let bottom = orig.y + orig.h

  if (movesW) {
    left = orig.x + dx
    if (opts.fromCenter) right = orig.x + orig.w - dx
  }
  if (movesE) {
    right = orig.x + orig.w + dx
    if (opts.fromCenter) left = orig.x - dx
  }
  if (movesN) {
    top = orig.y + dy
    if (opts.fromCenter) bottom = orig.y + orig.h - dy
  }
  if (movesS) {
    bottom = orig.y + orig.h + dy
    if (opts.fromCenter) top = orig.y - dy
  }

  // -- aspect lock ----------------------------------------------------------
  if (opts.aspect && orig.w > EPS && orig.h > EPS) {
    const isCorner = handle.length === 2
    const cx = orig.x + orig.w / 2
    const cy = orig.y + orig.h / 2

    if (isCorner) {
      // uniform scale driven by whichever axis the user pulled harder.
      // Inverted spans floor at zero rather than going through Math.abs: an
      // absolute value turns "dragged 250px past the anchor" into "250px wide
      // again", so the box would shrink, bottom out, then grow back the other
      // way — the exact mirroring this function promises not to do.
      const s = Math.max(Math.max(0, right - left) / orig.w, Math.max(0, bottom - top) / orig.h)
      const w = orig.w * s
      const h = orig.h * s
      if (opts.fromCenter) {
        left = cx - w / 2
        right = cx + w / 2
        top = cy - h / 2
        bottom = cy + h / 2
      } else {
        // pin the corner opposite the one being dragged
        if (movesW) {
          right = orig.x + orig.w
          left = right - w
        } else {
          left = orig.x
          right = left + w
        }
        if (movesN) {
          bottom = orig.y + orig.h
          top = bottom - h
        } else {
          top = orig.y
          bottom = top + h
        }
      }
    } else if (movesE || movesW) {
      // side handle: the perpendicular axis grows about the centre
      const h = (Math.max(0, right - left) * orig.h) / orig.w
      top = cy - h / 2
      bottom = cy + h / 2
    } else {
      const w = (Math.max(0, bottom - top) * orig.w) / orig.h
      left = cx - w / 2
      right = cx + w / 2
    }
  }

  // -- clamp (never flip) ---------------------------------------------------
  if (right - left < MIN_SIZE) {
    if (opts.fromCenter) {
      const c = (left + right) / 2
      left = c - MIN_SIZE / 2
      right = c + MIN_SIZE / 2
    } else if (movesW) {
      left = right - MIN_SIZE
    } else {
      right = left + MIN_SIZE
    }
  }
  if (bottom - top < MIN_SIZE) {
    if (opts.fromCenter) {
      const c = (top + bottom) / 2
      top = c - MIN_SIZE / 2
      bottom = c + MIN_SIZE / 2
    } else if (movesN) {
      top = bottom - MIN_SIZE
    } else {
      bottom = top + MIN_SIZE
    }
  }

  return { x: left, y: top, w: right - left, h: bottom - top }
}

/**
 * Map every node from its slot in `orig` to the matching slot in `next`.
 *
 * A degenerate axis (a perfectly horizontal arrow, a single zero-width node)
 * gets a scale of 1 and rides along on the translation — dividing by zero here
 * would smear the whole selection into NaN.
 */
export function scaleNodes(
  origNodes: readonly SquigNode[],
  orig: Bounds,
  next: Bounds
): Record<string, Partial<SquigNode>> {
  const sx = orig.w > EPS ? next.w / orig.w : 1
  const sy = orig.h > EPS ? next.h / orig.h : 1
  const patches: Record<string, Partial<SquigNode>> = {}

  for (const n of origNodes) {
    const patch: Record<string, unknown> = {
      x: next.x + (n.x - orig.x) * sx,
      y: next.y + (n.y - orig.y) * sy,
      w: Math.max(n.w * sx, 0),
      h: Math.max(n.h * sy, 0),
    }

    if (n.type === "draw") {
      patch.points = n.points.map(([px, py]) => [px * sx, py * sy] as [number, number])
    } else if (n.type === "arrow") {
      patch.points = n.points.map(([px, py]) => [px * sx, py * sy]) as [[number, number], [number, number]]
    } else if (n.type === "text") {
      // the renderer lays lines out at fontSize * (i + 1), so the type has to
      // follow the vertical scale or the box and the words come apart
      patch.fontSize = Math.max(4, n.fontSize * sy)
    }

    patches[n.id] = patch as Partial<SquigNode>
  }

  return patches
}

/** Handle offsets within a bbox of the given size, for the overlay. */
export function handleOffset(handle: Handle, w: number, h: number): [number, number] {
  const x = handle.includes("w") ? 0 : handle.includes("e") ? w : w / 2
  const y = handle.includes("n") ? 0 : handle.includes("s") ? h : h / 2
  return [x, y]
}

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
}
