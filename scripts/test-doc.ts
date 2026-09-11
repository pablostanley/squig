// ---------------------------------------------------------------------------
// The document as a plain value — the rules every door has to agree on.
//
//   node --experimental-strip-types scripts/test-doc.ts
//
// lib/doc is what the store, window.squig, the CLI and the MCP server all
// stand on, so a rule that only half-holds here goes wrong in four places at
// once. Two things are worth the ink: the sanitizer, which is the last thing
// between a file somebody edited by hand and a canvas that throws on its first
// render, and the builders, because an agent placing a node is working blind —
// it never sees what it drew, so "no component called that" has to arrive as a
// sentence rather than as a node quietly missing from the drawing.
//
// Every id and seed below is written down. Nothing here should depend on which
// second it ran in.
// ---------------------------------------------------------------------------

import {
  addNodes,
  arrowNode,
  bringToFront,
  componentNode,
  describeComponent,
  docBounds,
  emptyDoc,
  listComponents,
  nodesOf,
  parseDoc,
  removeNodes,
  sanitizeDoc,
  sendToBack,
  serializeDoc,
  shapeNode,
  textNode,
  updateNode,
  patchNode,
  groupNodes,
  DocError,
  type SquigDocument,
} from "../lib/doc.ts"
import type { ArrowNode, ComponentNode, ShapeNode, SquigNode, TextNode } from "../lib/types.ts"
import type { TextMeasurer } from "../lib/canvas/text-metrics.ts"
import type { Look } from "../lib/theme.ts"
import { check, report } from "./harness.ts"

// -- fixtures ---------------------------------------------------------------

const LOOK: Look = { theme: "graphite", paper: "white", font: "sans", grid: false }

/** the message a thrown DocError carried, or "" when the call didn't throw */
function threw(fn: () => unknown): string {
  try {
    fn()
    return ""
  } catch (e) {
    return e instanceof DocError ? e.message : `${e}`
  }
}

const button = (id: string, x = 0, y = 0) => componentNode("button", { id, seed: 1, x, y })

// -- a file, out and back again ---------------------------------------------

{
  const doc: SquigDocument = addNodes(emptyDoc("a drawing", LOOK), [
    button("btn", 10, 20),
    shapeNode("rect", { id: "box", seed: 2, x: 0, y: 0, w: 40, h: 30, fill: "light" }),
  ])
  const json = serializeDoc(doc)
  const written = JSON.parse(json) as Record<string, unknown>

  // the two fields nothing in squig reads and every other reader does: they
  // are how a stray .json on disk announces what wrote it
  check("a written document says what app it is", written.app === "squig")
  check("…and which version of the format", written.version === 1)

  const back = parseDoc(json)
  check("a document survives the round trip", !!back)
  check("…with its name", back?.fileName === "a drawing")
  check("…its look", JSON.stringify(back?.look) === JSON.stringify(LOOK))
  check("…and its nodes, in order", JSON.stringify(back?.order) === JSON.stringify(["btn", "box"]))
  check("…node for node", JSON.stringify(back?.nodes) === JSON.stringify(doc.nodes))
}

// -- what a document has to survive -----------------------------------------

{
  // The four repairs that have to happen before the canvas sees a file: one of
  // these nodes is unreadable, one is misfiled, one speaks an older dialect,
  // and the z-order has heard of neither.
  const clean = sanitizeDoc(
    {
      keyed: { id: "some-other-name", seed: 1, type: "shape", shape: "rect", x: 0, y: 0, w: 10, h: 10, fill: true },
      broken: { id: "broken", seed: 1, type: "shape", shape: "rect", x: NaN, y: 0, w: 10, h: 10 },
    },
    ["broken"]
  )

  check("a node with NaN geometry doesn't make it in", !clean.nodes.broken)
  check("…and can't hold a place in the z-order either", !clean.order.includes("broken"))
  // the key is the name the order, the selection and every arrow spell it by;
  // a node claiming a different one in its own `id` field is the misfiling
  check("the map key is the node's name", clean.nodes.keyed?.id === "keyed")
  check("a boolean fill grows up into a tone", (clean.nodes.keyed as ShapeNode).fill === "strong")
  check("a node the order forgot gets appended", JSON.stringify(clean.order) === JSON.stringify(["keyed"]))
}

{
  // a stranger's file can point an arrow at a node that was never in it
  const clean = sanitizeDoc(
    {
      a: {
        id: "a",
        seed: 1,
        type: "arrow",
        head: true,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        points: [
          [0, 0],
          [10, 10],
        ],
        bind: ["ghost", null],
      },
    },
    ["a"]
  )
  const arrow = clean.nodes.a as ArrowNode
  check("an arrow bound to a node that isn't here lets go", !arrow.bind)
  check("…and stays where it was drawn", JSON.stringify(arrow.points) === JSON.stringify([[0, 0], [10, 10]]))
}

// -- what isn't a document --------------------------------------------------

{
  check("prose isn't a document", parseDoc("dear squig, please draw me a login screen") === null)
  check("neither is a bare array", parseDoc("[1,2,3]") === null)

  // The one that matters. A file that had layers and lost every one of them
  // reads as an empty drawing, and taking it would trade the canvas on screen
  // for a blank one with nothing on it to say why.
  const lost = JSON.stringify({ nodes: { a: { id: "a", type: "nonsense" } }, order: ["a"] })
  check("a document that lost every layer is refused", parseDoc(lost) === null)

  // a genuinely empty export had nothing to lose, so it comes in
  const blank = parseDoc(JSON.stringify({ nodes: {}, order: [] }))
  check("a blank document is still a document", !!blank && blank.order.length === 0)
  check("…and gets a name to be filed under", blank?.fileName === "imported scribbles")

  // a file with no look — or a look nobody recognises — wears whatever the
  // canvas is already wearing rather than snapping to a default
  const noLook = parseDoc(JSON.stringify({ nodes: {}, order: [], look: "chartreuse" }), "n", LOOK)
  check("an unreadable look falls back to the one on screen", JSON.stringify(noLook?.look) === JSON.stringify(LOOK))
}

// -- building a component ---------------------------------------------------

{
  const b = componentNode("button", { id: "b", seed: 1, x: 5, y: 6 })
  check("a component arrives at its def's size", b.w === 132 && b.h === 40)
  check("…where it was asked for", b.x === 5 && b.y === 6)
  check("…wearing the def's defaults", b.props.label === "Click me" && b.props.variant === "filled")

  const named = componentNode("button", { id: "b", seed: 1, x: 0, y: 0, props: { label: "hi" } })
  check("given props sit on top of the defaults", named.props.label === "hi")
  check("…without knocking the rest off", named.props.variant === "filled")

  check(
    "an unknown kind says so, and says where to look",
    threw(() => componentNode("buttonn", { x: 0, y: 0 })) === 'no component called "buttonn" — try listComponents("buttonn")'
  )
}

// -- building text ----------------------------------------------------------

{
  const short = textNode("hi", { id: "t", seed: 1, x: 100, y: 10 })
  const long = textNode("hi there friend", { id: "t", seed: 1, x: 100, y: 10 })
  check("a text layer hugs its words", long.w > short.w)
  check("…and one line stays one line tall", long.h === short.h)
  check("left-aligned x is the left edge", short.x === 100)

  const mid = textNode("hi", { id: "t", seed: 1, x: 100, y: 10, align: "center" })
  check("centre-aligned x is the middle", mid.x + mid.w / 2 === 100)

  // a measure turns hugging off: the words wrap to the width they were given
  // and the box grows downward instead
  const wrapped = textNode("one two three four five six seven eight nine", { id: "t", seed: 1, x: 0, y: 0, w: 100 })
  check("a given w fixes the measure", wrapped.fixedW === true && wrapped.w === 100)
  check("…and the words wrap into more lines", wrapped.h > short.h)

  check("a fontSize of zero is not a font size", threw(() => textNode("hi", { x: 0, y: 0, fontSize: 0 })) !== "")
}

// -- building a shape -------------------------------------------------------

{
  const s = shapeNode("rect", { id: "s", seed: 1, x: 1, y: 2, w: 30, h: 40 })
  check("a shape is where and what it was asked to be", s.shape === "rect" && s.x === 1 && s.y === 2)
  check("…and starts unfilled", s.fill === "none")
  // the defaults are absent rather than spelled out, so a document doesn't
  // carry a line per node saying "ordinary"
  check("…with nothing written down that didn't have to be", !("stroke" in s) && !("ink" in s) && !("dashed" in s))
}

// -- building an arrow ------------------------------------------------------

{
  const doc = addNodes(emptyDoc("a", LOOK), [button("from", 0, 0), componentNode("card", { id: "to", seed: 2, x: 400, y: 300 })])
  const a = arrowNode({ id: "a", seed: 3, from: "from", to: "to" }, doc.nodes)
  const from = doc.nodes.from
  const to = doc.nodes.to

  check("a bound arrow remembers both ends", JSON.stringify(a.bind) === JSON.stringify(["from", "to"]))
  // before the document routes it, the arrow runs centre to centre — which is
  // exactly the box those two points describe
  check("…and its box spans the two centres", a.x === from.x + from.w / 2 && a.y === from.y + from.h / 2)
  check("…corner to corner", a.w === to.x + to.w / 2 - a.x && a.h === to.y + to.h / 2 - a.y)

  const free = arrowNode({ id: "f", seed: 3, from: [10, 10], to: [30, 50] }, {})
  check("a free arrow binds to nothing", !free.bind)
  check("…and is just its two points", free.x === 10 && free.y === 10 && free.w === 20 && free.h === 40)

  check(
    "an arrow can't point at itself",
    threw(() => arrowNode({ from: "from", to: "from" }, doc.nodes)) === "an arrow can't run from a node to itself"
  )
  check(
    "…nor at a node that isn't here",
    threw(() => arrowNode({ from: "nobody", to: [0, 0] }, doc.nodes)) ===
      'arrow "from" names a node that isn\'t in the document: "nobody"'
  )
}

// -- adding to a document ---------------------------------------------------

{
  const doc = addNodes(emptyDoc("a", LOOK), [button("b", 0, 0)])

  // A document is a map, so handing in a node with a name that's taken would
  // write over the one already there — which is how an agent loses somebody's
  // work without either of them noticing.
  check(
    "an id that's taken is refused, not overwritten",
    threw(() => addNodes(doc, [button("b", 99, 99)])) === 'there is already a node called "b"'
  )
  check("…and the drawing is untouched", doc.nodes.b.x === 0)
  check(
    "an id squig can't spell is refused too",
    threw(() => addNodes(doc, [shapeNode("rect", { id: "a b!", x: 0, y: 0, w: 1, h: 1 })])) !== ""
  )
  check(
    "so is a node a light-year off the sheet",
    threw(() => addNodes(doc, [shapeNode("rect", { id: "far", x: 5e9, y: 0, w: 1, h: 1 })])) !== ""
  )

  // a bound arrow arrives pointing centre to centre and comes out routed:
  // anchors are the document deciding which sides it actually leaves from
  const withCard = addNodes(doc, [componentNode("card", { id: "c", seed: 2, x: 400, y: 300 })])
  const added = addNodes(withCard, [arrowNode({ id: "a", seed: 3, from: "b", to: "c" }, withCard.nodes)])
  const arrow = added.nodes.a as ArrowNode
  check("a bound arrow settles onto sides when it lands", !!arrow.anchors && arrow.anchors.every(Boolean))
  check("…and the document keeps it on top", JSON.stringify(added.order) === JSON.stringify(["b", "c", "a"]))
}

// -- changing a node --------------------------------------------------------

{
  const doc = addNodes(emptyDoc("a", LOOK), [textNode("hi", { id: "t", seed: 1, x: 0, y: 0 })])
  const before = doc.nodes.t as TextNode
  const after = updateNode(doc, "t", { text: "hi there friend" } as Partial<SquigNode>).nodes.t as TextNode

  check("new words re-fit the box", after.w > before.w)
  check("…and the words are the new ones", after.text === "hi there friend")
  check("the document it came from is left alone", (doc.nodes.t as TextNode).text === "hi")

  check(
    "a text layer can't become a shape",
    threw(() => updateNode(doc, "t", { type: "shape" } as Partial<SquigNode>)) === "a text can't become a shape"
  )
  check(
    "a node that isn't here can't be changed",
    threw(() => updateNode(doc, "nobody", { x: 1 })) === 'no node called "nobody"'
  )
}

// -- taking nodes off the sheet ---------------------------------------------

{
  const base = addNodes(emptyDoc("a", LOOK), [button("b", 0, 0), componentNode("card", { id: "c", seed: 2, x: 400, y: 300 })])
  const doc = addNodes(base, [arrowNode({ id: "a", seed: 3, from: "b", to: "c" }, base.nodes)])
  const drawn = doc.nodes.a as ArrowNode

  const gone = removeNodes(doc, ["c"])
  const arrow = gone.nodes.a as ArrowNode

  check("the node is off the sheet", !gone.nodes.c && !gone.order.includes("c"))
  check("the arrow that pointed at it lets that end go", arrow.bind?.[1] === null)
  check("…and holds on to the end that's still there", arrow.bind?.[0] === "b")
  // letting go is not the same as moving: the line stays where it was last
  // drawn, so the drawing doesn't rearrange itself while you delete
  check("…and stays exactly where it was drawn", JSON.stringify(arrow.points) === JSON.stringify(drawn.points))
}

// -- grouping ---------------------------------------------------------------

{
  const doc = addNodes(emptyDoc("a", LOOK), [button("b", 0, 0), button("c", 200, 0)])
  const g = groupNodes(doc, ["b", "c"])

  check("grouping two nodes makes a group", !!g)
  check("…stamped on both of them", g?.doc.nodes.b.groupIds?.includes(g.groupId) === true)
  check("…the same one", JSON.stringify(g?.doc.nodes.b.groupIds) === JSON.stringify(g?.doc.nodes.c.groupIds))

  // one node is not a group; neither is a group that is already whole
  check("one node is nothing to group", groupNodes(doc, ["b"]) === null)
  check("nothing at all is nothing to group", groupNodes(doc, []) === null)
}

// -- z-order ----------------------------------------------------------------

{
  const doc = addNodes(emptyDoc("a", LOOK), [button("a", 0, 0), button("b", 0, 0), button("c", 0, 0)])
  check("bringToFront puts them on top", JSON.stringify(bringToFront(doc, ["a"]).order) === JSON.stringify(["b", "c", "a"]))
  check("sendToBack puts them underneath", JSON.stringify(sendToBack(doc, ["c"]).order) === JSON.stringify(["c", "a", "b"]))
  // several at once keep the order they already had between themselves
  check("…and a set keeps its own order", JSON.stringify(bringToFront(doc, ["a", "b"]).order) === JSON.stringify(["c", "a", "b"]))
}

// -- reading the document ---------------------------------------------------

{
  const doc = addNodes(emptyDoc("a", LOOK), [
    shapeNode("rect", { id: "s", seed: 1, x: 10, y: 20, w: 30, h: 40 }),
    shapeNode("rect", { id: "t", seed: 1, x: 100, y: 0, w: 10, h: 10 }),
  ])
  check("nodesOf reads in draw order", nodesOf(doc).map((n) => n.id).join(",") === "s,t")
  check("bounds cover everything", JSON.stringify(docBounds(doc)) === JSON.stringify({ minX: 10, minY: 0, maxX: 110, maxY: 60 }))
  check("a blank document has no bounds", docBounds(emptyDoc()) === null)
}

// -- the catalog ------------------------------------------------------------

{
  const found = listComponents("button")
  check("searching for a button finds the button", found.some((d) => d.kind === "button"))
  check("…and every hit is placeable", found.every((d) => d.size.w > 0 && d.size.h > 0))
  check("no query lists the whole library", listComponents().length >= found.length)

  const info = describeComponent("button")
  check("a description carries the props a caller can set", !!info?.controls.length)
  check("…and what they start at", info?.defaults.label === "Click me")
  check("an unknown kind describes as nothing", describeComponent("buttonn") === null)
}

// -- a locked layer stays out of a group -------------------------------------

{
  const doc = addNodes(emptyDoc("locks"), [
    shapeNode("rect", { x: 0, y: 0, w: 10, h: 10, id: "bg", seed: 1, locked: true }),
    shapeNode("rect", { x: 0, y: 0, w: 10, h: 10, id: "a", seed: 1 }),
    shapeNode("rect", { x: 0, y: 0, w: 10, h: 10, id: "b", seed: 1 }),
  ])
  const g = groupNodes(doc, ["bg", "a", "b"])
  check("the loose two still group", !!g && g.doc.nodes.a.groupIds?.[0] === g.groupId)
  check("…and the locked one is left out of it", g?.doc.nodes.bg.groupIds === undefined)
  check("…and left where it was in the order", g?.doc.order[0] === "bg")
  check("a locked layer and one loose one is nothing to group", groupNodes(doc, ["bg", "a"]) === null)
}

// -- an update reaches exactly as far as it should ---------------------------

{
  const doc = addNodes(emptyDoc("reach"), [
    componentNode("button", { x: 0, y: 0, id: "b", seed: 1, props: { variant: "outline", label: "Back" } }),
    shapeNode("rect", { x: 0, y: 0, w: 10, h: 10, id: "p", seed: 1 }),
    shapeNode("rect", { x: 20, y: 0, w: 10, h: 10, id: "q", seed: 1 }),
  ])
  const relabeled = updateNode(doc, "b", { props: { label: "Next" } } as Partial<SquigNode>)
  const b = relabeled.nodes.b as ComponentNode
  check("setting a label keeps the variant", b.props.variant === "outline" && b.props.label === "Next")

  const grouped = groupNodes(doc, ["p", "q"])!
  const alone = updateNode(grouped.doc, "p", { groupIds: undefined })
  check("leaving a group of two dissolves it for the other member too", alone.nodes.q.groupIds === undefined)
}

// -- the gate refuses what a paste never sends -------------------------------

{
  const at = { x: 0, y: 0, seed: 1 }
  const refused = (fn: () => unknown) => {
    try {
      fn()
      return false
    } catch (e) {
      return e instanceof DocError
    }
  }
  const empty = emptyDoc("gate")
  check("an id that reaches the prototype is refused", refused(() => addNodes(empty, [shapeNode("rect", { ...at, w: 1, h: 1, id: "__proto__" })])))
  check("a kind named after an Object property is refused", refused(() => componentNode("constructor", at)))
  check("a select prop off its list is refused", refused(() => addNodes(empty, [componentNode("button", { ...at, props: { variant: "neon" } })])))
  check("a number prop past its range is refused", refused(() => addNodes(empty, [componentNode("table", { ...at, props: { rows: 999 } })])))
  check("a toggle prop that isn't a boolean is refused", refused(() => addNodes(empty, [componentNode("switch", { ...at, props: { on: "yes" } })])))
  check("a legal prop passes", !refused(() => addNodes(empty, [componentNode("button", { ...at, props: { variant: "outline" } })])))
  const picture = (src: string): SquigNode =>
    ({ id: "pic", seed: 1, type: "image", x: 0, y: 0, w: 10, h: 10, src, naturalW: 10, naturalH: 10 }) as SquigNode
  check("an SVG data URL is refused, since it carries script", refused(() => addNodes(empty, [picture("data:image/svg+xml;base64,xxx")])))
  check("a png is a picture", !refused(() => addNodes(empty, [picture("data:image/png;base64,AA==")])))
  check("a zero font size is refused", refused(() => addNodes(empty, [{ ...textNode("hi", at), fontSize: 0 }])))
}

// -- a caller's own group id, and a caller's own ruler ----------------------

{
  const doc = addNodes(emptyDoc("mine"), [
    shapeNode("rect", { x: 0, y: 0, w: 10, h: 10, id: "a", seed: 1 }),
    shapeNode("rect", { x: 20, y: 0, w: 10, h: 10, id: "b", seed: 1 }),
  ])
  const g = groupNodes(doc, ["a", "b"], "chosen")
  check("a group can be named by the caller", g?.groupId === "chosen" && g.doc.nodes.a.groupIds?.[0] === "chosen")

  const wide: TextMeasurer = (text) => text.length * 40
  const guessed = textNode("one two three four", { x: 0, y: 0, w: 120, seed: 1 })
  const measured = textNode("one two three four", { x: 0, y: 0, w: 120, seed: 1 }, wide)
  check("a measurer that knows the face wraps the words differently", measured.h > guessed.h)
}

// -- a patch reaches only as far as it says -----------------------------------

{
  const doc = addNodes(emptyDoc("still"), [
    { ...textNode("Hi", { x: 0, y: 0, align: "center", fontSize: 20, seed: 1, id: "t" }), x: 0, w: 160, h: 80 } as SquigNode,
  ])
  const locked = updateNode(doc, "t", { locked: true })
  check("locking a label leaves its box alone", locked.nodes.t.w === 160 && locked.nodes.t.h === 80)
  const reworded = updateNode(doc, "t", { text: "Hello there" } as Partial<SquigNode>)
  check("…while new words re-fit it", reworded.nodes.t.w !== 160)
  const wrapped = textNode("two lines of words here", { x: 0, y: 0, w: 80, fontSize: 18, seed: 1, id: "p" })
  const squashed = patchNode(wrapped, { h: 1 } as Partial<SquigNode>) as TextNode
  check("a height patch is a floor the words may push past", squashed.h >= wrapped.h && squashed.fixedH === true)
  const roomy = patchNode(wrapped, { h: 300 } as Partial<SquigNode>) as TextNode
  check("…and a roomy one is kept", roomy.h === 300)
  const letGo = patchNode(roomy, { h: 300, fixedH: undefined } as Partial<SquigNode>) as TextNode
  check("a size handed back with the flag let go is not a chosen size", letGo.fixedH === undefined && letGo.h === wrapped.h)
  const loose = patchNode(wrapped, { w: 200, fixedW: false } as Partial<SquigNode>) as TextNode
  check("…and the same for width", !loose.fixedW)
  const long = "y".repeat(80)
  check("an eighty-character id is welcome", addNodes(emptyDoc("ids"), [shapeNode("rect", { x: 0, y: 0, w: 1, h: 1, id: long, seed: 1 })]).order[0] === long)
}


{
  const n = shapeNode("rect", { id: "rotated", seed: 1, x: 0, y: 0, w: 100, h: 50 })
  const rotated = patchNode(n, { rotation: 450 })
  check("node validation canonicalizes rotation", rotated.rotation === 90)
  const doc = addNodes(emptyDoc(), [rotated])
  check("rotation survives saving and loading", parseDoc(serializeDoc(doc))?.nodes.rotated.rotation === 90)
  check("nonfinite rotation is rejected", sanitizeDoc({ bad: { ...n, id: "bad", rotation: Infinity } }, ["bad"]).order.length === 0)
  check("zero rotation has a single absent spelling", patchNode(rotated, { rotation: 360 }).rotation === undefined)
  check("shape builders carry rotation", shapeNode("rect", { x: 0, y: 0, w: 20, h: 10, rotation: 30 }).rotation === 30)
  check("text builders carry rotation", textNode("hi", { x: 0, y: 0, rotation: 30 }).rotation === 30)
  check("component builders carry rotation", componentNode("button", { x: 0, y: 0, rotation: 30 }).rotation === 30)
}

report("document checks passed")
