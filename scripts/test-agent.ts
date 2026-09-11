// ---------------------------------------------------------------------------
// The hosted workspace, end to end without a database.
//
//   node --experimental-strip-types scripts/test-agent.ts
//
// The engine is the only thing standing between an agent's JSON and a canvas a
// person has to open, so most of what follows is refusals: bad ids, bad kinds,
// bad images, edits to a locked node. The rest is the render path, where a
// wrong line break or a missing face is invisible until someone looks at the
// PNG.
// ---------------------------------------------------------------------------

import { isDeepStrictEqual } from "node:util"
import { applyOperations, cleanNode, diffNodes, emptyDocument, validateDocument, AgentError, type CanvasDocument } from "../lib/agent/engine.ts"
import { renderPng, renderSvg, pngDocument } from "../lib/agent/render.ts"
import { operation } from "../lib/agent/schema.ts"
import { ALL_DEFS } from "../lib/library/registry.ts"
import { check, report } from "./harness.ts"

/** true when the call refused, which is the engine's whole job on bad input */
function refused(fn: () => unknown): boolean {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const same = (a: unknown, b: unknown) => isDeepStrictEqual(a, b)

// -- every library kind is placeable ----------------------------------------

let d = emptyDocument("Test")
for (const def of ALL_DEFS)
  check(
    `${def.kind} cleans to a component`,
    cleanNode({ type: "component", kind: def.kind, x: 0, y: 0 }).type ===
      "component",
  )

// -- one batch of every operation -------------------------------------------

const batch = operation.array().parse([
  {
    op: "add",
    nodes: [
      { id: "a", type: "component", kind: "button", x: 0, y: 0 },
      { id: "b", type: "shape", x: 200, y: 20, w: 100, h: 80 },
      {
        id: "c",
        type: "text",
        x: 400,
        y: 100,
        text: "Hello",
        fontSize: 20,
      },
      {
        id: "line",
        type: "arrow",
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        points: [
          [0, 0],
          [100, 100],
        ],
        head: true,
        bind: ["a", "b"],
      },
      {
        id: "draw",
        type: "draw",
        x: 0,
        y: 200,
        points: [
          [0, 0],
          [10, 20],
        ],
      },
      {
        id: "img",
        type: "image",
        x: 200,
        y: 200,
        src: "data:image/png;base64,AA==",
        naturalW: 10,
        naturalH: 10,
      },
    ],
  },
  { op: "variation", id: "v1", title: "First", nodeIds: ["a", "b", "c"] },
  { op: "note", x: 0, y: 400, text: "Make the action clear" },
])
d = applyOperations(d, batch).document
check("six nodes plus the note", d.order.length === 7)
check("the variation stuck", d.variations.length === 1)
check("an arrow came back an arrow", d.nodes.line.type === "arrow")

// -- a batch is all or nothing ----------------------------------------------

const before = JSON.stringify(d)
check(
  "one bad operation refuses the batch",
  refused(() =>
    applyOperations(
      d,
      operation.array().parse([
        { op: "rename", name: "Changed" },
        { op: "delete", ids: ["missing"] },
      ]),
    ),
  ),
)
check("…and leaves the document untouched", JSON.stringify(d) === before)

// -- refusals ---------------------------------------------------------------

check(
  "a prototype-polluting id is refused",
  refused(() =>
    cleanNode({ id: "__proto__", type: "text", x: 0, y: 0, text: "oops" }),
  ),
)
check(
  "a component nobody ships is refused",
  refused(() => cleanNode({ type: "component", kind: "not-real", x: 0, y: 0 })),
)
check(
  "a non-finite coordinate is refused",
  refused(() => cleanNode({ type: "text", x: Infinity, y: 0, text: "oops" })),
)
check(
  "an SVG data URL is refused, since it carries script",
  refused(() =>
    cleanNode({
      type: "image",
      x: 0,
      y: 0,
      src: "data:image/svg+xml;base64,xxx",
      naturalW: 10,
      naturalH: 10,
    }),
  ),
)
check(
  "a patch cannot change a node's type",
  refused(() =>
    applyOperations(
      d,
      operation
        .array()
        .parse([
          { op: "update", patches: [{ id: "a", patch: { type: "text" } }] },
        ]),
    ),
  ),
)
check(
  "a duplicated id in the order is refused",
  refused(() => validateDocument({ ...d, order: [...d.order, "a"] })),
)
check(
  "a negative width is refused",
  refused(() => cleanNode({ type: "text", x: 0, y: 0, w: -5, text: "bad" })),
)
check(
  "a javascript: link is refused",
  refused(() =>
    cleanNode({
      type: "text",
      x: 0,
      y: 0,
      link: "javascript:alert(1)",
      text: "bad",
    }),
  ),
)
check(
  "a hole in the node map is refused",
  refused(() =>
    validateDocument({
      ...d,
      nodes: { ...d.nodes, a: null },
    } as unknown as typeof d),
  ),
)
check(
  "a kind named after an Object property is refused",
  refused(() =>
    cleanNode({ type: "component", kind: "constructor", x: 0, y: 0 }),
  ),
)
check(
  "…and so is one named __proto__",
  refused(() => cleanNode({ type: "component", kind: "__proto__", x: 0, y: 0 })),
)

// -- locking ----------------------------------------------------------------

let locked = applyOperations(
  d,
  operation
    .array()
    .parse([
      { op: "update", patches: [{ id: "a", patch: { locked: true } }] },
    ]),
).document
check(
  "a locked node cannot be deleted",
  refused(() =>
    applyOperations(
      locked,
      operation.array().parse([{ op: "delete", ids: ["a"] }]),
    ),
  ),
)
locked = applyOperations(
  locked,
  operation.array().parse([
    { op: "update", patches: [{ id: "a", patch: { locked: false } }] },
    { op: "update", patches: [{ id: "a", patch: { x: 15 } }] },
  ]),
).document
check("unlocked, it moves", locked.nodes.a.x === 15)

// -- duplicating a group ----------------------------------------------------

const cloned = applyOperations(
  d,
  operation.array().parse([
    { op: "group", ids: ["a", "b"] },
    { op: "duplicate", ids: ["a", "b", "line"], dx: 800, dy: 0 },
  ]),
)
check("three copies came back", cloned.createdIds.length === 3)
check(
  "the copy got its own group",
  cloned.document.nodes.a.groupIds?.[0] !==
    cloned.document.nodes[cloned.createdIds[0]].groupIds?.[0],
)
check("the copied arrow binds to the copies", (() => {
  const n = cloned.document.nodes[cloned.createdIds[2]]
  return n.type === "arrow" && same(n.bind, cloned.createdIds.slice(0, 2))
})())

// -- grouping is whatever ⌘G does -------------------------------------------

const grouped = applyOperations(
  d,
  operation.array().parse([{ op: "group", ids: ["a", "b"] }]),
).document
check("both members carry the one new group", (() => {
  const path = grouped.nodes.a.groupIds
  return !!path && path.length === 1 && same(path, grouped.nodes.b.groupIds)
})())
check("and nobody else joined it", grouped.nodes.c.groupIds === undefined)
check(
  "grouping the same pair again has nothing to do",
  refused(() =>
    applyOperations(
      grouped,
      operation.array().parse([{ op: "group", ids: ["a", "b"] }]),
    ),
  ),
)
check(
  "deleting one of two leaves the other ungrouped",
  applyOperations(
    grouped,
    operation.array().parse([{ op: "delete", ids: ["a"] }]),
  ).document.nodes.b.groupIds === undefined,
)

// -- arranging --------------------------------------------------------------

const arranged = applyOperations(
  d,
  operation.array().parse([
    { op: "align", ids: ["a", "b", "c"], edge: "top" },
    { op: "distribute", ids: ["a", "b", "c"], axis: "x" },
    { op: "reorder", ids: ["a"], position: "front" },
    { op: "flip", ids: ["c"], axis: "x" },
  ]),
).document
check("aligned to the same top", arranged.nodes.a.y === arranged.nodes.c.y)
check("brought to the front", arranged.order.at(-1) === "a")
check("flipped on x", arranged.nodes.c.flipX === true)

const rotatedLayer = applyOperations(d, operation.array().parse([
  { op: "update", patches: [{ id: "c", patch: { rotation: 390 } }] },
])).document
check("agent updates accept and normalize rotation", rotatedLayer.nodes.c.rotation === 30)
const flippedRotation = applyOperations(rotatedLayer, operation.array().parse([
  { op: "flip", ids: ["c"], axis: "x" },
])).document
check("agent flips reflect a rotated layer's angle", flippedRotation.nodes.c.rotation === -30)

// -- detaching a component --------------------------------------------------

const detached = applyOperations(
  d,
  operation.array().parse([{ op: "detach", ids: ["a"] }]),
).document
check("the component itself is gone", detached.nodes.a === undefined)
check("its parts took its place", detached.order.length > 5)
check(
  "and the order still names real nodes",
  detached.order.every((id) => !!detached.nodes[id]),
)

// -- rendering --------------------------------------------------------------

const escaped = applyOperations(
  emptyDocument("<unsafe>"),
  operation.array().parse([
    {
      op: "add",
      nodes: [
        {
          id: "text",
          type: "text",
          x: 0,
          y: 0,
          text: '<script>alert("x")</script>',
          fontSize: 20,
        },
      ],
    },
  ]),
).document
check("markup in a text layer comes out escaped", (() => {
  const svg = renderSvg(escaped).svg
  return svg.includes("&lt;script&gt;") && !svg.includes("<script>")
})())
const typeset = applyOperations(
  emptyDocument("Typeset"),
  operation.array().parse([
    {
      op: "add",
      nodes: [
        {
          id: "t",
          type: "text",
          x: 0,
          y: 0,
          text: "Legible",
          fontSize: 24,
        },
      ],
    },
  ]),
).document
// Vercel functions carry no system fonts: the rasteriser only has the faces
// render.ts vendors, so the SVG has to ask for them by name or every glyph
// comes back a tofu box.
check(
  "the text asks for a face the rasteriser has",
  /font-family="([^"]*)"/.exec(renderSvg(typeset).svg)?.[1]?.includes(
    "Patrick Hand",
  ) === true,
)
const png = await renderPng(renderSvg(typeset).svg)
check(
  "a PNG comes back with a PNG's magic bytes",
  Buffer.isBuffer(png) && same([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]),
)
check(
  "rendering twice gives the same bytes",
  renderSvg(escaped).svg === renderSvg(escaped).svg,
)
check(
  "a variation nobody made is refused",
  refused(() => renderSvg(escaped, "missing")),
)

// -- cropping ---------------------------------------------------------------

const cropped = applyOperations(
  d,
  operation.array().parse([
    {
      op: "update",
      patches: [
        { id: "img", patch: { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } } },
      ],
    },
  ]),
).document
check(
  "a crop lands on the image",
  cropped.nodes.img.type === "image" && !!cropped.nodes.img.crop,
)
const uncropped = applyOperations(
  cropped,
  operation
    .array()
    .parse([{ op: "update", patches: [{ id: "img", unset: ["crop"] }] }]),
).document
check(
  "and unset takes it off again",
  uncropped.nodes.img.type === "image" && !uncropped.nodes.img.crop,
)
check(
  "a variation can be removed",
  applyOperations(
    d,
    operation.array().parse([{ op: "remove_variation", id: "v1" }]),
  ).document.variations.length === 0,
)

// -- merging a shared canvas ------------------------------------------------
// Concurrent human and agent changes both have to survive the round trip.

const { mergeCanvas, canvasEqual } = await import("../lib/agent/merge")
check("key order doesn't count", canvasEqual({ a: 1, b: 2 }, { b: 2, a: 1 }))
check(
  "an undefined field reads as absent, nested",
  canvasEqual(
    { nodes: { a: { text: "Hello", groupIds: undefined } } },
    { nodes: { a: { text: "Hello" } } },
  ),
)
check(
  "…and at the top",
  canvasEqual({ text: "Hello" }, { text: "Hello", groupIds: undefined }),
)
check(
  "but a real value against undefined is a change",
  !canvasEqual({ locked: true }, { locked: undefined }),
)
check("and null is not absent", !canvasEqual({ bind: null }, {}))
const baseCanvas = { nodes: { a: { x: 0, text: "hello" } }, order: ["a"] }
check(
  "two sides editing different fields both land",
  same(
    mergeCanvas(
      baseCanvas,
      { nodes: { a: { x: 10, text: "hello" } }, order: ["a"] },
      { nodes: { a: { x: 0, text: "world" } }, order: ["a"] },
    ),
    {
      value: { nodes: { a: { x: 10, text: "world" } }, order: ["a"] },
      conflicts: [],
    },
  ),
)
check(
  "the same field twice is a conflict",
  same(
    mergeCanvas(
      baseCanvas,
      { nodes: { a: { x: 10, text: "hello" } }, order: ["a"] },
      { nodes: { a: { x: 20, text: "hello" } }, order: ["a"] },
    ).conflicts,
    ["nodes.a.x"],
  ),
)
check(
  "two new nodes both survive",
  same(
    mergeCanvas<Record<string, unknown>>(
      baseCanvas,
      { nodes: { ...baseCanvas.nodes, b: { x: 20 } }, order: ["a", "b"] },
      { nodes: { ...baseCanvas.nodes, c: { x: 30 } }, order: ["a", "c"] },
    ).value,
    {
      nodes: { ...baseCanvas.nodes, b: { x: 20 }, c: { x: 30 } },
      order: ["a", "c", "b"],
    },
  ),
)
check(
  "deleting a node the other side edited is a conflict",
  same(
    mergeCanvas<Record<string, unknown>>(
      baseCanvas,
      { nodes: {}, order: [] },
      { nodes: { a: { x: 20, text: "hello" } }, order: ["a"] },
    ).conflicts,
    ["nodes.a"],
  ),
)
check(
  "two reorderings are a conflict",
  same(
    mergeCanvas(
      { order: ["a", "b", "c"] },
      { order: ["b", "a", "c"] },
      { order: ["a", "c", "b"] },
    ).conflicts,
    ["order"],
  ),
)

// -- an edit response ships only the nodes its batch touched ----------------

const touched = applyOperations(
  d,
  operation.array().parse([
    { op: "update", patches: [{ id: "c", patch: { text: "Changed" } }] },
    { op: "delete", ids: ["draw"] },
    {
      op: "add",
      nodes: [{ id: "fresh", type: "shape", x: 0, y: 600, w: 40, h: 40 }],
    },
  ]),
).document
const diff = diffNodes(d.nodes, touched.nodes)
check(
  "the edited and the new node come back",
  same(Object.keys(diff.changed).sort(), ["c", "fresh"]),
)
check("the deleted one is named", same(diff.deletedIds, ["draw"]))
check("with its new text", (() => {
  const node = diff.changed.c
  return node.type === "text" && node.text === "Changed"
})())
check("an untouched node stays home", diff.changed.a === undefined)
check(
  "no edits, nothing to ship",
  same(diffNodes(d.nodes, d.nodes), { changed: {}, deletedIds: [] }),
)

// -- the command layer ------------------------------------------------------
// An unfiltered catalog stays small, and db() stays lazy.

const { execute, origin } = await import("../lib/agent/service.ts")
type CatalogResult = {
  total: number
  hint?: string
  components: Record<string, unknown>[]
}
const compact = (await execute(
  "catalog",
  {},
  {
    workspaceId: "w",
  },
)) as unknown as CatalogResult
check(
  "the catalog lists every definition",
  compact.components.length === ALL_DEFS.length,
)
check(
  "…with sizes but without the long tail",
  compact.components.every(
    (c) => !!c.size && !("controls" in c) && !("defaults" in c),
  ),
)
check("and says how to ask for more", !!compact.hint?.includes("query or kind"))
const detailed = (await execute(
  "catalog",
  { kind: "button" },
  {
    workspaceId: "w",
  },
)) as unknown as CatalogResult
check("asking by kind narrows it to one", detailed.components.length === 1)
check(
  "and that one carries its controls",
  Array.isArray(detailed.components[0].controls),
)

// -- preview links ride the branch host, not the per-deployment hash --------

delete process.env.SQUIG_PUBLIC_URL
process.env.VERCEL_ENV = "preview"
process.env.VERCEL_URL = "squig-abc123.vercel.app"
process.env.VERCEL_BRANCH_URL = "squig-git-feature.vercel.app"
check(
  "a preview link points at the branch",
  origin() === "https://squig-git-feature.vercel.app",
)
delete process.env.VERCEL_BRANCH_URL
check(
  "without one, at the deployment",
  origin() === "https://squig-abc123.vercel.app",
)
delete process.env.VERCEL_ENV
check("and off Vercel entirely, at squig.sh", origin() === "https://squig.sh")
delete process.env.VERCEL_URL

// -- real face metrics drive both diagnostics and the SVG's line breaks -----

const { textMeasurer, measureDocumentText } = await import(
  "../lib/agent/text-metrics"
)
for (const font of ["hand", "sans", "serif"] as const) {
  const measure = textMeasurer(font)
  check(
    `${font} measures W wider than i`,
    measure("WWWW", { size: 20 }) > measure("iiii", { size: 20 }) * 2,
  )
}
const textDoc = applyOperations(
  emptyDocument("Text metrics"),
  operation
    .array()
    .parse([
      {
        op: "add",
        nodes: [
          {
            id: "overflow",
            type: "text",
            x: 0,
            y: 0,
            w: 70,
            h: 10,
            text: "Wide words wrap here",
            fontSize: 24,
            fixedW: true,
          },
        ],
      },
    ]),
).document
const measured = measureDocumentText(textDoc)[0]
check(
  "a box too short for its words reports the overflow",
  measured.overflowY && measured.lineCount > 1,
)
check(
  "and the render breaks in the same places",
  (renderSvg(textDoc).svg.match(/<text /g) ?? []).length ===
    measured.lineCount,
)
const fitted = applyOperations(
  textDoc,
  operation
    .array()
    .parse([
      {
        op: "update",
        patches: [
          { id: "overflow", patch: { h: measured.requiredHeight } },
        ],
      },
    ]),
).document
check(
  "the height it asked for is the height that fits",
  measureDocumentText(fitted)[0].overflowY === false,
)
const { wrapText } = await import("../lib/canvas/text-metrics")
let measuredCharacters = 0
const longLines = wrapText("a".repeat(10000), 8, { size: 1 }, (t) => {
  measuredCharacters += t.length
  return t.length
})
check(
  "an unbroken word breaks to the box",
  longLines.every((line) => line.length <= 8),
)
check("losing no characters", longLines.join("").length === 10000)
check(
  "long words must not repeatedly measure their entire suffix",
  measuredCharacters < 300000,
  `${measuredCharacters} characters measured`,
)
const { textNode } = await import("../lib/doc.ts")
const noteText = "Wide words wrap here and keep going for a while yet"
const noteAt = {
  x: 0,
  y: 0,
  w: 200,
  fontSize: 18,
  boxed: true,
  boxFill: "light",
} as const
const noteDoc = emptyDocument("Notes")
const noted = applyOperations(
  noteDoc,
  operation.array().parse([{ op: "note", x: 0, y: 0, w: 200, text: noteText }]),
)
check(
  "a note is wrapped by the faces the render uses",
  noted.document.nodes[noted.createdIds[0]].h ===
    textNode(noteText, noteAt, textMeasurer(noteDoc.look.font)).h,
)
check(
  "…which is not the em-ratio guess a browserless caller gets",
  textNode(noteText, noteAt).h !==
    textNode(noteText, noteAt, textMeasurer(noteDoc.look.font)).h,
)
const fixedWidth = applyOperations(
  emptyDocument("Hug"),
  operation.array().parse([
    {
      op: "add",
      nodes: [
        {
          id: "t",
          type: "text",
          x: 0,
          y: 0,
          w: 60,
          h: 40,
          fixedW: true,
          text: "Hug these words",
          fontSize: 20,
        },
      ],
    },
  ]),
).document
const hugging = applyOperations(
  fixedWidth,
  operation
    .array()
    .parse([{ op: "update", patches: [{ id: "t", unset: ["fixedW"] }] }]),
).document
check("unsetting fixedW puts the box back around the words", (() => {
  const n = hugging.nodes.t
  return n.type === "text" && !n.fixedW && n.w > fixedWidth.nodes.t.w
})())

// -- WebP is accepted by the canvas and must survive agent PNG previews -----

const { default: sharp } = await import("sharp")
const webp = await sharp({
  create: {
    width: 20,
    height: 20,
    channels: 3,
    background: { r: 230, g: 10, b: 50 },
  },
})
  .webp()
  .toBuffer()
const imageDoc = applyOperations(
  emptyDocument("WebP"),
  operation
    .array()
    .parse([
      {
        op: "add",
        nodes: [
          {
            id: "image",
            type: "image",
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            naturalW: 20,
            naturalH: 20,
            src: `data:image/webp;base64,${webp.toString("base64")}`,
          },
        ],
      },
    ]),
).document
const preview = await pngDocument(imageDoc)
check(
  "the preview swapped the picture out",
  preview.nodes.image !== imageDoc.nodes.image,
)
check(
  "and left the stored document as WebP",
  imageDoc.nodes.image.type === "image" &&
    imageDoc.nodes.image.src.startsWith("data:image/webp"),
)
const renderedWebp = await renderPng(renderSvg(preview).svg)
const { data: pixels, info } = await sharp(renderedWebp)
  .raw()
  .toBuffer({ resolveWithObject: true })
const pixel =
  (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
  info.channels
check(
  "WebP pixels must be visible in the PNG",
  pixels[pixel] > 200 && pixels[pixel + 1] < 40 && pixels[pixel + 2] < 100,
  `rgb(${pixels[pixel]}, ${pixels[pixel + 1]}, ${pixels[pixel + 2]})`,
)

// ---------------------------------------------------------------------------

// -- a batch is one edit: invariants hold at the end, not between steps ----

{
  const ops = (list: unknown[]) => operation.array().parse(list)
  const status = (fn: () => unknown) => {
    try {
      fn()
      return null
    } catch (e) {
      return e instanceof AgentError ? e.status : "threw"
    }
  }
  const two = applyOperations(
    emptyDocument("batch"),
    ops([
      { op: "add", nodes: [{ id: "p", type: "shape", x: 0, y: 0, w: 40, h: 40 }] },
      {
        op: "add",
        nodes: [
          { id: "link", type: "arrow", x: 0, y: 0, w: 10, h: 10, points: [[0, 0], [10, 10]], head: true, bind: ["p", "q"] },
        ],
      },
      { op: "add", nodes: [{ id: "q", type: "shape", x: 200, y: 0, w: 40, h: 40 }] },
    ]),
  ).document
  check("an arrow may name a box a later add brings", same(two.nodes.link.type === "arrow" && two.nodes.link.bind, ["p", "q"]))

  const paired = applyOperations(
    two,
    ops([{ op: "update", patches: [{ id: "p", patch: { groupIds: ["g9"] } }, { id: "q", patch: { groupIds: ["g9"] } }] }]),
  ).document
  check("two patches can found a group between them", same(paired.nodes.p.groupIds, ["g9"]) && same(paired.nodes.q.groupIds, ["g9"]))

  const labelled = applyOperations(
    two,
    ops([{ op: "add", nodes: [{ id: "t", type: "text", x: 0, y: 100, w: 160, h: 80, text: "Hi", fontSize: 20, align: "center" }] }]),
  ).document
  const lockedLabel = applyOperations(labelled, ops([{ op: "update", patches: [{ id: "t", patch: { locked: true } }] }])).document
  check("locking a label leaves its box alone", lockedLabel.nodes.t.w === 160 && lockedLabel.nodes.t.x === 0)

  const words = "Wide words wrap here and keep going for a while yet"
  const hand = applyOperations(emptyDocument("faces"), ops([{ op: "note", x: 0, y: 0, w: 200, text: words }])).document
  const sans = applyOperations(
    emptyDocument("faces"),
    ops([{ op: "look", font: "sans" }, { op: "note", x: 0, y: 0, w: 200, text: words }]),
  ).document
  const height = (doc: CanvasDocument) => doc.nodes[doc.order[0]].h
  check("a note after a look change measures with the new face", height(hand) !== height(sans))

  check("words that aren't a string are a 400, not a crash", status(() => applyOperations(two, ops([{ op: "update", patches: [{ id: "p", patch: { text: 123 } }] }]))) === 400)
  check("a negative width in a patch is a 400", status(() => applyOperations(two, ops([{ op: "update", patches: [{ id: "p", patch: { w: -5 } }] }]))) === 400)

  const long = "x".repeat(80)
  check("an eighty-character id is still welcome", status(() => applyOperations(two, ops([{ op: "add", nodes: [{ id: long, type: "shape", x: 0, y: 0, w: 1, h: 1 }] }]))) === null)

  const withButton = applyOperations(
    two,
    ops([
      { op: "add", nodes: [{ id: "btn", type: "component", kind: "button", x: 0, y: 300 }] },
      { op: "group", ids: ["btn", "q"], groupId: "pair" },
    ]),
  ).document
  const detached = applyOperations(withButton, ops([{ op: "detach", ids: ["btn"] }])).document
  check("detaching a grouped component keeps its sibling in the group", same(detached.nodes.q.groupIds, ["pair"]))

  const rebuilt = applyOperations(
    withButton,
    ops([
      { op: "delete", ids: ["q"] },
      { op: "add", nodes: [{ id: "c", type: "shape", x: 0, y: 500, w: 1, h: 1 }, { id: "d", type: "shape", x: 0, y: 600, w: 1, h: 1 }] },
      { op: "group", ids: ["c", "d"] },
      { op: "add", nodes: [{ id: "q", type: "shape", x: 200, y: 0, w: 40, h: 40, groupIds: ["pair"] }] },
    ]),
  ).document
  check("grouping elsewhere doesn't dissolve a group the batch is rebuilding", same(rebuilt.nodes.btn.groupIds, ["pair"]) && same(rebuilt.nodes.q.groupIds, ["pair"]))

  const tall = applyOperations(
    two,
    ops([{ op: "add", nodes: [{ id: "para", type: "text", x: 0, y: 0, w: 80, fixedW: true, text: "two lines of words here", fontSize: 18 }] }]),
  ).document
  const squashed = applyOperations(tall, ops([{ op: "update", patches: [{ id: "para", patch: { h: 1 } }] }])).document
  const needed = textNode("two lines of words here", { x: 0, y: 0, w: 80, fontSize: 18 }, textMeasurer("hand")).h
  check("a height patch can't push the words out of the box", squashed.nodes.para.h === needed && needed > 1)
}

// -- credentials fail closed before storage or database access --------------

const { keyKind, canvasConnection, workspaceKey, canvasStorage, KEY_STORAGE } =
  await import("../lib/agent/credentials.ts")
const { authenticate, hash, token } = await import("../lib/agent/db.ts")
const { neonConfig } = await import("@neondatabase/serverless")
const workspaceSecret = `sq_${token()}`
const canvasSecret = `sq_canvas_${token()}`
check("issued keys have distinct capabilities", keyKind(workspaceSecret) === "workspace" && keyKind(canvasSecret) === "canvas")
for (const bad of ["", "sq_canvas_fake", workspaceSecret + "\n", canvasSecret + " extra", "sq_" + "a".repeat(10000)])
  check("malformed keys are rejected", keyKind(bad) === null)
const stored = new Map([[KEY_STORAGE, workspaceSecret], [canvasStorage("one"), canvasSecret]])
const storage = { getItem: (name: string) => stored.get(name) ?? null }
check("owners can still open a plain canvas URL", canvasConnection("two", undefined, storage).key === workspaceSecret)
check("saved canvas keys take precedence over owner credentials", canvasConnection("one", undefined, storage).key === canvasSecret)
check("a new invitation is only a candidate; it does not overwrite storage", canvasConnection("one", `sq_canvas_${token()}`, storage).canvasKey !== stored.get(canvasStorage("one")))
for (const fragment of [workspaceSecret, "sq_canvas_fake", "", canvasSecret + "\n"])
  check("an invalid invitation never falls back to a saved owner key", refused(() => canvasConnection("one", fragment, storage)))
for (const badId of ["../catalog", "one/../../catalog", "one?x=1", "one#x", "one\n", "", "a".repeat(81)])
  check("untrusted canvas IDs cannot become request paths", refused(() => canvasConnection(badId, canvasSecret, storage)))
stored.set(KEY_STORAGE, canvasSecret)
check("canvas keys cannot occupy the workspace credential slot", workspaceKey(storage) === null)
stored.set(canvasStorage("one"), workspaceSecret)
check("workspace credentials cannot be shared from a canvas slot", refused(() => canvasConnection("one", undefined, storage)))

async function statusOf(run: () => Promise<unknown>) {
  try { await run(); return 200 } catch (e) { return e instanceof AgentError ? e.status : 500 }
}
const scopedPrincipal = { workspaceId: "w", documentId: "one" }
for (const [name, args] of [
  ["create_document", { name: "No" }],
  ["delete_document", { documentId: "one", revision: 1 }],
  ["rotate_canvas_link", { documentId: "one" }],
] as const)
  check(`canvas keys cannot ${name}`, await statusOf(() => execute(name, args, scopedPrincipal)) === 403)
for (const [name, args] of [
  ["get_document", {}], ["edit_document", { revision: 1, operations: [{ op: "rename", name: "No" }] }],
  ["replace_document", { revision: 1, document: emptyDocument("No") }],
  ["history", {}], ["restore", { revision: 1, targetRevision: 1 }],
  ["comment", { text: "No" }], ["resolve_comment", { commentId: "c", resolved: true }],
  ["export_document", {}], ["measure_text", {}], ["render_document", { format: "svg" }],
] as const)
  check(`canvas keys cannot ${name} on siblings`, await statusOf(() => execute(name, { ...args, documentId: "two" }, scopedPrincipal)) === 404)

// Mock only Neon's HTTP boundary: the real authentication and REST/MCP handlers run.
const previousDb = process.env.DATABASE_URL
const previousFetch = neonConfig.fetchFunction
let queries = 0
neonConfig.fetchFunction = async (_url: string, init: RequestInit) => {
  queries++
  const { query, params } = JSON.parse(String(init.body))
  let rows: Record<string, string>[] = []
  if (query.includes("FROM agent_workspaces")) {
    check("only the workspace hash reaches its lookup", params[0] === hash(workspaceSecret))
    rows = [{ id: "w" }]
  } else if (query.includes("FROM agent_documents")) {
    check("only the canvas hash reaches its lookup", params[0] === hash(canvasSecret))
    rows = [{ id: "one", workspace_id: "w" }]
  } else if (query.includes("INSERT INTO agent_limits")) {
    rows = [{ count: "1" }]
  } else throw new Error("Unexpected security test query")
  const names = Object.keys(rows[0] ?? {})
  return Response.json({ fields: names.map((name) => ({ name, dataTypeID: 25 })), rows: rows.map((row) => names.map((name) => row[name])) })
}
process.env.DATABASE_URL = "postgresql://test:test@security.invalid/test"
try {
  const req = (secret?: string) => new Request("https://squig.sh/api/v1/documents", { headers: secret ? { Authorization: `Bearer ${secret}` } : {} })
  for (const bad of [undefined, "bad", "sq_canvas_invalid", "sq_" + "x".repeat(5000)])
    check("malformed bearer is rejected without a database call", await statusOf(() => authenticate(req(bad))) === 401 && queries === 0)
  check("workspace authentication has no document scope", same(await authenticate(req(workspaceSecret)), { workspaceId: "w" }))
  check("canvas authentication retains its document scope", same(await authenticate(req(canvasSecret)), scopedPrincipal))
  const rest = await import("../app/api/v1/[...path]/route.ts")
  const rotate = await rest.POST(new Request("https://squig.sh/api/v1/workspace/rotate-key", {
    method: "POST", headers: { Authorization: `Bearer ${canvasSecret}`, "Content-Type": "application/json" }, body: "{}",
  }), { params: Promise.resolve({ path: ["workspace", "rotate-key"] }) })
  check("REST workspace rotation refuses canvas keys", rotate.status === 403)
  const mcp = await import("../app/mcp/route.ts")
  const request = new Request("https://squig.sh/mcp", {
    method: "POST", headers: { Authorization: `Bearer ${canvasSecret}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "squig_get_document", arguments: { documentId: "two" } } }),
  })
  const response = await mcp.POST(request)
  const rpc = await response.json()
  check("MCP enforces the same document boundary", rpc.result?.isError === true && JSON.parse(rpc.result.content[0].text).status === 404)
  check("MCP responses carrying private data cannot be cached", response.headers.get("cache-control") === "no-store" && response.headers.get("referrer-policy") === "no-referrer")
} finally {
  neonConfig.fetchFunction = previousFetch
  if (previousDb === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDb
}

report(`agent engine checks passed (${ALL_DEFS.length} library definitions)`)
