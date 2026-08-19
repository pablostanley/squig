// ---------------------------------------------------------------------------
// Getting around a drawing that no longer fits on the screen — pure.
//
// squig is an infinite canvas, so the day you can't see all of it arrives
// early and never leaves. Two moves answer for that: "show me everything"
// (⇧1) and "bring that one here" (Tab, and ⌘K's Jump to). Both are viewport
// arithmetic and nothing else, so both live here where they can be checked
// without a window — see scripts/test-navigate.ts.
//
// The zoom floors are the interesting part. There are two of them and they
// mean different things:
//
//   · MIN_ZOOM is where a *gesture* stops. A wheel, a pinch, ⌘- — you are
//     rummaging, and rummaging out to 1% would leave you lost on a grey field
//     with no way of telling which smudge you came from.
//   · FIT_MIN_ZOOM is where a *deliberate fit* stops, and it is far lower,
//     because "show me all of it" already told us what you want to look at.
//     A fit that quietly shows two-thirds of the board is worse than a small
//     one: it answers a question you didn't ask, and says nothing about it.
//
// FIT_MIN_ZOOM isn't zero because nothing survives arbitrary shrinking. Node
// outlines are drawn in world units inside a scaled <g>, so a 1.4-unit pen
// prints thinner and thinner until the drawing is a rumour; below roughly 2%
// one screen pixel is fifty world units, which is also wider than most nodes.
// 2% fits a board about 60,000 units across — sixty desktop screens in a row,
// with room over. Past that we clamp and say so out loud rather than pretend.
// ---------------------------------------------------------------------------

import type { Box, Viewport } from "../types"

/** Where a gesture — wheel, pinch, ⌘± — stops zooming out. */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

/**
 * Where a deliberate "fit everything" stops. Two per cent, for the reasons in
 * the banner: it is the point at which a hand-drawn line stops being a line.
 */
export const FIT_MIN_ZOOM = 0.02

/** breathing room around a zoom-to-fit, in screen px */
export const FIT_PADDING = 96

/**
 * How close to the window edge a node may sit and still count as "you can see
 * that". Wider than it looks like it needs to be on purpose: the rail and the
 * inspector float *over* the canvas near the edges, so a node in the outer
 * band is quite likely under one of them. Being generous here costs a pan you
 * might not have needed; being stingy costs the pan you did.
 */
export const REVEAL_MARGIN = 120

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * The floor a gesture may zoom out to, given where it is starting from.
 *
 * A fit is allowed below MIN_ZOOM, and once you are down there the next scroll
 * up must not teleport you back to 10% — from 5%, a 1.25× zoom-in lands at
 * 6.25%, which a hard clamp would round *up* to 10% and skip half the board.
 * So the floor is "the lower of MIN_ZOOM and where you already are": you can
 * always climb out, you just can't keep going down.
 *
 * Which does mean the climb is one-way — nudge up from a 2% fit and 2% is no
 * longer reachable by wheel. That's the right trade: ⇧1 is right there and
 * lands you back exactly, and the alternative is a floor the store has to
 * remember, which would then need a rule for when to forget it.
 */
export function zoomFloor(current: number): number {
  return Math.min(MIN_ZOOM, current)
}

/** Clamp a gesture's new zoom, letting a fit's small zoom stay where it is. */
export function clampGestureZoom(current: number, next: number): number {
  return clamp(next, zoomFloor(current), MAX_ZOOM)
}

export interface Fit {
  viewport: Viewport
  /**
   * True when the box was too big to show whole and the zoom hit the floor —
   * the caller owes the user a word about it.
   */
  clamped: boolean
}

/**
 * Frame a box in a window of vw × vh, with a margin so nothing kisses an edge.
 *
 * `cap` is the most it will zoom *in*: a fit of one small sticky note should
 * not blow it up to 400%, and opening a file caps at 1 so a small document
 * arrives at its own size.
 */
export function fitViewport(box: Box, vw: number, vh: number, cap = MAX_ZOOM, floor = FIT_MIN_ZOOM): Fit {
  const bw = Math.max(box.maxX - box.minX, 1)
  const bh = Math.max(box.maxY - box.minY, 1)
  // never let the padding eat the whole window — a phone in landscape with the
  // keyboard up is not much taller than 2 × FIT_PADDING
  const aw = Math.max(vw - FIT_PADDING * 2, vw * 0.5)
  const ah = Math.max(vh - FIT_PADDING * 2, vh * 0.5)
  const ideal = Math.min(aw / bw, ah / bh)
  const zoom = clamp(ideal, floor, cap)
  return {
    viewport: {
      zoom,
      x: vw / 2 - (box.minX + bw / 2) * zoom,
      y: vh / 2 - (box.minY + bh / 2) * zoom,
    },
    clamped: ideal < floor,
  }
}

/**
 * What a "bring that into view" should do about a box, at the zoom you're on.
 *
 *   · hold — it's already comfortably on screen. Tab lands on a dozen nodes in
 *     a row; a viewport that lurches on every one of them is its own kind of
 *     noise, and the ones that needed no move are the majority.
 *   · pan  — same zoom, box centred. Stepping through a board shouldn't keep
 *     re-scaling the drawing under you: the zoom you chose is a decision, and
 *     Tab has no business overruling it.
 *   · fit  — the box doesn't fit on screen at this zoom at all, so panning
 *     can't show it whole. Only then does the zoom get to change, and the
 *     caller hands that case to zoomToSelection.
 */
export type Reveal = { kind: "hold" } | { kind: "pan"; viewport: Viewport } | { kind: "fit" }

export function revealViewport(
  v: Viewport,
  box: Box,
  vw: number,
  vh: number,
  margin = REVEAL_MARGIN
): Reveal {
  const w = (box.maxX - box.minX) * v.zoom
  const h = (box.maxY - box.minY) * v.zoom
  // "doesn't fit" is measured against the room a fit would give it, not
  // against the comfortable region — otherwise a node that only just fits
  // would be shown by a fit and then immediately declared unshowable again
  if (w > vw - FIT_PADDING * 2 || h > vh - FIT_PADDING * 2) return { kind: "fit" }

  // the comfortable region, in screen px — never let the margin eat the window
  const m = Math.min(margin, vw / 4, vh / 4)
  const left = box.minX * v.zoom + v.x
  const top = box.minY * v.zoom + v.y
  if (left >= m && top >= m && left + w <= vw - m && top + h <= vh - m) return { kind: "hold" }

  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const panned = { zoom: v.zoom, x: vw / 2 - cx * v.zoom, y: vh / 2 - cy * v.zoom }
  // already centred and still not "comfortable" — a node wider than the
  // comfortable band but narrower than the window lands here, and there is
  // nowhere better to put it than where it is
  if (Math.abs(panned.x - v.x) < 0.5 && Math.abs(panned.y - v.y) < 0.5) return { kind: "hold" }
  return { kind: "pan", viewport: panned }
}
