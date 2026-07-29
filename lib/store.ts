"use client"

import { create } from "zustand"
import { nanoid } from "nanoid"
import type { SquigNode, Tool, Viewport, ShapeKind, ComponentNode } from "./types"
import { screenToWorld } from "./types"
import { getDef } from "./library/registry"
import { applyTheme, DEFAULT_FONT, DEFAULT_THEME, type FontMode, type ThemeName } from "./theme"

// ---------------------------------------------------------------------------
// Store — flat node map + z-order, selection, viewport, tool, history.
// ---------------------------------------------------------------------------

interface DocSnapshot {
  nodes: Record<string, SquigNode>
  order: string[]
  /** selection before the edit — what undo puts you back to */
  selection: string[]
  /** selection the edit ended with — what redo puts you back to */
  selAfter?: string[]
  /** the redo stack this checkpoint displaced, so a cancel can hand it back */
  displacedFuture?: DocSnapshot[]
}

export type PanelKind = "components" | "blocks" | null

export interface ContextMenuState {
  x: number
  y: number
  /** node the menu was opened on, or null for the canvas itself */
  nodeId: string | null
}

interface SquigState {
  fileName: string
  nodes: Record<string, SquigNode>
  order: string[]
  selection: string[]
  viewport: Viewport
  tool: Tool
  shapeKind: ShapeKind
  panel: PanelKind
  /** component kind waiting to be placed on next canvas click */
  placing: string | null
  editingId: string | null
  contextRow: boolean
  theme: ThemeName
  font: FontMode
  hydrated: boolean
  commandOpen: boolean
  contextMenu: ContextMenuState | null
  /** in-app clipboard — deterministic, and no permission prompts */
  clipboard: SquigNode[]
  /** how many times the current clipboard has been pasted, for cascade offset */
  pasteStep: number

  past: DocSnapshot[]
  future: DocSnapshot[]

  setFileName: (n: string) => void
  setTool: (t: Tool) => void
  setShapeKind: (s: ShapeKind) => void
  setPanel: (p: PanelKind) => void
  setPlacing: (kind: string | null) => void
  setEditing: (id: string | null) => void
  setContextRow: (on: boolean) => void
  setTheme: (t: ThemeName) => void
  setFont: (f: FontMode) => void
  setViewport: (v: Viewport) => void
  setSelection: (ids: string[]) => void
  setCommandOpen: (open: boolean) => void
  setContextMenu: (m: ContextMenuState | null) => void

  /** snapshot current doc onto the undo stack (call once at gesture start) */
  checkpoint: () => void
  /** discard the last checkpoint and restore it — cancels an in-flight gesture */
  revertToCheckpoint: () => void
  addNode: (node: Omit<SquigNode, "id" | "seed"> & Partial<Pick<SquigNode, "id" | "seed">>, opts?: { select?: boolean; checkpoint?: boolean }) => string
  addNodes: (nodes: SquigNode[], opts?: { select?: boolean; checkpoint?: boolean }) => void
  updateNode: (id: string, patch: Partial<SquigNode>, opts?: { checkpoint?: boolean }) => void
  updateNodes: (patches: Record<string, Partial<SquigNode>>, opts?: { checkpoint?: boolean }) => void
  removeNodes: (ids: string[], opts?: { checkpoint?: boolean }) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  /** clone the selection in place and select the clones — the alt-drag primitive */
  cloneSelectionInPlace: () => string[]
  /** swap a set of nodes for another set in one step, keeping z-order slots */
  replaceNodes: (spec: { remove: string[]; insert: Record<string, SquigNode[]>; select?: string[] }) => void
  bringToFront: (ids: string[]) => void
  sendToBack: (ids: string[]) => void
  undo: () => void
  redo: () => void
  hydrate: () => void
  clearCanvas: () => void

  /** drop a library item at the middle of what the user is looking at */
  insertComponent: (kind: string) => void
  alignSelected: (edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void
  distributeSelected: (axis: "h" | "v") => void

  copySelection: () => void
  cutSelection: () => void
  /** paste; `at` is a world point the pasted bbox is centred on */
  paste: (at?: [number, number]) => void

  selectAll: () => void
  selectNone: () => void
  invertSelection: () => void
  /** grow the selection to every node of the same component kind / node type */
  selectSameKind: () => void
  /** step selection through z-order — Tab / Shift+Tab */
  cycleSelection: (dir: 1 | -1) => void
  /** frame the given ids (or everything) in the viewport */
  zoomTo: (ids?: string[]) => void

  newFile: () => void
  serialize: () => string
  loadDoc: (json: string) => boolean
}

const STORAGE_KEY = "squig:doc:v1"
const MAX_HISTORY = 100

const FINITE_KEYS = ["x", "y", "w", "h"] as const

/**
 * Drop anything that would put a NaN on the canvas. One non-finite coordinate
 * makes the selection box collapse and gets written straight back to
 * localStorage, so a single bad node can wedge the document across reloads.
 */
function sanitize(
  nodes: Record<string, SquigNode> | undefined,
  order: string[] | undefined
): { nodes: Record<string, SquigNode>; order: string[] } {
  const clean: Record<string, SquigNode> = {}
  for (const [id, n] of Object.entries(nodes ?? {})) {
    if (!n || typeof n !== "object") continue
    if (FINITE_KEYS.some((k) => !Number.isFinite((n as SquigNode)[k]))) continue
    clean[id] = { ...n, w: Math.max(0, n.w), h: Math.max(0, n.h) }
  }
  const seen = new Set<string>()
  const ord = (order ?? []).filter((id) => {
    if (!clean[id] || seen.has(id)) return false
    seen.add(id)
    return true
  })
  // anything present but unordered still deserves to be drawn
  for (const id of Object.keys(clean)) if (!seen.has(id)) ord.push(id)
  return { nodes: clean, order: ord }
}

function snapshot(s: Pick<SquigState, "nodes" | "order" | "selection">): DocSnapshot {
  return structuredClone({ nodes: s.nodes, order: s.order, selection: s.selection })
}

/**
 * Record what the selection looks like now on the checkpoint the current edit
 * is writing against. Called after every mutation, so the last write wins and
 * the entry ends up describing the finished operation — which is what redo
 * should restore. Selection changes made *later*, with no edit between them,
 * don't touch it.
 */
function stampSelAfter(past: DocSnapshot[], selection: string[]): void {
  const top = past[past.length - 1]
  if (top) top.selAfter = [...selection]
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(get: () => SquigState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { fileName, nodes, order, contextRow, theme, font } = get()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fileName, nodes, order, contextRow, theme, font }))
    } catch {
      // storage full or unavailable — squig shrugs
    }
  }, 400)
}

export const useSquig = create<SquigState>((set, get) => ({
  fileName: "untitled scribbles",
  nodes: {},
  order: [],
  selection: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  tool: "select",
  shapeKind: "rect",
  panel: null,
  placing: null,
  editingId: null,
  contextRow: false,
  theme: DEFAULT_THEME,
  font: DEFAULT_FONT,
  hydrated: false,
  commandOpen: false,
  contextMenu: null,
  clipboard: [],
  pasteStep: 0,
  past: [],
  future: [],

  setFileName: (n) => {
    set({ fileName: n })
    scheduleSave(get)
  },
  setTool: (t) => set({ tool: t, placing: null, panel: null }),
  setShapeKind: (s) => set({ shapeKind: s }),
  setPanel: (p) => set((st) => ({ panel: st.panel === p ? null : p, placing: null })),
  setPlacing: (kind) => set({ placing: kind }),
  setEditing: (id) => set({ editingId: id }),
  setContextRow: (on) => {
    set({ contextRow: on })
    scheduleSave(get)
  },
  setTheme: (t) => {
    set({ theme: t })
    applyTheme(t, get().font)
    scheduleSave(get)
  },
  setFont: (f) => {
    set({ font: f })
    applyTheme(get().theme, f)
    scheduleSave(get)
  },
  setViewport: (v) => set({ viewport: v }),
  // a selection is a set, so store it in one canonical order: document order.
  // everything downstream (clipboard, duplicate, align, the type summary) then
  // behaves the same whether it was built by marquee, shift-click or ⌘A
  setSelection: (ids) => {
    set((s) => {
      const want = new Set(ids)
      const next = s.order.filter((id) => want.has(id))
      // bail out when nothing actually changed, so the canvas doesn't re-render
      // on every pointermove of a marquee that isn't crossing anything new
      if (next.length === s.selection.length && next.every((id, i) => s.selection[i] === id)) return s
      return { selection: next }
    })
  },
  setCommandOpen: (open) => set({ commandOpen: open, contextMenu: null, panel: open ? null : get().panel }),
  setContextMenu: (m) => set({ contextMenu: m }),

  checkpoint: () => {
    set((s) => {
      const kept = s.past.slice(-MAX_HISTORY + 1)
      // only the newest checkpoint can ever be reverted — once an edit lands on
      // top of one, its stashed redo branch is unreachable, and holding onto it
      // would let history retain far more clones than MAX_HISTORY implies
      const top = kept[kept.length - 1]
      if (top?.displacedFuture) kept[kept.length - 1] = { ...top, displacedFuture: undefined }
      return { past: [...kept, { ...snapshot(s), displacedFuture: s.future }], future: [] }
    })
  },

  /**
   * Roll back to the most recent checkpoint and forget it ever happened.
   * This is Escape-cancels-the-drag: unlike undo it leaves the redo stack
   * alone, because a cancelled gesture is not something you redo.
   */
  revertToCheckpoint: () => {
    const { past } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({
      nodes: prev.nodes,
      order: prev.order,
      selection: prev.selection.filter((id) => prev.nodes[id]),
      past: past.slice(0, -1),
      // the checkpoint wiped `future` on the way in; a cancelled gesture left
      // the document untouched, so redo has to survive it
      future: prev.displacedFuture ?? get().future,
    })
    scheduleSave(get)
  },

  addNode: (node, opts = {}) => {
    const id = node.id ?? nanoid(8)
    const seed = node.seed ?? Math.floor(Math.random() * 2 ** 31)
    if (opts.checkpoint !== false) get().checkpoint()
    set((s) => {
      const selection = opts.select !== false ? [id] : s.selection
      stampSelAfter(s.past, selection)
      return { nodes: { ...s.nodes, [id]: { ...node, id, seed } as SquigNode }, order: [...s.order, id], selection }
    })
    scheduleSave(get)
    return id
  },

  addNodes: (nodes, opts = {}) => {
    if (opts.checkpoint !== false) get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      const ids: string[] = []
      for (const n of nodes) {
        map[n.id] = n
        ids.push(n.id)
      }
      const selection = opts.select !== false ? ids : s.selection
      stampSelAfter(s.past, selection)
      return { nodes: map, order: [...s.order, ...ids], selection }
    })
    scheduleSave(get)
  },

  updateNode: (id, patch, opts) => {
    if (opts?.checkpoint) get().checkpoint()
    set((s) => {
      const cur = s.nodes[id]
      if (!cur) return s
      stampSelAfter(s.past, s.selection)
      return { nodes: { ...s.nodes, [id]: { ...cur, ...patch } as SquigNode } }
    })
    scheduleSave(get)
  },

  updateNodes: (patches, opts) => {
    if (opts?.checkpoint) get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      for (const [id, patch] of Object.entries(patches)) {
        const cur = map[id]
        if (cur) map[id] = { ...cur, ...patch } as SquigNode
      }
      stampSelAfter(s.past, s.selection)
      return { nodes: map }
    })
    scheduleSave(get)
  },

  removeNodes: (ids, opts) => {
    if (!ids.length) return
    if (opts?.checkpoint !== false) get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      for (const id of ids) delete map[id]
      stampSelAfter(s.past, s.selection.filter((i) => !ids.includes(i)))
      return {
        nodes: map,
        order: s.order.filter((i) => !ids.includes(i)),
        selection: s.selection.filter((i) => !ids.includes(i)),
        // editing a node that just went away would wedge the canvas: the
        // overlay renders nothing but pointer events keep deferring to it
        editingId: s.editingId && ids.includes(s.editingId) ? null : s.editingId,
      }
    })
    scheduleSave(get)
  },

  deleteSelected: () => get().removeNodes(get().selection),

  duplicateSelected: () => {
    const { selection, nodes } = get()
    if (!selection.length) return
    get().checkpoint()
    const clones: SquigNode[] = []
    for (const id of selection) {
      const n = nodes[id]
      if (!n) continue
      clones.push({
        ...structuredClone(n),
        id: nanoid(8),
        x: n.x + 16,
        y: n.y + 16,
        seed: Math.floor(Math.random() * 2 ** 31),
      })
    }
    set((s) => {
      const selection = clones.map((c) => c.id)
      stampSelAfter(s.past, selection)
      return {
        nodes: { ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) },
        order: [...s.order, ...selection],
        selection,
      }
    })
    scheduleSave(get)
  },

  cloneSelectionInPlace: () => {
    const { selection, nodes } = get()
    const clones: SquigNode[] = []
    // keep document order so the copies stack the way the originals did
    for (const id of get().order) {
      if (!selection.includes(id)) continue
      const n = nodes[id]
      if (!n) continue
      clones.push({ ...structuredClone(n), id: nanoid(8), seed: Math.floor(Math.random() * 2 ** 31) })
    }
    if (!clones.length) return []
    const ids = clones.map((c) => c.id)
    set((s) => ({
      nodes: { ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) },
      order: [...s.order, ...ids],
      selection: ids,
    }))
    scheduleSave(get)
    return ids
  },

  replaceNodes: ({ remove, insert, select }) => {
    const s = get()
    const gone = new Set(remove)
    const nodes = { ...s.nodes }
    const order: string[] = []
    const produced: string[] = []

    for (const id of s.order) {
      const parts = insert[id]
      if (parts) {
        // splice the replacements into the slot the original occupied, so a
        // broken-apart block doesn't leap in front of whatever covered it
        delete nodes[id]
        for (const part of parts) {
          nodes[part.id] = part
          order.push(part.id)
          produced.push(part.id)
        }
        continue
      }
      if (gone.has(id)) {
        delete nodes[id]
        continue
      }
      order.push(id)
    }

    get().checkpoint()
    const wanted = new Set(select ?? produced)
    set((st) => {
      const selection = order.filter((id) => wanted.has(id))
      stampSelAfter(st.past, selection)
      return { nodes, order, selection, editingId: null }
    })
    scheduleSave(get)
  },

  bringToFront: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => {
      stampSelAfter(s.past, s.selection)
      return { order: [...s.order.filter((i) => !ids.includes(i)), ...s.order.filter((i) => ids.includes(i))] }
    })
    scheduleSave(get)
  },
  sendToBack: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => {
      stampSelAfter(s.past, s.selection)
      return { order: [...s.order.filter((i) => ids.includes(i)), ...s.order.filter((i) => !ids.includes(i))] }
    })
    scheduleSave(get)
  },

  undo: () => {
    const { past } = get()
    if (!past.length) return
    set((s) => {
      const prev = s.past[s.past.length - 1]
      // the redo entry remembers what the undone edit had produced, not
      // whatever happens to be selected at the moment ⌘Z was pressed
      const forward: DocSnapshot = { ...snapshot(s), selAfter: prev.selAfter ?? s.selection }
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, forward],
        nodes: prev.nodes,
        order: prev.order,
        selection: prev.selection.filter((id) => prev.nodes[id]),
        editingId: null,
      }
    })
    scheduleSave(get)
  },

  redo: () => {
    const { future } = get()
    if (!future.length) return
    set((s) => {
      const next = s.future[s.future.length - 1]
      const restored = (next.selAfter ?? next.selection).filter((id) => next.nodes[id])
      return {
        future: s.future.slice(0, -1),
        past: [...s.past, { ...snapshot(s), selAfter: restored }],
        nodes: next.nodes,
        order: next.order,
        selection: next.order.filter((id) => restored.includes(id)),
        editingId: null,
      }
    })
    scheduleSave(get)
  },

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const doc = JSON.parse(raw)
        const theme: ThemeName = doc.theme ?? DEFAULT_THEME
        const font: FontMode = doc.font ?? DEFAULT_FONT
        const clean = sanitize(doc.nodes, doc.order)
        set({
          fileName: doc.fileName ?? "untitled scribbles",
          nodes: clean.nodes,
          order: clean.order,
          contextRow: doc.contextRow ?? false,
          theme,
          font,
          hydrated: true,
        })
        applyTheme(theme, font)
        return
      }
    } catch {
      // corrupted doc — start fresh
    }
    applyTheme(get().theme, get().font)
    set({ hydrated: true })
  },

  clearCanvas: () => {
    get().checkpoint()
    set({ nodes: {}, order: [], selection: [], editingId: null })
    scheduleSave(get)
  },

  insertComponent: (kind) => {
    const def = getDef(kind)
    if (!def) return
    const v = get().viewport
    const [cx, cy] = screenToWorld(v, window.innerWidth / 2, window.innerHeight / 2)
    get().addNode({
      type: "component",
      kind: def.kind,
      props: { ...def.defaults },
      x: Math.round(cx - def.size.w / 2),
      y: Math.round(cy - def.size.h / 2),
      w: def.size.w,
      h: def.size.h,
    } as Omit<SquigNode, "id" | "seed">)
  },

  alignSelected: (edge) => {
    const { selection, nodes } = get()
    if (selection.length < 2) return
    const sel = selection.map((id) => nodes[id]).filter(Boolean)
    if (sel.length < 2) return
    get().checkpoint()
    const minX = Math.min(...sel.map((n) => n.x))
    const maxX = Math.max(...sel.map((n) => n.x + n.w))
    const minY = Math.min(...sel.map((n) => n.y))
    const maxY = Math.max(...sel.map((n) => n.y + n.h))
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of sel) {
      switch (edge) {
        case "left": patches[n.id] = { x: minX }; break
        case "right": patches[n.id] = { x: maxX - n.w }; break
        case "hcenter": patches[n.id] = { x: (minX + maxX) / 2 - n.w / 2 }; break
        case "top": patches[n.id] = { y: minY }; break
        case "bottom": patches[n.id] = { y: maxY - n.h }; break
        case "vcenter": patches[n.id] = { y: (minY + maxY) / 2 - n.h / 2 }; break
      }
    }
    get().updateNodes(patches)
  },

  distributeSelected: (axis) => {
    const { selection, nodes } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    // fewer than three and there is no gap to even out
    if (sel.length < 3) return
    const size = (n: SquigNode) => (axis === "h" ? n.w : n.h)
    const pos = (n: SquigNode) => (axis === "h" ? n.x : n.y)
    const rank = new Map(get().order.map((id, i) => [id, i]))
    // ties resolve by z-order so the result doesn't depend on click sequence
    const sorted = [...sel].sort((a, b) => pos(a) - pos(b) || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    const start = Math.min(...sorted.map(pos))
    // the widest node may start early and still end last, so take the real
    // maximum trailing edge rather than the last one in leading-edge order
    const end = Math.max(...sorted.map((n) => pos(n) + size(n)))
    const used = sorted.reduce((sum, n) => sum + size(n), 0)
    const gap = (end - start - used) / (sorted.length - 1)
    get().checkpoint()
    const patches: Record<string, Partial<SquigNode>> = {}
    let cursor = start
    for (const n of sorted) {
      patches[n.id] = axis === "h" ? { x: cursor } : { y: cursor }
      cursor += size(n) + gap
    }
    get().updateNodes(patches)
  },

  // -- clipboard ------------------------------------------------------------

  copySelection: () => {
    const { selection, nodes, order } = get()
    const copied = order.filter((id) => selection.includes(id)).map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!copied.length) return
    set({ clipboard: structuredClone(copied), pasteStep: 0 })
  },

  cutSelection: () => {
    get().copySelection()
    if (get().clipboard.length) get().deleteSelected()
  },

  paste: (at) => {
    const { clipboard, viewport } = get()
    if (!clipboard.length) return

    const minX = Math.min(...clipboard.map((n) => n.x))
    const minY = Math.min(...clipboard.map((n) => n.y))
    const maxX = Math.max(...clipboard.map((n) => n.x + n.w))
    const maxY = Math.max(...clipboard.map((n) => n.y + n.h))

    let dx: number
    let dy: number

    if (at) {
      // "paste here" — centre the copied cluster on the cursor, and restart
      // the cascade so the next plain ⌘V steps from this spot
      set({ pasteStep: 0 })
      dx = at[0] - (minX + maxX) / 2
      dy = at[1] - (minY + maxY) / 2
    } else {
      const [vx1, vy1] = screenToWorld(viewport, 0, 0)
      const [vx2, vy2] = screenToWorld(viewport, window.innerWidth, window.innerHeight)
      const onScreen = minX < vx2 && maxX > vx1 && minY < vy2 && maxY > vy1
      // the clipboard never moves, so the cascade has to come from a counter —
      // without it, repeated pastes of an off-screen source land on the exact
      // same spot and look like one paste
      const step = get().pasteStep + 1
      set({ pasteStep: step })
      if (onScreen) {
        dx = 16 * step
        dy = 16 * step
      } else {
        // the source is off-screen — put the first paste where the user is
        // looking, and step subsequent ones off it
        dx = (vx1 + vx2) / 2 - (minX + maxX) / 2 + 16 * (step - 1)
        dy = (vy1 + vy2) / 2 - (minY + maxY) / 2 + 16 * (step - 1)
      }
    }

    const fresh = clipboard.map((n) => ({
      ...structuredClone(n),
      id: nanoid(8),
      seed: Math.floor(Math.random() * 2 ** 31),
      x: n.x + dx,
      y: n.y + dy,
    })) as SquigNode[]

    get().addNodes(fresh)
  },

  // -- selection ------------------------------------------------------------

  selectAll: () => set((s) => ({ selection: [...s.order] })),
  selectNone: () => set({ selection: [] }),

  invertSelection: () => {
    set((s) => ({ selection: s.order.filter((id) => !s.selection.includes(id)) }))
  },

  selectSameKind: () => {
    const { selection, nodes, order } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!sel.length) return
    // a component matches on its library kind; anything else on node type
    const kinds = new Set(sel.filter((n) => n.type === "component").map((n) => (n as ComponentNode).kind))
    const types = new Set(sel.filter((n) => n.type !== "component").map((n) => n.type))
    const next = order.filter((id) => {
      const n = nodes[id]
      if (!n) return false
      return n.type === "component" ? kinds.has(n.kind) : types.has(n.type)
    })
    set({ selection: next })
  },

  cycleSelection: (dir) => {
    const { order, selection } = get()
    if (!order.length) return
    if (!selection.length) {
      set({ selection: [dir === 1 ? order[0] : order[order.length - 1]] })
      return
    }
    // step from the frontmost member so repeated Tabs march in one direction
    const anchor = selection[selection.length - 1]
    const i = order.indexOf(anchor)
    const next = order[(((i === -1 ? 0 : i) + dir) % order.length + order.length) % order.length]
    set({ selection: [next] })
  },

  zoomTo: (ids) => {
    const { nodes, order } = get()
    const list = (ids?.length ? ids : order).map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!list.length) return
    const minX = Math.min(...list.map((n) => n.x))
    const minY = Math.min(...list.map((n) => n.y))
    const maxX = Math.max(...list.map((n) => n.x + n.w))
    const maxY = Math.max(...list.map((n) => n.y + n.h))
    const pad = 80
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)
    const zoom = Math.min(4, Math.max(0.1, Math.min((vw - pad * 2) / w, (vh - pad * 2) / h)))
    set({
      viewport: {
        zoom,
        x: vw / 2 - ((minX + maxX) / 2) * zoom,
        y: vh / 2 - ((minY + maxY) / 2) * zoom,
      },
    })
  },

  newFile: () => {
    set({
      fileName: "untitled scribbles",
      nodes: {},
      order: [],
      selection: [],
      editingId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      past: [],
      future: [],
    })
    scheduleSave(get)
  },

  serialize: () => {
    const { fileName, nodes, order } = get()
    return JSON.stringify({ app: "squig", version: 1, fileName, nodes, order }, null, 2)
  },

  loadDoc: (json) => {
    try {
      const doc = JSON.parse(json)
      if (!doc || typeof doc !== "object" || !doc.nodes || !Array.isArray(doc.order)) return false
      const clean = sanitize(doc.nodes, doc.order)
      set({
        fileName: typeof doc.fileName === "string" ? doc.fileName : "imported scribbles",
        nodes: clean.nodes,
        order: clean.order,
        selection: [],
        editingId: null,
        past: [],
        future: [],
      })
      scheduleSave(get)
      return true
    } catch {
      return false
    }
  },
}))
