// ---------------------------------------------------------------------------
// squig document model — a flat list of nodes on an infinite canvas.
// ---------------------------------------------------------------------------

export type Tool =
  | "select"
  | "shape"
  | "draw"
  | "text"
  | "arrow"

export type ShapeKind = "rect" | "ellipse"

/**
 * Area fill for a hand-drawn shape — the same three-tone ladder the library
 * components print with, plus opaque paper for a box that has to occlude what
 * it sits on. There is no fourth tone on purpose; see lib/theme.ts.
 */
export type FillTone = "none" | "paper" | "light" | "strong"

/**
 * Which step of the ink ladder a node prints in. One ink, three strengths:
 * full ink, the muted secondary, and the faint hairline tone — the same three
 * the theme already mixes for component labels. Absent means full ink, which
 * is what every document written before this existed meant.
 */
export type InkTone = "ink" | "muted" | "faint"

/** Documents come from disk and localStorage — read anything, keep the ladder. */
export function normalizeInk(v: unknown): InkTone {
  return v === "muted" || v === "faint" ? v : "ink"
}

/**
 * Pen pressure for a drawn line. One pen, pressed harder or softer — squig has
 * no second stroke colour, so weight is the whole outline vocabulary.
 */
export type StrokeWeight = "light" | "regular" | "heavy"

/** Outline settings shared by every hand-drawn node. */
export interface Outlined {
  stroke?: StrokeWeight
  /** the tone the line prints in — full ink when absent */
  ink?: InkTone
  dashed?: boolean
}

/**
 * `fill` was a boolean before shapes had a tonal ladder. Old documents live in
 * localStorage and in files people already saved, so read both spellings and
 * write only the new one.
 */
export function normalizeFill(v: unknown): FillTone {
  if (v === true) return "strong"
  if (v === "paper" || v === "light" || v === "strong") return v
  return "none"
}

export interface BaseNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Stable seed so the wobble doesn't re-roll on every render */
  seed: number
  /**
   * Group membership, outermost first. Groups are a stamp on a flat document
   * rather than a tree: dragging, deleting, undo and saving all keep working,
   * and nesting costs one more entry in this array.
   */
  groupIds?: string[]
  /** Mirrored along its own box — see mirrorPrims, which flips layout not glyphs */
  flipX?: boolean
  flipY?: boolean
  /**
   * Held down: the layer still prints and still exports, but the pointer walks
   * straight past it. This is for the background rectangle and the screenshot
   * everything else is drawn on top of — the things you keep grabbing by
   * accident. Absent means loose, like every other flag here.
   *
   * The rule the rest of the app is built on: a locked layer is never in the
   * selection. Getting one back is the right button's job, or Unlock all —
   * see lib/selection for the filter and components/chrome/context-menu.
   */
  locked?: boolean
}

export interface ComponentNode extends BaseNode {
  type: "component"
  /** registry key, e.g. "button", "card", "login" */
  kind: string
  /** variant props — shape depends on kind, controls defined in the registry */
  props: Record<string, unknown>
}

export interface ShapeNode extends BaseNode, Outlined {
  type: "shape"
  shape: ShapeKind
  /** older documents wrote a boolean here — read it through normalizeFill */
  fill: FillTone
}

export interface DrawNode extends BaseNode, Outlined {
  type: "draw"
  /** freehand points, relative to node origin (0..w, 0..h) */
  points: [number, number][]
}

/**
 * No justify — a napkin has no reason to stretch its lines. The three that
 * remain are real: on an auto-sized layer they decide which edge of the box
 * the run is pinned to (what holds still while you type), and on a fixed-width
 * layer they lay the wrapped lines out inside it.
 */
export type TextAlign = "left" | "center" | "right"

export interface TextNode extends BaseNode {
  type: "text"
  text: string
  fontSize: number
  /**
   * A text layer starts life auto-sized: the box hugs the words, a line ends
   * where you pressed Return. Dragging a side handle sets this — from then on
   * `w` is the measure the words wrap to and `h` follows the wrapped line
   * count. Corner handles scale the type either way. Double-clicking a side
   * handle clears it. Absent on every document written before this existed.
   */
  fixedW?: boolean
  /** left when absent — most text is */
  align?: TextAlign
  /** the tone the words print in — full ink when absent */
  ink?: InkTone
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** where this text points — wireframe metadata, drawn as an underline */
  link?: string
}

/** What an arrow's two ends are stuck to — [start, end], null for a free end. */
export type ArrowBind = [string | null, string | null]

/** The five stable places an attached end can occupy on a node. */
export const ARROW_ANCHORS = ["top", "right", "bottom", "left", "center"] as const
export type ArrowAnchor = (typeof ARROW_ANCHORS)[number]
export type ArrowAnchors = [ArrowAnchor | null, ArrowAnchor | null]

export interface ArrowNode extends BaseNode, Outlined {
  type: "arrow"
  /** [start, end] relative to node origin — components of w/h so they scale on resize */
  points: [[number, number], [number, number]]
  head: boolean
  /**
   * Absent on a free-floating arrow, which is how most of them start and how
   * every arrow written before this existed stayed. When it is here, `points`
   * and the box are a *consequence* of it — see lib/canvas/arrow-binding.
   */
  bind?: ArrowBind
  /** The fixed anchor on each bound node. Old bindings acquire these on load. */
  anchors?: ArrowAnchors
  /** False makes this a free line. Absent is the default, auto-snapping state. */
  snap?: false
}

/**
 * A binding we're willing to trust, or undefined for "no bindings at all".
 *
 * Documents arrive from localStorage, from a file, and off the clipboard, so
 * the shape has to be checked rather than assumed. Ids that name nothing are
 * a separate problem and get dropped later, once there's a document to check
 * them against — see settleBinds.
 */
export function normalizeBind(v: unknown): ArrowBind | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const end = (e: unknown) => (typeof e === "string" && e ? e : null)
  const a = end(v[0])
  const b = end(v[1])
  return a || b ? [a, b] : undefined
}

/** Anchors from an imported document, with anchors on free ends discarded. */
export function normalizeArrowAnchors(v: unknown, bind?: ArrowBind): ArrowAnchors | undefined {
  if (!bind || !Array.isArray(v) || v.length !== 2) return undefined
  const anchor = (value: unknown) =>
    typeof value === "string" && (ARROW_ANCHORS as readonly string[]).includes(value)
      ? (value as ArrowAnchor)
      : null
  const a = bind[0] ? anchor(v[0]) : null
  const b = bind[1] ? anchor(v[1]) : null
  return a || b ? [a, b] : undefined
}

/**
 * A picture someone pasted in. The only node that isn't drawn by hand: a
 * screenshot you're wireframing around has to stay legible, so it prints as
 * itself and gets a drawn frame instead — a photo taped to the napkin.
 *
 * The pixels live in the document as a data URL. That keeps a file one
 * self-contained thing you can export and open anywhere, at the cost of
 * needing every paste re-encoded down to a size a browser will hold; see
 * lib/clipboard.ts.
 */
export interface ImageNode extends BaseNode {
  type: "image"
  /** data:image/… — nothing else is ever put here, or ever read back out */
  src: string
  /** the pixels' own size — the ratio the box started life at */
  naturalW: number
  naturalH: number
  /** the file it came from, when the clipboard said */
  name?: string
  /**
   * Which part of the picture the box shows. Absent means all of it, which is
   * how every picture arrives and how most of them stay.
   */
  crop?: ImageCrop
}

/**
 * A crop window in the picture's own coordinates — 0..1 on both axes, never
 * pixels. Normalised is what lets the crop survive everything that happens to
 * the box afterwards: a resize, a scaled selection, a source re-encoded at a
 * different size. The box shows this rectangle of the picture stretched to
 * fill it, which is the same deal an uncropped picture has always had.
 *
 * Nothing is thrown away. The pixels outside the window are still in the
 * document, so re-cropping can hand any of them back.
 */
export interface ImageCrop {
  x: number
  y: number
  w: number
  h: number
}

/** The whole picture — what a node with no `crop` is showing. */
export const FULL_CROP: ImageCrop = { x: 0, y: 0, w: 1, h: 1 }

/** Smallest slice of a picture a crop may narrow to, per axis. */
const MIN_CROP = 0.005

/**
 * A crop we're willing to render, or undefined for "no crop at all".
 *
 * One NaN through here lands in the document, gets autosaved, and takes the
 * picture with it on every reload — the same reason `sanitize` exists in the
 * store. A window that says "all of it" comes back undefined rather than
 * {0,0,1,1}: the absent field is the canonical spelling of an uncropped
 * picture, and two spellings of one state is a bug waiting for a `===`.
 */
export function normalizeCrop(v: unknown): ImageCrop | undefined {
  if (!v || typeof v !== "object") return undefined
  const c = v as ImageCrop
  const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
  if (!fin(c.x) || !fin(c.y) || !fin(c.w) || !fin(c.h)) return undefined
  const w = Math.min(1, Math.max(MIN_CROP, c.w))
  const h = Math.min(1, Math.max(MIN_CROP, c.h))
  const x = Math.min(1 - w, Math.max(0, c.x))
  const y = Math.min(1 - h, Math.max(0, c.y))
  if (x === 0 && y === 0 && w === 1 && h === 1) return undefined
  return { x, y, w, h }
}

/** The window a picture is showing, with the absent-means-all case spelled out. */
export function cropOf(n: ImageNode): ImageCrop {
  return n.crop ?? FULL_CROP
}

export type SquigNode = ComponentNode | ShapeNode | DrawNode | TextNode | ArrowNode | ImageNode

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface SquigDoc {
  fileName: string
  nodes: Record<string, SquigNode>
  order: string[]
}

export function worldToScreen(v: Viewport, wx: number, wy: number): [number, number] {
  return [wx * v.zoom + v.x, wy * v.zoom + v.y]
}

export function screenToWorld(v: Viewport, sx: number, sy: number): [number, number] {
  return [(sx - v.x) / v.zoom, (sy - v.y) / v.zoom]
}

/** The group a click should select — the outermost one the node belongs to. */
export function outerGroup(n: SquigNode | undefined | null): string | null {
  return n?.groupIds?.[0] ?? null
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function unionBox(nodes: SquigNode[]): Box | null {
  if (!nodes.length) return null
  return {
    minX: Math.min(...nodes.map((n) => n.x)),
    minY: Math.min(...nodes.map((n) => n.y)),
    maxX: Math.max(...nodes.map((n) => n.x + n.w)),
    maxY: Math.max(...nodes.map((n) => n.y + n.h)),
  }
}
