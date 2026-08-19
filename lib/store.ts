"use client"

import { create } from "zustand"
import { nanoid } from "nanoid"
import type { ComponentNode, ImageNode, SquigNode, TextAlign, TextNode, Tool, Viewport, ShapeKind } from "./types"
import { normalizeCrop, normalizeFill, screenToWorld, unionBox } from "./types"
import { isCropped, uncropPatch } from "./canvas/crop"
import { repeatStep, type DupTrail } from "./canvas/duplicate"
import { getDef } from "./library/registry"
import { breakApart } from "./library/break-apart"
import {
  applyLook,
  DEFAULT_LOOK,
  type FontMode,
  type Look,
  type PaperShade,
  type ThemeName,
} from "./theme"
import {
  INDEX_KEY,
  deleteFile as dropFile,
  knownLook,
  listFiles,
  loadPrefs,
  migrateLegacyDoc,
  readFile,
  saveFile,
  savePrefs,
  type FileMeta,
} from "./files"

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
  /** which file in the drawer this canvas is — every doc has one */
  docId: string
  fileName: string
  /** the drawer, newest first; kept in state so menus re-render as it changes */
  files: FileMeta[]
  /** bumped by an explicit save, so the file name can say so out loud */
  saveFlash: number
  nodes: Record<string, SquigNode>
  order: string[]
  selection: string[]
  viewport: Viewport
  tool: Tool
  shapeKind: ShapeKind
  panel: PanelKind
  /** component kind waiting to be placed on next canvas click */
  placing: string | null
  /** the pending placement came out of a library drag, so it lands on pointer up
   *  rather than on the next click */
  placingDrag: boolean
  editingId: string | null
  /** the picture whose crop window is being dragged — see lib/canvas/crop */
  croppingId: string | null
  contextRow: boolean
  /* --- the look, kept flat so a control can subscribe to just its own knob.
     It belongs to the open document: every setter writes it back to the file,
     and opening another one brings that file's look with it. */
  theme: ThemeName
  font: FontMode
  /** how bright the sheet behind the drawing is */
  paper: PaperShade
  /** the canvas dot grid is drawn */
  grid: boolean
  hydrated: boolean
  commandOpen: boolean
  contextMenu: ContextMenuState | null
  /** the floating file name is in its editable state */
  renamingFile: boolean
  /** a gesture is actively changing a layer's geometry — move, resize, draw, create */
  transforming: boolean
  /** the arrow tool draws a head — L is a plain line, ⇧L an arrow */
  arrowHead: boolean
  /** ⌘\ — everything but the canvas gets out of the way */
  uiHidden: boolean
  shortcutsOpen: boolean
  /** ⌘K over selected text opens the link field instead of the palette */
  linkOpen: boolean
  /** private clipboard — ⌘C/⌘X/⌘V never touch the system one */
  clipboard: SquigNode[]
  /** the last copies made, and where each one started life. ⌘D reads the gap
   *  between the two and repeats it, so an ⌥-drag (or a duplicate you then
   *  moved) becomes a step you can march across the board. */
  dupTrail: DupTrail | null
  /** a one-line flash in the corner; the id makes a repeat of the same words
   *  count as a new message */
  notice: { id: number; text: string } | null

  past: DocSnapshot[]
  future: DocSnapshot[]

  setFileName: (n: string) => void
  setTool: (t: Tool) => void
  setShapeKind: (s: ShapeKind) => void
  setPanel: (p: PanelKind) => void
  setPlacing: (kind: string | null, opts?: { drag?: boolean }) => void
  setEditing: (id: string | null) => void
  /** step into (or out of) a picture's crop window */
  setCropping: (id: string | null) => void
  /** give a picture back every pixel it's hiding */
  resetCrop: (ids?: string[]) => void
  setContextRow: (on: boolean) => void
  setTheme: (t: ThemeName) => void
  setFont: (f: FontMode) => void
  setPaper: (s: PaperShade) => void
  setGrid: (on: boolean) => void
  setViewport: (v: Viewport) => void
  setSelection: (ids: string[]) => void
  setCommandOpen: (open: boolean) => void
  setContextMenu: (m: ContextMenuState | null) => void
  setRenamingFile: (on: boolean) => void
  setTransforming: (on: boolean) => void
  setArrowHead: (on: boolean) => void
  setUiHidden: (on: boolean) => void
  setShortcutsOpen: (on: boolean) => void
  setLinkOpen: (on: boolean) => void
  setNotice: (text: string | null) => void

  /** snapshot current doc onto the undo stack (call once at gesture start) */
  checkpoint: () => void
  addNode: (node: Omit<SquigNode, "id" | "seed"> & Partial<Pick<SquigNode, "id" | "seed">>, opts?: { select?: boolean; checkpoint?: boolean }) => string
  addNodes: (nodes: SquigNode[], opts?: { select?: boolean; checkpoint?: boolean }) => void
  updateNode: (id: string, patch: Partial<SquigNode>, opts?: { checkpoint?: boolean }) => void
  updateNodes: (patches: Record<string, Partial<SquigNode>>, opts?: { checkpoint?: boolean }) => void
  removeNodes: (ids: string[], opts?: { checkpoint?: boolean }) => void
  /** discard the last checkpoint and restore it — cancels an in-flight gesture */
  revertToCheckpoint: () => void
  /** clone the selection in place and select the clones — the alt-drag primitive */
  cloneSelectionInPlace: () => string[]
  /** remember copies and their origins, so ⌘D can repeat the move that followed */
  rememberDuplicate: (ids: string[], from: DupTrail["from"]) => void
  distributeSelected: (axis: "h" | "v") => void
  selectAll: () => void
  selectNone: () => void
  invertSelection: () => void
  /** grow the selection to every node of the same component kind / node type */
  selectSameKind: () => void
  /** step selection through z-order — Tab / Shift+Tab */
  cycleSelection: (dir: 1 | -1) => void
  deleteSelected: () => void
  /** clone the selection and select the clones; returns the new ids */
  duplicateSelected: (offset?: number) => string[]
  bringToFront: (ids: string[]) => void
  sendToBack: (ids: string[]) => void
  bringForward: (ids: string[]) => void
  sendBackward: (ids: string[]) => void
  undo: () => void
  redo: () => void
  hydrate: () => void
  clearCanvas: () => void

  /** grow a set of ids to whole groups — what a click on a member selects */
  expandSelection: (ids: string[]) => string[]
  groupSelected: () => void
  /** ⇧⌘G — peels one group off, or detaches instances when nothing is grouped */
  ungroupSelected: () => void
  detachSelected: () => void
  flipSelected: (axis: "x" | "y") => void
  toggleTextStyle: (style: "bold" | "italic" | "underline") => void
  setTextAlign: (align: TextAlign) => void
  setLinkOnSelection: (url: string) => void

  copySelected: () => void
  cutSelected: () => void
  /** paste at a world point, or nudged off the original when none is given */
  pasteClipboard: (at?: [number, number]) => void
  /** the same, for layers that came from somewhere other than this canvas */
  pasteNodes: (nodes: readonly SquigNode[], at?: [number, number]) => void

  zoomBy: (factor: number, center?: [number, number]) => void
  zoomTo100: () => void
  zoomToFit: () => void
  zoomToSelection: () => void

  /** drop a library item at the middle of what the user is looking at,
      optionally overriding some of its default props (⌘K inserting an icon) */
  insertComponent: (kind: string, props?: Record<string, unknown>) => void
  alignSelected: (edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void
  newFile: () => void
  /** swap the canvas to another file in the drawer, saving this one first */
  openFile: (id: string) => void
  deleteFile: (id: string) => void
  /** write to the drawer right now instead of waiting out the debounce */
  saveNow: () => void
  serialize: () => string
  loadDoc: (json: string) => boolean
}

const MAX_HISTORY = 100
const SAVE_DEBOUNCE_MS = 400
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
/** breathing room around a zoom-to-fit, in screen px */
const FIT_PADDING = 96

function snapshot(s: Pick<SquigState, "nodes" | "order" | "selection">): DocSnapshot {
  return structuredClone({ nodes: s.nodes, order: s.order, selection: s.selection })
}

/**
 * Record what the selection looks like now on the checkpoint the current edit
 * is writing against. Called after every mutation, so the last write wins and
 * the entry ends up describing the finished operation — which is what redo
 * should restore.
 */
function stampSelAfter(past: DocSnapshot[], selection: string[]): void {
  const top = past[past.length - 1]
  if (top) top.selAfter = [...selection]
}

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
    const node: SquigNode = { ...n, w: Math.max(0, n.w), h: Math.max(0, n.h) }
    // shapes stored a boolean fill before they had a tonal ladder; upgrade on
    // the way in so nothing downstream has to know the old spelling existed
    if (node.type === "shape") node.fill = normalizeFill(node.fill)
    // an imported file is a stranger's document: a picture in it carries its
    // own pixels or it doesn't render at all — never a URL we'd go and fetch
    if (node.type === "image") {
      if (!/^data:image\//i.test(node.src ?? "")) continue
      // a crop is four numbers that divide the box; one bad one would render
      // the picture at infinity and take the file with it
      node.crop = normalizeCrop(node.crop)
    }
    clean[id] = node
  }
  const seen = new Set<string>()
  const ord = (order ?? []).filter((id) => {
    if (!clean[id] || seen.has(id)) return false
    seen.add(id)
    return true
  })
  for (const id of Object.keys(clean)) if (!seen.has(id)) ord.push(id)
  return { nodes: clean, order: ord }
}

const freshSeed = () => Math.floor(Math.random() * 2 ** 31)

/**
 * Copy nodes for duplicate / paste.
 *
 * Group ids are remapped consistently across the batch, so copying a group
 * gives you a second, independent group rather than two halves of the first.
 */
function cloneNodes(list: SquigNode[], dx: number, dy: number): SquigNode[] {
  const gmap = new Map<string, string>()
  return list.map((n) => {
    const c = structuredClone(n)
    c.id = nanoid(8)
    c.x = n.x + dx
    c.y = n.y + dy
    c.seed = freshSeed()
    if (c.groupIds?.length) {
      c.groupIds = c.groupIds.map((g) => {
        const mapped = gmap.get(g) ?? nanoid(8)
        gmap.set(g, mapped)
        return mapped
      })
    }
    return c
  })
}

/** Frame a set of nodes in the window, with a margin so nothing kisses an edge. */
function fitBox(set: (partial: { viewport: Viewport }) => void, list: SquigNode[], cap = MAX_ZOOM) {
  const box = unionBox(list)
  if (!box) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const bw = Math.max(box.maxX - box.minX, 1)
  const bh = Math.max(box.maxY - box.minY, 1)
  const zoom = Math.min(cap, Math.max(MIN_ZOOM, Math.min((vw - FIT_PADDING * 2) / bw, (vh - FIT_PADDING * 2) / bh)))
  set({
    viewport: {
      zoom,
      x: vw / 2 - (box.minX + bw / 2) * zoom,
      y: vh / 2 - (box.minY + bh / 2) * zoom,
    },
  })
}

/** Move ids one slot along `order`, without jumping over each other. */
function stepOrder(order: string[], ids: string[], dir: 1 | -1): string[] {
  const out = [...order]
  const sel = new Set(ids)
  if (dir === 1) {
    for (let i = out.length - 2; i >= 0; i--) {
      if (sel.has(out[i]) && !sel.has(out[i + 1])) [out[i], out[i + 1]] = [out[i + 1], out[i]]
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (sel.has(out[i]) && !sel.has(out[i - 1])) [out[i], out[i - 1]] = [out[i - 1], out[i]]
    }
  }
  return out
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
/** true between an edit and the write that records it */
let dirty = false

/** The four knobs that make up a look, gathered out of the flat state. */
function lookOf(s: Pick<SquigState, "theme" | "paper" | "font" | "grid">): Look {
  return { theme: s.theme, paper: s.paper, font: s.font, grid: s.grid }
}

/** Put a look on screen and in state — the one path both the panel and an
    opened file go through, so they can't drift apart. */
function wearLook(set: (partial: Partial<SquigState>) => void, look: Look) {
  set(look)
  applyLook(look)
}

/** Every edit calls this; the drawer only gets written once the hand rests. */
function scheduleSave(get: () => SquigState) {
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushSave(get), SAVE_DEBOUNCE_MS)
}

/**
 * Write the current document to the drawer now. A blank canvas nobody has
 * touched stays out of the list — until `force`, which is a person asking.
 *
 * A canvas with nothing new on it writes nothing at all: a second tab may be
 * holding a fresher copy of this same document, and an idle tab closing is no
 * reason to hand it back an old one.
 */
function flushSave(get: () => SquigState, force = false) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const s = get()
  // the look goes to prefs too, but only as the default a new file will start
  // from — the copy that matters travels inside the document below
  savePrefs({ look: lookOf(s), contextRow: s.contextRow, activeId: s.docId })
  if (!dirty && !force) return
  const known = s.files.some((f) => f.id === s.docId)
  if (!s.order.length && !known && !force) return
  const files = saveFile({
    id: s.docId,
    name: s.fileName,
    nodes: s.nodes,
    order: s.order,
    updatedAt: Date.now(),
    look: lookOf(s),
  })
  useSquig.setState({ files })
  dirty = false
}

let watching = false
/**
 * A tab can close inside the debounce window. Catch it on the way out — and
 * on the way to the background, which is all iOS ever gives you.
 *
 * The same listener keeps an eye on the drawer itself, so a file made in
 * another tab shows up in this one's recents without a reload.
 */
function watchWindow(get: () => SquigState) {
  if (watching || typeof window === "undefined") return
  watching = true
  const save = () => flushSave(get)
  window.addEventListener("beforeunload", save)
  window.addEventListener("pagehide", save)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save()
  })
  window.addEventListener("storage", (e) => {
    if (e.key === INDEX_KEY) useSquig.setState({ files: listFiles() })
  })
}

export const useSquig = create<SquigState>((set, get) => ({
  docId: nanoid(8),
  fileName: "untitled scribbles",
  files: [],
  saveFlash: 0,
  nodes: {},
  order: [],
  selection: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  tool: "select",
  shapeKind: "rect",
  panel: null,
  placing: null,
  placingDrag: false,
  editingId: null,
  croppingId: null,
  contextRow: false,
  ...DEFAULT_LOOK,
  hydrated: false,
  commandOpen: false,
  contextMenu: null,
  renamingFile: false,
  transforming: false,
  arrowHead: true,
  uiHidden: false,
  shortcutsOpen: false,
  linkOpen: false,
  clipboard: [],
  dupTrail: null,
  notice: null,
  past: [],
  future: [],

  setFileName: (n) => {
    set({ fileName: n })
    scheduleSave(get)
  },
  setTool: (t) => set({ tool: t, placing: null, placingDrag: false, panel: null, croppingId: null }),
  setShapeKind: (s) => set({ shapeKind: s }),
  setPanel: (p) => set((st) => ({ panel: st.panel === p ? null : p, placing: null, placingDrag: false })),
  // reaching for something to place is a new intent, and the crop window would
  // otherwise swallow the click that drops it
  setPlacing: (kind, opts) =>
    set({ placing: kind, placingDrag: kind !== null && opts?.drag === true, ...(kind ? { croppingId: null } : {}) }),
  setEditing: (id) => set({ editingId: id, croppingId: id ? null : get().croppingId }),

  setCropping: (id) => {
    // only a picture has a crop window to step into, and only one at a time —
    // the mode owns the whole selection while it's on, which is also how it
    // ends: see croppingImage in components/canvas/canvas
    if (!id) {
      set({ croppingId: null })
      return
    }
    if (get().nodes[id]?.type !== "image") return
    set({ croppingId: id, editingId: null, selection: [id] })
  },

  resetCrop: (ids) => {
    const s = get()
    const targets = (ids ?? s.selection)
      .map((id) => s.nodes[id])
      .filter((n): n is ImageNode => n?.type === "image" && isCropped(n))
    if (!targets.length) return
    s.updateNodes(
      Object.fromEntries(targets.map((n) => [n.id, uncropPatch(n) as Partial<SquigNode>])),
      { checkpoint: true }
    )
  },

  setContextRow: (on) => {
    set({ contextRow: on })
    scheduleSave(get)
  },
  // each of these edits the open document, so each schedules a save
  setTheme: (t) => {
    wearLook(set, { ...lookOf(get()), theme: t })
    scheduleSave(get)
  },
  setFont: (f) => {
    wearLook(set, { ...lookOf(get()), font: f })
    scheduleSave(get)
  },
  setPaper: (p) => {
    wearLook(set, { ...lookOf(get()), paper: p })
    scheduleSave(get)
  },
  setGrid: (on) => {
    wearLook(set, { ...lookOf(get()), grid: on })
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
      // bail when nothing actually changed, so a marquee crossing nothing new
      // doesn't re-render the canvas on every pointermove
      if (next.length === s.selection.length && next.every((id, i) => s.selection[i] === id)) return s
      // the crop window belongs to one picture and to nothing else: reaching
      // for anything at all — another node, a second one, empty canvas — is
      // how you leave, and leaving keeps the crop you'd dragged so far
      const cropping = s.croppingId && next.length === 1 && next[0] === s.croppingId ? s.croppingId : null
      return { selection: next, croppingId: cropping }
    })
  },
  setCommandOpen: (open) =>
    set({ commandOpen: open, contextMenu: null, shortcutsOpen: false, panel: open ? null : get().panel }),
  setContextMenu: (m) => set({ contextMenu: m }),
  setRenamingFile: (on) => set({ renamingFile: on }),
  // called on the edges of a drag, so the hundreds of moves in between don't
  // each write to the store
  setTransforming: (on) => set((s) => (s.transforming === on ? s : { transforming: on })),
  setArrowHead: (on) => set({ arrowHead: on }),
  setUiHidden: (on) => set({ uiHidden: on }),
  setShortcutsOpen: (on) => set({ shortcutsOpen: on, commandOpen: false, contextMenu: null }),
  setLinkOpen: (on) => set({ linkOpen: on, contextMenu: null }),
  setNotice: (text) => set((s) => ({ notice: text === null ? null : { id: (s.notice?.id ?? 0) + 1, text } })),

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
   * This is Escape-cancels-the-drag: a cancelled gesture leaves the document
   * untouched, so the redo stack the checkpoint displaced has to come back too.
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
        // editing a node that just went away would wedge the canvas
        editingId: s.editingId && ids.includes(s.editingId) ? null : s.editingId,
        croppingId: s.croppingId && ids.includes(s.croppingId) ? null : s.croppingId,
      }
    })
    scheduleSave(get)
  },

  deleteSelected: () => get().removeNodes(get().selection),

  duplicateSelected: (offset = 16) => {
    const { selection, nodes, order, dupTrail } = get()
    const src = order.filter((id) => selection.includes(id)).map((id) => nodes[id])
    if (!src.length) return []

    // ⌘D on the copies you just made repeats the gap you put between them and
    // their originals; anything else gets the polite diagonal nudge
    const step = repeatStep(dupTrail, selection, nodes) ?? { dx: offset, dy: offset }
    get().checkpoint()
    const clones = cloneNodes(src, step.dx, step.dy)
    set((s) => ({
      nodes: { ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) },
      order: [...s.order, ...clones.map((c) => c.id)],
      selection: clones.map((c) => c.id),
      // where these copies came from, so the next ⌘D can measure the same way
      dupTrail: {
        ids: clones.map((c) => c.id),
        from: Object.fromEntries(clones.map((c, i) => [c.id, { x: src[i].x, y: src[i].y }])),
      },
    }))
    scheduleSave(get)
    return clones.map((c) => c.id)
  },

  rememberDuplicate: (ids, from) => set({ dupTrail: ids.length ? { ids, from } : null }),

  bringToFront: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => ({ order: [...s.order.filter((i) => !ids.includes(i)), ...s.order.filter((i) => ids.includes(i))] }))
    scheduleSave(get)
  },
  sendToBack: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => ({ order: [...s.order.filter((i) => ids.includes(i)), ...s.order.filter((i) => !ids.includes(i))] }))
    scheduleSave(get)
  },
  bringForward: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => ({ order: stepOrder(s.order, ids, 1) }))
    scheduleSave(get)
  },
  sendBackward: (ids) => {
    if (!ids.length) return
    get().checkpoint()
    set((s) => ({ order: stepOrder(s.order, ids, -1) }))
    scheduleSave(get)
  },

  undo: () => {
    const { past } = get()
    if (!past.length) return
    set((s) => {
      const prev = s.past[s.past.length - 1]
      // the redo entry remembers what the undone edit produced, not whatever
      // happened to be selected at the moment ⌘Z was pressed
      const forward: DocSnapshot = { ...snapshot(s), selAfter: prev.selAfter ?? s.selection }
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, forward],
        nodes: prev.nodes,
        order: prev.order,
        selection: prev.selection.filter((id) => prev.nodes[id]),
        editingId: null,
        // unlike the text editor, the crop overlay is a pure read of the node,
        // so ⌘Z can walk back through a crop without leaving the mode
        croppingId: s.croppingId && prev.nodes[s.croppingId] ? s.croppingId : null,
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
        croppingId: s.croppingId && next.nodes[s.croppingId] ? s.croppingId : null,
      }
    })
    scheduleSave(get)
  },

  hydrate: () => {
    migrateLegacyDoc(() => nanoid(8))
    const prefs = loadPrefs()
    const files = listFiles()
    // last file open wins; failing that, the most recent one we have
    const wanted = prefs.activeId && files.some((f) => f.id === prefs.activeId) ? prefs.activeId : files[0]?.id
    const doc = wanted ? readFile(wanted) : null
    const clean = sanitize(doc?.nodes, doc?.order)

    set({
      docId: doc?.id ?? nanoid(8),
      fileName: doc?.name ?? "untitled scribbles",
      nodes: clean.nodes,
      order: clean.order,
      files,
      contextRow: prefs.contextRow,
      hydrated: true,
    })
    // the document's own look, or — for one saved before looks existed — the
    // last look this browser was set to
    wearLook(set, doc?.look ?? prefs.look)
    // what we just read is, by definition, what the drawer already holds
    dirty = false
    watchWindow(get)
  },

  clearCanvas: () => {
    get().checkpoint()
    set({ nodes: {}, order: [], selection: [], editingId: null, croppingId: null })
    scheduleSave(get)
  },

  // -- groups ---------------------------------------------------------------

  expandSelection: (ids) => {
    const { nodes, order } = get()
    const gids = new Set<string>()
    for (const id of ids) {
      const g = nodes[id]?.groupIds?.[0]
      if (g) gids.add(g)
    }
    if (!gids.size) return ids
    const out = new Set(ids)
    for (const id of order) {
      const g = nodes[id]?.groupIds?.[0]
      if (g && gids.has(g)) out.add(id)
    }
    return order.filter((id) => out.has(id))
  },

  groupSelected: () => {
    const { selection, nodes, order } = get()
    const ids = order.filter((id) => selection.includes(id) && nodes[id])
    if (ids.length < 2) return
    get().checkpoint()
    const gid = nanoid(8)
    set((s) => {
      const map = { ...s.nodes }
      for (const id of ids) {
        const n = map[id]
        map[id] = { ...n, groupIds: [gid, ...(n.groupIds ?? [])] } as SquigNode
      }
      // collapse the members together at the topmost one, so nothing else
      // can sit inside the group's z-range and look like it belongs
      const top = s.order.lastIndexOf(ids[ids.length - 1])
      const before = s.order.slice(0, top + 1).filter((id) => !ids.includes(id))
      const after = s.order.slice(top + 1).filter((id) => !ids.includes(id))
      return { nodes: map, order: [...before, ...ids, ...after], selection: ids }
    })
    scheduleSave(get)
  },

  ungroupSelected: () => {
    const { selection, nodes } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!sel.length) return
    const gids = new Set(sel.map((n) => n.groupIds?.[0]).filter(Boolean) as string[])

    // nothing grouped? then ⇧⌘G means the other kind of coming apart
    if (!gids.size) {
      get().detachSelected()
      return
    }

    get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      const freed: string[] = []
      for (const id of s.order) {
        const n = map[id]
        const g = n?.groupIds?.[0]
        if (!g || !gids.has(g)) continue
        const rest = n.groupIds!.slice(1)
        map[id] = { ...n, groupIds: rest.length ? rest : undefined } as SquigNode
        freed.push(id)
      }
      return { nodes: map, selection: freed }
    })
    scheduleSave(get)
  },

  detachSelected: () => {
    const { selection, nodes } = get()
    const comps = selection.map((id) => nodes[id]).filter((n) => n?.type === "component") as ComponentNode[]
    if (!comps.length) return
    get().checkpoint()
    set((s) => {
      const map = { ...s.nodes }
      let ord = [...s.order]
      const picked: string[] = []
      for (const c of comps) {
        // icons come back out of breakApart as icon components, so detaching
        // one is a no-op that would loop forever if you kept asking
        if (c.kind === "icon") continue
        // a detached instance stays one thing you can drag — same as Figma
        const gid = nanoid(8)
        const pieces = breakApart(c).map((p) => ({ ...p, groupIds: [gid, ...(c.groupIds ?? [])] }))
        if (!pieces.length) continue
        for (const p of pieces) {
          map[p.id] = p
          picked.push(p.id)
        }
        const at = ord.indexOf(c.id)
        ord = [...ord.slice(0, at), ...pieces.map((p) => p.id), ...ord.slice(at + 1)]
        delete map[c.id]
      }
      return { nodes: map, order: ord, selection: picked }
    })
    scheduleSave(get)
  },

  flipSelected: (axis) => {
    const { selection, nodes } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!sel.length) return
    const box = unionBox(sel)
    if (!box) return
    get().checkpoint()
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of sel) {
      patches[n.id] =
        axis === "x"
          ? { x: box.minX + box.maxX - (n.x + n.w), flipX: !n.flipX }
          : { y: box.minY + box.maxY - (n.y + n.h), flipY: !n.flipY }
    }
    get().updateNodes(patches)
  },

  toggleTextStyle: (style) => {
    const { selection, nodes } = get()
    const texts = selection.map((id) => nodes[id]).filter((n) => n?.type === "text") as TextNode[]
    if (!texts.length) return
    get().checkpoint()
    // mixed selection turns everything on first, like every text editor ever
    const on = texts.some((n) => !n[style])
    get().updateNodes(Object.fromEntries(texts.map((n) => [n.id, { [style]: on } as Partial<SquigNode>])))
  },

  setTextAlign: (align) => {
    const { selection, nodes } = get()
    const texts = selection.map((id) => nodes[id]).filter((n) => n?.type === "text") as TextNode[]
    if (!texts.length) return
    // already unanimous — pressing the segment it's already on isn't an edit
    if (texts.every((n) => (n.align ?? "left") === align)) return
    get().checkpoint()
    get().updateNodes(Object.fromEntries(texts.map((n) => [n.id, { align } as Partial<SquigNode>])))
  },

  setLinkOnSelection: (url) => {
    const { selection, nodes } = get()
    const texts = selection.map((id) => nodes[id]).filter((n) => n?.type === "text") as TextNode[]
    if (!texts.length) return
    get().checkpoint()
    const trimmed = url.trim()
    get().updateNodes(
      Object.fromEntries(texts.map((n) => [n.id, { link: trimmed || undefined } as Partial<SquigNode>]))
    )
  },

  // -- clipboard ------------------------------------------------------------

  copySelected: () => {
    const { selection, nodes, order } = get()
    const sel = order.filter((id) => selection.includes(id)).map((id) => nodes[id])
    if (!sel.length) return
    set({ clipboard: structuredClone(sel) })
  },

  cutSelected: () => {
    get().copySelected()
    get().deleteSelected()
  },

  pasteClipboard: (at) => get().pasteNodes(get().clipboard, at),

  pasteNodes: (list, at) => {
    if (!list.length) return
    const box = unionBox([...list])!
    const [dx, dy] = at ? [at[0] - box.minX, at[1] - box.minY] : [16, 16]
    get().checkpoint()
    const clones = cloneNodes([...list], dx, dy)
    set((s) => ({
      nodes: { ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) },
      order: [...s.order, ...clones.map((c) => c.id)],
      selection: clones.map((c) => c.id),
    }))
    scheduleSave(get)
  },

  // -- zoom -----------------------------------------------------------------

  zoomBy: (factor, center) => {
    const v = get().viewport
    const [cx, cy] = center ?? [window.innerWidth / 2, window.innerHeight / 2]
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
    const k = zoom / v.zoom
    set({ viewport: { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k } })
  },

  zoomTo100: () => {
    const v = get().viewport
    const [cx, cy] = [window.innerWidth / 2, window.innerHeight / 2]
    const k = 1 / v.zoom
    set({ viewport: { zoom: 1, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k } })
  },

  zoomToFit: () => {
    const { nodes, order } = get()
    fitBox(set, order.map((id) => nodes[id]).filter(Boolean))
  },

  zoomToSelection: () => {
    const { nodes, selection } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean)
    if (!sel.length) return get().zoomToFit()
    fitBox(set, sel)
  },

  insertComponent: (kind, props) => {
    const def = getDef(kind)
    if (!def) return
    const v = get().viewport
    const [cx, cy] = screenToWorld(v, window.innerWidth / 2, window.innerHeight / 2)
    get().addNode({
      type: "component",
      kind: def.kind,
      props: { ...def.defaults, ...props },
      x: Math.round(cx - def.size.w / 2),
      y: Math.round(cy - def.size.h / 2),
      w: def.size.w,
      h: def.size.h,
    } as Omit<SquigNode, "id" | "seed">)
  },

  cloneSelectionInPlace: () => {
    const { selection, nodes, order } = get()
    const clones: SquigNode[] = []
    // document order, so the copies stack the way the originals did
    for (const id of order) {
      if (!selection.includes(id)) continue
      const n = nodes[id]
      if (!n) continue
      clones.push({ ...structuredClone(n), id: nanoid(8), seed: Math.floor(Math.random() * 2 ** 31) })
    }
    if (!clones.length) return []
    const ids = clones.map((c) => c.id)
    set((s) => {
      stampSelAfter(s.past, ids)
      return {
        nodes: { ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) },
        order: [...s.order, ...ids],
        selection: ids,
      }
    })
    scheduleSave(get)
    return ids
  },

  distributeSelected: (axis) => {
    const { selection, nodes, order } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    // fewer than three and there is no gap to even out
    if (sel.length < 3) return
    const size = (n: SquigNode) => (axis === "h" ? n.w : n.h)
    const pos = (n: SquigNode) => (axis === "h" ? n.x : n.y)
    const rank = new Map(order.map((id, i) => [id, i]))
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

  selectAll: () => set((s) => ({ selection: [...s.order] })),
  selectNone: () => set({ selection: [], croppingId: null }),

  invertSelection: () => {
    set((s) => ({ selection: s.order.filter((id) => !s.selection.includes(id)) }))
  },

  selectSameKind: () => {
    const { selection, nodes, order } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!sel.length) return
    // a component matches on its library kind; a shape on its shape; anything
    // else on node type — the same taxonomy the inspector's summary uses
    const kinds = new Set(sel.filter((n) => n.type === "component").map((n) => (n as ComponentNode).kind))
    const shapes = new Set(sel.filter((n) => n.type === "shape").map((n) => (n as { shape: string }).shape))
    const types = new Set(sel.filter((n) => n.type !== "component" && n.type !== "shape").map((n) => n.type))
    set({
      selection: order.filter((id) => {
        const n = nodes[id]
        if (!n) return false
        if (n.type === "component") return kinds.has(n.kind)
        if (n.type === "shape") return shapes.has(n.shape)
        return types.has(n.type)
      }),
    })
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
    // the file you were on keeps its place in the drawer — this is a new one
    flushSave(get)
    set({
      docId: nanoid(8),
      fileName: "untitled scribbles",
      nodes: {},
      order: [],
      selection: [],
      croppingId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      renamingFile: false,
      linkOpen: false,
      past: [],
      future: [],
    })
    flushSave(get)
  },

  openFile: (id) => {
    if (id === get().docId) return
    flushSave(get)
    const doc = readFile(id)
    if (!doc) {
      // the index knew about it but the document itself is gone
      set({ files: dropFile(id) })
      return
    }
    const clean = sanitize(doc.nodes, doc.order)
    set({
      docId: doc.id,
      fileName: doc.name,
      nodes: clean.nodes,
      order: clean.order,
      selection: [],
      croppingId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      renamingFile: false,
      linkOpen: false,
      panel: null,
      past: [],
      future: [],
    })
    // a drawing carries its own ink and paper; one saved before looks existed
    // keeps whatever is on screen rather than snapping to a default
    if (doc.look) wearLook(set, doc.look)
    // frame what's there, but never past life size — 400% on one small
    // rectangle tells you nothing about where you've landed
    if (clean.order.length) fitBox(set, clean.order.map((nid) => clean.nodes[nid]), 1)
    // straight off the drawer, so there is nothing to write back yet
    dirty = false
    flushSave(get)
  },

  deleteFile: (id) => {
    const files = dropFile(id)
    set({ files })
    if (id !== get().docId) return
    // The file you had open just went away. Let go of it before landing
    // somewhere else, or the save on the way out would write it right back.
    set({
      docId: nanoid(8),
      fileName: "untitled scribbles",
      nodes: {},
      order: [],
      selection: [],
      croppingId: null,
      past: [],
      future: [],
    })
    const next = files[0]?.id
    if (next) get().openFile(next)
    else get().newFile()
  },

  saveNow: () => {
    flushSave(get, true)
    set((s) => ({ saveFlash: s.saveFlash + 1 }))
  },

  serialize: () => {
    const s = get()
    const { fileName, nodes, order } = s
    return JSON.stringify({ app: "squig", version: 1, fileName, look: lookOf(s), nodes, order }, null, 2)
  },

  loadDoc: (json) => {
    try {
      const doc = JSON.parse(json)
      if (!doc || typeof doc !== "object" || !doc.nodes || !Array.isArray(doc.order)) return false
      // an opened file joins the drawer as its own document, so importing
      // never writes over whatever was on the canvas
      flushSave(get)
      const clean = sanitize(doc.nodes, doc.order)
      set({
        docId: nanoid(8),
        fileName: typeof doc.fileName === "string" ? doc.fileName : "imported scribbles",
        nodes: clean.nodes,
        order: clean.order,
        selection: [],
        croppingId: null,
        renamingFile: false,
        linkOpen: false,
        past: [],
        future: [],
      })
      // an import brings its author's ink and paper with it, when it has any
      if (doc.look) wearLook(set, knownLook(doc.look, lookOf(get())))
      // an imported file was drawn wherever its author left it — go there,
      // or the canvas looks empty when it isn't
      if (clean.order.length) fitBox(set, clean.order.map((id) => clean.nodes[id]), 1)
      else set({ viewport: { x: 0, y: 0, zoom: 1 } })
      scheduleSave(get)
      return true
    } catch {
      return false
    }
  },
}))
