// ---------------------------------------------------------------------------
// What is actually on the glass — the arithmetic behind viewport culling.
//
// Every node in a squig document is a live SVG subtree. rough.js turns one
// component into dozens of <path>s, and the busy ones run to ninety marks
// apiece — an inbox screen is 93, a kanban board 90, a chat screen 85 — so
// forty screens on a board is somewhere around ten thousand path elements,
// all of them resident whether or not they are anywhere near the window.
// Panning survives that: it is one transform on one <g> and the compositor
// does the work. A ⌘-scroll zoom does not, because it re-rasterises the whole
// tree every frame, and that is where a big board starts dragging its feet.
//
// So the renderer skips the nodes it can prove are off-screen. Two things
// this file is careful about:
//
//   · It is a *render* decision and nothing else. A culled node is still in
//     `order`, still picked up by ⌘A, still exported — the PNG and SVG writers
//     render from nodePrims and never read the DOM — and still found by ⌘K.
//     None of this is allowed to leak into the document.
//   · A node draws in a slightly bigger box than the one it claims. A drawn
//     stroke overshoots its corners, a block shadow sits four units down and
//     to the right, and text hangs off a baseline rather than sitting inside
//     a rectangle. So the bounds get a little ink allowance before the test.
//
// See scripts/test-cull.ts — it is all pure arithmetic, which is why it lives
// out here rather than inline in the render.
// ---------------------------------------------------------------------------

import type { Box, Viewport } from "../types"

/**
 * How far past the window edge a node still gets drawn, in screen px.
 *
 * Screen px rather than world units on purpose. Culling is computed from the
 * same viewport the <g> transform uses, so a node can never arrive a frame
 * late — it mounts on the frame its box enters the kept region. What the
 * margin buys is *when* rough.js builds the geometry: with no margin at all
 * that work lands on the exact frame the node slides into view, so the
 * heaviest nodes cost their hitch at the moment you are looking at them. How
 * soon a node arrives is a matter of how fast the hand is moving across the
 * glass, which is a screen quantity; how much world that covers is not.
 *
 * 500 is about a third of a laptop window and several frames of even a hard
 * trackpad flick — enough head start that the work happens off the glass. The
 * other direction matters as much: go far past a window's width and the kept
 * region is mostly margin, and there is nothing left to cull.
 */
export const CULL_MARGIN = 500

/**
 * How far outside its own box a node's marks can land, in world units.
 *
 * World units, not screen px, because this is a property of the marks: pen
 * width, roughness overshoot and the shadow offset are all measured in the
 * same units the node's box is. The PNG export pads its crop by 12 for the
 * same reason; double that here, since being generous costs one node's worth
 * of paths and being stingy costs a clipped stroke at the edge of the window.
 */
export const INK_SLOP = 24

/** The answer when there is nothing sensible to measure against. */
const EVERYTHING: Box = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity }

/**
 * The world rectangle worth drawing, given the viewport and the stage size.
 *
 * At the far end of the zoom range this correctly stops doing anything: a
 * board fitted to 2% turns a 500px margin into 25,000 world units on each
 * side and the window itself into 70,000 across, which is most boards whole.
 * Culling nothing is the right answer there — at that zoom nearly everything
 * really is on screen.
 */
export function visibleBox(v: Viewport, vw: number, vh: number, margin = CULL_MARGIN): Box {
  // A zero-sized stage is a canvas nobody has measured yet — the first render,
  // before the ResizeObserver has spoken — and a zoom of zero is arithmetic
  // that can't be done. Both answer "draw the lot" rather than "draw nothing":
  // one slow frame is recoverable, a blank one looks like lost work.
  if (!(vw > 0) || !(vh > 0) || !(v.zoom > 0) || !Number.isFinite(v.zoom)) return EVERYTHING
  const m = margin / v.zoom
  const left = -v.x / v.zoom
  const top = -v.y / v.zoom
  return {
    minX: left - m,
    minY: top - m,
    maxX: left + vw / v.zoom + m,
    maxY: top + vh / v.zoom + m,
  }
}

/** A node's box, in world units, with the ink allowance already added. */
export interface CullBounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Is this node worth putting in the DOM?
 *
 * Read the box both ways round before comparing. Nothing in squig stores a
 * negative width today — resizes clamp at MIN_SIZE — but a box read backwards
 * would never intersect anything and the node would simply stop existing,
 * which is a bad way to find out that an invariant moved.
 */
export function inViewBox(n: CullBounds, view: Box, slop = INK_SLOP): boolean {
  const minX = Math.min(n.x, n.x + n.w) - slop
  const maxX = Math.max(n.x, n.x + n.w) + slop
  const minY = Math.min(n.y, n.y + n.h) - slop
  const maxY = Math.max(n.y, n.y + n.h) + slop
  return maxX >= view.minX && minX <= view.maxX && maxY >= view.minY && minY <= view.maxY
}
