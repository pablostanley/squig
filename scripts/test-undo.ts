// ---------------------------------------------------------------------------
// Undo, by the symptoms a person would notice.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-undo.ts
//
// The store used to leave the checkpoint contract to each call site, and three
// separate bugs came out of the same gap: dismissing a text draft cost two
// steps and left an invisible click-blocker between them, commands that moved
// nothing still spent a step saying so, and a redo after a duplicate handed
// the copies back with nothing selected. `edit()` is the answer to all three,
// so the checks below are written the way the bugs were reported — press this,
// count the steps, look at what came back — rather than against the primitive.
//
// The second half is the part that must NOT have changed: a real edit is still
// one step, a drag is still one step for the whole drag, and a document that
// goes down the undo stack and back comes out identical.
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
const { hitsPoint } = await import("../lib/canvas/hit-test.ts")
import type { SquigNode, TextNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

// -- the canvas, driven the way the app drives it ---------------------------

const s = () => useSquig.getState()
const depth = () => s().past.length
const order = () => s().order
const nodeAt = (i: number) => s().nodes[s().order[i]]

function reset() {
  useSquig.setState({
    nodes: {},
    order: [],
    selection: [],
    past: [],
    future: [],
    dupTrail: null,
    editingId: null,
    croppingId: null,
  })
}

const rect = (x: number, y: number, w = 40, h = 30) =>
  s().addNode({ type: "shape", shape: "rect", fill: "none", x, y, w, h } as Omit<SquigNode, "id" | "seed">)

/** What the text tool does on a click: place an empty run and open the editor. */
const placeDraft = (x: number, y: number) => {
  const id = s().addNode({ type: "text", text: "", fontSize: 18, x, y, w: 120, h: 23.4 } as Omit<SquigNode, "id" | "seed">)
  s().setEditing(id)
  return id
}

/** The document, written down so two of them can be compared. */
function docJson(): string {
  const st = s()
  return JSON.stringify(
    st.order.map((id) => {
      const n = st.nodes[id] as unknown as Record<string, unknown>
      return Object.fromEntries(Object.keys(n).sort().map((k) => [k, n[k]]))
    })
  )
}

// ---------------------------------------------------------------------------
// (a) A draft nobody typed into
// ---------------------------------------------------------------------------
{
  reset()
  rect(0, 0)
  const before = depth()
  const id = placeDraft(200, 200)
  s().dismissDraft(id)
  s().setEditing(null)

  check("empty draft: costs no undo step at all", depth() === before, `past ${before} -> ${depth()}`)
  check("empty draft: leaves nothing behind", order().length === 1)

  // the bug: one ⌘Z used to hand back a text node with no words in it — nothing
  // to see, 120×23 of hit area, and a place in ⌘A
  s().undo()
  const ghost = order().map((id2) => s().nodes[id2]).find((n) => n.type === "text" && !(n as TextNode).text)
  check("empty draft: ⌘Z can't reach a ghost, because there isn't one", !ghost)
  check(
    "empty draft: nothing invisible is swallowing presses at 260,210",
    !order().some((id2) => hitsPoint(s().nodes[id2], 260, 210, 1))
  )
  check("empty draft: that ⌘Z undid the edit before it", order().length === 0)
}

{
  // placing a draft and typing into it is one act, so ⌘Z lifts the whole layer
  // off rather than stopping on the empty run it passed through
  reset()
  const id = placeDraft(200, 200)
  const before = depth()
  s().commitText(id, { text: "hello", w: 46 } as Partial<SquigNode>)
  s().setEditing(null)
  check("place then type: no second step for the words", depth() === before, `past ${before} -> ${depth()}`)
  check("place then type: the words landed", (nodeAt(0) as TextNode).text === "hello")
  s().undo()
  check("place then type: one ⌘Z takes the whole layer", order().length === 0)
}

{
  // …and the very next edit of that same layer is a layer that's already
  // there, however little has happened since. The top checkpoint goes on
  // predating the node for as long as nothing else pushes one, so this used to
  // fold into the placement too — a second run of words landing on top of the
  // first, with the first never checkpointed at all. ⌘Z lifted the whole layer
  // off the canvas, and redo couldn't reach the words in between either.
  reset()
  const id = placeDraft(200, 200)
  s().commitText(id, { text: "hello", w: 46 } as Partial<SquigNode>)
  s().setEditing(null)
  const before = depth()

  // double-click the same layer, select all, type over it, click away
  s().setEditing(id)
  s().commitText(id, { text: "goodbye", w: 70 } as Partial<SquigNode>)
  s().setEditing(null)
  check("typing over it again: a step of its own", depth() === before + 1, `past ${before} -> ${depth()}`)
  check("typing over it again: the new words landed", (s().nodes[id] as TextNode).text === "goodbye")

  s().undo()
  check(
    "typing over it again: ⌘Z hands back the words before, not an empty canvas",
    (s().nodes[id] as TextNode)?.text === "hello",
    s().nodes[id] ? JSON.stringify((s().nodes[id] as TextNode).text) : "the layer is gone"
  )
  s().redo()
  check("typing over it again: ⇧⌘Z puts the new words back", (s().nodes[id] as TextNode)?.text === "goodbye")
  // and the placement is still one step under it, exactly where it was
  s().undo()
  s().undo()
  check("typing over it again: one more ⌘Z takes the layer off", !order().length)
}

{
  // the same shape on a component: a label is never empty when the library
  // drops it, so renaming one is an edit from the first letter — ⌘Z hands back
  // the label it came with rather than deleting the layer
  reset()
  const id = s().addNode({
    type: "component",
    kind: "button",
    props: { label: "Button" },
    x: 0,
    y: 0,
    w: 100,
    h: 36,
  } as unknown as Omit<SquigNode, "id" | "seed">)
  const before = depth()
  s().setEditing(id)
  s().commitText(id, { props: { label: "Save" } } as Partial<SquigNode>)
  s().setEditing(null)
  check("renaming a just-dropped button: one step", depth() === before + 1, `past ${before} -> ${depth()}`)
  const labelOf = (nid: string) => (s().nodes[nid] as unknown as { props?: { label?: string } })?.props?.label
  check("renaming a just-dropped button: the new label landed", labelOf(id) === "Save")
  s().undo()
  check("renaming a just-dropped button: ⌘Z brings the old label back", labelOf(id) === "Button", `label ${labelOf(id)}`)
}

{
  // emptying words that were already there is a real edit and keeps its step
  reset()
  const id = s().addNode({ type: "text", text: "hello", fontSize: 18, x: 0, y: 0, w: 60, h: 23.4 } as Omit<SquigNode, "id" | "seed">)
  rect(200, 200) // …and some other edit since, so the layer isn't freshly placed
  s().setEditing(id)
  const before = depth()
  s().dismissDraft(id)
  s().setEditing(null)
  check("emptied words: still cost one step", depth() === before + 1, `past ${before} -> ${depth()}`)
  check("emptied words: the layer is gone", !s().nodes[id])
  s().undo()
  check("emptied words: ⌘Z brings the words back", (s().nodes[id] as TextNode)?.text === "hello")
}

{
  // and re-typing the same words into an old layer is no edit at all
  reset()
  const id = s().addNode({ type: "text", text: "hello", fontSize: 18, x: 0, y: 0, w: 60, h: 23.4 } as Omit<SquigNode, "id" | "seed">)
  rect(200, 200)
  const before = depth()
  s().commitText(id, { text: "hello" } as Partial<SquigNode>)
  check("retyping the same words on an old layer: no undo step", depth() === before, `past ${before} -> ${depth()}`)
}

// ---------------------------------------------------------------------------
// (b) Commands that change nothing
// ---------------------------------------------------------------------------
{
  reset()
  const a = rect(0, 0)
  const b = rect(100, 0)

  const noop = (name: string, run: () => void) => {
    const was = depth()
    const doc = docJson()
    run()
    check(`${name}: no undo step`, depth() === was, `past ${was} -> ${depth()}`)
    check(`${name}: document untouched`, docJson() === doc)
  }

  noop("] on the frontmost layer", () => s().bringToFront([b]))
  noop("⌥⌘] on the frontmost layer", () => s().bringForward([b]))
  noop("[ on the backmost layer", () => s().sendToBack([a]))
  noop("⌥⌘[ on the backmost layer", () => s().sendBackward([a]))

  // and the real ones still work, one step each
  const was = depth()
  s().bringToFront([a])
  check("] on the back layer: one step, and it moved", depth() === was + 1 && order()[1] === a)
  s().undo()
  check("…and ⌘Z puts it back", order()[0] === a)
}

{
  reset()
  const c1 = rect(0, 0)
  const c2 = rect(0, 100)
  s().setSelection([c1, c2])
  const was = depth()
  s().alignSelected("left")
  check("align left on a column already flush left: no undo step", depth() === was)
  s().alignSelected("right")
  check("align right on the same column: no undo step either", depth() === was)

  // one of them out of line, and the same command is an edit again
  s().updateNode(c2, { x: 40 })
  const then = depth()
  s().alignSelected("left")
  check("align left with one node out: one step", depth() === then + 1)
  check("…and it landed", s().nodes[c2].x === 0)
}

{
  reset()
  const icon = s().addNode({
    type: "component",
    kind: "icon",
    props: { name: "star" },
    x: 0,
    y: 0,
    w: 24,
    h: 24,
  } as unknown as Omit<SquigNode, "id" | "seed">)
  s().setSelection([icon])
  const was = depth()
  const doc = docJson()
  s().detachSelected()
  check("detach on an icon-only selection: no undo step", depth() === was, `past ${was} -> ${depth()}`)
  check("detach on an icon: document untouched", docJson() === doc)
  check("detach on an icon: the icon is still selected", s().selection.join() === icon)
}

{
  reset()
  const was = depth()
  s().clearCanvas()
  check("clearing an empty canvas: no undo step", depth() === was)
  rect(0, 0)
  const then = depth()
  s().clearCanvas()
  check("clearing a canvas with something on it: one step", depth() === then + 1 && !order().length)
}

{
  // a command that changes nothing must not eat the redo branch either — that
  // would be the same bug wearing a different coat
  reset()
  const a = rect(0, 0)
  rect(100, 0)
  s().undo()
  check("no-op guard: there is a redo waiting", s().future.length === 1)
  s().bringToFront([a])
  check("no-op guard: ] on the only layer left the redo alone", s().future.length === 1)
  s().redo()
  check("no-op guard: …and it still redoes", order().length === 2)
}

// ---------------------------------------------------------------------------
// (c) Redo after a duplicate hands the copies back selected
// ---------------------------------------------------------------------------
{
  reset()
  const src = rect(0, 0)
  s().setSelection([src])
  // a stride of 40, so a repeat can be told apart from the polite 16px nudge
  const [copy] = s().duplicateSelected(40)
  s().setSelection([]) // click away
  s().undo()
  s().redo()

  check("⌘D then ⌘Z then ⇧⌘Z: the copy is back", !!s().nodes[copy])
  check("…and it is what's selected", s().selection.join() === copy, `selection ${JSON.stringify(s().selection)}`)

  const [second] = s().duplicateSelected()
  check("…so the next ⌘D repeats the stride instead of nudging", s().nodes[second]?.x === 80, `x ${s().nodes[second]?.x}`)
}

{
  reset()
  const src = rect(0, 0)
  const [pasted] = [s().nodes[src]]
  s().setSelection([])
  s().pasteNodes([pasted], [200, 200])
  const ids = [...s().selection]
  s().setSelection([])
  s().undo()
  s().redo()
  check("paste then ⌘Z then ⇧⌘Z: the paste comes back selected", s().selection.join() === ids.join())
}

// ---------------------------------------------------------------------------
// What must not have changed
// ---------------------------------------------------------------------------
{
  reset()
  const a = rect(0, 0)
  const was = depth()
  s().updateNode(a, { x: 50 }, { checkpoint: true })
  check("a real edit: one step", depth() === was + 1)
  s().undo()
  check("a real edit: one ⌘Z is enough", s().nodes[a].x === 0 && depth() === was)
}

{
  // the live-drag path: one checkpoint on the first move that counts, then
  // hundreds of free writes. edit() has no business anywhere near this.
  reset()
  const a = rect(0, 0)
  const was = depth()
  s().checkpoint()
  for (let i = 1; i <= 200; i++) s().updateNodes({ [a]: { x: i, y: i } })
  check("a drag: one step for the whole gesture", depth() === was + 1, `past ${was} -> ${depth()}`)
  check("a drag: the node ended where the pointer did", s().nodes[a].x === 200)
  s().undo()
  check("a drag: one ⌘Z rewinds all of it", s().nodes[a].x === 0)
}

{
  // and a gesture that never got going still drops its own checkpoint
  reset()
  const a = rect(0, 0)
  const was = depth()
  s().checkpoint()
  s().updateNodes({ [a]: { x: 3 } })
  s().revertToCheckpoint()
  check("a cancelled gesture: no step, no move", depth() === was && s().nodes[a].x === 0)
}

{
  reset()
  const a = rect(0, 0)
  const b = rect(100, 0)
  s().setSelection([a, b])
  s().groupSelected()
  s().alignSelected("top")
  s().updateNode(b, { y: 60 }, { checkpoint: true })
  s().bringToFront([a])
  s().duplicateSelected()
  const finished = docJson()
  const steps = depth()

  for (let i = 0; i < steps; i++) s().undo()
  check("round trip: undoing everything empties the canvas", !order().length, `${order().length} left`)
  for (let i = 0; i < steps; i++) s().redo()
  check("round trip: redoing it all lands on the same document", docJson() === finished)
}

{
  // an edit that starts inside another one joins it — the store's own guard
  // against the convention drifting back
  reset()
  const a = rect(0, 0)
  const was = depth()
  s().edit(() => {
    s().updateNodes({ [a]: { x: 10 } })
    s().edit(() => s().updateNodes({ [a]: { y: 10 } }))
  })
  check("a nested edit: one step between them", depth() === was + 1, `past ${was} -> ${depth()}`)
  s().undo()
  check("a nested edit: one ⌘Z takes both halves", s().nodes[a].x === 0 && s().nodes[a].y === 0)
}

{
  // what edit() says it did, since callers lean on it
  reset()
  const a = rect(0, 0)
  check("edit(): true when the document moved", s().edit(() => s().updateNodes({ [a]: { x: 9 } })) === true)
  check("edit(): false when it didn't", s().edit(() => s().updateNodes({ [a]: { x: 9 } })) === false)
  check("edit(): false when the body writes nothing at all", s().edit(() => {}) === false)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} undo checks passed`)
