// ---------------------------------------------------------------------------
// Viewport culling — the box that says what gets drawn.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-cull.ts
//
// The whole point of this file is that culling is a render optimisation that
// must never turn into a document one, and the way it goes wrong is arithmetic
// rather than React: a sign flipped in the world/screen conversion, a margin
// that stops meaning anything at 2% zoom, a box read backwards. All of that is
// checkable without a window.
// ---------------------------------------------------------------------------

import { CULL_MARGIN, INK_SLOP, inViewBox, visibleBox, type CullBounds } from "../lib/canvas/cull.ts"
import { FIT_MIN_ZOOM, MAX_ZOOM } from "../lib/canvas/navigate.ts"
import { screenToWorld, type Viewport } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

/** a laptop window, near enough */
const VW = 1440
const VH = 900

// written out long rather than as arrows: an arrow whose body is a
// parenthesised object literal, followed by one of the bare blocks below,
// reads to the parser as another parameter list still waiting for its `=>`
function at(zoom: number, x = 0, y = 0): Viewport {
  return { zoom, x, y }
}

function node(x: number, y: number, w = 100, h = 100): CullBounds {
  return { x, y, w, h }
}

// -- the box lines up with what's on screen ---------------------------------

{
  // the corners of the kept region, with the margin taken back off, have to be
  // exactly the corners of the window — this is the conversion that would
  // silently shift everything by a viewport offset if a sign were wrong
  for (const v of [at(1), at(1, 300, -120), at(0.5, -40, 900), at(2.5, 77, 13)]) {
    const box = visibleBox(v, VW, VH)
    const m = CULL_MARGIN / v.zoom
    const [tlx, tly] = screenToWorld(v, 0, 0)
    const [brx, bry] = screenToWorld(v, VW, VH)
    check(`zoom ${v.zoom}: left edge is the window's`, close(box.minX + m, tlx), `${box.minX + m} vs ${tlx}`)
    check(`zoom ${v.zoom}: top edge is the window's`, close(box.minY + m, tly), `${box.minY + m} vs ${tly}`)
    check(`zoom ${v.zoom}: right edge is the window's`, close(box.maxX - m, brx), `${box.maxX - m} vs ${brx}`)
    check(`zoom ${v.zoom}: bottom edge is the window's`, close(box.maxY - m, bry), `${box.maxY - m} vs ${bry}`)
  }
}

// -- anything you can see is kept -------------------------------------------

{
  // walk a node over every screen position the window can show it in and
  // insist it survives. This is the check that matters: a false negative here
  // is a node that vanished off a drawing.
  const v = at(1, 0, 0)
  const box = visibleBox(v, VW, VH)
  let kept = 0
  let seen = 0
  for (let sx = -80; sx <= VW + 80; sx += 40) {
    for (let sy = -80; sy <= VH + 80; sy += 40) {
      const [wx, wy] = screenToWorld(v, sx, sy)
      seen++
      if (inViewBox(node(wx, wy, 120, 80), box)) kept++
    }
  }
  check("every node touching the window is kept", kept === seen, `${kept}/${seen}`)
}

{
  // and at several zooms, including both ends of the range, with the viewport
  // shoved somewhere awkward
  for (const zoom of [FIT_MIN_ZOOM, 0.1, 0.35, 1, 2, MAX_ZOOM]) {
    const v = at(zoom, -1234.5, 987.25)
    const box = visibleBox(v, VW, VH)
    let ok = true
    for (let sx = 0; sx <= VW; sx += 60) {
      for (let sy = 0; sy <= VH; sy += 60) {
        const [wx, wy] = screenToWorld(v, sx, sy)
        // a 1×1 node is the hardest case: no size to spare
        if (!inViewBox(node(wx, wy, 1, 1), box)) ok = false
      }
    }
    check(`zoom ${zoom}: nothing on screen is culled`, ok)
  }
}

// -- and things well away from it are not -----------------------------------

{
  const v = at(1)
  const box = visibleBox(v, VW, VH)
  // a full window's width past the margin is not a close call
  check("a node a window to the left is dropped", !inViewBox(node(-CULL_MARGIN - VW, 0), box))
  check("a node a window to the right is dropped", !inViewBox(node(VW + CULL_MARGIN + 200, 0), box))
  check("a node a window above is dropped", !inViewBox(node(0, -CULL_MARGIN - VH), box))
  check("a node a window below is dropped", !inViewBox(node(0, VH + CULL_MARGIN + 200), box))
  // but a big one straddling the window from off both edges is not "outside"
  check("a node wrapped round the window is kept", inViewBox(node(-5000, -5000, 10000, 10000), box))
}

// -- the margin is really the margin ----------------------------------------

{
  const v = at(1)
  const box = visibleBox(v, VW, VH)
  const slop = INK_SLOP
  // just inside the margin, just outside it — measured from the right edge of
  // the window, with the ink allowance taken into account on both sides
  const edge = VW + CULL_MARGIN + slop
  check("a node one px inside the margin is kept", inViewBox(node(edge - 1, 0, 10, 10), box))
  check("a node just past the margin is dropped", !inViewBox(node(edge + 1, 0, 10, 10), box))
}

{
  // the margin is screen px, so at 2× it covers half as much world and at 50%
  // twice as much — a pan of 500 screen px always crosses exactly one margin,
  // whatever the zoom
  for (const zoom of [0.25, 0.5, 1, 2, 4]) {
    const box = visibleBox(at(zoom), VW, VH)
    const worldMargin = -box.minX
    check(`zoom ${zoom}: the margin is ${CULL_MARGIN} screen px`, close(worldMargin * zoom, CULL_MARGIN), `${worldMargin * zoom}`)
  }
}

// -- the far end of the zoom range ------------------------------------------

{
  // a fit can reach 2% on a huge board, and there the maths should be doing
  // nothing at all: a 60,000-unit board is smaller than one screenful
  const box = visibleBox(at(FIT_MIN_ZOOM), VW, VH)
  const width = box.maxX - box.minX
  check("a 2% viewport keeps a board 60k across", width > 60_000, `${Math.round(width)}`)
  check("…and everything in it", inViewBox(node(-30_000, -30_000, 60_000, 60_000), box))
  // still finite, still ordered — an Infinity here would be a NaN somewhere
  // downstream rather than an honest "keep everything"
  check("…without going infinite", Number.isFinite(width) && box.maxX > box.minX)
}

// -- the cases where the answer has to be "draw the lot" ---------------------

{
  const far = node(1e9, 1e9)
  check("an unmeasured stage keeps everything", inViewBox(far, visibleBox(at(1), 0, 0)))
  check("a zero-height stage keeps everything", inViewBox(far, visibleBox(at(1), VW, 0)))
  check("a zoom of zero keeps everything", inViewBox(far, visibleBox(at(0), VW, VH)))
  check("a NaN zoom keeps everything", inViewBox(far, visibleBox(at(NaN), VW, VH)))
  check("a negative zoom keeps everything", inViewBox(far, visibleBox(at(-1), VW, VH)))
}

// -- the ink allowance -------------------------------------------------------

{
  const v = at(1)
  const box = visibleBox(v, VW, VH, 0)
  // with no margin at all, a node whose box stops just short of the window
  // still draws marks over the line — a shadow four units out, a stroke that
  // overshoots the corner — so it has to be kept
  check("a node a hair outside its box's edge is kept", inViewBox(node(VW + INK_SLOP / 2, 0, 10, 10), box))
  check("…but not one well clear of it", !inViewBox(node(VW + INK_SLOP + 50, 0, 10, 10), box))
}

// -- a box stored backwards ---------------------------------------------------

{
  const box = visibleBox(at(1), VW, VH)
  // same rectangle, written from the far corner. Nothing makes one of these
  // today; if something starts to, it must not make nodes disappear.
  check("a backwards box still intersects", inViewBox(node(200, 200, -100, -100), box))
  check("…and a backwards box far away still doesn't", !inViewBox(node(-9000, 0, -100, -100), box))
}

// -- it actually culls something on a real board ------------------------------

{
  // forty screens laid out five across, the size the library's own screens
  // come out at, at 100%: the answer has to be "most of these are not here"
  const v = at(1)
  const box = visibleBox(v, VW, VH)
  let kept = 0
  for (let i = 0; i < 40; i++) {
    const x = (i % 5) * 1240
    const y = Math.floor(i / 5) * 880
    if (inViewBox(node(x, y, 1040, 680), box)) kept++
  }
  check("a 40-screen board draws a handful at 100%", kept <= 6, `kept ${kept}`)

  // and at a zoom that fits the whole thing, all forty are drawn, because all
  // forty are on the glass
  const wide = visibleBox(at(0.15), VW, VH)
  let all = 0
  for (let i = 0; i < 40; i++) {
    const x = (i % 5) * 1240
    const y = Math.floor(i / 5) * 880
    if (inViewBox(node(x, y, 1040, 680), wide)) all++
  }
  check("…and all forty once they all fit", all === 40, `kept ${all}`)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} cull checks passed`)
