"use client"

// ---------------------------------------------------------------------------
// window.squig — the canvas, from the other side of the glass.
//
// This is how an agent driving a real browser works the drawing: Playwright,
// Claude in Chrome, or a person with the devtools console open. Every call
// here goes through the store, which is the whole point — the human watching
// sees it land, ⌘Z takes it back, and it autosaves like their own edits. An
// agent that reached into the node map directly would get all three wrong.
//
// The rules about what a node may be live in lib/doc, not here: this file
// builds the node, hands it to lib/doc to be vouched for, and passes the
// vouched result on to the store. So the message you get for a taken id is
// the same sentence the CLI and the MCP server print. Glue, not logic.
// ---------------------------------------------------------------------------

import {
  addNodes,
  arrowNode,
  componentNode,
  describeComponent,
  docBounds,
  listComponents,
  nodesOf,
  shapeNode,
  textNode,
  updateNode,
  type ArrowOpts,
  type ComponentAt,
  type ComponentInfo,
  type ComponentSummary,
  type ShapeAt,
  type SquigDocument,
  type TextAt,
} from "./doc"
import { resizeSpacedNodes, spaceNodes, tidyNodes, type SpacingOptions, type SpacingAxis } from "./canvas/spacing"
import { renderSvg } from "./sketch/svg"
import { lookOf, useSquig } from "./store"
import type { Box, ShapeKind, SquigNode } from "./types"

export interface SquigAgentApi {
  version: 1
  /** Identify the open canvas before editing an existing browser tab. */
  documentId(): string
  /** the open document as a value — a copy, not the store's objects */
  doc(): SquigDocument
  serialize(): string
  /** replace the canvas with a .squig.json; false when it isn't one */
  load(json: string): boolean
  /** put finished nodes on top of the drawing and select them; returns their ids */
  add(nodes: SquigNode[]): string[]
  addComponent(kind: string, at: ComponentAt): string
  addText(text: string, at: TextAt): string
  addShape(shape: ShapeKind, at: ShapeAt): string
  addArrow(opts: ArrowOpts): string
  update(id: string, patch: Partial<SquigNode>): void
  remove(ids: string[]): void
  /** ⌘G on these; the new group's id, or null when there was nothing to group */
  group(ids: string[]): string | null
  /** z-order: later is drawn on top, so a backdrop goes to the back */
  toFront(ids: string[]): void
  toBack(ids: string[]): void
  resizeSpaced(ids: string[], marked: string[], axis: SpacingAxis, delta: number): void
  tidy(ids: string[], gap?: number): void
  spacing(ids: string[], options: SpacingOptions): void
  select(ids: string[]): void
  selection(): string[]
  zoomToFit(): void
  /** select these and zoom the view to them */
  zoomTo(ids: string[]): void
  bounds(): Box | null
  components(query?: string): ComponentSummary[]
  describe(kind: string): ComponentInfo | null
  /**
   * Standalone SVG of these nodes (default: the whole drawing), no fonts
   * inlined. Synchronous, so it draws with the icon catalogs the canvas has
   * already pulled in — which is every icon on screen.
   */
  svg(ids?: string[]): string
}

declare global {
  interface Window {
    squig?: SquigAgentApi
  }
}

/** The store's document, borrowed — safe to hand to lib/doc, which never mutates. */
function current(): SquigDocument {
  const s = useSquig.getState()
  return { fileName: s.fileName, look: lookOf(s), nodes: s.nodes, order: s.order, variations: s.variations, comments: s.comments }
}

const api: SquigAgentApi = {
  version: 1,
  documentId: () => useSquig.getState().docId,
  resizeSpaced(ids, marked, axis, delta) {
    const s = useSquig.getState()
    s.edit(() => s.updateNodes(resizeSpacedNodes(ids.map((id) => s.nodes[id]).filter(Boolean), marked, axis, delta)))
  },
  tidy(ids, gap) {
    const s = useSquig.getState()
    s.edit(() => s.updateNodes(tidyNodes(ids.map((id) => s.nodes[id]).filter(Boolean), gap)))
  },
  spacing(ids, options) {
    const s = useSquig.getState()
    s.edit(() => s.updateNodes(spaceNodes(ids.map((id) => s.nodes[id]).filter(Boolean), options)))
  },

  doc: () => structuredClone(current()),
  serialize: () => useSquig.getState().serialize(),
  load: (json) => useSquig.getState().loadDoc(json),

  add(nodes) {
    // lib/doc does the arguing; what comes back out of it has settled arrow
    // anchors on it, so the store gets the vouched copy rather than the input
    // cloned on the way in: the store keeps what it is handed, in history
    // too, and a caller that goes on editing its own object must not be
    // editing an undo step
    const before = current()
    const after = addNodes(before, structuredClone(nodes))
    const ids = after.order.slice(before.order.length)
    const store = useSquig.getState()
    store.addNodes(ids.map((id) => after.nodes[id]))
    // the store selects everything it was handed, and a locked layer must
    // never be in the selection or Delete takes the backdrop with it
    const loose = ids.filter((id) => !after.nodes[id].locked)
    if (loose.length !== ids.length) store.setSelection(loose)
    return ids
  },
  addComponent: (kind, at) => api.add([componentNode(kind, at)])[0],
  addText: (text, at) => api.add([textNode(text, at)])[0],
  addShape: (shape, at) => api.add([shapeNode(shape, at)])[0],
  addArrow: (opts) => api.add([arrowNode(opts, useSquig.getState().nodes)])[0],

  update(id, patch) {
    const before = current()
    const after = updateNode(before, id, structuredClone(patch))
    // the change can reach past the node named — a group left with one
    // member dissolves on its partner too — so commit every node that moved
    const changed: Record<string, SquigNode> = {}
    for (const [nid, n] of Object.entries(after.nodes)) if (n !== before.nodes[nid]) changed[nid] = n
    const store = useSquig.getState()
    // updateNodes on its own is the store's mid-drag write and takes no
    // checkpoint; an agent's change is a finished edit, so it gets one
    store.edit(() => {
      store.updateNodes(changed)
      // a locked node leaves the selection, and a group that just dissolved
      // stops being what the selection stands for
      const s = useSquig.getState()
      const loose = s.selection.filter((i) => !after.nodes[i]?.locked)
      const gid = s.selectionGroupId
      const groupAlive = !!gid && loose.some((i) => after.nodes[i]?.groupIds?.includes(gid))
      if (loose.length !== s.selection.length || (gid && !groupAlive)) s.setSelection(loose, groupAlive ? gid : null)
    })
  },
  remove: (ids) => useSquig.getState().removeNodes(ids),

  group(ids) {
    useSquig.getState().setSelection(ids)
    useSquig.getState().groupSelected()
    return useSquig.getState().selectionGroupId
  },

  toFront: (ids) => useSquig.getState().bringToFront(ids),
  toBack: (ids) => useSquig.getState().sendToBack(ids),

  select: (ids) => useSquig.getState().setSelection(ids),
  selection: () => [...useSquig.getState().selection],

  zoomToFit: () => useSquig.getState().zoomToFit(),
  zoomTo(ids) {
    useSquig.getState().setSelection(ids)
    useSquig.getState().zoomToSelection()
  },
  bounds: () => docBounds(current()),

  components: (query) => listComponents(query),
  describe: (kind) => describeComponent(kind),

  svg(ids) {
    const d = current()
    const picked = ids ? new Set(ids) : null
    const list = picked ? d.order.filter((id) => picked.has(id)).map((id) => d.nodes[id]) : nodesOf(d)
    return renderSvg(list, d.look)
  },
}

export function installAgentBridge(): void {
  if (typeof window === "undefined" || window.squig === api) return
  window.squig = api
}
