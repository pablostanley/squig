"use client"

import { create } from "zustand"
import { nanoid } from "nanoid"
import type { SquigNode, Tool, Viewport, ShapeKind } from "./types"
import { screenToWorld } from "./types"
import { getDef } from "./library/registry"
import { applyTheme, DEFAULT_FONT, DEFAULT_THEME, type FontMode, type ThemeName } from "./theme"

// ---------------------------------------------------------------------------
// Store — flat node map + z-order, selection, viewport, tool, history.
// ---------------------------------------------------------------------------

interface DocSnapshot {
  nodes: Record<string, SquigNode>
  order: string[]
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
  /** the floating file name is in its editable state */
  renamingFile: boolean

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
  setRenamingFile: (on: boolean) => void

  /** snapshot current doc onto the undo stack (call once at gesture start) */
  checkpoint: () => void
  addNode: (node: Omit<SquigNode, "id" | "seed"> & Partial<Pick<SquigNode, "id" | "seed">>, opts?: { select?: boolean; checkpoint?: boolean }) => string
  addNodes: (nodes: SquigNode[], opts?: { select?: boolean }) => void
  updateNode: (id: string, patch: Partial<SquigNode>) => void
  updateNodes: (patches: Record<string, Partial<SquigNode>>) => void
  removeNodes: (ids: string[]) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  bringToFront: (ids: string[]) => void
  sendToBack: (ids: string[]) => void
  undo: () => void
  redo: () => void
  hydrate: () => void
  clearCanvas: () => void

  /** drop a library item at the middle of what the user is looking at */
  insertComponent: (kind: string) => void
  alignSelected: (edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void
  newFile: () => void
  serialize: () => string
  loadDoc: (json: string) => boolean
}

const STORAGE_KEY = "squig:doc:v1"
const MAX_HISTORY = 100

function snapshot(s: Pick<SquigState, "nodes" | "order">): DocSnapshot {
  return structuredClone({ nodes: s.nodes, order: s.order })
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
  renamingFile: false,
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
  setSelection: (ids) => set({ selection: ids }),
  setCommandOpen: (open) => set({ commandOpen: open, contextMenu: null, panel: open ? null : get().panel }),
  setContextMenu: (m) => set({ contextMenu: m }),
  setRenamingFile: (on) => set({ renamingFile: on }),

  checkpoint: () => {
    set((s) => ({ past: [...s.past.slice(-MAX_HISTORY + 1), snapshot(s)], future: [] }))
  },

  addNode: (node, opts = {}) => {
    const id = node.id ?? nanoid(8)
    const seed = node.seed ?? Math.floor(Math.random() * 2 ** 31)
    if (opts.checkpoint !== false) get().checkpoint()
    set((s) => ({
      nodes: { ...s.nodes, [id]: { ...node, id, seed } as SquigNode },
      order: [...s.order, id],
      selection: opts.select !== false ? [id] : s.selection,
    }))
    scheduleSave(get)
    return id
  },

  addNodes: (nodes, opts = {}) => {
    get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      const ids: string[] = []
      for (const n of nodes) {
        map[n.id] = n
        ids.push(n.id)
      }
      return {
        nodes: map,
        order: [...s.order, ...ids],
        selection: opts.select !== false ? ids : s.selection,
      }
    })
    scheduleSave(get)
  },

  updateNode: (id, patch) => {
    set((s) => {
      const cur = s.nodes[id]
      if (!cur) return s
      return { nodes: { ...s.nodes, [id]: { ...cur, ...patch } as SquigNode } }
    })
    scheduleSave(get)
  },

  updateNodes: (patches) => {
    set((s) => {
      const map = { ...s.nodes }
      for (const [id, patch] of Object.entries(patches)) {
        const cur = map[id]
        if (cur) map[id] = { ...cur, ...patch } as SquigNode
      }
      return { nodes: map }
    })
    scheduleSave(get)
  },

  removeNodes: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      for (const id of ids) delete map[id]
      return {
        nodes: map,
        order: s.order.filter((i) => !ids.includes(i)),
        selection: s.selection.filter((i) => !ids.includes(i)),
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
    set((s) => ({
      nodes: { ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) },
      order: [...s.order, ...clones.map((c) => c.id)],
      selection: clones.map((c) => c.id),
    }))
    scheduleSave(get)
  },

  bringToFront: (ids) => {
    set((s) => ({ order: [...s.order.filter((i) => !ids.includes(i)), ...s.order.filter((i) => ids.includes(i))] }))
    scheduleSave(get)
  },
  sendToBack: (ids) => {
    set((s) => ({ order: [...s.order.filter((i) => ids.includes(i)), ...s.order.filter((i) => !ids.includes(i))] }))
    scheduleSave(get)
  },

  undo: () => {
    const { past } = get()
    if (!past.length) return
    set((s) => {
      const prev = s.past[s.past.length - 1]
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, snapshot(s)],
        nodes: prev.nodes,
        order: prev.order,
        selection: s.selection.filter((id) => prev.nodes[id]),
      }
    })
    scheduleSave(get)
  },

  redo: () => {
    const { future } = get()
    if (!future.length) return
    set((s) => {
      const next = s.future[s.future.length - 1]
      return {
        future: s.future.slice(0, -1),
        past: [...s.past, snapshot(s)],
        nodes: next.nodes,
        order: next.order,
        selection: s.selection.filter((id) => next.nodes[id]),
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
        set({
          fileName: doc.fileName ?? "untitled scribbles",
          nodes: doc.nodes ?? {},
          order: doc.order ?? [],
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
    set({ nodes: {}, order: [], selection: [] })
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

  newFile: () => {
    set({
      fileName: "untitled scribbles",
      nodes: {},
      order: [],
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      renamingFile: false,
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
      set({
        fileName: typeof doc.fileName === "string" ? doc.fileName : "imported scribbles",
        nodes: doc.nodes,
        order: doc.order,
        selection: [],
        renamingFile: false,
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
