// ---------------------------------------------------------------------------
// The document as a plain value.
//
// The same file the app autosaves and exports, with nothing from the browser
// attached. Read one, build one, change one, write one — from node, a test,
// the command line or an MCP tool. The store, window.squig, the CLI and the
// MCP server all come through here, so a node that is legal at one door is
// legal at all of them, and a rule about documents is written once.
//
// Every operation returns a new document and leaves its input alone. Anything
// a caller got wrong — an unknown component, an id that's taken, a patch that
// breaks a node — throws a DocError with a sentence the caller can show.
// ---------------------------------------------------------------------------

import { nanoid } from "nanoid"
import type {
  ArrowNode,
  Box,
  ComponentNode,
  FillTone,
  InkTone,
  LineStyle,
  ShapeKind,
  ShapeNode,
  SquigDoc,
  SquigNode,
  StrokeWeight,
  TextAlign,
  TextNode,
} from "./types"
import { normalizeFill } from "./types"
import { validNode } from "./clipboard-payload"
import { bindPair, settleBinds } from "./canvas/arrow-binding"
import { nodeVisualBounds } from "./canvas/line-routing"
import { planGroupPaths, pruneDegenerateGroups } from "./canvas/groups"
import { fitTextBox } from "./canvas/text-reflow"
import type { TextMeasurer } from "./canvas/text-metrics"
import { ALL_DEFS, getDef, matches, type Category, type ComponentDef, type ControlDef, type Props } from "./library/registry"
import { DEFAULT_LOOK, knownLook, type Look } from "./theme"

export const DOC_VERSION = 1
export const DEFAULT_FILE_NAME = "untitled scribbles"
/** the size a text layer starts at when nobody said otherwise */
export const DEFAULT_FONT_SIZE = 18

/** A whole drawing: what a .squig.json holds once it has been read. */
export interface SquigDocument extends SquigDoc {
  look: Look
}

export class DocError extends Error {}

/** Short and URL-safe, like the ids the app mints; a caller may bring its own. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
/** Names a plain object already answers to — as a key they'd reach the prototype. */
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"])
/** A picture is raster: an SVG data URL can carry script, and nothing here needs one. */
const RASTER_SRC = /^data:image\/(png|jpeg|webp|gif);base64,/i
const MAX_FONT_SIZE = 1000
/** Keeps a typo'd coordinate from putting a node a light-year off the sheet. */
const MAX_COORD = 1_000_000

export const newId = () => nanoid(8)
export const newSeed = () => Math.floor(Math.random() * 2 ** 31)

export function emptyDoc(fileName = DEFAULT_FILE_NAME, look: Look = DEFAULT_LOOK): SquigDocument {
  return { fileName, look: { ...look }, nodes: {}, order: [] }
}

// -- reading and writing files ----------------------------------------------

/**
 * Everything a document has to survive before the canvas will draw it.
 *
 * The check itself is `validNode` — the same gate a paste goes through. There
 * used to be two of them, and the weaker one guarded the wider door: a
 * .squig.json that had lost its `points` — a truncated export, an older
 * writer, a file somebody edited by hand — imported happily, threw on the
 * first render, and left no screen to fix it from. One gate now, on every
 * door, which also means a node type only has to be vouched for in one place
 * the next time squig grows one.
 *
 * What stays here is the part no single node can answer for itself: the
 * boolean fill old shapes wrote, the z-order, and arrow ends that name nodes
 * this document turns out not to have.
 */
export function sanitizeDoc(nodes: unknown, order: unknown): { nodes: Record<string, SquigNode>; order: string[] } {
  const clean: Record<string, SquigNode> = {}
  const raw = nodes && typeof nodes === "object" ? (nodes as Record<string, unknown>) : {}
  for (const [id, value] of Object.entries(raw)) {
    const node = validNode(value)
    if (!node) continue
    // the key is the name the rest of the document knows this node by — the
    // z-order, an arrow's binding and the selection all spell it that way.
    // validNode calls an unnamed node "pasted", since a paste renames it on
    // the way down; here the key is the name, so stamp it back on.
    node.id = id
    // shapes stored a boolean fill before they had a tonal ladder; upgrade on
    // the way in so nothing downstream has to know the old spelling existed
    if (node.type === "shape") node.fill = normalizeFill(node.fill)
    clean[id] = node
  }
  const seen = new Set<string>()
  const ord = (Array.isArray(order) ? order : []).filter((id): id is string => {
    if (typeof id !== "string" || !clean[id] || seen.has(id)) return false
    seen.add(id)
    return true
  })
  for (const id of Object.keys(clean)) if (!seen.has(id)) ord.push(id)
  // a stranger's document can bind an arrow to a node that was never in it, or
  // to one the loop above just threw out. Those ends let go here, and the ones
  // that survive get routed to wherever their boxes actually are.
  return { nodes: settleBinds(pruneDegenerateGroups(clean)), order: ord }
}

/**
 * A document from JSON, or null for anything that isn't one.
 *
 * A file that had layers and lost every one of them is not an empty drawing —
 * it's a document squig can't read, and taking it anyway would trade the
 * canvas you're looking at for a blank one. A genuinely empty export still
 * comes in: it had nothing to lose. A file with no look wears `fallbackLook`,
 * which for the app is whatever the canvas is already wearing.
 */
export function parseDoc(
  json: string,
  fallbackName = "imported scribbles",
  fallbackLook: Look = DEFAULT_LOOK
): SquigDocument | null {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return null
  }
  if (!doc || typeof doc !== "object") return null
  const d = doc as Record<string, unknown>
  if (!d.nodes || typeof d.nodes !== "object" || !Array.isArray(d.order)) return null
  const clean = sanitizeDoc(d.nodes, d.order)
  if (Object.keys(d.nodes as object).length && !clean.order.length) return null
  return {
    fileName: typeof d.fileName === "string" && d.fileName ? d.fileName : fallbackName,
    look: knownLook(d.look, fallbackLook),
    nodes: clean.nodes,
    order: clean.order,
  }
}

export function serializeDoc(doc: SquigDocument): string {
  const { fileName, look, nodes, order } = doc
  return JSON.stringify({ app: "squig", version: DOC_VERSION, fileName, look, nodes, order }, null, 2)
}

/** The nodes in draw order, which is the only order anything should read them in. */
export function nodesOf(doc: SquigDoc): SquigNode[] {
  return doc.order.map((id) => doc.nodes[id]).filter(Boolean)
}

/** The world box the drawing covers — bent connectors included — or null when it's blank. */
export function docBounds(doc: SquigDoc): Box | null {
  let box: Box | null = null
  for (const n of nodesOf(doc)) {
    const b = nodeVisualBounds(n)
    box = box
      ? {
          minX: Math.min(box.minX, b.x),
          minY: Math.min(box.minY, b.y),
          maxX: Math.max(box.maxX, b.x + b.w),
          maxY: Math.max(box.maxY, b.y + b.h),
        }
      : { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }
  }
  return box
}

// -- building nodes ----------------------------------------------------------

export interface NodeAt {
  x: number
  y: number
  /** Counterclockwise degrees around the node's center. */
  rotation?: number
  id?: string
  seed?: number
  /** held down: still prints, but the pointer walks past it — see BaseNode */
  locked?: boolean
}

export interface ComponentAt extends NodeAt {
  /** the def's own size when absent */
  w?: number
  h?: number
  /** overrides on top of the def's defaults; see describeComponent for the keys */
  props?: Props
}

/** A library component at its default size, unless told otherwise. */
export function componentNode(kind: string, at: ComponentAt): ComponentNode {
  const def = getDef(kind)
  if (!def) throw new DocError(`no component called "${kind}" — try listComponents("${kind}")`)
  return {
    id: at.id ?? newId(),
    seed: at.seed ?? newSeed(),
    type: "component",
    kind: def.kind,
    props: { ...def.defaults, ...at.props },
    x: at.x,
    y: at.y,
    w: at.w ?? def.size.w,
    h: at.h ?? def.size.h,
    ...(at.rotation !== undefined ? { rotation: at.rotation } : {}),
    ...(at.locked ? { locked: true } : {}),
  }
}

export interface TextAt extends NodeAt {
  fontSize?: number
  /** a measure to wrap to; absent means the box hugs the words */
  w?: number
  align?: TextAlign
  bold?: boolean
  italic?: boolean
  underline?: boolean
  ink?: InkTone
  boxed?: boolean
  boxFill?: FillTone
  link?: string
}

/**
 * A text layer sized to its words, the way one typed on the canvas ends up.
 *
 * `x` is where the anchor edge lands — the left edge for left-aligned text,
 * the middle for centred, the right edge for right-aligned — and `y` is the
 * top of the box. Give it a `w` and the words wrap to it instead. Off the
 * browser, `measureText` (see lib/canvas/text-metrics) is what makes the
 * box the size the real face needs rather than an em-ratio guess.
 */
export function textNode(text: string, at: TextAt, measureText?: TextMeasurer): TextNode {
  const fontSize = at.fontSize ?? DEFAULT_FONT_SIZE
  if (!(fontSize > 0)) throw new DocError("fontSize has to be a positive number")
  const base: TextNode = {
    id: at.id ?? newId(),
    seed: at.seed ?? newSeed(),
    type: "text",
    text,
    fontSize,
    x: at.x,
    y: at.y,
    w: at.w ?? 0,
    h: 0,
    ...(at.rotation !== undefined ? { rotation: at.rotation } : {}),
    ...(at.w !== undefined ? { fixedW: true } : {}),
    ...(at.align && at.align !== "left" ? { align: at.align } : {}),
    ...(at.bold ? { bold: true } : {}),
    ...(at.italic ? { italic: true } : {}),
    ...(at.underline ? { underline: true } : {}),
    ...(at.ink && at.ink !== "ink" ? { ink: at.ink } : {}),
    ...(at.boxed ? { boxed: true } : {}),
    ...(at.boxed && at.boxFill ? { boxFill: at.boxFill } : {}),
    ...(at.link ? { link: at.link } : {}),
    ...(at.locked ? { locked: true } : {}),
  }
  return { ...base, ...fitTextBox(base, text, fontSize, measureText) }
}

export interface ShapeAt extends NodeAt {
  w: number
  h: number
  fill?: FillTone
  stroke?: StrokeWeight
  ink?: InkTone
  dashed?: boolean
}

export function shapeNode(shape: ShapeKind, at: ShapeAt): ShapeNode {
  return {
    id: at.id ?? newId(),
    seed: at.seed ?? newSeed(),
    type: "shape",
    shape,
    fill: at.fill ?? "none",
    x: at.x,
    y: at.y,
    w: at.w,
    h: at.h,
    ...(at.rotation !== undefined ? { rotation: at.rotation } : {}),
    ...(at.stroke && at.stroke !== "regular" ? { stroke: at.stroke } : {}),
    ...(at.ink && at.ink !== "ink" ? { ink: at.ink } : {}),
    ...(at.dashed ? { dashed: true } : {}),
    ...(at.locked ? { locked: true } : {}),
  }
}

/** An arrow end: the id of a node to stick to, or a point on the sheet. */
export type ArrowEnd = string | [number, number]

export interface ArrowOpts {
  from: ArrowEnd
  to: ArrowEnd
  /** arrowhead at `to`; on unless turned off */
  head?: boolean
  lineStyle?: LineStyle
  stroke?: StrokeWeight
  ink?: InkTone
  dashed?: boolean
  id?: string
  seed?: number
}

/**
 * A connector. An end given as an id sticks to that node and follows it; the
 * document the arrow is added to routes it from box to box (see settleBinds),
 * so here a bound end only needs to start somewhere sensible — the target's
 * middle — and the box around the two points follows from that.
 */
export function arrowNode(opts: ArrowOpts, nodes: Record<string, SquigNode>): ArrowNode {
  const end = (e: ArrowEnd, which: "from" | "to"): [number, number] => {
    if (typeof e !== "string") return e
    const n = nodes[e]
    if (!n) throw new DocError(`arrow "${which}" names a node that isn't in the document: "${e}"`)
    return [n.x + n.w / 2, n.y + n.h / 2]
  }
  const fromId = typeof opts.from === "string" ? opts.from : null
  const toId = typeof opts.to === "string" ? opts.to : null
  if (fromId && fromId === toId) throw new DocError("an arrow can't run from a node to itself")
  const a = end(opts.from, "from")
  const b = end(opts.to, "to")
  const x = Math.min(a[0], b[0])
  const y = Math.min(a[1], b[1])
  return {
    id: opts.id ?? newId(),
    seed: opts.seed ?? newSeed(),
    type: "arrow",
    head: opts.head !== false,
    x,
    y,
    w: Math.abs(b[0] - a[0]),
    h: Math.abs(b[1] - a[1]),
    points: [
      [a[0] - x, a[1] - y],
      [b[0] - x, b[1] - y],
    ],
    bind: bindPair(fromId, toId),
    ...(opts.lineStyle && opts.lineStyle !== "straight" ? { lineStyle: opts.lineStyle } : {}),
    ...(opts.stroke && opts.stroke !== "regular" ? { stroke: opts.stroke } : {}),
    ...(opts.ink && opts.ink !== "ink" ? { ink: opts.ink } : {}),
    ...(opts.dashed ? { dashed: true } : {}),
  }
}

// -- changing a document -----------------------------------------------------

/**
 * The one gate: the node as the canvas would accept it, or a reason it won't.
 *
 * validNode is the shape check every door already shares; what's added here
 * is what a stranger's node can get wrong that a paste can't — a name that
 * reaches the prototype, a component with a prop its controls don't allow, a
 * picture that isn't a raster. The store, the CLI, window.squig and the
 * workspace engine all come through this, so a refusal reads the same at
 * every door.
 */
export function vouchNode(raw: unknown): SquigNode {
  const n = validNode({ ...(raw as object) })
  if (!n) throw new DocError(`not a node squig can draw: ${describe(raw)}`)
  if (!ID_PATTERN.test(n.id) || RESERVED_IDS.has(n.id)) {
    throw new DocError(`"${n.id}" isn't a usable id (letters, digits, - and _, up to 80)`)
  }
  if ([n.x, n.y, n.w, n.h].some((v) => Math.abs(v) > MAX_COORD)) {
    throw new DocError(`node "${n.id}" is off the sheet — keep coordinates within ±${MAX_COORD}`)
  }
  switch (n.type) {
    case "component": {
      const def = getDef(n.kind)
      if (!def) throw new DocError(`no component called "${n.kind}"`)
      checkProps(def, n.props)
      break
    }
    case "text":
      if (!(n.fontSize > 0 && n.fontSize <= MAX_FONT_SIZE)) {
        throw new DocError(`fontSize has to be between 1 and ${MAX_FONT_SIZE}, not ${n.fontSize}`)
      }
      break
    case "image":
      if (!RASTER_SRC.test(n.src)) throw new DocError(`a picture is a png, jpeg, webp or gif data URL, not "${n.src.slice(0, 24)}…"`)
      if (!(n.naturalW > 0 && n.naturalH > 0 && Number.isFinite(n.naturalW) && Number.isFinite(n.naturalH))) {
        throw new DocError(`picture "${n.id}" needs its own size — positive naturalW and naturalH`)
      }
      break
  }
  return n
}

/** Every prop a control governs holds a value that control could have set. */
function checkProps(def: ComponentDef, props: Props): void {
  for (const c of def.controls) {
    const v = props[c.key]
    if (v === undefined) continue
    const bad = (why: string) => new DocError(`${def.kind}.${c.key} can't be ${JSON.stringify(v)}: ${why}`)
    switch (c.type) {
      case "select":
        if (c.options && !c.options.includes(String(v))) throw bad(`it's one of ${c.options.join(", ")}`)
        break
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) throw bad("it wants a number")
        if ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max)) {
          throw bad(`it stays between ${c.min ?? "-∞"} and ${c.max ?? "∞"}`)
        }
        break
      case "toggle":
        if (typeof v !== "boolean") throw bad("it's on or off")
        break
      case "text":
      case "icon":
        if (typeof v !== "string") throw bad("it wants a string")
        break
    }
  }
  // a def that throws on its own props is the last check — it's what the
  // canvas would do on the first paint, and the paint is the wrong place
  try {
    def.render({ ...def.defaults, ...props }, def.size.w, def.size.h)
  } catch {
    throw new DocError(`${def.kind} can't draw with those props`)
  }
}

function describe(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw)
  const r = raw as Record<string, unknown>
  return typeof r.id === "string" ? `"${r.id}"` : `a ${String(r.type ?? "typeless")} node with no id`
}

/**
 * Put nodes on top of the drawing, in the order given.
 *
 * Ids have to be new: a document is a map, and writing over a node by handing
 * in another with its name is how an agent loses work without noticing.
 * Change a node with updateNode.
 */
export function addNodes(doc: SquigDocument, nodes: readonly SquigNode[]): SquigDocument {
  const map = { ...doc.nodes }
  const order = [...doc.order]
  for (const raw of nodes) {
    const n = vouchNode(raw)
    if (map[n.id]) throw new DocError(`there is already a node called "${n.id}"`)
    map[n.id] = n
    order.push(n.id)
  }
  return { ...doc, nodes: settleBinds(pruneDegenerateGroups(map)), order }
}

/** The keys whose change means a text layer's box has to be measured again. */
const TEXT_LAYOUT_KEYS: ReadonlySet<string> = new Set(["text", "fontSize", "bold", "italic", "boxed", "w", "h", "fixedW", "fixedH"])

/**
 * One node with a patch on it, vouched. A text layer keeps its box honest
 * when the patch touches its words or its measure — new words, a new size,
 * a new width re-fit the box the way the inline editor would — and keeps
 * its box as it was for anything else, so locking or moving a label never
 * re-lays it out. A component's props merge, so setting the label keeps the
 * variant. This is the node half of updateNode; a caller building a batch
 * of its own applies it per node and settles the document once at the end.
 */
export function patchNode(node: SquigNode, patch: Partial<SquigNode>, measureText?: TextMeasurer): SquigNode {
  if ("type" in patch && patch.type !== node.type) throw new DocError(`a ${node.type} can't become a ${patch.type}`)
  let merged: SquigNode
  if (node.type === "text") {
    const { text, fontSize, ...rest } = patch as Partial<TextNode>
    // a width or height handed in is a chosen one, the way a dragged handle
    // is: the words wrap to the width, and the height is a floor they may
    // still push past — see setTextWidth and setTextHeight in text-reflow.
    // Unless the patch says otherwise about the flag itself: a caller
    // handing back a size together with fixedW: false is letting go.
    const base: TextNode = {
      ...node,
      ...rest,
      ...(rest.w !== undefined && !("fixedW" in rest) ? { fixedW: true } : {}),
      ...(rest.h !== undefined && !("fixedH" in rest) ? { fixedH: true } : {}),
    }
    const relaid = Object.keys(patch).some((k) => TEXT_LAYOUT_KEYS.has(k))
    merged = relaid
      ? { ...base, ...fitTextBox(base, text ?? node.text, fontSize ?? node.fontSize, measureText) }
      : { ...base, text: text ?? node.text, fontSize: fontSize ?? node.fontSize }
  } else if (node.type === "component") {
    const { props, ...rest } = patch as Partial<ComponentNode>
    merged = { ...node, ...rest, ...(props ? { props: { ...node.props, ...props } } : {}) }
  } else {
    merged = { ...node, ...patch } as SquigNode
  }
  return vouchNode({ ...merged, id: node.id })
}

/**
 * Change one node in a document. The document that comes back may have
 * changed neighbours too — a group left with one member dissolves, and bound
 * arrows follow a moved box — so read the whole node map, not just the node
 * you named.
 */
export function updateNode(
  doc: SquigDocument,
  id: string,
  patch: Partial<SquigNode>,
  measureText?: TextMeasurer
): SquigDocument {
  const node = doc.nodes[id]
  if (!node) throw new DocError(`no node called "${id}"`)
  const next = patchNode(node, patch, measureText)
  return { ...doc, nodes: settleBinds(pruneDegenerateGroups({ ...doc.nodes, [id]: next })) }
}

/** Take nodes off the sheet. An arrow aimed at one lets go and stays where it was drawn. */
export function removeNodes(doc: SquigDocument, ids: readonly string[]): SquigDocument {
  const gone = new Set(ids)
  const map = { ...doc.nodes }
  for (const id of gone) delete map[id]
  return {
    ...doc,
    nodes: settleBinds(pruneDegenerateGroups(map)),
    order: doc.order.filter((id) => !gone.has(id)),
  }
}

/**
 * Group nodes, the way ⌘G does: the members collapse together at the topmost
 * one's z-position so nothing can sit inside the group's range and look like
 * it belongs. Locked layers are left out. Null when there is nothing to group
 * — fewer than two things, or one group that is already whole.
 */
export function groupNodes(
  doc: SquigDocument,
  ids: readonly string[],
  groupId: string = newId()
): { doc: SquigDocument; groupId: string } | null {
  const stamped = stampGroup(doc, ids, groupId)
  return stamped && { doc: { ...stamped, nodes: pruneDegenerateGroups(stamped.nodes) }, groupId }
}

/**
 * The stamping half of groupNodes, with the document's other groups left
 * exactly as they are. A caller applying a batch of its own uses this and
 * prunes once at the end, so grouping two things can't dissolve a group it
 * is still in the middle of rebuilding.
 */
export function stampGroup(doc: SquigDocument, ids: readonly string[], groupId: string): SquigDocument | null {
  // a locked layer is never in a selection, so ⌘G never sees one; here the
  // ids come straight from a caller, and the plan below would leave it out
  // while the stamping would still reach it
  const members = doc.order.filter((id) => ids.includes(id) && doc.nodes[id] && !doc.nodes[id].locked)
  const paths = planGroupPaths(members, doc.nodes, doc.order, groupId)
  if (!paths) return null
  const map = { ...doc.nodes }
  for (const id of members) map[id] = { ...map[id], groupIds: paths.get(id) } as SquigNode
  const top = doc.order.lastIndexOf(members[members.length - 1])
  const before = doc.order.slice(0, top + 1).filter((id) => !members.includes(id))
  const after = doc.order.slice(top + 1).filter((id) => !members.includes(id))
  return { ...doc, nodes: map, order: [...before, ...members, ...after] }
}

export function bringToFront(doc: SquigDocument, ids: readonly string[]): SquigDocument {
  const picked = new Set(ids)
  return { ...doc, order: [...doc.order.filter((id) => !picked.has(id)), ...doc.order.filter((id) => picked.has(id))] }
}

export function sendToBack(doc: SquigDocument, ids: readonly string[]): SquigDocument {
  const picked = new Set(ids)
  return { ...doc, order: [...doc.order.filter((id) => picked.has(id)), ...doc.order.filter((id) => !picked.has(id))] }
}

// -- saying what's on the sheet ---------------------------------------------

const whole = (v: number) => String(Math.round(v))

function clip(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > 40 ? flat.slice(0, 39) + "…" : flat
}

/**
 * One node as four columns: its id, what it is, its box, and what it says.
 * The CLI's `ls`, the MCP server's read_document and anything else that has to
 * name a node in a line of text print this, so an agent reading one door's
 * answer can use the words at another.
 */
export function nodeRow(n: SquigNode): [id: string, what: string, box: string, label: string] {
  let label = ""
  if (n.type === "text") label = clip(n.text)
  else if (n.type === "component") {
    const said = [n.props.label, n.props.title].find((v) => typeof v === "string" && v)
    label = typeof said === "string" ? clip(said) : ""
  } else if (n.type === "arrow") {
    const end = (i: 0 | 1) => n.bind?.[i] ?? `${whole(n.x + n.points[i][0])},${whole(n.y + n.points[i][1])}`
    label = `${end(0)} → ${end(1)}`
  }
  return [n.id, n.type === "component" ? n.kind : n.type, `${whole(n.x)} ${whole(n.y)} ${whole(n.w)} ${whole(n.h)}`, label]
}

/** nodeRow on one line, two spaces between columns. */
export function nodeLine(n: SquigNode): string {
  return nodeRow(n).filter(Boolean).join("  ")
}

// -- the catalog, for a caller that can't read TypeScript --------------------

export interface ComponentSummary {
  kind: string
  name: string
  category: Category
  group?: string
  size: { w: number; h: number }
}

export interface ComponentInfo extends ComponentSummary {
  keywords: string[]
  defaults: Props
  controls: ControlDef[]
}

/** The library, one line each — the index an agent scans before it asks for details. */
export function listComponents(query = ""): ComponentSummary[] {
  const q = query.trim().toLowerCase()
  return ALL_DEFS.filter((d) => matches(d, q)).map(({ kind, name, category, group, size }) => ({
    kind,
    name,
    category,
    ...(group ? { group } : {}),
    size,
  }))
}

/** Everything a caller needs to place one component and set its props. */
export function describeComponent(kind: string): ComponentInfo | null {
  const d = getDef(kind)
  if (!d) return null
  return {
    kind: d.kind,
    name: d.name,
    category: d.category,
    ...(d.group ? { group: d.group } : {}),
    size: d.size,
    keywords: d.keywords ?? [],
    defaults: d.defaults,
    controls: d.controls,
  }
}
