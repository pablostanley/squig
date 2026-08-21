// ---------------------------------------------------------------------------
// Arrow bindings — where a bound end lands, and what happens to the ones that
// can't land anywhere sensible.
//
//   node --experimental-strip-types scripts/test-arrows.ts
//
// lib/canvas/arrow-binding pulls in hit-test and types and nothing else, so
// this runs standalone with no bundler and no test framework.
// ---------------------------------------------------------------------------

import {
  anchorTargetAt,
  arrowEnds,
  bindTargetAt,
  bindable,
  edgeDistance,
  EDGE_GAP,
  endsPatch,
  remapBinds,
  routeEnds,
  settleBinds,
  snapsToObjects,
  withBind,
  withTarget,
} from "../lib/canvas/arrow-binding.ts"
import { normalizeArrowAnchors, normalizeBind, type ArrowNode, type ShapeNode, type SquigNode } from "../lib/types.ts"
import { arrowRouteBounds, localArrowRoute, nodeVisualBounds, sampleArrowRoute, worldRouteHandle } from "../lib/canvas/line-routing.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

type Point = [number, number]

function pointIs(name: string, got: Point, want: Point, eps = 1e-6) {
  const ok = close(got[0], want[0], eps) && close(got[1], want[1], eps)
  check(name, ok, ok ? "" : `got [${got[0].toFixed(3)}, ${got[1].toFixed(3)}], want [${want[0]}, ${want[1]}]`)
}

const finite = (p: Point) => Number.isFinite(p[0]) && Number.isFinite(p[1])

// -- fixtures ---------------------------------------------------------------
// `function` rather than an arrow with a defaulted parameter: tsc mis-parses
// `(o: T = {}): T => ({...})` in a .ts file with no JSX to disambiguate it.

function box(id: string, x: number, y: number, w: number, h: number): ShapeNode {
  return { id, type: "shape", shape: "rect", fill: "none", x, y, w, h, seed: 1 }
}

function oval(id: string, x: number, y: number, w: number, h: number): ShapeNode {
  return { id, type: "shape", shape: "ellipse", fill: "none", x, y, w, h, seed: 1 }
}

function arrow(over: Partial<ArrowNode>): ArrowNode {
  return {
    id: "arr",
    type: "arrow",
    x: 0,
    y: 0,
    w: 100,
    h: 0,
    seed: 1,
    head: true,
    points: [
      [0, 0],
      [100, 0],
    ],
    ...over,
  }
}

/** An arrow laid between two world points, the way the canvas writes one. */
function arrowBetween(a: Point, b: Point, over: Partial<ArrowNode>): ArrowNode {
  return { ...arrow(over), ...endsPatch(a, b) } as ArrowNode
}

function doc(list: SquigNode[]): Record<string, SquigNode> {
  return Object.fromEntries(list.map((n) => [n.id, n]))
}

// -- routed line geometry ---------------------------------------------------

{
  const elbow = arrow({ lineStyle: "elbow", h: 80, points: [[0, 0], [100, 80]] })
  const route = localArrowRoute(elbow)
  check("elbow: route is a polyline", route.kind === "polyline" && route.style === "elbow")
  if (route.kind === "polyline") {
    check(
      "elbow: every run is orthogonal",
      route.points.slice(1).every((p, i) => close(p[0], route.points[i][0]) || close(p[1], route.points[i][1]))
    )
    pointIs("elbow: starts at the connector tail", route.points[0], [0, 0])
    pointIs("elbow: ends at the connector head", route.points[route.points.length - 1], [100, 80])
  }

  const outside = localArrowRoute(arrow({ lineStyle: "elbow", h: 80, points: [[0, 0], [100, 80]], anchors: ["right", "right"] }))
  check(
    "elbow: same-facing anchors route outside both ends",
    outside.kind === "polyline" && outside.points.some(([x]) => x > 100)
  )

  const flat = worldRouteHandle(arrow({ lineStyle: "elbow" }))
  check("elbow: a collapsed horizontal route still offers a vertical dogleg handle", flat?.kind === "elbow" && flat.axis === "y")

  const curved = arrow({ lineStyle: "curved" })
  const curve = localArrowRoute(curved)
  const sampled = sampleArrowRoute(curved, 24)
  check("curve: automatic route visibly bows", curve.kind === "curve" && !close(curve.handle.offset[1], 0))
  if (curve.kind === "curve") pointIs("curve: handle sits on the curve", sampled[12], curve.handle.point)
  check("curve: visible bounds include the automatic bow", arrowRouteBounds(curved).y < curved.y)

  const bent = localArrowRoute(arrow({ lineStyle: "curved", curveBend: [12, 30] }))
  check(
    "curve: a manual midpoint is read relative to the endpoints",
    bent.kind === "curve" && close(bent.handle.point[0], 62) && close(bent.handle.point[1], 30)
  )

  const deep = arrow({ lineStyle: "curved", curveBend: [83, 1000] })
  const deepBounds = arrowRouteBounds(deep)
  check("curve: exact bounds include an extreme manual midpoint", close(deepBounds.y + deepBounds.h, 1000))
  check("visual bounds: routed arrows use their visible path", nodeVisualBounds(deep).h > deep.h)
}

// -- the ray, against a rectangle -------------------------------------------

{
  // a 200×100 box: 100 out along x, 50 out along y
  const r = box("r", 0, 0, 200, 100)
  check("rect: straight out the side is the half-width", close(edgeDistance(r, 1, 0), 100))
  check("rect: straight up is the half-height", close(edgeDistance(r, 0, -1), 50))

  // (0.6, 0.8) leaves through the bottom, because y runs out first
  const d = edgeDistance(r, 0.6, 0.8)
  pointIs("rect: a diagonal leaves through the edge that runs out first", [d * 0.6, d * 0.8], [37.5, 50])

  // the corner of a square is reached along the diagonal, both axes at once
  const sq = box("sq", 0, 0, 100, 100)
  const k = Math.SQRT1_2
  check("rect: a square's corner is on the 45° ray", close(edgeDistance(sq, k, k), 50 * Math.SQRT2))

  check("rect: the answer doesn't care which way round the ray points", close(edgeDistance(r, -1, 0), edgeDistance(r, 1, 0)))
}

// -- the ray, against an ellipse --------------------------------------------

{
  const e = oval("e", 0, 0, 200, 100)
  check("ellipse: straight out the side is the long radius", close(edgeDistance(e, 1, 0), 100))
  check("ellipse: straight up is the short radius", close(edgeDistance(e, 0, -1), 50))

  // the real test: the point it returns has to be *on* the ring
  for (const [ux, uy] of [
    [0.6, 0.8],
    [Math.SQRT1_2, -Math.SQRT1_2],
    [-0.28, 0.96],
  ] as Point[]) {
    const d = edgeDistance(e, ux, uy)
    const on = ((d * ux) / 100) ** 2 + ((d * uy) / 50) ** 2
    check(`ellipse: [${ux}, ${uy}] lands on the ring`, close(on, 1, 1e-9), `got ${on}`)
  }

  // an oval is inside its own box everywhere but the four cardinal points, so
  // a diagonal has to stop short of what a rectangle would give
  check("ellipse: a diagonal stops short of the box's", edgeDistance(e, 0.6, 0.8) < edgeDistance(box("b", 0, 0, 200, 100), 0.6, 0.8))

  // a circle is the same distance in every direction, which is the one case
  // where the two norms are allowed to disagree with each other and not with us
  const c = oval("c", 0, 0, 80, 80)
  check("ellipse: a circle answers the same in every direction", close(edgeDistance(c, 0.6, 0.8), 40) && close(edgeDistance(c, 1, 0), 40))
}

// -- both ends bound --------------------------------------------------------

{
  // two 100×100 boxes, centres 300 apart on the x axis
  const a = box("a", 0, 0, 100, 100)
  const b = box("b", 300, 0, 100, 100)
  const arr = arrowBetween([0, 0], [1, 1], { bind: ["a", "b"], anchors: ["right", "left"] })
  const nodes = doc([a, b, arr])

  const ends = routeEnds(arr, nodes)!
  pointIs("both bound: the tail leaves a's right edge, plus the gap", ends[0], [100 + EDGE_GAP, 50])
  pointIs("both bound: the head stops short of b's left edge", ends[1], [300 - EDGE_GAP, 50])
  check("both bound: the gap is on both ends", close(ends[0][0] - 100, EDGE_GAP) && close(300 - ends[1][0], EDGE_GAP))

  // the whole point: move a box and the arrow is somewhere else
  const moved = settleBinds(doc([a, { ...b, y: 400 }, arr]))
  const after = arrowEnds(moved.arr as ArrowNode)
  check("both bound: moving a box moves the arrow", after[1][1] > 100, `head y ${after[1][1]}`)
  pointIs("…and the tail stays locked to its chosen side", after[0], [100 + EDGE_GAP, 50])
  pointIs("…while the head stays on b's left midpoint", after[1], [300 - EDGE_GAP, 450])

  // and resizing one is the same question asked again
  const grown = settleBinds(doc([{ ...a, w: 200 }, b, arr]))
  const wide = arrowEnds(grown.arr as ArrowNode)
  check("both bound: widening a box pushes the tail out with it", close(wide[0][0], 200 + EDGE_GAP))

  // a settled document is a fixed point — the canvas settles on every write,
  // and a routing that crept would drift a millimetre per pointer move
  const once = settleBinds(nodes)
  const twice = settleBinds(once)
  check("routing is a fixed point", twice === once)

  // Bindings written before anchors existed are upgraded once, choosing the
  // primary sides they currently face, then stop changing sides.
  const legacy = settleBinds(doc([a, b, arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] })]))
  check("legacy bindings acquire stable anchors", JSON.stringify((legacy.arr as ArrowNode).anchors) === '["right","left"]')
  const rearranged = settleBinds(doc([a, { ...b, y: 600 }, legacy.arr as ArrowNode]))
  pointIs("a migrated anchor stays on the same side after rearranging", arrowEnds(rearranged.arr as ArrowNode)[0], [106, 50])
}

// -- one end bound ----------------------------------------------------------

{
  const a = box("a", 0, 0, 100, 100)
  // head parked out at (400, 50), tail attached to the box on the left
  const arr = arrowBetween([50, 50], [400, 50], { bind: ["a", null], anchors: ["right", null] })
  const nodes = doc([a, arr])
  const ends = routeEnds(arr, nodes)!
  pointIs("one bound: the free end doesn't move", ends[1], [400, 50])
  pointIs("one bound: the bound end comes off the edge facing it", ends[0], [100 + EDGE_GAP, 50])

  // Dragging the free end around does not silently change the side the user chose.
  const above = settleBinds(doc([a, { ...arr, ...endsPatch([50, 50], [50, -400]) } as ArrowNode]))
  const up = arrowEnds(above.arr as ArrowNode)
  pointIs("one bound: the chosen side remains stable", up[0], [100 + EDGE_GAP, 50])
}

// -- bound nodes that overlap -----------------------------------------------

{
  // two 200-wide boxes sitting mostly on top of each other: they want 106 units
  // of trim each out of 60 units of centre-to-centre
  const a = box("a", 0, 0, 200, 100)
  const b = box("b", 60, 0, 200, 100)
  const arr = arrowBetween([0, 0], [1, 1], { bind: ["a", "b"], anchors: ["right", "left"] })
  const ends = routeEnds(arr, doc([a, b, arr]))!

  check("overlapping: both ends are real numbers", finite(ends[0]) && finite(ends[1]))
  const run = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1])
  check("overlapping: there's still a visible run of line", run > 1, `run ${run}`)
  pointIs("overlapping: the tail keeps a's right anchor", ends[0], [200 + EDGE_GAP, 50])
  pointIs("overlapping: the head keeps b's left anchor", ends[1], [60 - EDGE_GAP, 50])
  const mid = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2]
  // centres are 100 and 160, so halfway is 130
  pointIs("overlapping: it sits between the two centres", mid as Point, [130, 50])

  // one box entirely inside the other is the same problem, harder
  const inner = box("b", 60, 30, 40, 40)
  const nested = routeEnds(arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] }), doc([a, inner]))!
  check("nested: still finite", finite(nested[0]) && finite(nested[1]))
}

// -- a node with no size ----------------------------------------------------

{
  const dot = box("a", 50, 50, 0, 0)
  const b = box("b", 300, 0, 100, 100)
  const ends = routeEnds(arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] }), doc([dot, b]))!
  check("zero-size: no NaN out of the 0/0", finite(ends[0]) && finite(ends[1]))
  // the outline of a point is the point, so only the gap stands the arrow off
  check("zero-size: the tail stands off by the gap alone", close(Math.hypot(ends[0][0] - 50, ends[0][1] - 50), EDGE_GAP))

  const flat = box("a", 0, 45, 200, 0)
  const thin = routeEnds(arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] }), doc([flat, b]))!
  check("zero-height: still finite", finite(thin[0]) && finite(thin[1]))

  const round = oval("a", 50, 50, 0, 0)
  const pip = routeEnds(arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] }), doc([round, b]))!
  check("zero-size oval: still finite", finite(pip[0]) && finite(pip[1]))
}

// -- coincident centres -----------------------------------------------------

{
  // two boxes stacked dead on top of each other: no direction to point in
  const a = box("a", 0, 0, 100, 100)
  const b = box("b", 0, 0, 100, 100)
  const ends = routeEnds(arrowBetween([0, 0], [1, 1], { bind: ["a", "b"], anchors: ["center", "center"] }), doc([a, b]))!
  check("coincident: no divide by zero", finite(ends[0]) && finite(ends[1]))
  check("coincident: the arrow lies down rather than collapsing", ends[1][0] > ends[0][0])
  check("…about the shared centre", close((ends[0][1] + ends[1][1]) / 2, 50))

  // and the patch that comes out of it is a document you could save
  const patch = endsPatch(ends[0], ends[1])
  check("coincident: the box it derives is finite", [patch.x, patch.y, patch.w, patch.h].every((n) => Number.isFinite(n!)))

  // the same, with nothing on either side to give a size
  const nowhere = routeEnds(arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] }), doc([box("a", 5, 5, 0, 0), box("b", 5, 5, 0, 0)]))!
  check("coincident points: still finite", finite(nowhere[0]) && finite(nowhere[1]))
}

// -- the box is a consequence -----------------------------------------------

{
  const a = box("a", 0, 0, 100, 100)
  const b = box("b", 300, 200, 100, 100)
  const settled = settleBinds(doc([a, b, arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] })]))
  const arr = settled.arr as ArrowNode
  const ends = arrowEnds(arr)
  check("the derived box holds both ends", close(arr.x, Math.min(ends[0][0], ends[1][0])) && close(arr.w, Math.abs(ends[1][0] - ends[0][0])))
  check("…and its points are still relative to its own origin", close(arr.x + arr.points[0][0], ends[0][0]))

  // a flip on a bound arrow would mirror the answer a second time, so routing
  // takes it off; the ends it lands on are read through the flip first
  const flipped = settleBinds(doc([a, b, { ...arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] }), flipX: true } as ArrowNode]))
  check("routing takes the flips off a bound arrow", !(flipped.arr as ArrowNode).flipX)
}

// -- deleting the far end ---------------------------------------------------

{
  const a = box("a", 0, 0, 100, 100)
  const b = box("b", 300, 0, 100, 100)
  const settled = settleBinds(doc([a, b, arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] })]))
  const before = arrowEnds(settled.arr as ArrowNode)

  // b goes away; the arrow keeps the picture it had
  const after = settleBinds(doc([a, settled.arr as SquigNode]))
  const arr = after.arr as ArrowNode
  check("deleting a bound node drops the binding", arr.bind?.[1] === null || arr.bind === undefined)
  check("…and keeps the other one", arr.bind?.[0] === "a")
  pointIs("…and leaves the head exactly where it was", arrowEnds(arr)[1], before[1])
  check("…and doesn't collapse the arrow to nothing", arr.w > 1)

  // both gone: the whole binding goes, the arrow stays put
  const orphan = settleBinds(doc([settled.arr as SquigNode]))
  check("with nothing left to hold, the binding is dropped outright", (orphan.arr as ArrowNode).bind === undefined)
  pointIs("…and the arrow still hasn't moved", arrowEnds(orphan.arr as ArrowNode)[0], before[0])

  // an id that names an arrow is no better than one that names nothing
  const cyclic = settleBinds(doc([a, arrowBetween([0, 0], [1, 1], { id: "other", bind: [null, null] }), arrowBetween([0, 0], [1, 1], { bind: ["a", "other"] })]))
  check("an arrow can't be bound to another arrow", (cyclic.arr as ArrowNode).bind?.[1] === null)
}

// -- nothing changed, nothing rewritten -------------------------------------

{
  const nodes = doc([box("a", 0, 0, 100, 100), arrowBetween([0, 0], [200, 0], {})])
  check("a document with no bindings comes back untouched", settleBinds(nodes) === nodes)

  const bound = settleBinds(doc([box("a", 0, 0, 100, 100), box("b", 300, 0, 100, 100), arrowBetween([0, 0], [1, 1], { bind: ["a", "b"] })]))
  const again = settleBinds(bound)
  check("…and so does a settled one, so a colour change redraws nothing", again === bound)
}

// -- copying ----------------------------------------------------------------

{
  // the trio, copied whole: the copy's arrow must point at the copies
  const map = new Map([
    ["a", "a2"],
    ["b", "b2"],
    ["arr", "arr2"],
  ])
  const clones: SquigNode[] = [
    box("a2", 0, 0, 100, 100),
    box("b2", 300, 0, 100, 100),
    arrowBetween([0, 0], [1, 1], { id: "arr2", bind: ["a", "b"], anchors: ["bottom", "center"] }),
  ]
  remapBinds(clones, map)
  const copied = clones[2] as ArrowNode
  check("duplicate: the copy's arrow points at the copies", copied.bind?.[0] === "a2" && copied.bind?.[1] === "b2")
  check("duplicate: the copy keeps both chosen anchors", JSON.stringify(copied.anchors) === '["bottom","center"]')

  // and the copy is genuinely independent: moving the original box leaves it
  const both = settleBinds(doc([box("a", 0, 0, 100, 100), box("b", 300, 0, 100, 100), ...clones]))
  const at = arrowEnds(both.arr2 as ArrowNode)
  const shifted = settleBinds(doc([box("a", 0, 800, 100, 100), box("b", 300, 0, 100, 100), ...clones]))
  pointIs("duplicate: moving the original leaves the copy alone", arrowEnds(shifted.arr2 as ArrowNode)[0], at[0])

  // the arrow on its own has nothing to point at and comes away loose
  const lone: SquigNode[] = [arrowBetween([0, 0], [1, 1], { id: "arr3", bind: ["a", "b"] })]
  remapBinds(lone, new Map([["arr", "arr3"]]))
  check("copying an arrow without its boxes gives a loose arrow", (lone[0] as ArrowNode).bind === undefined)

  // half a copy keeps the half it can
  const half: SquigNode[] = [arrowBetween([0, 0], [1, 1], { id: "arr4", bind: ["a", "b"], anchors: ["top", "right"] })]
  remapBinds(half, new Map([["a", "a4"]]))
  check("copying one of the two boxes keeps that one end", (half[0] as ArrowNode).bind?.[0] === "a4")
  check("…and lets the other go", (half[0] as ArrowNode).bind?.[1] === null)
  check("…and clears only the released end's anchor", JSON.stringify((half[0] as ArrowNode).anchors) === '["top",null]')
}

// -- a stranger's document --------------------------------------------------

{
  check("a binding has to be two entries", normalizeBind(["a"]) === undefined)
  check("…and not a string", normalizeBind("a") === undefined)
  check("…and not a number pretending to be an id", normalizeBind([1, 2]) === undefined)
  check("two nulls is spelled 'absent'", normalizeBind([null, null]) === undefined)
  check("one id survives on its own", JSON.stringify(normalizeBind([null, "b"])) === '[null,"b"]')
  check("valid anchors survive", JSON.stringify(normalizeArrowAnchors(["top", "center"], ["a", "b"])) === '["top","center"]')
  check("unknown anchors are dropped", JSON.stringify(normalizeArrowAnchors(["corner", "left"], ["a", "b"])) === '[null,"left"]')
  check("a free end cannot retain an anchor", normalizeArrowAnchors(["top", null], [null, "b"]) === undefined)

  // an id nobody in the document answers to is dropped on the way in
  const stranger = settleBinds(doc([box("a", 0, 0, 100, 100), arrowBetween([0, 0], [200, 0], { bind: ["a", "ghost"] })]))
  check("an id naming nothing is let go", (stranger.arr as ArrowNode).bind?.[1] === null)
}

// -- picking a target -------------------------------------------------------

{
  const hollow = box("a", 0, 0, 100, 100)
  const arr = arrowBetween([0, 0], [200, 0], { bind: [null, null] })
  const nodes = doc([hollow, arr])
  const order = ["a", "arr"]

  check("the middle of an empty box counts", bindTargetAt(nodes, order, 50, 50, 1) === "a")
  check("…and so does its outline", bindTargetAt(nodes, order, 0, 50, 1) === "a")
  check("empty canvas grabs nothing", bindTargetAt(nodes, order, 900, 900, 1) === null)
  check("an arrow is never a target", bindTargetAt(nodes, order, 150, 0, 1) === null)
  check("…and neither is a node the caller ruled out", bindTargetAt(nodes, order, 50, 50, 1, ["a"]) === null)

  // an oval's corners are empty air, the same way they are to a click
  const round = doc([oval("o", 0, 0, 100, 100)])
  check("an oval isn't grabbable by the corner of its box", bindTargetAt(round, ["o"], 2, 2, 1) === null)
  check("…but is by its middle", bindTargetAt(round, ["o"], 50, 50, 1) === "o")

  const top = anchorTargetAt(nodes, order, 50, 2, 1)
  const right = anchorTargetAt(nodes, order, 98, 50, 1)
  const bottom = anchorTargetAt(nodes, order, 50, 98, 1)
  const left = anchorTargetAt(nodes, order, 2, 50, 1)
  const center = anchorTargetAt(nodes, order, 50, 50, 1)
  check("the top zone resolves to the top midpoint", top?.anchor === "top")
  check("the right zone resolves to the right midpoint", right?.anchor === "right")
  check("the bottom zone resolves to the bottom midpoint", bottom?.anchor === "bottom")
  check("the left zone resolves to the left midpoint", left?.anchor === "left")
  check("the center zone resolves to center", center?.anchor === "center")
  check("the capture reach is screen-sized", anchorTargetAt(nodes, order, -15, 50, 1)?.anchor === "left")
  check("the capture reach scales with zoom", anchorTargetAt(nodes, order, -8, 50, 2)?.anchor === "left")
  check("the same world gap is too far when zoomed in", anchorTargetAt(nodes, order, -15, 50, 2) === null)

  check("an arrow can't be a binding target at all", !bindable(arr))
  check("…and a shape can", bindable(hollow))
}

// -- setting one end at a time ----------------------------------------------

{
  check("attaching the tail leaves the head alone", JSON.stringify(withBind([null, "b"], 0, "a")) === '["a","b"]')
  check("letting the head go leaves the tail attached", JSON.stringify(withBind(["a", "b"], 1, null)) === '["a",null]')
  check("letting the last one go clears the binding", withBind(["a", null], 0, null) === undefined)

  const attached = arrow({ bind: ["a", null], anchors: ["top", null] })
  const switched = withTarget(attached, 0, { id: "a", anchor: "bottom" })
  check("switching sides updates the anchor without losing the target", switched.bind?.[0] === "a" && switched.anchors?.[0] === "bottom")

  const free = arrowBetween([106, 50], [250, 50], { bind: ["a", null], anchors: ["right", null], snap: false })
  const released = settleBinds(doc([box("a", 0, 0, 100, 100), free])).arr as ArrowNode
  check("Snap off drops live relationships", released.bind === undefined && released.anchors === undefined)
  pointIs("Snap off leaves the endpoint where it was", arrowEnds(released)[0], [106, 50])
  check("Snap off is the only opt-out state", !snapsToObjects(released) && snapsToObjects(arrow({})))
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} arrow checks passed`)
