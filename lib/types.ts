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
 * Pen pressure for a drawn line. One pen, pressed harder or softer — squig has
 * no second stroke colour, so weight is the whole outline vocabulary.
 */
export type StrokeWeight = "light" | "regular" | "heavy"

/** Outline settings shared by every hand-drawn node. */
export interface Outlined {
  stroke?: StrokeWeight
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
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** where this text points — wireframe metadata, drawn as an underline */
  link?: string
}

export interface ArrowNode extends BaseNode, Outlined {
  type: "arrow"
  /** [start, end] relative to node origin — components of w/h so they scale on resize */
  points: [[number, number], [number, number]]
  head: boolean
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
