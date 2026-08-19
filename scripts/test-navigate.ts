// ---------------------------------------------------------------------------
// Getting around a big drawing — the fit arithmetic, the reveal decision, and
// the canvas search behind ⌘K's Jump to.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-navigate.ts
//
// All three are pure functions of a box, a window and a query, which is the
// whole reason they live outside the store: the bug this replaces — ⇧1 on a
// wide board showing two-thirds of it — was arithmetic, and arithmetic can be
// checked without a browser.
// ---------------------------------------------------------------------------

import {
  clampGestureZoom,
  fitViewport,
  revealViewport,
  zoomFloor,
  FIT_MIN_ZOOM,
  FIT_PADDING,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../lib/canvas/navigate.ts"
import { searchNodes } from "../lib/canvas/find.ts"
import type { Box, ComponentNode, ShapeNode, SquigNode, TextNode, Viewport } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

// A laptop window, which is what most of this is judged against.
const VW = 1440
const VH = 900

const box = (minX: number, minY: number, w: number, h: number): Box => ({
  minX,
  minY,
  maxX: minX + w,
  maxY: minY + h,
})

/** Where a world point lands on screen under a viewport. */
const toScreen = (v: Viewport, wx: number, wy: number): [number, number] => [wx * v.zoom + v.x, wy * v.zoom + v.y]

/** Is every corner of this box inside the window? */
function allOnScreen(v: Viewport, b: Box, vw = VW, vh = VH): boolean {
  const [x1, y1] = toScreen(v, b.minX, b.minY)
  const [x2, y2] = toScreen(v, b.maxX, b.maxY)
  return x1 >= 0 && y1 >= 0 && x2 <= vw && y2 <= vh
}

// -- the fit ----------------------------------------------------------------
{
  // fifteen desktop screens in a row, 1000 wide with 200 between them — an
  // ordinary week, and the exact shape ⇧1 used to give up on
  const week = box(0, 0, 15 * 1200 - 200, 900)
  const ideal = (VW - FIT_PADDING * 2) / (week.maxX - week.minX)
  check("a week's board is past the old floor", ideal < MIN_ZOOM, `ideal ${ideal.toFixed(3)}`)

  const fit = fitViewport(week, VW, VH)
  check("…and fits entirely on screen anyway", allOnScreen(fit.viewport, week))
  check("…without claiming it was clamped", !fit.clamped)
  check("…centred horizontally", close(fit.viewport.x + ((week.minX + week.maxX) / 2) * fit.viewport.zoom, VW / 2))
  check("…centred vertically", close(fit.viewport.y + ((week.minY + week.maxY) / 2) * fit.viewport.zoom, VH / 2))
  check("…and left the padding it promised", close(toScreen(fit.viewport, week.minX, 0)[0], FIT_PADDING, 0.5))

  // a board past even the fit floor: shown as much as possible, and it says so
  const absurd = box(0, 0, 400_000, 900)
  const huge = fitViewport(absurd, VW, VH)
  check("a board past the fit floor stops at the floor", close(huge.viewport.zoom, FIT_MIN_ZOOM))
  check("…and reports that it clamped", huge.clamped)
  check("…still centred on the board", close(huge.viewport.x + 200_000 * huge.viewport.zoom, VW / 2))

  // a single sticky note must not be blown up to fill the screen
  const note = fitViewport(box(0, 0, 40, 40), VW, VH)
  check("a tiny board stops at MAX_ZOOM", close(note.viewport.zoom, MAX_ZOOM))
  check("…and doesn't report a clamp", !note.clamped)

  // opening a file caps the fit at 1:1 — a small document arrives its own size
  const opened = fitViewport(box(0, 0, 200, 200), VW, VH, 1)
  check("an explicit cap holds", close(opened.viewport.zoom, 1))

  // a window shorter than two paddings would otherwise fit to a negative zoom
  const cramped = fitViewport(box(0, 0, 600, 400), 320, 160)
  check("a tiny window still fits to a positive zoom", cramped.viewport.zoom > 0)
  check("…and doesn't invert the box", cramped.viewport.zoom <= MAX_ZOOM)
}

// -- the gesture floor ------------------------------------------------------
{
  check("a gesture stops at MIN_ZOOM", close(clampGestureZoom(0.12, 0.05), MIN_ZOOM))
  check("a gesture stops at MAX_ZOOM", close(clampGestureZoom(3, 9), MAX_ZOOM))
  // after a fit to 4%, zooming in must pick up from there rather than snapping
  // back up to 10% and skipping half the board on the way
  check("zooming in from a fit's 4% lands at 5%", close(clampGestureZoom(0.04, 0.05), 0.05))
  check("…and zooming further out holds where it is", close(clampGestureZoom(0.04, 0.02), 0.04))
  check("the floor follows you down", close(zoomFloor(0.04), 0.04))
  check("…and never above MIN_ZOOM", close(zoomFloor(2), MIN_ZOOM))
}

// -- the reveal -------------------------------------------------------------
{
  const at = (zoom: number, x = 0, y = 0): Viewport => ({ zoom, x, y })

  // dead centre of the window at 1:1 — nothing to do
  const middle = box(600, 350, 200, 200)
  check("a node already centred holds still", revealViewport(at(1), middle, VW, VH).kind === "hold")

  // just inside the window but tucked under where the inspector floats
  const underPanel = box(1330, 350, 80, 80)
  check("a node in the outer band is not 'visible'", revealViewport(at(1), underPanel, VW, VH).kind === "pan")

  // the next screen over, entirely off to the right
  const away = box(4000, 200, 900, 600)
  const move = revealViewport(at(1), away, VW, VH)
  check("an off-screen node gets a pan", move.kind === "pan")
  if (move.kind === "pan") {
    check("…at the same zoom", close(move.viewport.zoom, 1))
    check("…centred on the node", close(move.viewport.x + 4450, VW / 2) && close(move.viewport.y + 500, VH / 2))
    check("…and now on screen", allOnScreen(move.viewport, away))
    // and asking again, from where it landed, is a no-op rather than a lurch
    check("…and asking again holds still", revealViewport(move.viewport, away, VW, VH).kind === "hold")
  }

  // taller and wider than the window at this zoom: panning can't show it whole
  const whole = box(0, 0, 4000, 3000)
  check("a node too big to pan to asks for a fit", revealViewport(at(1), whole, VW, VH).kind === "fit")
  // …but at a zoom where it does fit, it's a pan again
  check("…and a pan once the zoom allows it", revealViewport(at(0.2), whole, VW, VH).kind === "pan")

  // the fit a reveal falls back to must not bounce straight back to "fit"
  const fitted = fitViewport(whole, VW, VH).viewport
  check("a fitted node is settled, not re-fitted", revealViewport(fitted, whole, VW, VH).kind !== "fit")
}

// -- the search -------------------------------------------------------------

let seq = 0
function frame(label: string, x = 0): ComponentNode {
  return {
    id: `frame${seq++}`,
    type: "component",
    kind: "frame",
    props: { label, preset: "desktop" },
    x,
    y: 0,
    w: 1000,
    h: 700,
    seed: 1,
  }
}

function words(text: string, over: Partial<TextNode> = {}): TextNode {
  return {
    id: `text${seq++}`,
    type: "text",
    text,
    fontSize: 16,
    x: 0,
    y: 0,
    w: 200,
    h: 40,
    seed: 2,
    ...over,
  }
}

function block(kind: string, props: Record<string, unknown> = {}): ComponentNode {
  return { id: `block${seq++}`, type: "component", kind, props, x: 0, y: 0, w: 400, h: 300, seed: 3 }
}

function rect(): ShapeNode {
  return { id: `rect${seq++}`, type: "shape", shape: "rect", fill: "none", x: 0, y: 0, w: 100, h: 100, seed: 4 }
}

function doc(list: SquigNode[]): [Record<string, SquigNode>, string[]] {
  return [Object.fromEntries(list.map((n) => [n.id, n])), list.map((n) => n.id)]
}

{
  const checkout = frame("Checkout flow", 0)
  const settings = frame("Settings", 2000)
  const login = block("login")
  const heading = words("Checkout")
  const prose = words(
    "the checkout step is where people give up, so this screen has to be shorter than the one before it"
  )
  const [nodes, order] = doc([checkout, settings, login, heading, prose, rect(), rect()])

  const hits = searchNodes(nodes, order, "checkout")
  check("a frame is found by its label", hits.some((h) => h.id === checkout.id))
  check("…and reads as its label", hits.find((h) => h.id === checkout.id)?.label === "Checkout flow")
  check("…tagged with what it is", hits.find((h) => h.id === checkout.id)?.detail === "Frame")
  check("a heading and a paragraph both match", hits.some((h) => h.id === heading.id) && hits.some((h) => h.id === prose.id))

  const rank = hits.map((h) => h.id)
  check("the frame label outranks the paragraph", rank.indexOf(checkout.id) < rank.indexOf(prose.id))
  check("the heading outranks the paragraph", rank.indexOf(heading.id) < rank.indexOf(prose.id))

  // a component is findable by the name the library gives it
  const byKind = searchNodes(nodes, order, "login screen")
  check("a component is found by its kind's name", byKind.length === 1 && byKind[0].id === login.id)
  check("…labelled with that name", byKind[0]?.label === "Login screen")
  check("a component is found by its bare kind too", searchNodes(nodes, order, "login").some((h) => h.id === login.id))
  check("…and by the def's keywords", searchNodes(nodes, order, "signin").some((h) => h.id === login.id))

  // the quiet cases
  check("nothing matches, nothing comes back", searchNodes(nodes, order, "zzzz").length === 0)
  check("a one-letter query is not a search", searchNodes(nodes, order, "c").length === 0)
  check("an empty query is not a search", searchNodes(nodes, order, "   ").length === 0)
  check("shapes carry no words", !searchNodes(nodes, order, "rect").length)

  // a board of nothing but rectangles never grows a section
  const [bare, bareOrder] = doc([rect(), rect(), rect(), rect(), rect(), rect()])
  check("six rectangles answer nothing", searchNodes(bare, bareOrder, "screen").length === 0)
}

{
  // a start-of-word hit beats one buried mid-word, at the same tier
  const front = words("Checkout total")
  const buried = words("Precheckout notes")
  const [nodes, order] = doc([buried, front])
  const rank = searchNodes(nodes, order, "checkout").map((h) => h.id)
  check("a word start outranks a mid-word hit", rank[0] === front.id)
}

{
  // an unedited frame still says "Screen" on the canvas, so it is still
  // findable — searching what is drawn, not what was typed
  const plain: ComponentNode = { ...frame("x"), props: { preset: "phone" } }
  const [nodes, order] = doc([plain])
  check("a default label is searchable", searchNodes(nodes, order, "screen").some((h) => h.id === plain.id))
}

{
  // locked layers are never in the selection, so jumping to one is a dead end
  const locked = { ...frame("Background board"), locked: true }
  const [nodes, order] = doc([locked])
  check("a locked layer is not offered", searchNodes(nodes, order, "background").length === 0)
}

{
  // the limit holds, and a paragraph shows the line the match is on
  const many = Array.from({ length: 20 }, (_, i) => frame(`Screen ${i}`, i * 1200))
  const [nodes, order] = doc(many)
  check("the list is capped", searchNodes(nodes, order, "screen", 6).length === 6)

  const multi = words("first line\nthe checkout summary\nlast line")
  const [n2, o2] = doc([multi])
  check("a paragraph shows the matching line", searchNodes(n2, o2, "checkout")[0]?.label === "the checkout summary")
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} navigate checks passed`)
