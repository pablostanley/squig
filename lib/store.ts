"use client"

import { create } from "zustand"
import { nanoid } from "nanoid"
import type { ComponentNode, ImageNode, SquigNode, TextAlign, TextNode, Tool, Viewport, ShapeKind } from "./types"
import { normalizeFill, screenToWorld, unionBox } from "./types"
import { validNode } from "./clipboard-payload"
import { remapBinds, settleBinds } from "./canvas/arrow-binding"
import { isCropped, trueShapePatch, uncropPatch } from "./canvas/crop"
import {
  clampGestureZoom,
  fitViewport,
  revealViewport,
  FIT_MIN_ZOOM,
  MAX_ZOOM,
} from "./canvas/navigate"
import { lockedIds, selectable } from "./selection"
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
  fileKey,
  knownLook,
  listFiles,
  loadPrefs,
  migrateLegacyDoc,
  readFile,
  saveFile,
  savePrefs,
  type FileMeta,
} from "./files"
import { planTabSync } from "./tabs"

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
  /** the browser has no room left: this drawing is on screen and nowhere else.
   *  It stays true until a save gets through, because the trouble does too — a
   *  flash that fades is the wrong shape for "your work isn't being kept". */
  drawerFull: boolean
  /** another tab has written this document since this one last read it. The
   *  canvas on screen is no longer the file on disk, so squig has stopped
   *  writing rather than put this version over one it never saw. Like
   *  drawerFull it is a condition, not a moment: it stands until this tab is
   *  pointed at some other document. */
  stale: boolean

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
  /** put a squashed picture back on the ratio its pixels actually have */
  restoreAspect: (ids?: string[]) => void
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
  /** run one discrete command as exactly one undo step — or none, when it
   *  turned out to change nothing. Returns whether it landed. */
  edit: (fn: () => void) => boolean
  addNode: (node: Omit<SquigNode, "id" | "seed"> & Partial<Pick<SquigNode, "id" | "seed">>, opts?: { select?: boolean; checkpoint?: boolean }) => string
  addNodes: (nodes: SquigNode[], opts?: { select?: boolean; checkpoint?: boolean }) => void
  updateNode: (id: string, patch: Partial<SquigNode>, opts?: { checkpoint?: boolean }) => void
  updateNodes: (patches: Record<string, Partial<SquigNode>>, opts?: { checkpoint?: boolean }) => void
  removeNodes: (ids: string[], opts?: { checkpoint?: boolean }) => void
  /** discard the last checkpoint and restore it — cancels an in-flight gesture */
  revertToCheckpoint: () => void
  /** an empty text editor closing: undo the click that placed the draft, or
   *  delete the layer whose words were emptied */
  dismissDraft: (id: string) => void
  /** the text editor closing with words in it */
  commitText: (id: string, patch: Partial<SquigNode>) => void
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
  /** hold the selection down and let go of it — see the note in lib/selection */
  lockSelected: () => void
  /** let named layers loose again — what the right-click menu runs */
  unlockNodes: (ids: string[]) => void
  /** the escape hatch that needs no aiming: everything loose at once */
  unlockAll: () => void
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
  /** bring the selection into view, moving the viewport only if it has to */
  revealSelection: () => void

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
// the zoom floors, the fit padding and the arithmetic they feed live in
// lib/canvas/navigate, where they can be tested without a window

/**
 * The document as it stands right now, for the undo stack.
 *
 * This hands back the very same `nodes` map and `order` array the store is
 * holding rather than copies of them, and the whole thing rests on one rule
 * the store already keeps everywhere: **a node that is in the document is
 * never written to again**. Every mutation here rebuilds instead —
 * `{ ...s.nodes, [id]: { ...cur, ...patch } }` — settleBinds copies on write,
 * and every `order:` in this file is a fresh array. So the instant anything
 * changes, the objects this entry is pointing at stop being reachable from the
 * live document and belong to history alone. undo and revertToCheckpoint have
 * always assigned a checkpoint's map straight back into state, which is the
 * same bargain read the other way round; this is only the outbound half.
 *
 * It used to be `structuredClone`, and nothing about that was visible until
 * you pasted a screenshot in. An ImageNode carries its pixels inline as a data
 * URL — up to 400,000 characters each, by lib/clipboard's own budget — so six
 * pictures on a board meant every checkpoint deep-copied nearly two megabytes
 * of base64 synchronously, before the first frame of a drag, and a full
 * hundred-step history retained a hundred copies of pictures that hadn't
 * changed since the day they were pasted. Sharing costs nothing per checkpoint
 * and retains exactly one copy of each version anything still refers to. What
 * makes it safe for pictures specifically is that the pixels are immutable
 * once decoded: cropping is a window in normalised coordinates, and nothing in
 * squig ever rewrites a `src`.
 *
 * Nothing about what gets written to disk or to the clipboard moves — those
 * both serialize `nodes` as it stands, `src` inline, and a document is still
 * one self-contained thing.
 *
 * `selection` is copied because it's a handful of ids and because the entry
 * gets a second array stamped onto it afterwards; see stampSelAfter.
 *
 * If you ever do need to write a field onto a live node, this is what breaks —
 * quietly, by rewriting history under itself. scripts/test-history.ts is there
 * to say so out loud.
 */
function snapshot(s: Pick<SquigState, "nodes" | "order" | "selection">): DocSnapshot {
  return { nodes: s.nodes, order: s.order, selection: [...s.selection] }
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

/** Just the two fields an undo step is really about. */
type Doc = Pick<SquigState, "nodes" | "order">

/**
 * Two values that say the same thing about the drawing.
 *
 * Only ever reached for the handful of nodes an edit rewrote, so the walk is
 * small; `points` and `props` are the deepest anything here goes.
 *
 * A key holding `undefined` counts as a key that isn't there, because that is
 * how this store spells taking something away — `{ locked: undefined }`,
 * `{ link: undefined }` — and clearing a link off a layer that never had one
 * draws exactly the same picture it did a moment ago.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => sameValue(v, b[i]))
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined)
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => sameValue(ra[k], rb[k]))
}

/**
 * Did anything actually change?
 *
 * Cheap because it barely ever deep-compares: every write in this store
 * rebuilds only the nodes it touched — `{ ...cur, ...patch }` — and settleBinds
 * hands the untouched ones straight back, so one identity check clears the
 * whole document bar the few an edit rewrote. Those few are compared by value,
 * because "changed" has to mean the drawing came out different, not that a new
 * object was allocated: align writes `x: minX` onto a node already sitting at
 * minX, and bringToFront rebuilds `order` out of the same ids in the same
 * places. Both hand back new objects holding old news, and an identity test
 * would call each of them an edit.
 *
 * The other half of "cheap" is where this gets called from — once per discrete
 * command, never inside a drag. See `edit` below.
 */
function sameDoc(a: Doc, b: Doc): boolean {
  if (a.order !== b.order) {
    if (a.order.length !== b.order.length) return false
    for (let i = 0; i < a.order.length; i++) if (a.order[i] !== b.order[i]) return false
  }
  if (a.nodes === b.nodes) return true
  const ids = Object.keys(a.nodes)
  if (ids.length !== Object.keys(b.nodes).length) return false
  for (const id of ids) {
    const x = a.nodes[id]
    const y = b.nodes[id]
    if (x === y) continue
    if (!y || !sameValue(x, y)) return false
  }
  return true
}

/**
 * Everything a document has to survive before the canvas will draw it.
 *
 * The check itself is `validNode` — the same gate a paste goes through. There
 * used to be two of them, and the weaker one guarded the wider door: this
 * function looked at x/y/w/h and waved the rest past, while the clipboard's
 * looked at the node type, the points a line is made of, the words a label is
 * made of. So a .squig.json that had lost its `points` — a truncated export,
 * an older writer, a file somebody edited by hand — imported happily, threw on
 * the first render, and left no screen to fix it from. One gate now, on both
 * doors, which also means a node type only has to be vouched for in one place
 * the next time squig grows one.
 *
 * What stays here is the part no single node can answer for itself: the
 * boolean fill old shapes wrote, the z-order, and arrow ends that name nodes
 * this document turns out not to have.
 */
function sanitize(
  nodes: Record<string, SquigNode> | undefined,
  order: string[] | undefined
): { nodes: Record<string, SquigNode>; order: string[] } {
  const clean: Record<string, SquigNode> = {}
  for (const [id, raw] of Object.entries(nodes ?? {})) {
    const node = validNode(raw)
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
  const ord = (order ?? []).filter((id) => {
    if (!clean[id] || seen.has(id)) return false
    seen.add(id)
    return true
  })
  for (const id of Object.keys(clean)) if (!seen.has(id)) ord.push(id)
  // a stranger's document can bind an arrow to a node that was never in it, or
  // to one the loop above just threw out. Those ends let go here, and the ones
  // that survive get routed to wherever their boxes actually are.
  return { nodes: settleBinds(clean), order: ord }
}

/**
 * Was this node put on the canvas by the checkpoint currently on top?
 *
 * The text editor opens on two nodes wearing identical clothes: a draft the
 * click before last just placed, and a layer that has been sitting there since
 * before lunch. The undo stack can tell them apart on its own — a checkpoint
 * that predates the node *is* the click that placed it — which saves passing a
 * flag down through the view and back, and saves it being wrong.
 */
function placedByTop(past: DocSnapshot[], id: string): boolean {
  const top = past[past.length - 1]
  return !!top && !top.nodes[id]
}

const freshSeed = () => Math.floor(Math.random() * 2 ** 31)

/**
 * Copy nodes for duplicate / paste.
 *
 * Group ids are remapped consistently across the batch, so copying a group
 * gives you a second, independent group rather than two halves of the first.
 * Arrow bindings ride the same idea: copy two boxes and the arrow between them
 * and you get a second connected pair, copy the arrow on its own and it comes
 * away loose rather than still tethered to the originals.
 *
 * Copies come out loose in the other sense too. Nothing in this document can be
 * locked and copied at once — the selection can't hold a locked layer — but a
 * paste from another canvas can arrive that way, and a copy you asked for and
 * then can't touch, sitting sixteen pixels off the one you already couldn't
 * touch, is a trap rather than a courtesy. The lock says "leave *that* one
 * alone", and this isn't that one.
 */
function cloneNodes(list: SquigNode[], dx: number, dy: number): SquigNode[] {
  const gmap = new Map<string, string>()
  const idMap = new Map<string, string>()
  const clones = list.map((n) => {
    const c = structuredClone(n)
    c.id = nanoid(8)
    idMap.set(n.id, c.id)
    c.x = n.x + dx
    c.y = n.y + dy
    c.seed = freshSeed()
    c.locked = undefined
    if (c.groupIds?.length) {
      c.groupIds = c.groupIds.map((g) => {
        const mapped = gmap.get(g) ?? nanoid(8)
        gmap.set(g, mapped)
        return mapped
      })
    }
    return c
  })
  remapBinds(clones, idMap)
  return clones
}

/**
 * Frame a set of nodes in the window, with a margin so nothing kisses an edge.
 *
 * Returns whether the board was too big to show whole even at the fit floor —
 * only zoomToFit says anything about that, because only zoomToFit was asked
 * the question. Opening a file frames it too, and a "doesn't fit" flash on
 * arrival would be a greeting rather than an answer.
 */
function fitBox(set: (partial: { viewport: Viewport }) => void, list: SquigNode[], cap = MAX_ZOOM): boolean {
  const box = unionBox(list)
  if (!box) return false
  const { viewport, clamped } = fitViewport(box, window.innerWidth, window.innerHeight, cap)
  set({ viewport })
  return clamped
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
/**
 * The `updatedAt` of the bytes this tab last read or wrote for the document it
 * has open — null for one that has never been on disk. It is the whole of what
 * this tab knows about the file underneath it, and no write goes out that
 * isn't checked against it. See lib/tabs.
 */
let seen: number | null = null
/** an `edit` is running, so a nested one joins it instead of opening a step */
let editing = false

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

/**
 * This canvas and the drawer agree: `at` is when the bytes on disk were
 * written, or null for a document that has never been written at all. Nothing
 * is owed, and whatever another tab had done to the document this one was on
 * before is no longer this one's problem.
 *
 * Every path that points the canvas at a document goes through here — opening,
 * importing, starting a new one, hydrating — so the three facts that have to
 * agree can't drift apart.
 */
function nowSeeing(at: number | null) {
  seen = at
  dirty = false
  useSquig.setState({ stale: false })
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
  // This tab has been told its document moved on without it. Not one more
  // write goes out until it is pointed at another document — ⌘S included,
  // since nobody pressing it is asking to throw away work they can't see.
  if (s.stale) return
  if (!dirty && !force) return
  const known = s.files.some((f) => f.id === s.docId)
  if (!s.order.length && !known && !force) return
  const at = Date.now()
  const { index, full, stale } = saveFile(
    {
      id: s.docId,
      name: s.fileName,
      nodes: s.nodes,
      order: s.order,
      updatedAt: at,
      look: lookOf(s),
    },
    seen
  )
  // The drawer holds a version of this document this tab has never seen, and
  // squig has just declined to write over it. Usually the `storage` event gets
  // here first and this never fires; it is the backstop for the times it
  // doesn't — an event missed while the tab slept at the back of a phone, or a
  // write that landed inside this very debounce.
  if (stale) {
    stopWriting(get, "this drawing changed in another tab — export to keep your version")
    return
  }
  // Say it once, on the way into trouble — every autosave after this one would
  // be saying the same thing about the same drawing. The line under the file
  // name carries it from there, for as long as it lasts.
  if (full && !s.drawerFull) s.setNotice("no room left in this browser — export this one to keep it")
  useSquig.setState({ files: index, drawerFull: full })
  // a refused write leaves the drawing unsaved, so it stays owed: the next
  // edit, or the tab closing, tries again — which is how squig comes back on
  // its own once the user has made room
  dirty = full
  // a refused write left the old bytes on disk, and those are still the ones
  // this tab has seen
  if (!full) seen = at
}

/**
 * This canvas is not the document on disk any more, and squig has stopped
 * writing it.
 *
 * It speaks in both shapes squig has, because there are two things to say. The
 * flash is for the moment it happened: that is news, it is momentary, and the
 * user is looking at the canvas rather than at the file name. The line under
 * the file name is for the condition it leaves behind, which stands until this
 * tab is pointed at another document — the same shape a full drawer uses, for
 * the same reason.
 *
 * It is deliberately the same line, word for word. What that line reports is
 * that the drawing on screen is the only copy of itself there is, and that is
 * exactly as true whichever way squig got here.
 */
function stopWriting(get: () => SquigState, why: string) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (get().stale) return
  useSquig.setState({ stale: true })
  get().setNotice(why)
}

/**
 * Take the version another tab just wrote. Safe only because this tab holds
 * nothing the drawer doesn't already have — see hasUnsavedWork in lib/tabs,
 * which is where that claim gets made carefully.
 *
 * The undo stack goes with it. Those checkpoints describe a document that is
 * no longer on disk, and an undo through them would put the other tab's work
 * back to a state it never passed through, silently — which is the very trade
 * this whole guard exists to refuse. The viewport stays where it was: the user
 * is looking at a place on the canvas, not at a version of it.
 */
function adoptDoc(get: () => SquigState) {
  const doc = readFile(get().docId)
  // it was there a moment ago and now won't read: that comes to the same thing
  // as the document going away, so say so rather than guess
  if (!doc) {
    stopWriting(get, "this drawing was removed in another tab — export to keep your copy")
    return
  }
  const clean = sanitize(doc.nodes, doc.order)
  const s = get()
  const held = new Set(s.selection)
  useSquig.setState({
    fileName: doc.name,
    nodes: clean.nodes,
    order: clean.order,
    // whatever of the selection survived the other tab's edit, in document order
    selection: selectable(clean.order.filter((id) => held.has(id)), clean.nodes),
    croppingId: s.croppingId && clean.nodes[s.croppingId] ? s.croppingId : null,
    past: [],
    future: [],
  })
  if (doc.look) wearLook(useSquig.setState, doc.look)
  nowSeeing(doc.updatedAt)
  get().setNotice("another tab saved this drawing — this one caught up")
}

/**
 * The `updatedAt` out of the document another tab just wrote, or null when the
 * key no longer holds one we can read.
 *
 * Parsing a whole document to get at one number is more work than it looks — a
 * drawing with pasted screenshots in it runs to megabytes — but this only ever
 * runs when a second tab writes the document this one has open, which is the
 * rare case by construction. An ordinary single-tab session never reaches it:
 * a tab is never told about its own writes.
 */
function stampOf(raw: string | null): number | null {
  if (!raw) return null
  try {
    const at = (JSON.parse(raw) as { updatedAt?: unknown }).updatedAt
    return typeof at === "number" ? at : null
  } catch {
    return null
  }
}

let watching = false
/**
 * A tab can close inside the debounce window. Catch it on the way out — and
 * on the way to the background, which is all iOS ever gives you.
 *
 * The same listener keeps an eye on the drawer itself, so a file made in
 * another tab shows up in this one's recents without a reload — and, since a
 * second tab opens onto the same drawing this one has, on that drawing's own
 * key. A `storage` event fires in every tab but the one that wrote, so this is
 * the only way a tab ever hears that the file under it has changed.
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
    if (e.key === INDEX_KEY) {
      useSquig.setState({ files: listFiles() })
      return
    }
    const s = get()
    // e.key is null when the whole origin was cleared; docKey never is, so
    // that lands on "not ours" and this tab is left holding the only copy —
    // which is the truth, and the save that follows puts it back
    switch (
      planTabSync({
        key: e.key ?? "",
        docKey: fileKey(s.docId),
        stamp: stampOf(e.newValue),
        seen,
        work: { dirty, transforming: s.transforming, editing: s.editingId !== null },
        stale: s.stale,
      })
    ) {
      case "adopt":
        adoptDoc(get)
        break
      case "conflict":
        stopWriting(get, "this drawing changed in another tab — export to keep your version")
        break
      case "gone":
        stopWriting(get, "this drawing was removed in another tab — export to keep your copy")
        break
    }
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
  drawerFull: false,
  stale: false,
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
    const n = get().nodes[id]
    // this one writes the selection itself, so it also keeps the locked layers
    // out of it — a held-down picture has no crop to step into
    if (n?.type !== "image" || n.locked) return
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

  restoreAspect: (ids) => {
    const s = get()
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const id of ids ?? s.selection) {
      const n = s.nodes[id]
      if (n?.type !== "image") continue
      // a picture already on its ratio hands back null, and so drops out of
      // the batch — a selection of twelve where one is squashed moves that one
      const p = trueShapePatch(n)
      if (p) patches[id] = p as Partial<SquigNode>
    }
    // nothing was out of shape: no checkpoint, no undo step that undoes nothing
    if (!Object.keys(patches).length) return
    s.updateNodes(patches, { checkpoint: true })
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
      const want = new Set(selectable(ids, s.nodes))
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
      selection: selectable(prev.selection, prev.nodes),
      past: past.slice(0, -1),
      future: prev.displacedFuture ?? get().future,
    })
    scheduleSave(get)
  },

  /**
   * One discrete command, one undo step — or none at all, when nothing moved.
   *
   * That arithmetic used to be left to each call site, and so it drifted:
   * addNode and removeNodes take a checkpoint by default, updateNodes doesn't,
   * and selAfter is a third thing you have to remember on top. Whether an
   * action cost zero, one or two undo steps came down to which pair of
   * primitives it happened to compose. Dismissing a text draft you never typed
   * into cost two, with an invisible click-blocker parked between them; ] on
   * the frontmost layer cost one and moved nothing.
   *
   * So the deal is a property of the store instead. edit() takes the
   * checkpoint, runs the change, stamps the selection it ended on — that's
   * what redo puts back — and, if the document came out the same, puts history
   * back exactly as it found it. Call the primitives inside the cheap way,
   * without a checkpoint of their own; nesting is safe regardless, since an
   * edit that starts inside another one joins the one already running rather
   * than opening a second step.
   *
   * This is for discrete commands, not for the inside of a drag. A gesture
   * still takes its own checkpoint on the first move that counts and then
   * writes freely: it already knows exactly when it began, and a pointer move
   * arriving every few milliseconds is no place to be comparing documents.
   */
  edit: (fn) => {
    const before = get()
    if (editing) {
      // already inside one — no second checkpoint, just say what this part did
      fn()
      return !sameDoc(before, get())
    }
    const { past, future } = before
    before.checkpoint()
    editing = true
    try {
      fn()
    } finally {
      editing = false
    }
    const after = get()
    if (sameDoc(before, after)) {
      // hand history back whole, rather than popping: `checkpoint` may have
      // trimmed the far end of `past` to stay under MAX_HISTORY, and an edit
      // that did nothing has no business costing anyone their oldest step
      set({ past, future })
      return false
    }
    stampSelAfter(after.past, after.selection)
    scheduleSave(get)
    return true
  },

  addNode: (node, opts = {}) => {
    const id = node.id ?? nanoid(8)
    const seed = node.seed ?? Math.floor(Math.random() * 2 ** 31)
    if (opts.checkpoint !== false) get().checkpoint()
    set((s) => {
      const selection = opts.select !== false ? [id] : s.selection
      stampSelAfter(s.past, selection)
      return {
        nodes: settleBinds({ ...s.nodes, [id]: { ...node, id, seed } as SquigNode }),
        order: [...s.order, id],
        selection,
      }
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
      return { nodes: settleBinds(map), order: [...s.order, ...ids], selection }
    })
    scheduleSave(get)
  },

  updateNode: (id, patch, opts) => {
    if (opts?.checkpoint) get().checkpoint()
    set((s) => {
      const cur = s.nodes[id]
      if (!cur) return s
      stampSelAfter(s.past, s.selection)
      return { nodes: settleBinds({ ...s.nodes, [id]: { ...cur, ...patch } as SquigNode }) }
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
      // every bound arrow catches up here, which is what lets a box drag, a
      // nudge, an align and a resize all pull their connectors along without
      // any of them having to know that bindings exist
      return { nodes: settleBinds(map) }
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
        // an arrow aimed at something that just went away lets go of it and
        // stays exactly where it was last drawn — see settleBinds
        nodes: settleBinds(map),
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

  /**
   * The text editor closing on an empty run.
   *
   * An empty text node draws nothing and can never be clicked again, so it
   * goes either way — but *how* it goes depends on where it came from. A draft
   * you placed and then dismissed without typing gets the same deal a pen tap
   * gets from finishGesture: the click that made it already took a checkpoint,
   * so rolling back to that one takes the node and the step together. Removing
   * it instead would spend a second undo step, and the ⌘Z in between would
   * hand back a blank 120×23 rectangle you can't see but can still click.
   *
   * Emptying words that were already there is a real edit, and keeps its step.
   */
  dismissDraft: (id) => {
    if (placedByTop(get().past, id)) get().revertToCheckpoint()
    else get().removeNodes([id])
  },

  /**
   * The text editor closing with words in it.
   *
   * Placing a draft and typing into it is one act, so the words land on the
   * checkpoint the click already took — ⌘Z then lifts the whole text layer off
   * the canvas instead of stopping halfway, on the same empty run dismissDraft
   * exists to keep out of the history. Editing a layer that was already there
   * is a step of its own and goes through edit(), which is also what makes
   * closing the editor on words you didn't really change cost nothing.
   */
  commitText: (id, patch) => {
    if (placedByTop(get().past, id)) get().updateNode(id, patch)
    else get().edit(() => get().updateNode(id, patch))
  },

  // -- locking ---------------------------------------------------------------

  /**
   * Locking lets go of what it locked.
   *
   * It has to: the invariant the rest of the app leans on is that a locked
   * layer is never selected, and leaving the ring up around something that no
   * longer answers to a drag would be the most confusing possible way to say
   * "done". The flash names the way back in, because the layer is about to
   * stop being clickable and that is a thing worth being told once.
   */
  lockSelected: () => {
    const { selection, nodes } = get()
    const ids = selection.filter((id) => nodes[id])
    if (!ids.length) return
    get().edit(() => {
      get().updateNodes(Object.fromEntries(ids.map((id) => [id, { locked: true } as Partial<SquigNode>])))
      // letting go is part of the edit, and edit() stamps the checkpoint with
      // the selection the whole thing ended on — so redo lands here too
      set({ selection: [], croppingId: null })
    })
    get().setNotice(
      ids.length > 1 ? "locked — right-click one to let that one go" : "locked — right-click it to let it go"
    )
  },

  unlockNodes: (ids) => {
    const { nodes } = get()
    const locked = ids.filter((id) => nodes[id]?.locked)
    if (!locked.length) return
    get().checkpoint()
    get().updateNodes(Object.fromEntries(locked.map((id) => [id, { locked: undefined } as Partial<SquigNode>])))
    // handing them back selected is the point — you unlocked them to touch them
    get().setSelection(locked)
  },

  unlockAll: () => get().unlockNodes(lockedIds(get().nodes, get().order)),

  duplicateSelected: (offset = 16) => {
    const { selection, nodes, order, dupTrail } = get()
    const src = order.filter((id) => selection.includes(id)).map((id) => nodes[id])
    if (!src.length) return []

    // ⌘D on the copies you just made repeats the gap you put between them and
    // their originals; anything else gets the polite diagonal nudge
    const step = repeatStep(dupTrail, selection, nodes) ?? { dx: offset, dy: offset }
    const clones = cloneNodes(src, step.dx, step.dy)
    // through edit(), so the checkpoint remembers that the copies are what this
    // ended selected — a redo that handed them back unselected would leave the
    // next ⌘D measuring nothing, and stepping 16px diagonally instead of
    // repeating the stride you were walking
    get().edit(() =>
      set((s) => ({
        nodes: settleBinds({ ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) }),
        order: [...s.order, ...clones.map((c) => c.id)],
        selection: clones.map((c) => c.id),
        // where these copies came from, so the next ⌘D can measure the same way
        dupTrail: {
          ids: clones.map((c) => c.id),
          from: Object.fromEntries(clones.map((c, i) => [c.id, { x: src[i].x, y: src[i].y }])),
        },
      }))
    )
    return clones.map((c) => c.id)
  },

  rememberDuplicate: (ids, from) => set({ dupTrail: ids.length ? { ids, from } : null }),

  // all four go through edit(), which is what makes ] on the frontmost layer
  // cost nothing: they reorder first and let the comparison notice that the
  // ids came out in the places they were already in
  bringToFront: (ids) => {
    if (!ids.length) return
    get().edit(() =>
      set((s) => ({ order: [...s.order.filter((i) => !ids.includes(i)), ...s.order.filter((i) => ids.includes(i))] }))
    )
  },
  sendToBack: (ids) => {
    if (!ids.length) return
    get().edit(() =>
      set((s) => ({ order: [...s.order.filter((i) => ids.includes(i)), ...s.order.filter((i) => !ids.includes(i))] }))
    )
  },
  bringForward: (ids) => {
    if (!ids.length) return
    get().edit(() => set((s) => ({ order: stepOrder(s.order, ids, 1) })))
  },
  sendBackward: (ids) => {
    if (!ids.length) return
    get().edit(() => set((s) => ({ order: stepOrder(s.order, ids, -1) })))
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
        // history is restored wholesale, so it restores the rule too: whatever
        // the selection was then, it can't hand back something locked now
        selection: selectable(prev.selection, prev.nodes),
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
        selection: selectable(next.order.filter((id) => restored.includes(id)), next.nodes),
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
    nowSeeing(doc?.updatedAt ?? null)
    watchWindow(get)
  },

  // clearing a canvas that is already clear is the emptiest edit there is
  clearCanvas: () => {
    get().edit(() => set({ nodes: {}, order: [], selection: [], editingId: null, croppingId: null }))
  },

  // -- groups ---------------------------------------------------------------

  /**
   * The lock is on the layer, not on the group.
   *
   * `groupIds` is a stamp on a flat document, not a tree, so there is no group
   * object to lock — which settles the question rather neatly: locking one
   * member locks that member, and the group carries on with the rest. Drag it
   * and everything loose comes along while the locked one stays put, which is
   * the whole point of having locked it. Locking a *group* is just locking
   * every member, because clicking any of them selects all of them anyway.
   */
  expandSelection: (ids) => {
    const { nodes, order } = get()
    const gids = new Set<string>()
    for (const id of ids) {
      const g = nodes[id]?.groupIds?.[0]
      if (g) gids.add(g)
    }
    if (!gids.size) return selectable(ids, nodes)
    const out = new Set(ids)
    for (const id of order) {
      const g = nodes[id]?.groupIds?.[0]
      if (g && gids.has(g)) out.add(id)
    }
    return selectable(order.filter((id) => out.has(id)), nodes)
  },

  groupSelected: () => {
    const { selection, nodes, order } = get()
    const ids = order.filter((id) => selection.includes(id) && nodes[id])
    if (ids.length < 2) return
    const gid = nanoid(8)
    get().edit(() => set((s) => {
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
    }))
  },

  ungroupSelected: () => {
    const { selection, nodes } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!sel.length) return
    const gids = new Set(sel.map((n) => n.groupIds?.[0]).filter(Boolean) as string[])

    // nothing grouped? then ⇧⌘G means the other kind of coming apart. Handed
    // over before any checkpoint is taken, so detach owns the whole step
    if (!gids.size) {
      get().detachSelected()
      return
    }

    get().edit(() => set((s) => {
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
      // a locked member comes out of the group with the rest — the group is
      // what's being dissolved, and leaving one node stamped with a group that
      // no longer exists would be worse — but it doesn't come out selected
      return { nodes: map, selection: selectable(freed, map) }
    }))
  },

  detachSelected: () => {
    const { selection, nodes } = get()
    const comps = selection.map((id) => nodes[id]).filter((n) => n?.type === "component") as ComponentNode[]
    if (!comps.length) return
    // an icon-only selection walks the loop below and comes out the other side
    // having done nothing at all; edit() is what stops that being an undo step
    get().edit(() => set((s) => {
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
      // a detached instance is gone as a node, so anything aimed at it lets go.
      // Nothing came apart? then keep the selection — deselecting the icon you
      // asked about would be the only thing that happened
      return { nodes: settleBinds(map), order: ord, selection: picked.length ? picked : s.selection }
    }))
  },

  flipSelected: (axis) => {
    const { selection, nodes } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
    if (!sel.length) return
    const box = unionBox(sel)
    if (!box) return
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of sel) {
      patches[n.id] =
        axis === "x"
          ? { x: box.minX + box.maxX - (n.x + n.w), flipX: !n.flipX }
          : { y: box.minY + box.maxY - (n.y + n.h), flipY: !n.flipY }
    }
    get().edit(() => get().updateNodes(patches))
  },

  toggleTextStyle: (style) => {
    const { selection, nodes } = get()
    const texts = selection.map((id) => nodes[id]).filter((n) => n?.type === "text") as TextNode[]
    if (!texts.length) return
    // mixed selection turns everything on first, like every text editor ever
    const on = texts.some((n) => !n[style])
    get().edit(() =>
      get().updateNodes(Object.fromEntries(texts.map((n) => [n.id, { [style]: on } as Partial<SquigNode>])))
    )
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
    const trimmed = url.trim()
    // ⌘K, look at the address that's already there, press Return: no edit
    get().edit(() =>
      get().updateNodes(
        Object.fromEntries(texts.map((n) => [n.id, { link: trimmed || undefined } as Partial<SquigNode>]))
      )
    )
  },

  // -- clipboard ------------------------------------------------------------

  copySelected: () => {
    const { selection, nodes, order } = get()
    const sel = order.filter((id) => selection.includes(id)).map((id) => nodes[id])
    if (!sel.length) return
    // the nodes as they are, not copies of them — same reason as `snapshot`.
    // Moving the original after a ⌘C builds a new node and leaves this list
    // holding the version that was copied, which is what a copy means; and a
    // paste clones on the way back out regardless, see cloneNodes. Copying
    // here instead would keep a second set of pixels alive for the session for
    // no one's benefit.
    set({ clipboard: sel })
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
    const clones = cloneNodes([...list], dx, dy)
    // same reason as duplicateSelected: what a paste leaves selected is part of
    // the paste, so redo has to hand it back
    get().edit(() =>
      set((s) => ({
        nodes: settleBinds({ ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) }),
        order: [...s.order, ...clones.map((c) => c.id)],
        selection: clones.map((c) => c.id),
      }))
    )
  },

  // -- zoom -----------------------------------------------------------------

  zoomBy: (factor, center) => {
    const v = get().viewport
    const [cx, cy] = center ?? [window.innerWidth / 2, window.innerHeight / 2]
    const zoom = clampGestureZoom(v.zoom, v.zoom * factor)
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
    // a board past the fit floor is one you can't be shown whole. Saying so is
    // the whole point: the old behaviour stopped at 10%, showed two-thirds of
    // the drawing and left you to work out that the rest was still out there
    if (fitBox(set, order.map((id) => nodes[id]).filter(Boolean))) {
      get().setNotice(`this board is bigger than a fit can go — showing it at ${Math.round(FIT_MIN_ZOOM * 100)}%`)
    }
  },

  zoomToSelection: () => {
    const { nodes, selection } = get()
    const sel = selection.map((id) => nodes[id]).filter(Boolean)
    if (!sel.length) return get().zoomToFit()
    fitBox(set, sel)
  },

  /**
   * Bring the selection into view. Selecting something you can't see is how
   * Tab used to work: the inspector said "Login screen" and the canvas didn't
   * move an inch. A viewport move is not a document edit, so — like every
   * zoom action above it — this writes `viewport` straight and stays out of
   * the undo stack.
   */
  revealSelection: () => {
    const { nodes, selection, viewport } = get()
    const box = unionBox(selection.map((id) => nodes[id]).filter(Boolean))
    if (!box) return
    const move = revealViewport(viewport, box, window.innerWidth, window.innerHeight)
    if (move.kind === "hold") return
    // too big to show by panning — that's zoomToSelection's job, and the one
    // case where getting there is allowed to change the zoom you chose
    if (move.kind === "fit") return get().zoomToSelection()
    set({ viewport: move.viewport })
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
    const idMap = new Map<string, string>()
    // document order, so the copies stack the way the originals did
    for (const id of order) {
      if (!selection.includes(id)) continue
      const n = nodes[id]
      if (!n) continue
      const clone = { ...structuredClone(n), id: nanoid(8), seed: freshSeed() }
      idMap.set(n.id, clone.id)
      clones.push(clone)
    }
    if (!clones.length) return []
    // an ⌥-drag of two boxes and their arrow takes a connected copy with it,
    // not a copy still stuck to what it was dragged off — same remap cloneNodes
    // does for a ⌘D, which this deliberately isn't a second version of
    remapBinds(clones, idMap)
    const ids = clones.map((c) => c.id)
    set((s) => {
      stampSelAfter(s.past, ids)
      return {
        nodes: settleBinds({ ...s.nodes, ...Object.fromEntries(clones.map((c) => [c.id, c])) }),
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
    const patches: Record<string, Partial<SquigNode>> = {}
    let cursor = start
    for (const n of sorted) {
      patches[n.id] = axis === "h" ? { x: cursor } : { y: cursor }
      cursor += size(n) + gap
    }
    // evening out gaps that are already even is the align case again
    get().edit(() => get().updateNodes(patches))
  },

  // every one of these builds a selection straight out of `order` rather than
  // going through setSelection, so each has to remember the locked layers on
  // its own. "All" means all the ones you can have.
  selectAll: () => set((s) => ({ selection: selectable(s.order, s.nodes) })),
  selectNone: () => set({ selection: [], croppingId: null }),

  invertSelection: () => {
    set((s) => ({ selection: selectable(s.order.filter((id) => !s.selection.includes(id)), s.nodes) }))
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
      selection: selectable(
        order.filter((id) => {
          const n = nodes[id]
          if (!n) return false
          if (n.type === "component") return kinds.has(n.kind)
          if (n.type === "shape") return shapes.has(n.shape)
          return types.has(n.type)
        }),
        nodes
      ),
    })
  },

  cycleSelection: (dir) => {
    const { order, selection, nodes } = get()
    // Tab walks the layers you can actually have, so a locked one is simply
    // not a stop on the tour — and a board of nothing but locked layers has
    // nowhere to go, which is the empty list below rather than a wrap-around
    // that lands on one anyway
    const ring = selectable(order, nodes)
    if (!ring.length) return
    if (!selection.length) {
      set({ selection: [dir === 1 ? ring[0] : ring[ring.length - 1]] })
      get().revealSelection()
      return
    }
    // step from the frontmost member so repeated Tabs march in one direction
    const anchor = selection[selection.length - 1]
    const i = ring.indexOf(anchor)
    const next = ring[(((i === -1 ? 0 : i) + dir) % ring.length + ring.length) % ring.length]
    set({ selection: [next] })
    // stepping onto something you can't see is the same as not stepping at
    // all. revealSelection holds still when the layer was already on screen,
    // so a walk through a screenful of nodes doesn't lurch on every press
    get().revealSelection()
  },

  alignSelected: (edge) => {
    const { selection, nodes } = get()
    if (selection.length < 2) return
    const sel = selection.map((id) => nodes[id]).filter(Boolean)
    if (sel.length < 2) return
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
    // a selection already flush against that edge writes its own coordinates
    // back onto itself, which edit() reads as the nothing it is
    get().edit(() => get().updateNodes(patches))
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
    // an id nobody has ever written: nothing on disk to be careful about, and
    // whatever another tab did to the file we were on is behind us
    nowSeeing(null)
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
    nowSeeing(doc.updatedAt)
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
    nowSeeing(null)
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
      const clean = sanitize(doc.nodes, doc.order)
      // A file that had layers and lost every one of them is not an empty
      // drawing — it's a document squig can't read. Taking it anyway would
      // trade the canvas you're looking at for a blank one, make that blank
      // the file the drawer reopens, and leave nothing on screen to say why.
      // A genuinely empty export still comes in: it had nothing to lose.
      if (Object.keys(doc.nodes).length && !clean.order.length) return false
      // an opened file joins the drawer as its own document, so importing
      // never writes over whatever was on the canvas
      flushSave(get)
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
      // a fresh id, so this lands as its own document however the last one was
      // getting on with the rest of the browser
      nowSeeing(null)
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
