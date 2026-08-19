// ---------------------------------------------------------------------------
// History and the pixels — what a picture costs to remember.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-history.ts
//
// A checkpoint used to be a `structuredClone` of the whole document, and an
// ImageNode carries its pixels inline as a data URL. Paste six screenshots to
// wireframe around and every drag deep-copied a couple of megabytes of base64
// before it drew a frame, with a hundred of those on the stack. `snapshot` now
// keeps references instead, which is free — and correct only for as long as
// nobody writes a field onto a node that is already in the document.
//
// So there are two halves here. The first is the behaviour that must not have
// changed: undo, redo, delete, duplicate and a save/load round trip all still
// hand back the same picture, byte for byte, with `src` inline where it has
// always been. The second is the invariant the saving rests on, checked
// directly — an entry on the undo stack still reads as the document did when
// it was taken, however much has happened since. That check is the one that
// fails if someone ever reaches for `node.x = …`, and it is worth more than
// the speed it buys.
// ---------------------------------------------------------------------------

// the store writes through to the drawer, and the drawer is localStorage —
// stand one up before the module that reaches for it is loaded
;(globalThis as { window?: unknown }).window = {
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
}
const held = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => held.get(k) ?? null,
  setItem: (k: string, v: string) => void held.set(k, v),
  removeItem: (k: string) => void held.delete(k),
}

const { useSquig } = await import("../lib/store.ts")
const { nodePrims } = await import("../lib/sketch/node-prims.ts")
import type { ImageNode, SquigNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const s = () => useSquig.getState()

function reset() {
  useSquig.setState({
    nodes: {},
    order: [],
    selection: [],
    clipboard: [],
    past: [],
    future: [],
    dupTrail: null,
    editingId: null,
    croppingId: null,
  })
}

/**
 * A data URL the shape lib/clipboard writes — long enough that a stray copy
 * would show up in a heap profile, and distinct per picture so a test can tell
 * two of them apart.
 */
function fakeSrc(salt: string, chars = 40_000): string {
  const head = "data:image/png;base64,"
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let body = salt
  while (body.length < chars - head.length) body += alphabet[(body.length * 7 + salt.length) % 62]
  return head + body.slice(0, chars - head.length)
}

const picture = (salt: string, x = 0, y = 0) =>
  s().addNode({
    type: "image",
    src: fakeSrc(salt),
    naturalW: 1280,
    naturalH: 800,
    x,
    y,
    w: 640,
    h: 400,
  } as Omit<SquigNode, "id" | "seed">)

const rect = (x: number, y: number) =>
  s().addNode({ type: "shape", shape: "rect", fill: "none", x, y, w: 40, h: 30 } as Omit<SquigNode, "id" | "seed">)

const img = (id: string) => s().nodes[id] as ImageNode | undefined

/** The document written down, so two of them can be compared whole. */
const docJson = () => JSON.stringify({ nodes: s().nodes, order: s().order })

// -- the pixels survive the round trip --------------------------------------

{
  reset()
  const a = picture("alpha", 0, 0)
  const srcA = img(a)!.src
  const before = docJson()

  s().updateNodes({ [a]: { x: 200 } }, { checkpoint: true })
  s().updateNodes({ [a]: { w: 320, h: 200 } }, { checkpoint: true })
  s().undo()
  s().undo()

  check("⌘Z back through two moves: the document is what it was", docJson() === before)
  check("⌘Z back through two moves: the pixels came with it", img(a)?.src === srcA)
  check("the pixels are all there", (img(a)?.src.length ?? 0) === srcA.length)

  s().redo()
  s().redo()
  check("⇧⌘Z forward again: the picture is where the edits left it", img(a)?.x === 200 && img(a)?.w === 320)
  check("⇧⌘Z forward again: still the same pixels", img(a)?.src === srcA)
}

// -- deleting a picture, then changing your mind ----------------------------

{
  reset()
  const a = picture("beta", 0, 0)
  const srcA = img(a)!.src
  s().setSelection([a])
  s().deleteSelected()
  check("delete: the picture is gone", !img(a))

  s().undo()
  check("⌘Z after a delete: the picture is back", !!img(a))
  check("⌘Z after a delete: with the same pixels", img(a)?.src === srcA)
  check("⌘Z after a delete: nothing was truncated", img(a)?.src.length === srcA.length)

  // and the other way — a redo has to be able to take it away again
  s().redo()
  check("⇧⌘Z after that: gone again", !img(a))
  s().undo()
  check("⌘Z once more: back once more, pixels intact", img(a)?.src === srcA)
}

// -- duplicating leaves the original alone ----------------------------------

{
  reset()
  const a = picture("gamma", 0, 0)
  const srcA = img(a)!.src
  s().setSelection([a])
  s().duplicateSelected()
  const copy = s().order.find((id) => id !== a)!
  check("⌘D: there are two pictures now", s().order.length === 2)
  check("⌘D: the copy shows the same picture", img(copy)?.src === srcA)
  check("⌘D: the copy is its own node", copy !== a)

  s().undo()
  check("⌘Z after a ⌘D: the copy is gone", s().order.length === 1)
  check("⌘Z after a ⌘D: the original is untouched", img(a)?.src === srcA)

  // moving the copy must not drag the original with it, however the two of
  // them are stored — this is the check that a shared reference would break if
  // anything ever wrote through one
  s().redo()
  s().updateNodes({ [copy]: { x: 999, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } } }, { checkpoint: true })
  check("moving the copy leaves the original where it was", img(a)?.x === 0)
  check("cropping the copy leaves the original uncropped", img(a)?.crop === undefined)
  check("cropping the copy doesn't rewrite anyone's pixels", img(copy)?.src === srcA && img(a)?.src === srcA)
}

// -- a copy on the clipboard is the version that was copied ------------------

{
  reset()
  const a = picture("delta", 0, 0)
  const srcA = img(a)!.src
  s().setSelection([a])
  s().copySelected()
  s().updateNodes({ [a]: { x: 400 } }, { checkpoint: true })
  s().pasteClipboard([0, 0])
  const pasted = s().order.find((id) => id !== a)!
  check("⌘C then move then ⌘V: the paste is the picture as copied", img(pasted)?.x === 0)
  check("⌘C then move then ⌘V: with its pixels", img(pasted)?.src === srcA)
  check("⌘C then move then ⌘V: the original stayed moved", img(a)?.x === 400)
}

// -- what goes to disk is unchanged -----------------------------------------

{
  reset()
  const a = picture("epsilon", 0, 0)
  const srcA = img(a)!.src
  rect(700, 0)
  const before = docJson()

  const json = s().serialize()
  const parsed = JSON.parse(json)
  check("a saved file carries the picture inline", typeof parsed.nodes[a].src === "string")
  check("…as the data URL it always was", parsed.nodes[a].src === srcA)
  check("…and nothing was hoisted out beside it", !("images" in parsed) && !("blobs" in parsed))

  reset()
  check("loading it back works", s().loadDoc(json) === true)
  // ids survive a load, so the document should come back the same shape
  check("the loaded document is the one that was saved", docJson() === before)
  check("the loaded picture has its pixels", (s().nodes[a] as ImageNode).src === srcA)

  // and the file an older squig wrote — same shape, since the shape never
  // moved. Written by hand here rather than by serialize, so this is a real
  // check on the reader rather than a round trip through one writer.
  reset()
  const legacy = JSON.stringify({
    app: "squig",
    version: 1,
    fileName: "older scribbles",
    nodes: { pic1: { id: "pic1", type: "image", src: srcA, naturalW: 100, naturalH: 50, x: 0, y: 0, w: 100, h: 50, seed: 7 } },
    order: ["pic1"],
  })
  check("a file written before any of this still opens", s().loadDoc(legacy) === true)
  check("…with its picture", (s().nodes.pic1 as ImageNode)?.src === srcA)
}

// -- sameDoc still knows a no-op when it sees one ---------------------------

{
  reset()
  const a = picture("zeta", 0, 0)
  const b = rect(700, 0)
  const steps = s().past.length

  check("writing a picture's own values back is not an edit", s().edit(() => s().updateNodes({ [a]: { x: 0 } })) === false)
  check("nor is writing a shape's", s().edit(() => s().updateNodes({ [b]: { x: 700 } })) === false)
  check("neither cost a step", s().past.length === steps)
  check("a real move still is one", s().edit(() => s().updateNodes({ [a]: { x: 1 } })) === true)
  check("and cost exactly one step", s().past.length === steps + 1)

  // the same document arriving twice — one built here, one read back off disk
  const json = s().serialize()
  const mine = docJson()
  s().loadDoc(json)
  check("a document and its own round trip are the same document", docJson() === mine)
}

// -- the invariant the saving rests on --------------------------------------

{
  // A checkpoint holds the live objects rather than copies of them. That is
  // only sound while nothing writes to a node that is already in the document,
  // so check it from the outside: take an entry, run one command, read the
  // entry back. One command at a time and a fresh checkpoint before each,
  // because an entry only tells you anything about the nodes it still shares —
  // once a command has rebuilt a node, the next command can't reach the copy
  // history is holding even if it wants to.
  const wringer: [string, () => void][] = [
    ["a move", () => s().updateNodes({ [s().order[0]]: { x: 42 } }, { checkpoint: false })],
    ["a crop", () => s().updateNodes({ [s().order[0]]: { crop: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 } } }, { checkpoint: false })],
    ["a resize", () => s().updateNodes({ [s().order[1]]: { w: 10, h: 10 } }, { checkpoint: false })],
    ["a delete", () => { s().setSelection([s().order[2]]); s().deleteSelected() }],
    ["a duplicate", () => { s().setSelection([s().order[0]]); s().duplicateSelected() }],
    ["a group", () => { s().setSelection([s().order[0], s().order[1]]); s().groupSelected() }],
    ["an align", () => { s().setSelection([s().order[0], s().order[1]]); s().alignSelected("left") }],
    ["a flip", () => { s().setSelection([s().order[0]]); s().flipSelected("x") }],
    ["bring to front", () => s().bringToFront([s().order[0]])],
    ["a ⌘C and ⌘V", () => { s().setSelection([s().order[0]]); s().copySelected(); s().pasteClipboard([50, 50]) }],
    ["a lock", () => s().updateNodes({ [s().order[0]]: { locked: true } }, { checkpoint: false })],
  ]
  for (const [what, run] of wringer) {
    reset()
    picture("eta", 0, 0)
    picture("theta", 700, 0)
    rect(0, 500)
    s().checkpoint()
    const entry = s().past[s().past.length - 1]
    const asTaken = JSON.stringify({ nodes: entry.nodes, order: entry.order })
    run()
    check(
      `after ${what}, the entry underneath still reads as the document did`,
      JSON.stringify({ nodes: entry.nodes, order: entry.order }) === asTaken
    )
  }

  // …and the pixels really are shared, which is the whole point. Node identity
  // rather than string equality: two equal strings would pass a === and still
  // be two copies on the heap.
  reset()
  const p = picture("iota", 0, 0)
  const node = s().nodes[p]
  s().checkpoint()
  const top = s().past[s().past.length - 1]
  check("a checkpoint holds the node, not a copy of it", top.nodes[p] === node)
  s().updateNodes({ [p]: { x: 5 } }, { checkpoint: false })
  check("…and goes on holding the one it was given", top.nodes[p] === node && (top.nodes[p] as ImageNode).x === 0)
  check("a move rebuilds the node rather than writing to it", s().nodes[p] !== node)
  check("but not the pixels", (s().nodes[p] as ImageNode).src === (node as ImageNode).src)
}

// -- a hundred steps deep ---------------------------------------------------

{
  // MAX_HISTORY is 100, and the far end falling off is what used to keep the
  // clones from growing without bound. Walking the whole stack down and back
  // up has to be lossless whichever end you start from.
  reset()
  const a = picture("kappa", 0, 0)
  const srcA = img(a)!.src
  for (let i = 0; i < 120; i++) s().updateNodes({ [a]: { x: i + 1 } }, { checkpoint: true })
  check("history stops at MAX_HISTORY", s().past.length === 100)
  for (let i = 0; i < 100; i++) s().undo()
  check("all the way back: the picture is still a picture", img(a)?.type === "image")
  check("all the way back: with its pixels", img(a)?.src === srcA)
  check("all the way back: at the oldest x history still holds", img(a)?.x === 20)
  for (let i = 0; i < 100; i++) s().redo()
  check("all the way forward again: pixels intact", img(a)?.src === srcA)
  check("all the way forward again: at the last x", img(a)?.x === 120)
}

// -- what the drawing hands out ---------------------------------------------

{
  // The other half of the sharing bargain. Nothing writes to a node that is in
  // the document — but a node's own arrays leave the document all the time, as
  // the prims the canvas draws and the exporter walks, and from there they
  // reach rough.js. Every consumer only reads them today, and a shared
  // reference is exactly as safe as that stays true: sort a freehand stroke's
  // points in place, in a library upgrade nobody here would think to look at,
  // and every checkpoint holding that node quietly changes shape with it. The
  // stroke is the one array long enough to be worth sorting, so it is the one
  // this checks.
  reset()
  const pts: [number, number][] = [[0, 0], [10, 4], [20, 1]]
  const d = s().addNode({ type: "draw", points: pts, x: 0, y: 0, w: 20, h: 4 } as unknown as Omit<SquigNode, "id" | "seed">)
  const stroke = (s().nodes[d] as unknown as { points: [number, number][] }).points
  const prims = nodePrims(s().nodes[d])
  const poly = prims.find((p) => p.t === "poly") as { pts: [number, number][] } | undefined
  check("a freehand stroke draws as a poly", !!poly)
  check("…whose points are not the document's own array", poly?.pts !== stroke)
  // and the copy really is one: reordering it leaves the drawing alone
  poly?.pts.reverse()
  check(
    "…so a consumer that reorders them can't reach the layer",
    stroke.map((p) => p.join()).join(" ") === "0,0 10,4 20,1",
    JSON.stringify(stroke)
  )
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} history checks passed`)
