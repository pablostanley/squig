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

export interface ShapeNode extends BaseNode {
  type: "shape"
  shape: ShapeKind
  fill: boolean
}

export interface DrawNode extends BaseNode {
  type: "draw"
  /** freehand points, relative to node origin (0..w, 0..h) */
  points: [number, number][]
}

export interface TextNode extends BaseNode {
  type: "text"
  text: string
  fontSize: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** where this text points — wireframe metadata, drawn as an underline */
  link?: string
}

export interface ArrowNode extends BaseNode {
  type: "arrow"
  /** [start, end] relative to node origin — components of w/h so they scale on resize */
  points: [[number, number], [number, number]]
  head: boolean
}

export type SquigNode = ComponentNode | ShapeNode | DrawNode | TextNode | ArrowNode

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
