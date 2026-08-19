// ---------------------------------------------------------------------------
// The import door — what a .squig.json has to survive to reach the canvas.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-import.ts
//
// A paste and an import are the same act: a document written somewhere else,
// arriving here. They used to be judged by two different checks, and the
// import — the one that can also poison the drawer, since what lands gets
// autosaved as the active file — was the lenient one. A layer that got through
// missing its `points` or its words took the whole render down on arrival, and
// a blank page is not a screen you can fix a document from.
//
// So the checks below are mostly about what gets turned away, and about the
// things a good document must never lose on the way in: a lock, an arrow's
// bindings, a crop.
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
import type { SquigNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const st = () => useSquig.getState()

/** A document as it arrives: JSON, exactly like the file picker hands it over. */
function file(nodes: Record<string, unknown>, order?: string[]): string {
  return JSON.stringify({
    app: "squig",
    version: 1,
    fileName: "a stranger's doc",
    order: order ?? Object.keys(nodes),
    nodes,
  })
}

const rect = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "shape",
  shape: "rect",
  fill: "none",
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  seed: 7,
  ...extra,
})

/** Put a known drawing on the canvas, so a refused import has something to leave alone. */
function standing(): void {
  const ok = st().loadDoc(file({ keep: rect("keep") }))
  if (!ok) throw new Error("fixture failed to import")
}

// -- what the old import let through ----------------------------------------

// Every one of these has finite x/y/w/h, which is all the import path used to
// ask for. Each is a field a real export writes and a truncated one can lose.
{
  const bad = {
    a: { id: "a", type: "draw", x: 0, y: 0, w: 50, h: 50, seed: 1 },
    b: { id: "b", type: "arrow", x: 0, y: 0, w: 50, h: 50, seed: 1, head: true },
    c: { id: "c", type: "text", x: 0, y: 0, w: 50, h: 50, seed: 1, fontSize: 18 },
    d: { id: "d", type: "wormhole", x: 0, y: 0, w: 50, h: 50, seed: 1 },
    e: { id: "e", type: "text", x: 0, y: 0, w: 50, h: 50, seed: 1, text: "hi" },
    f: { id: "f", type: "shape", shape: "rect", fill: "none", x: NaN, y: 0, w: 50, h: 50, seed: 1 },
  }

  standing()
  const ok = st().loadDoc(file({ good: rect("good"), ...bad }))
  check("a document with one readable layer still opens", ok === true)
  check("…and only that layer lands", st().order.join(",") === "good", st().order.join(","))

  for (const [id, n] of Object.entries(bad)) {
    check(`${id} (${n.type}) is turned away`, !st().nodes[id])
  }

  let threw = ""
  for (const id of st().order) {
    try {
      nodePrims(st().nodes[id])
    } catch (e) {
      threw = `${id}: ${(e as Error).message}`
    }
  }
  check("everything that landed can be drawn", threw === "", threw)
}

// -- a whole document of nothing readable -----------------------------------

// The canvas you are looking at is worth more than a file that turned out not
// to be one. Landing this would blank the screen and make the blank the file
// the drawer reopens, so the import stops at the door instead.
{
  standing()
  const before = st().docId
  const ok = st().loadDoc(file({ a: { id: "a", type: "wormhole", x: 0, y: 0, w: 1, h: 1, seed: 1 } }))
  check("a document with nothing readable in it is refused", ok === false)
  check("…and the drawing already open is untouched", st().order.join(",") === "keep")
  check("…and it is still the same document", st().docId === before)
}

// A document that genuinely has no layers is a different thing: it's an empty
// drawing, which is a perfectly good thing to export and open.
{
  standing()
  const ok = st().loadDoc(file({}))
  check("an empty drawing still imports", ok === true)
  check("…onto an empty canvas", st().order.length === 0)
}

// -- what a good document must not lose -------------------------------------

{
  const doc = {
    box: rect("box", { locked: true, ink: "muted", stroke: "heavy", dashed: true, groupIds: ["g1"] }),
    other: rect("other", { x: 300 }),
    line: {
      id: "line",
      type: "arrow",
      x: 100,
      y: 0,
      w: 200,
      h: 40,
      seed: 3,
      head: true,
      points: [
        [0, 0],
        [200, 40],
      ],
      bind: ["box", "other"],
    },
    pic: {
      id: "pic",
      type: "image",
      src: "data:image/png;base64,AAA",
      naturalW: 100,
      naturalH: 50,
      x: 0,
      y: 200,
      w: 100,
      h: 50,
      seed: 4,
      crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 },
      name: "screenshot.png",
    },
    words: {
      id: "words",
      type: "text",
      text: "hello\nnapkin",
      fontSize: 18,
      x: 0,
      y: 400,
      w: 80,
      h: 40,
      seed: 5,
      align: "center",
      fixedW: true,
      bold: true,
      link: "https://example.com",
    },
  }

  const ok = st().loadDoc(file(doc, ["words", "pic", "line", "other", "box"]))
  check("a well-formed document imports", ok === true)
  check("…with its layers in the order it wrote them", st().order.join(",") === "words,pic,line,other,box", st().order.join(","))

  const box = st().nodes.box
  check("a locked layer arrives locked", box?.locked === true)
  check("…keeping its ink and its pen", box?.type === "shape" && box.ink === "muted" && box.stroke === "heavy")
  check("…and its group", box?.groupIds?.join(",") === "g1")

  const line = st().nodes.line
  check("an arrow keeps both its bindings", line?.type === "arrow" && line.bind?.join(",") === "box,other")

  const pic = st().nodes.pic
  check("a picture keeps its crop", pic?.type === "image" && pic.crop?.x === 0.1 && pic.crop?.w === 0.5)
  check("…and the file it came from", pic?.type === "image" && pic.name === "screenshot.png")

  const words = st().nodes.words
  check("a label keeps its words", words?.type === "text" && words.text === "hello\nnapkin")
  check("…its measure, its alignment and its link", words?.type === "text" && words.fixedW === true && words.align === "center" && !!words.link)

  // exporting and importing again has to be a no-op, or a file loses a little
  // more of itself every time it goes round
  const again = st().loadDoc(st().serialize())
  const box2 = st().nodes.box
  const line2 = st().nodes.line
  const pic2 = st().nodes.pic
  check("a second trip through changes nothing", again === true)
  check("…the lock survives it", box2?.locked === true)
  check("…and so do the bindings", line2?.type === "arrow" && line2.bind?.join(",") === "box,other")
  check("…and the crop", pic2?.type === "image" && pic2.crop?.x === 0.1)
}

// -- bindings that name nothing ---------------------------------------------

// The shape of a binding is one node's business; whether the ids name anything
// is the document's. An end pointing at a layer that isn't here lets go.
{
  const ok = st().loadDoc(
    file({
      box: rect("box"),
      line: {
        id: "line",
        type: "arrow",
        x: 0,
        y: 0,
        w: 100,
        h: 10,
        seed: 3,
        head: true,
        points: [
          [0, 0],
          [100, 10],
        ],
        bind: ["box", "ghost"],
      },
    })
  )
  const line = st().nodes.line
  check("a document with a dangling binding still opens", ok === true)
  check("…the end that names something holds", line?.type === "arrow" && line.bind?.[0] === "box")
  check("…and the one that doesn't lets go", line?.type === "arrow" && line.bind?.[1] === null)
}

// -- the z-order ------------------------------------------------------------

{
  const ok = st().loadDoc(
    file({ a: rect("a"), b: rect("b") }, ["a", "a", "ghost", "b"])
  )
  check("an order that repeats itself is deduped", ok === true && st().order.join(",") === "a,b", st().order.join(","))

  st().loadDoc(file({ a: rect("a"), b: rect("b") }, ["b"]))
  check("a layer the order forgot is put on top", st().order.join(",") === "b,a", st().order.join(","))
}

// -- the node's name --------------------------------------------------------

// The key is what the z-order, the selection and an arrow's binding all spell,
// so a document whose node disagrees with its own key is read the key's way.
{
  st().loadDoc(file({ real: { ...rect("stale") } }))
  check("a node is named by its key", st().nodes.real?.id === "real", st().nodes.real?.id)

  // …and a node with no name at all still gets the key's
  const nameless = { type: "shape", shape: "rect", fill: "none", x: 0, y: 0, w: 10, h: 10, seed: 1 }
  st().loadDoc(file({ here: nameless as unknown as SquigNode }))
  check("…even one that arrived without one", st().nodes.here?.id === "here", st().nodes.here?.id)
}

// -- pictures ---------------------------------------------------------------

{
  const pic = (src: string) => ({
    id: "p",
    type: "image",
    src,
    naturalW: 100,
    naturalH: 50,
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    seed: 1,
  })

  standing()
  const remote = st().loadDoc(file({ p: pic("https://example.com/tracker.png") }))
  check("a picture pointing at the network never lands", remote === false)
  check("…and the drawing already open is untouched", st().order.join(",") === "keep")

  const own = st().loadDoc(file({ p: pic("data:image/png;base64,AAA") }))
  check("a picture carrying its own pixels does", own === true && st().order.join(",") === "p")

  // one bad number in a crop would render the picture at infinity; the crop
  // goes, the picture stays
  st().loadDoc(file({ p: { ...pic("data:image/png;base64,AAA"), crop: { x: NaN, y: 0, w: 1, h: 1 } } }))
  const cropped = st().nodes.p
  check("a crop made of nonsense is dropped, not the picture", cropped?.type === "image" && cropped.crop === undefined)
}

// -- what isn't a document at all -------------------------------------------

{
  standing()
  check("prose is refused", st().loadDoc("just some words") === false)
  check("a document with no nodes at all is refused", st().loadDoc(JSON.stringify({ order: [] })) === false)
  check("…and the drawing already open survived all of it", st().order.join(",") === "keep")
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} import checks passed`)
