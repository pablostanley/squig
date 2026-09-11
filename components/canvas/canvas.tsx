"use client"

// ---------------------------------------------------------------------------
// The infinite canvas — pan/zoom, marquee, drag, resize, snap, create tools.
//
// Gesture rules worth knowing before editing this file:
//   · every gesture is anchored in WORLD space, so panning or zooming mid-drag
//     doesn't warp what you're doing
//   · every frame recomputes from the gesture-start snapshot, never from live
//     state, so dragging out and back is lossless
//   · modifiers are re-read continuously, so Shift/Alt can be pressed and let
//     go mid-drag the way they can in Figma
//   · the 3px threshold latches: once a gesture is a drag it stays a drag,
//     even if you come back to where you started
//   · Escape reverts to the gesture's checkpoint instead of leaving half a move
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useSquig } from "@/lib/store"
import type { ArrowNode, SquigNode, TextNode } from "@/lib/types"
import { screenToWorld } from "@/lib/types"
import {
  anchorPair,
  anchorTargetAt,
  arrowEnds,
  bindOf,
  bindPair,
  endsPatch,
  snapsToObjects,
  withTarget,
  type ArrowTarget,
} from "@/lib/canvas/arrow-binding"
import { clampWindow, cropAnchor, cropPatch, cropTarget, imageSheet, panSheet } from "@/lib/canvas/crop"
import {
  autoSizeTextBox,
  autoSizeTextHeight,
  setTextBoxSize,
  setTextHeight,
  setTextWidth,
} from "@/lib/canvas/text-reflow"
import {
  computeSnap,
  computeResizeSnap,
  makeSnapRect,
  type DistanceIndicator,
  type GuideLine,
  type SnapRect,
} from "@/lib/canvas/snap-engine"
import { pinchViewport, type PinchStart, type Pt } from "@/lib/canvas/pinch"
import { useSpacebarPan } from "@/lib/canvas/use-spacebar-pan"
import { useFileDrop } from "@/lib/canvas/use-file-drop"
import { resizeBounds, resizeNodesBy, scaleNodes, type Handle } from "@/lib/canvas/transform"
import { canvasTarget, pickAt, pickInRect, pickSoftAt, type PickOpts } from "@/lib/canvas/hit-test"
import { canvasOwnsKeyboard } from "@/lib/canvas/keyboard-owner"
import { useClipboard } from "@/lib/canvas/use-clipboard"
import { editTarget, hasEditableText, iconControlAt, textControlAt } from "@/lib/canvas/edit-target"
import { textBlockHeight } from "@/lib/sketch/text-layout"
import { unionBounds, type Bounds } from "@/lib/selection"
import { NodeSketch, SketchPrims } from "./sketch"
import { getDef, renderComponent } from "@/lib/library/registry"
import { exportDoc } from "@/lib/file-io"
import { copyAsPngWithNotice } from "@/lib/export-image"
import { clampGestureZoom, zoomFloor, MAX_ZOOM, MIN_ZOOM } from "@/lib/canvas/navigate"
import { inViewBox, visibleBox } from "@/lib/canvas/cull"
import { groupPickForHit, selectionForPress, stepIntoGroup, type GroupPick } from "@/lib/canvas/groups"
import { ContextRow } from "./context-row"
import { CropOverlay, CropStage } from "./crop-overlay"
import { EmptyCanvas } from "./empty-canvas"
import { AnchorZones, SelectionOverlay, SmartGuides } from "./selection-overlay"
import { TextEditOverlay } from "./text-edit-overlay"
import { nodeVisualBounds, type RouteHandle } from "@/lib/canvas/line-routing"
import { normalizeRotation, orientResize, rotateNodes, rotatePoint, rotationDelta, unrotatePoint } from "@/lib/canvas/rotation"
import { resizeCursor, ROTATE_CURSOR } from "@/lib/canvas/handles"
import { SMALL_NUDGE } from "@/lib/nudge"
import { constrainMoveTo45, constrainSnapToDirection, type DragDirection } from "@/lib/canvas/move"

/**
 * A gesture's zoom floor is not a constant: ⇧1 is allowed below MIN_ZOOM to
 * show a board that big, and once you're down there the next scroll up has to
 * pick up from where you are rather than snapping back to 10% — see
 * lib/canvas/navigate.
 */
const zoomRange = (zoom: number) => ({ min: zoomFloor(zoom), max: MAX_ZOOM })
const SNAP_THRESHOLD = 6
/** Once caught, keep the relationship through a slightly wider exit zone. */
const SNAP_RELEASE_THRESHOLD = 9
/** screen px of travel before a press stops being a click */
const DRAG_THRESHOLD = 3
/** how close to the viewport edge a drag has to get before the canvas follows */
const AUTOPAN_EDGE = 40
const AUTOPAN_MAX_SPEED = 22

interface Mods {
  shift: boolean
  alt: boolean
  /** the "add this to what I've already got" key */
  toggle: boolean
}

const NO_MODS: Mods = { shift: false, alt: false, toggle: false }

type ModSource = { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }

/**
 * Cmd and Ctrl both toggle selection.
 *
 * On macOS this is a deliberate divergence from Figma, where Ctrl+click is the
 * OS right-click: it was asked for explicitly, and a two-finger tap or a real
 * right-click still opens the context menu, so nothing is actually lost.
 */
function readMods(e: ModSource): Mods {
  return { shift: e.shiftKey, alt: e.altKey, toggle: e.metaKey || e.ctrlKey }
}

/** Shift or the toggle key turn the marquee into a symmetric difference. */
type MarqueeMode = "replace" | "xor"
const marqueeMode = (m: Mods): MarqueeMode => (m.shift || m.toggle ? "xor" : "replace")

export type Gesture =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; pointerId: number; exceeded: boolean }
  | {
      /**
       * Two fingers on the paper — pan and zoom at once, the way every map
       * works. It's the only gesture that rides two pointers and the only one
       * that touches no node at all, so it skips the world-anchored machinery
       * every other gesture shares and writes the viewport straight from the
       * finger positions (lib/canvas/pinch).
       *
       * `pointerId` is the first finger, which keeps everything the other
       * gestures do with a single id — pointer capture, the release listener —
       * working unchanged; `idB` is the second, and both have to be watched
       * because either one lifting ends the pinch.
       */
      kind: "pinch"
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      idB: number
      /** the snapshot every frame is computed from, never the frame before */
      start: PinchStart
      /** where those same two fingers are now, canvas-local px */
      a: Pt
      b: Pt
    }
  | {
      kind: "move"
      /** world anchor */
      wx: number
      wy: number
      /** screen anchor, for the drag threshold only */
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      /** the nodes the gesture started on, in document order */
      sourceIds: string[]
      /** the nested group those leaves represent, when they are one group */
      sourceGroupId: string | null
      /** positions at gesture start, keyed by source id */
      sourcePos: Record<string, { x: number; y: number }>
      /** visual boxes at gesture start — routed arrows can extend past x/y/w/h */
      sourceBounds: Record<string, Bounds>
      /** ids of the alt-drag copies, while alt is held */
      cloneIds: string[] | null
      /** whether a checkpoint has been taken for this gesture */
      dirty: boolean
      /** snapped visual-box origins in world units; the wider release zone
       *  keeps a caught relationship from flickering at its boundary */
      snapLock: { x: number | null; y: number | null }
      /** set when the press landed inside a bigger selection: a click with no
       *  drag narrows to exactly this set. Carries the set rather than the id
       *  because ⌘-click means "just this piece" while a plain click means
       *  "this piece's whole group". */
      clickSelection: GroupPick | null
    }
  | {
      kind: "marquee"
      wx: number
      wy: number
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      base: string[]
      baseGroupId: string | null
      /** the hollow shape whose middle the press landed in, if any. A press
       *  there reads two ways — a click means "select this shape", a drag
       *  means "marquee, it just happened to start inside" — so the candidate
       *  rides along and the release picks the reading. */
      softHitId: string | null
    }
  | { kind: "draw"; points: [number, number][]; sx: number; sy: number; pointerId: number; exceeded: boolean }
  | {
      kind: "create"
      wx: number
      wy: number
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      id: string | null
      what: "shape" | "arrow"
      /** the node the press landed on, if any — an arrow started on a box is
       *  attached to it from its very first frame */
      tailTarget: ArrowTarget | null
      /** and the one under the pointer right now, which the head takes on release */
      headTarget: ArrowTarget | null
    }
  | {
      /**
       * One end of a lone arrow, in hand. Arrows are the one node whose box
       * isn't something you set — the two ends are — so this replaces the
       * eight resize handles rather than joining them.
       */
      kind: "endpoint"
      wx: number
      wy: number
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      id: string
      /** 0 is the tail, 1 the head */
      end: 0 | 1
      /** the arrow at gesture start — every frame recomputes from it */
      orig: ArrowNode
      dirty: boolean
    }
  | {
      /** The bend/midpoint of one routed connector. */
      kind: "route"
      wx: number
      wy: number
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      id: string
      style: "elbow" | "curved"
      /** Elbows move on one axis and may switch a collapsed straight run into
       *  a dogleg on that axis. Curves use both axes. */
      axis?: "x" | "y"
      routeAxis?: "x" | "y"
      origOffset: [number, number]
      flipX: boolean
      flipY: boolean
      dirty: boolean
    }
  | {
      kind: "rotate"
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      center: [number, number]
      startAngle: number
      initialRotation: number
      origNodes: SquigNode[]
      dirty: boolean
    }
  | {
      kind: "resize"
      handle: Handle
      wx: number
      wy: number
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      ids: string[]
      origNodes: SquigNode[]
      origBounds: Bounds
      dirty: boolean
    }
  | {
      kind: "crop"
      /** a handle moves the window; "pan" slides the picture under it */
      handle: Handle | "pan"
      wx: number
      wy: number
      sx: number
      sy: number
      pointerId: number
      exceeded: boolean
      id: string
      /** the box at gesture start */
      origWin: Bounds
      rotation: number
      /** where the whole picture lay at gesture start — see lib/canvas/crop */
      origSheet: Bounds
      /**
       * which way round the picture prints. Every rectangle above is world
       * space and needs no help from these; the crop the gesture writes is in
       * the file's own pixels, and those run backwards on a flipped axis.
       */
      flipX: boolean
      flipY: boolean
      dirty: boolean
    }

const inRect = (b: Bounds, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h

/** Every pointer a gesture is riding on. Only a pinch has more than one. */
const gesturePointers = (g: Gesture): number[] => (g.kind === "pinch" ? [g.pointerId, g.idB] : [g.pointerId])

const canAutoPan = (g: Gesture | null) =>
  !!g &&
  (g.kind === "marquee" ||
    g.kind === "move" ||
    g.kind === "resize" ||
    g.kind === "route" ||
    g.kind === "create" ||
    // the box you want to attach to is often the one just off the edge
    g.kind === "endpoint")

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const gestureAbort = useRef<AbortController | null>(null)
  const nudgeRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    sel: string
    kind: "move" | "resize"
    top: unknown
  }>({
    timer: null,
    sel: "",
    kind: "move",
    top: null,
  })
  const modsRef = useRef<Mods>(NO_MODS)
  /**
   * Every finger currently on the canvas, in the order they landed, at the
   * position they landed. The second entry is what starts a pinch, so this
   * has to be kept whether or not a gesture is running.
   */
  const touchesRef = useRef<Map<number, Pt>>(new Map())
  const lastPointRef = useRef<{ clientX: number; clientY: number } | null>(null)
  /**
   * Double-press bookkeeping for the side handles. A DOM dblclick can't carry
   * this: the first press starts (and empties out) a resize gesture, which
   * remounts every handle, so the browser sees two different targets and
   * delivers the dblclick to the canvas underneath — which would edit the
   * layer, or worse, plant a new one. So the second press is caught in
   * startResize, before it becomes a gesture at all.
   */
  const lastHandlePress = useRef<{ handle: Handle; t: number; selection: string } | null>(null)
  const swallowDblClickUntil = useRef(0)
  const autoPanRef = useRef<number | null>(null)
  const autoPanTickRef = useRef<() => void>(() => {})
  const hoverRafRef = useRef<number | null>(null)
  /** last world position of the pointer — ⌘V pastes here */
  const pointerWorld = useRef<[number, number] | null>(null)

  const nodes = useSquig((s) => s.nodes)
  const order = useSquig((s) => s.order)
  const selection = useSquig((s) => s.selection)
  const viewport = useSquig((s) => s.viewport)
  const tool = useSquig((s) => s.tool)
  const grid = useSquig((s) => s.grid)

  const placing = useSquig((s) => s.placing)
  const placingDrag = useSquig((s) => s.placingDrag)
  const editingId = useSquig((s) => s.editingId)
  const croppingId = useSquig((s) => s.croppingId)

  // where the words being edited actually sit — the editor stands there, and
  // the renderer leaves that one run out so they don't print on top of it
  const editingNode = editingId ? nodes[editingId] : null
  /**
   * Which of a component's labels the double-click aimed at, and on which
   * layer. The press is the only thing that knows where the pointer landed,
   * and the editor is built here from the store's editingId, so the aim waits
   * in between. It carries the layer's id so a stale aim can't attach itself
   * to the next edit — Return on a selected layer clears it, and every other
   * way in never sets one, so both open on the first control as before.
   */
  const [aim, setAim] = useState<{ id: string; key: string } | null>(null)
  const editing = useMemo(() => {
    if (!editingNode) return null
    return editTarget(editingNode, aim?.id === editingNode.id ? aim.key : undefined)
  }, [editingNode, aim])

  /** marquee box in WORLD units — screen conversion happens at render time */
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const [guides, setGuides] = useState<GuideLine[]>([])
  const [snapDistances, setSnapDistances] = useState<DistanceIndicator[]>([])
  const [gestureCursor, setGestureCursor] = useState<string | null>(null)
  const [rotationFrame, setRotationFrame] = useState<Bounds | undefined>(undefined)
  const [rotationLabel, setRotationLabel] = useState<number | null>(null)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [livePoints, setLivePoints] = useState<[number, number][] | null>(null)
  /** Soft hover: Shift inside an unselected outline offers marquee selection. */
  const [hover, setHover] = useState<{ id: string; soft: boolean; locked: boolean } | null>(null)
  /** the node an arrow end would attach to if it were let go right now */
  const [bindHint, setBindHint] = useState<ArrowTarget | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [gestureKind, setGestureKind] = useState<Gesture["kind"] | null>(null)
  /**
   * How big the stage is, in screen px — what the culling measures against.
   * Zero until the observer has read it, which lib/canvas/cull reads as
   * "draw everything", so the first frame is never blank.
   */
  const [stage, setStage] = useState({ w: 0, h: 0 })
  /** the canvas has the keyboard, and arrived by keyboard — see the ring */
  const [ring, setRing] = useState(false)
  /**
   * Escape has handed Tab back to the browser.
   *
   * The canvas keeps DOM focus — every other shortcut still works — but the
   * next Tab is allowed through instead of cycling the selection, which is
   * the whole of how a keyboard user gets back out to the chrome. Blurring
   * instead would be worse than useless: the canvas is the first thing in the
   * document, so a Tab from nowhere lands straight back on it.
   */
  const tabReleased = useRef(false)

  const { isSpacebarHeld } = useSpacebarPan()
  // ⌘C/⌘X/⌘V live on the browser's clipboard events, not in onKey below
  useClipboard(pointerWorld)
  // a picture dragged in off the desktop — HTML5 drag and drop, which shares
  // nothing with the pointer gestures above, including the library's drag-out
  const dropping = useFileDrop(containerRef)

  const st = useSquig.getState

  // -- coordinate helpers ---------------------------------------------------

  const toLocal = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const r = containerRef.current?.getBoundingClientRect()
    return r ? [e.clientX - r.left, e.clientY - r.top] : [e.clientX, e.clientY]
  }, [])

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): [number, number] => {
      const [sx, sy] = toLocal(e)
      return screenToWorld(st().viewport, sx, sy)
    },
    [toLocal, st]
  )

  const pick = useCallback(
    (e: { clientX: number; clientY: number }, opts?: PickOpts): string | null => {
      const s = st()
      const [wx, wy] = toWorld(e)
      // ink and fills first; failing that, the hollow shape the point is
      // inside of — double-click, right-click and hover all read a point the
      // way a completed click does
      return (
        pickAt(s.nodes, s.order, wx, wy, s.viewport.zoom, opts) ?? pickSoftAt(s.nodes, s.order, wx, wy, opts)
      )
    },
    [st, toWorld]
  )

  // -- library placement ----------------------------------------------------

  /** drop a pending library item centred on a world point */
  const dropComponent = useCallback(
    (kind: string, wx: number, wy: number) => {
      const def = getDef(kind)
      if (!def) return
      st().addNode({
        type: "component",
        kind: def.kind,
        props: { ...def.defaults },
        x: wx - def.size.w / 2,
        y: wy - def.size.h / 2,
        w: def.size.w,
        h: def.size.h,
      } as Omit<SquigNode, "id" | "seed">)
    },
    [st]
  )

  // -- how much glass there is ----------------------------------------------

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    read()
    // observed rather than taken from the window: the canvas is inset-0 today,
    // but the culling would go quietly wrong the day it isn't, and a wrong
    // culling rectangle is a node that isn't there rather than a layout nit
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // -- wheel: pan / pinch-zoom ---------------------------------------------

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = st().viewport
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const [sx, sy] = [e.clientX - r.left, e.clientY - r.top]
        const factor = Math.exp(-e.deltaY * 0.01)
        const zoom = clampGestureZoom(v.zoom, v.zoom * factor)
        const scale = zoom / v.zoom
        st().setViewport({ zoom, x: sx - (sx - v.x) * scale, y: sy - (sy - v.y) * scale })
      } else {
        st().setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [st])

  // -- touch: keeping the tally, and keeping Safari out of it ---------------

  useEffect(() => {
    // Fingers come off anywhere — over the inspector, past the edge of the
    // screen — so the tally is kept at the window rather than on the canvas.
    // Miss one and it stays counted forever, which reads as a third finger
    // and quietly stops pinching from ever starting again.
    const drop = (e: PointerEvent) => {
      if (e.pointerType === "touch") touchesRef.current.delete(e.pointerId)
    }
    window.addEventListener("pointerup", drop)
    window.addEventListener("pointercancel", drop)
    return () => {
      window.removeEventListener("pointerup", drop)
      window.removeEventListener("pointercancel", drop)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Safari on iOS runs its own two-finger zoom of the whole page and
    // announces it through these non-standard events. Left alone, a pinch on
    // the canvas would scale the document out from under the drawing instead
    // of zooming it. No other engine fires them, so this costs nothing else.
    const swallow = (e: Event) => e.preventDefault()
    const kinds = ["gesturestart", "gesturechange", "gestureend"]
    for (const k of kinds) el.addEventListener(k, swallow)
    return () => {
      for (const k of kinds) el.removeEventListener(k, swallow)
    }
  }, [])

  // -- snapping -------------------------------------------------------------

  const collectCandidates = useCallback(
    (excludeIds: readonly string[]): SnapRect[] => {
      const { nodes: all, order: ord, viewport: v } = st()
      const skip = new Set(excludeIds)
      const out: SnapRect[] = []
      for (const id of ord) {
        if (skip.has(id)) continue
        const n = all[id]
        if (!n) continue
        const b = nodeVisualBounds(n)
        out.push(makeSnapRect(id, b.x * v.zoom + v.x, b.y * v.zoom + v.y, b.w * v.zoom, b.h * v.zoom))
      }
      return out
    },
    [st]
  )

  // -- the gesture update, driven by pointer moves AND by auto-pan ticks -----

  const updateGesture = useCallback(
    (clientX: number, clientY: number) => {
      const g = gestureRef.current
      if (!g) return
      const s = st()
      const v = s.viewport
      const mods = modsRef.current
      const [lx, ly] = toLocal({ clientX, clientY })
      const [wx, wy] = screenToWorld(v, lx, ly)

      // once a press has travelled far enough it is a drag for good — measured
      // radially, so a diagonal wiggle isn't held to a longer leash
      if (!g.exceeded && Math.hypot(clientX - g.sx, clientY - g.sy) >= DRAG_THRESHOLD) {
        g.exceeded = true
        // hands are now on the geometry: chrome that floats over the canvas
        // (the file name) gets out of the way until the drag ends. Pan and
        // marquee leave every layer where it is, so they don't count.
        if (g.kind !== "pan" && g.kind !== "marquee") s.setTransforming(true)
      }

      if (g.kind === "pan") {
        s.setViewport({ ...v, x: g.ox + (clientX - g.sx), y: g.oy + (clientY - g.sy) })
        return
      }

      if (g.kind === "marquee") {
        // while a hollow-shape candidate is in play the press hasn't chosen a
        // meaning yet, so the selection holds still: a click will take the
        // shape on release, and a real drag lands in the branch below
        if (!g.exceeded) return
        const box: Bounds = {
          x: Math.min(g.wx, wx),
          y: Math.min(g.wy, wy),
          w: Math.abs(wx - g.wx),
          h: Math.abs(wy - g.wy),
        }
        setMarquee(g.exceeded ? box : null)
        // grazing one member of a group takes the whole group
        const hits = s.expandSelection(pickInRect(s.nodes, s.order, box, v.zoom))
        if (marqueeMode(mods) === "replace") {
          s.setSelection(hits)
        } else {
          // symmetric difference against the selection we started from, so
          // sweeping back and forth adds and removes the same things
          const hitSet = new Set(hits)
          const baseSet = new Set(g.base)
          s.setSelection([
            ...g.base.filter((id) => !hitSet.has(id)),
            ...hits.filter((id) => !baseSet.has(id)),
          ])
        }
        return
      }

      if (g.kind === "move") {
        if (!g.exceeded) return
        if (!g.dirty) {
          s.checkpoint()
          g.dirty = true
          // a real drag means this was never a click, so nothing collapses
          g.clickSelection = null
        }

        // alt engages and disengages drag-a-copy, live, mid-gesture
        if (mods.alt && !g.cloneIds) {
          st().setSelection(g.sourceIds, g.sourceGroupId)
          // put the sources back first so the copies land exactly on them
          st().updateNodes(Object.fromEntries(g.sourceIds.map((id) => [id, { ...g.sourcePos[id] }])))
          const ids = st().cloneSelectionInPlace()
          if (ids.length === g.sourceIds.length) g.cloneIds = ids
        } else if (!mods.alt && g.cloneIds) {
          st().removeNodes(g.cloneIds, { checkpoint: false })
          st().setSelection(g.sourceIds, g.sourceGroupId)
          g.cloneIds = null
        }

        const live = st()
        const ids = g.cloneIds ?? g.sourceIds
        // sourceIds and cloneSelectionInPlace are both in document order, so
        // index i refers to the same original either way
        const startPos = (i: number) => g.sourcePos[g.sourceIds[i]]

        let dx = wx - g.wx
        let dy = wy - g.wy
        let lockedDirection: DragDirection | null = null
        if (mods.shift) {
          // Eight-way lock: horizontal, vertical, or either 45-degree diagonal.
          // Recompute from the gesture origin so releasing Shift returns to
          // the pointer without accumulated drift.
          const constrained = constrainMoveTo45(dx, dy)
          dx = constrained.dx
          dy = constrained.dy
          lockedDirection = constrained.direction
        }

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (let i = 0; i < ids.length; i++) {
          const n = live.nodes[ids[i]]
          const o = startPos(i)
          const b = g.sourceBounds[g.sourceIds[i]]
          if (!n || !o || !b) continue
          if (b.x + dx < minX) minX = b.x + dx
          if (b.y + dy < minY) minY = b.y + dy
          if (b.x + dx + b.w > maxX) maxX = b.x + dx + b.w
          if (b.y + dy + b.h > maxY) maxY = b.y + dy + b.h
        }
        if (!Number.isFinite(minX)) return

        // the toggle key is the escape hatch from a magnetised board
        let sdx = 0
        let sdy = 0
        if (!mods.toggle) {
          const candidates = collectCandidates(ids)
          const rawLeft = minX * v.zoom + v.x
          const rawTop = minY * v.zoom + v.y
          // A directional move must stay on its projected line, so do not
          // reuse independent per-axis locks captured by a free move.
          if (lockedDirection) {
            g.snapLock.x = null
            g.snapLock.y = null
          }
          let holdX =
            lockedDirection === null &&
            g.snapLock.x !== null &&
            Math.abs((minX - g.snapLock.x) * v.zoom) <= SNAP_RELEASE_THRESHOLD
          let holdY =
            lockedDirection === null &&
            g.snapLock.y !== null &&
            Math.abs((minY - g.snapLock.y) * v.zoom) <= SNAP_RELEASE_THRESHOLD

          const probe = () => makeSnapRect(
            "__drag__",
            holdX && g.snapLock.x !== null ? g.snapLock.x * v.zoom + v.x : rawLeft,
            holdY && g.snapLock.y !== null ? g.snapLock.y * v.zoom + v.y : rawTop,
            (maxX - minX) * v.zoom,
            (maxY - minY) * v.zoom
          )
          let snap = computeSnap(probe(), candidates, SNAP_THRESHOLD, undefined, v.zoom)
          const hasFeedback = (axis: "x" | "y") =>
            snap.guides.some((guide) => guide.axis === axis) || snap.distances.some((distance) => distance.axis === axis)

          // A lock normally recomputes as an exact zero-delta snap. If its
          // target disappeared as another relationship changed, drop only
          // that axis and give the raw pointer position a fresh chance.
          if ((holdX && !hasFeedback("x")) || (holdY && !hasFeedback("y"))) {
            if (holdX && !hasFeedback("x")) {
              holdX = false
              g.snapLock.x = null
            }
            if (holdY && !hasFeedback("y")) {
              holdY = false
              g.snapLock.y = null
            }
            snap = computeSnap(probe(), candidates, SNAP_THRESHOLD, undefined, v.zoom)
          }

          if (lockedDirection) {
            // A guide or equal-gap target may move a constrained drag, but
            // only along its locked line. Independent x/y corrections would
            // turn an exact 45-degree move into an almost-diagonal one.
            const constrainedSnap = constrainSnapToDirection(lockedDirection, snap, {
              x: hasFeedback("x"),
              y: hasFeedback("y"),
            })
            sdx = constrainedSnap.dx
            sdy = constrainedSnap.dy
            setGuides(
              snap.guides.filter((guide) => (guide.axis === "x" ? constrainedSnap.useX : constrainedSnap.useY))
            )
            setSnapDistances(
              snap.distances.filter((distance) =>
                distance.axis === "x" ? constrainedSnap.useX : constrainedSnap.useY
              )
            )
          } else {
            sdx = holdX && g.snapLock.x !== null
              ? (g.snapLock.x - minX) * v.zoom
              : snap.dx
            sdy = holdY && g.snapLock.y !== null
              ? (g.snapLock.y - minY) * v.zoom
              : snap.dy

            g.snapLock.x = holdX
              ? g.snapLock.x
              : hasFeedback("x")
                ? minX + snap.dx / v.zoom
                : null
            g.snapLock.y = holdY
              ? g.snapLock.y
              : hasFeedback("y")
                ? minY + snap.dy / v.zoom
                : null
            setGuides(snap.guides)
            setSnapDistances(snap.distances)
          }
        } else {
          g.snapLock.x = null
          g.snapLock.y = null
          setGuides([])
          setSnapDistances([])
        }

        const patches: Record<string, Partial<SquigNode>> = {}
        for (let i = 0; i < ids.length; i++) {
          const o = startPos(i)
          if (!o) continue
          patches[ids[i]] = { x: o.x + dx + sdx / v.zoom, y: o.y + dy + sdy / v.zoom }
        }
        live.updateNodes(patches)
        return
      }

      if (g.kind === "endpoint") {
        if (!g.dirty) {
          if (!g.exceeded) return
          s.checkpoint()
          g.dirty = true
        }
        const bind = bindOf(g.orig)
        const other = g.end === 0 ? bind[1] : bind[0]
        // Whatever the far end is already holding is off the table. Self-loop
        // attachment needs its own anchor semantics; a route style alone does
        // not make two ends on one box unambiguous.
        const target = snapsToObjects(g.orig)
          ? anchorTargetAt(s.nodes, s.order, wx, wy, v.zoom, [g.id, other])
          : null
        setBindHint(target)

        // The end in hand goes exactly where the pointer is. If that's over a
        // box, the store routes it to the box's edge on the way through — so
        // what you're looking at mid-drag is already the arrow you'd get by
        // letting go, rather than a preview of one.
        const ends = arrowEnds(g.orig)
        ends[g.end] = [wx, wy]
        s.updateNodes({
          [g.id]: { ...endsPatch(ends[0], ends[1]), ...withTarget(g.orig, g.end, target) } as Partial<SquigNode>,
        })
        return
      }

      if (g.kind === "route") {
        if (!g.dirty) {
          if (!g.exceeded) return
          s.checkpoint()
          g.dirty = true
        }
        const dx = (wx - g.wx) * (g.flipX ? -1 : 1)
        const dy = (wy - g.wy) * (g.flipY ? -1 : 1)
        if (g.style === "curved") {
          s.updateNodes({
            [g.id]: { curveBend: [g.origOffset[0] + dx, g.origOffset[1] + dy] } as Partial<SquigNode>,
          })
        } else {
          const offset: [number, number] = [...g.origOffset]
          if (g.axis === "x") offset[0] += dx
          else offset[1] += dy
          s.updateNodes({
            [g.id]: { elbowAxis: g.routeAxis, elbowOffset: offset } as Partial<SquigNode>,
          })
        }
        return
      }

      if (g.kind === "rotate") {
        if (!g.exceeded) return
        if (!g.dirty) { s.checkpoint(); g.dirty = true }
        const current = Math.atan2(g.center[1] - wy, wx - g.center[0]) * 180 / Math.PI
        const delta = rotationDelta(g.startAngle, current, g.initialRotation, mods.shift)
        s.updateNodes(rotateNodes(g.origNodes, g.center, delta))
        setRotationLabel(normalizeRotation(g.initialRotation + delta))
        return
      }

      if (g.kind === "resize") {
        if (!g.dirty) {
          if (!g.exceeded) return
          s.checkpoint()
          g.dirty = true
        }
        const solo = g.origNodes.length === 1 ? g.origNodes[0] : null
        const rotation = solo?.rotation ?? 0
        const [dx, dy] = rotatePoint(wx - g.wx, wy - g.wy, 0, 0, -rotation)
        const applyResize = (patches: Record<string, Partial<SquigNode>>) => {
          if (solo) patches[solo.id] = orientResize(solo, patches[solo.id])
          s.updateNodes(patches)
        }

        // One text layer alone resizes like a text container. Side handles own
        // one box axis without touching the font. Corners own both axes; Shift
        // locks the box ratio, while the glyphs themselves always keep theirs.
        const soloText = g.origNodes.length === 1 && g.origNodes[0].type === "text" ? (g.origNodes[0] as TextNode) : null
        const lockAspect = (mods.shift && (!soloText || g.handle.length === 2)) ||
          (!solo && g.origNodes.some((n) => !!n.rotation))

        const raw = resizeBounds(g.origBounds, g.handle, dx, dy, { aspect: lockAspect, fromCenter: mods.alt })
        let next = raw

        if (!mods.toggle && !lockAspect && !rotation) {
          // measure the snap on the unsnapped box, then fold the correction
          // back through the same resize so the result stays self-consistent
          const rectS = makeSnapRect("__bbox__", raw.x * v.zoom + v.x, raw.y * v.zoom + v.y, raw.w * v.zoom, raw.h * v.zoom)
          const snap = computeResizeSnap(rectS, g.handle, collectCandidates(g.ids), SNAP_THRESHOLD)
          setGuides(snap.guides)
          setSnapDistances([])
          next = resizeBounds(g.origBounds, g.handle, dx + snap.dx / v.zoom, dy + snap.dy / v.zoom, {
            aspect: false,
            fromCenter: mods.alt,
          })
        } else {
          // snapping an edge would break the ratio, so aspect lock wins
          setGuides([])
          setSnapDistances([])
        }

        if (soloText && (g.handle === "e" || g.handle === "w")) {
          // wrap-width drag. The clamp can refuse the last few pixels of a
          // squeeze, so the box is re-anchored on whichever edge the gesture
          // holds still — otherwise the far edge walks as the clamp bites.
          const patch = setTextWidth(soloText, next.w)
          const w = patch.w as number
          const x = mods.alt
            ? next.x + next.w / 2 - w / 2
            : g.handle === "w"
              ? next.x + next.w - w
              : next.x
          applyResize({ [soloText.id]: { ...patch, x } as Partial<SquigNode> })
          return
        }

        if (soloText && (g.handle === "n" || g.handle === "s")) {
          // Height drag. Like the width branch above, a content clamp may make
          // the final box larger than the pointer's raw box, so re-anchor it on
          // the edge the gesture promised would stay put.
          const patch = setTextHeight(soloText, next.h)
          const h = patch.h as number
          const y = mods.alt
            ? next.y + next.h / 2 - h / 2
            : g.handle === "n"
              ? next.y + next.h - h
              : next.y
          applyResize({ [soloText.id]: { ...patch, y } as Partial<SquigNode> })
          return
        }

        if (soloText && g.handle.length === 2 && !lockAspect) {
          // A free corner uses vertical movement as the one scalar for type;
          // width is independent and reflows the words. That keeps every glyph
          // proportional without secretly locking the outer box.
          const sy = g.origBounds.h > 1e-6 ? next.h / g.origBounds.h : 1
          const patch = setTextBoxSize(soloText, next.w, next.h, Math.max(4, soloText.fontSize * sy))
          const w = patch.w as number
          const h = patch.h as number
          const x = mods.alt
            ? next.x + next.w / 2 - w / 2
            : g.handle.includes("w")
              ? next.x + next.w - w
              : next.x
          const y = mods.alt
            ? next.y + next.h / 2 - h / 2
            : g.handle.includes("n")
              ? next.y + next.h - h
              : next.y
          applyResize({ [soloText.id]: { ...patch, x, y } as Partial<SquigNode> })
          return
        }

        applyResize(scaleNodes(g.origNodes, g.origBounds, next))
        return
      }

      if (g.kind === "crop") {
        if (!g.dirty) {
          if (!g.exceeded) return
          s.checkpoint()
          g.dirty = true
        }
        const [dx, dy] = rotatePoint(wx - g.wx, wy - g.wy, 0, 0, -g.rotation)

        // Sliding the picture: the window is pinned and the sheet moves under
        // it, stopping when the picture's own edge would come inside the box.
        if (g.handle === "pan") {
          s.updateNodes({
            [g.id]: cropPatch(g.origWin, panSheet(g.origSheet, g.origWin, dx, dy), g.flipX, g.flipY) as Partial<SquigNode>,
          })
          return
        }

        // Dragging a handle: the sheet is pinned and the window moves over it,
        // so the pixels you're keeping hold still at the size they already are
        // — the mat slides, the photo doesn't. No snapping to other nodes here:
        // the only edges that mean anything are the picture's own, and those
        // are the clamp.
        const aspect = mods.shift
        const raw = resizeBounds(g.origWin, g.handle, dx, dy, { aspect, fromCenter: mods.alt })
        const win = clampWindow(raw, g.origSheet, aspect ? cropAnchor(g.handle, g.origWin, mods.alt) : undefined)
        s.updateNodes({ [g.id]: orientResize({ ...g.origWin, rotation: g.rotation },
          cropPatch(win, g.origSheet, g.flipX, g.flipY) as Partial<SquigNode>) })
        return
      }

      if (g.kind === "draw") {
        g.points.push([wx, wy])
        setLivePoints([...g.points])
        return
      }

      if (g.kind === "create") {
        let x = Math.min(g.wx, wx)
        let y = Math.min(g.wy, wy)
        let w = Math.abs(wx - g.wx)
        let h = Math.abs(wy - g.wy)
        if (mods.shift && g.what === "shape") {
          const side = Math.max(w, h)
          x = wx < g.wx ? g.wx - side : g.wx
          y = wy < g.wy ? g.wy - side : g.wy
          w = side
          h = side
        }
        // aim as you draw: the box under the pointer lights up and takes the
        // head the moment you let go. The tail was decided on pointer down.
        if (g.what === "arrow" && g.exceeded) {
          g.headTarget = anchorTargetAt(s.nodes, s.order, wx, wy, v.zoom, [g.id, g.tailTarget?.id])
          setBindHint(g.headTarget)
        }
        if (!g.id) {
          if (!g.exceeded) return
          if (g.what === "shape") {
            g.id = s.addNode(
              { type: "shape", shape: s.shapeKind, fill: "none", x, y, w: Math.max(w, 8), h: Math.max(h, 8) } as Omit<
                SquigNode,
                "id" | "seed"
              >,
              { select: false }
            )
          } else {
            g.id = s.addNode(
              {
                type: "arrow",
                head: true,
                x,
                y,
                w: Math.max(w, 8),
                h: Math.max(h, 8),
                points: [
                  [0, 0],
                  [Math.max(w, 8), Math.max(h, 8)],
                ],
                bind: bindPair(g.tailTarget?.id ?? null, g.headTarget?.id ?? null),
                anchors: anchorPair(g.tailTarget?.anchor ?? null, g.headTarget?.anchor ?? null),
              } as Omit<SquigNode, "id" | "seed">,
              { select: false }
            )
          }
          return
        }
        if (g.what === "arrow") {
          // keep true start/end so the arrow points the way you dragged
          const pts: [[number, number], [number, number]] = [
            [g.wx - x, g.wy - y],
            [wx - x, wy - y],
          ]
          s.updateNode(g.id, {
            x,
            y,
            w: Math.max(w, 2),
            h: Math.max(h, 2),
            points: pts,
            bind: bindPair(g.tailTarget?.id ?? null, g.headTarget?.id ?? null),
            anchors: anchorPair(g.tailTarget?.anchor ?? null, g.headTarget?.anchor ?? null),
          } as Partial<SquigNode>)
        } else {
          s.updateNode(g.id, { x, y, w: Math.max(w, 2), h: Math.max(h, 2) })
        }
      }
    },
    [st, toLocal, collectCandidates]
  )

  // -- edge auto-pan --------------------------------------------------------

  const stopAutoPan = useCallback(() => {
    if (autoPanRef.current !== null) {
      cancelAnimationFrame(autoPanRef.current)
      autoPanRef.current = null
    }
  }, [])

  const autoPanTick = useCallback(() => {
    autoPanRef.current = null
    const g = gestureRef.current
    const pt = lastPointRef.current
    const el = containerRef.current
    // only auto-pan for a drag that has actually left the starting point
    if (!canAutoPan(g) || !g?.exceeded || !pt || !el) return

    const r = el.getBoundingClientRect()
    const lx = pt.clientX - r.left
    const ly = pt.clientY - r.top
    const speed = (dist: number) =>
      dist >= AUTOPAN_EDGE ? 0 : Math.min(AUTOPAN_MAX_SPEED, ((AUTOPAN_EDGE - dist) / AUTOPAN_EDGE) * AUTOPAN_MAX_SPEED)

    const vx = speed(lx) - speed(r.width - lx)
    const vy = speed(ly) - speed(r.height - ly)

    if (vx !== 0 || vy !== 0) {
      const v = st().viewport
      st().setViewport({ ...v, x: v.x + vx, y: v.y + vy })
      // re-run the gesture so a parked pointer keeps selecting/dragging
      updateGesture(pt.clientX, pt.clientY)
      autoPanRef.current = requestAnimationFrame(() => autoPanTickRef.current())
    }
  }, [st, updateGesture])

  useEffect(() => {
    autoPanTickRef.current = autoPanTick
  }, [autoPanTick])

  const maybeAutoPan = useCallback(() => {
    if (autoPanRef.current !== null) return
    const g = gestureRef.current
    if (!canAutoPan(g) || !g?.exceeded) return
    const pt = lastPointRef.current
    const el = containerRef.current
    if (!pt || !el) return
    const r = el.getBoundingClientRect()
    const lx = pt.clientX - r.left
    const ly = pt.clientY - r.top
    if (lx < AUTOPAN_EDGE || ly < AUTOPAN_EDGE || r.width - lx < AUTOPAN_EDGE || r.height - ly < AUTOPAN_EDGE) {
      autoPanRef.current = requestAnimationFrame(() => autoPanTickRef.current())
    }
  }, [])

  // -- gesture lifecycle ----------------------------------------------------

  const teardownGesture = useCallback(() => {
    const g = gestureRef.current
    const el = containerRef.current
    if (g && el) {
      for (const id of gesturePointers(g)) {
        if (!el.hasPointerCapture?.(id)) continue
        try {
          el.releasePointerCapture(id)
        } catch {
          // the pointer is already gone — nothing to release
        }
      }
    }
    gestureRef.current = null
    gestureAbort.current?.abort()
    gestureAbort.current = null
    st().setTransforming(false)
    setGestureKind(null)
    setRotationLabel(null)
    setGestureCursor(null)
    setRotationFrame(undefined)
    setGuides([])
    setSnapDistances([])
    setLivePoints(null)
    setMarquee(null)
    setBindHint(null)
  }, [st])

  /** Pointer up, or anything else that means "keep what they did". */
  const finishGesture = useCallback(() => {
    const g = gestureRef.current
    if (!g) return
    const s = st()
    stopAutoPan()

    if (g.kind === "draw") {
      if (g.points.length > 2) {
        const xs = g.points.map((p) => p[0])
        const ys = g.points.map((p) => p[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        const w = Math.max(Math.max(...xs) - x, 2)
        const h = Math.max(Math.max(...ys) - y, 2)
        s.addNode(
          {
            type: "draw",
            x,
            y,
            w,
            h,
            points: g.points.map((p) => [p[0] - x, p[1] - y] as [number, number]),
          } as Omit<SquigNode, "id" | "seed">,
          { select: false, checkpoint: false }
        )
      } else {
        // a tap, not a stroke — drop the checkpoint taken on pointer down so
        // it doesn't leave an undo step that undoes nothing
        s.revertToCheckpoint()
      }
    }

    if (g.kind === "create") {
      // a press with no drag at all never reached the create branch, so make
      // the thing here — otherwise clicking with the rect tool silently does
      // nothing AND drops you back to the select tool
      let id = g.id
      if (!id) {
        const [w, h] = [140, 90]
        id =
          g.what === "shape"
            ? s.addNode(
                { type: "shape", shape: s.shapeKind, fill: "none", x: g.wx, y: g.wy, w, h } as Omit<SquigNode, "id" | "seed">,
                { select: false }
              )
            : s.addNode(
                {
                  type: "arrow",
                  head: true,
                  x: g.wx,
                  y: g.wy,
                  w,
                  h,
                  points: [
                    [0, 0],
                    [w, h],
                  ],
                  bind: bindPair(g.tailTarget?.id ?? null, g.headTarget?.id ?? null),
                  anchors: anchorPair(g.tailTarget?.anchor ?? null, g.headTarget?.anchor ?? null),
                } as Omit<SquigNode, "id" | "seed">,
                { select: false }
              )
      } else {
        const n = st().nodes[id]
        // a bound arrow's box is a consequence of where its boxes sit, not
        // something the drag set, so a small one is the honest answer rather
        // than a gesture that fizzled
        const bound = n?.type === "arrow" && !!n.bind
        // BOTH dimensions, not either: a horizontal arrow is 2 units tall by
        // construction and a divider rect is deliberately thin. Testing `||`
        // would quietly replace every one of them with a fat diagonal.
        if (n && !bound && n.w < 10 && n.h < 10) {
          const [w, h] = [140, 90]
          if (n.type === "arrow") {
            // keep the direction they dragged, however small
            const sx = n.w > 0 ? w / n.w : 1
            const sy = n.h > 0 ? h / n.h : 1
            s.updateNode(id, {
              w,
              h,
              points: n.points.map(([px, py]) => [px * sx, py * sy]) as [[number, number], [number, number]],
            } as Partial<SquigNode>)
          } else {
            s.updateNode(id, { w, h })
          }
        }
      }
      s.setSelection([id])
      s.setTool("select")
    }

    // a press that actually dragged is a resize, not the first half of a
    // double-click — don't let the next press on that handle read as one
    if (g.kind === "resize" && g.exceeded) lastHandlePress.current = null

    // a click with no drag inside a bigger selection narrows to what was
    // clicked — already resolved to a group or a single piece at press time
    if (g.kind === "move" && !g.exceeded && g.clickSelection) {
      s.setSelection(g.clickSelection.ids, g.clickSelection.groupId)
    }

    // the press sat inside a hollow shape and never became a drag: it was a
    // click on that shape all along, with the same grammar a hard click gets —
    // groups expand, ⌘ digs into them, Shift/⌘ add or toggle off
    if (g.kind === "marquee" && !g.exceeded && g.softHitId && s.nodes[g.softHitId]) {
      const mods = modsRef.current
      const deep = mods.toggle && !!s.nodes[g.softHitId]?.groupIds?.length
      const picked = deep
        ? { ids: [g.softHitId], groupId: null }
        : groupPickForHit(g.softHitId, s.selection, s.selectionGroupId, s.nodes, s.order)
      const hitSet = picked.ids
      if (!deep && (mods.shift || mods.toggle)) {
        const sel = s.selection
        s.setSelection(
          hitSet.every((id) => sel.includes(id))
            ? sel.filter((i) => !hitSet.includes(i))
            : [...new Set([...sel, ...hitSet])]
        )
      } else {
        s.setSelection(hitSet, picked.groupId)
      }
    }

    // an ⌥-drag copy hands ⌘D the distance it travelled, so the next one
    // lands the same way again. cloneIds and sourceIds share an index.
    if (g.kind === "move" && g.cloneIds) {
      s.rememberDuplicate(
        g.cloneIds,
        Object.fromEntries(g.cloneIds.map((id, i) => [id, g.sourcePos[g.sourceIds[i]]]))
      )
    }

    if ((g.kind === "move" || g.kind === "resize" || g.kind === "rotate" || g.kind === "crop" ||
      g.kind === "endpoint" || g.kind === "route") && g.dirty) s.finishCheckpoint()
    teardownGesture()
  }, [st, stopAutoPan, teardownGesture])

  /** Escape or pointercancel: undo whatever the gesture has done so far. */
  const cancelGesture = useCallback(() => {
    const g = gestureRef.current
    if (!g) return
    const s = st()
    stopAutoPan()

    if (g.kind === "marquee") {
      s.setSelection(g.base, g.baseGroupId)
    } else if ((g.kind === "move" || g.kind === "resize" || g.kind === "rotate" || g.kind === "crop" || g.kind === "endpoint" || g.kind === "route") && g.dirty) {
      // Escape undoes this drag, not the whole crop — you stay in the mode
      s.revertToCheckpoint()
    } else if (g.kind === "create") {
      if (g.id) s.revertToCheckpoint()
      s.setTool("select")
    } else if (g.kind === "draw") {
      s.revertToCheckpoint()
    }

    teardownGesture()
  }, [st, stopAutoPan, teardownGesture])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g || !gesturePointers(g).includes(e.pointerId)) return

      // A pinch is answered here rather than in updateGesture: it takes two
      // pointers instead of one, and it has no world anchor, no drag
      // threshold and no node to move — all updateGesture deals in. It also
      // skips the buttons===0 rescue below, because a touch that vanishes
      // arrives as a pointercancel and ending a two-finger gesture off one
      // finger's stale button state would cut pinches short mid-squeeze.
      if (g.kind === "pinch") {
        const pt = toLocal(e)
        if (e.pointerId === g.pointerId) g.a = pt
        else g.b = pt
        st().setViewport(pinchViewport(g.start, g.a, g.b, zoomRange(g.start.viewport.zoom)))
        return
      }

      modsRef.current = readMods(e)
      lastPointRef.current = { clientX: e.clientX, clientY: e.clientY }
      // the button came up somewhere we couldn't see it — keep the work
      if (e.buttons === 0) {
        finishGesture()
        return
      }
      updateGesture(e.clientX, e.clientY)
      maybeAutoPan()
    },
    [updateGesture, maybeAutoPan, finishGesture, toLocal, st]
  )

  const beginGesture = useCallback(
    (g: Gesture, e: React.PointerEvent) => {
      gestureRef.current = g
      setGestureKind(g.kind)
      setGestureCursor(g.kind === "resize" ? resizeCursor(g.handle, g.origNodes.length === 1 ? g.origNodes[0].rotation : 0) : null)
      setRotationFrame(g.kind === "rotate" && g.origNodes.length > 1 ? unionBounds(g.origNodes.map(nodeVisualBounds)) ?? undefined : undefined)

      // capture keeps events coming even when the pointer leaves the window
      const ids = gesturePointers(g)
      for (const id of ids) {
        try {
          containerRef.current?.setPointerCapture(id)
        } catch {
          // some pointer types refuse capture; window listeners still cover us
        }
      }

      // one controller per gesture: aborting removes every listener at once, so
      // a handler identity changing mid-drag can't strand a live listener
      gestureAbort.current?.abort()
      const ac = new AbortController()
      gestureAbort.current = ac
      const opts = { signal: ac.signal }

      window.addEventListener("pointermove", onPointerMove, opts)
      // either finger coming up ends a pinch — there is no one-finger half of
      // it to carry on with, and the finger still down is left alone until it
      // either lifts or is joined again
      window.addEventListener(
        "pointerup",
        (ev: PointerEvent) => {
          if (!ids.includes(ev.pointerId)) return
          if (g.kind !== "pinch") {
            modsRef.current = readMods(ev)
            updateGesture(ev.clientX, ev.clientY)
          }
          finishGesture()
        },
        opts
      )
      window.addEventListener(
        "pointercancel",
        (ev: PointerEvent) => {
          if (ids.includes(ev.pointerId)) cancelGesture()
        },
        opts
      )
      // a lost window means we'll never see the release; keep the work
      window.addEventListener("blur", finishGesture, opts)

      // modifiers are live: pressing Shift mid-drag locks the direction now, not on
      // the next pixel of mouse movement
      const onModKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          ev.preventDefault()
          ev.stopPropagation()
          cancelGesture()
          return
        }
        if (ev.key !== "Shift" && ev.key !== "Alt" && ev.key !== "Meta" && ev.key !== "Control") return
        // stop a bare Alt from handing focus to the browser menu bar mid-drag
        ev.preventDefault()
        modsRef.current = readMods(ev)
        const pt = lastPointRef.current
        if (pt) updateGesture(pt.clientX, pt.clientY)
      }
      window.addEventListener("keydown", onModKey, { signal: ac.signal, capture: true })
      window.addEventListener("keyup", onModKey, { signal: ac.signal, capture: true })

      // resolve once up front so a zero-distance press still does its job
      modsRef.current = readMods(e)
      lastPointRef.current = { clientX: e.clientX, clientY: e.clientY }
      if (g.kind === "marquee" && !g.softHitId && marqueeMode(modsRef.current) === "replace") st().setSelection([])
    },
    [onPointerMove, finishGesture, cancelGesture, updateGesture, st]
  )

  /** Double-clicking a side handle un-fixes the width — the box hugs again. */
  const resetTextWidth = useCallback(() => {
    const s = st()
    const n = s.selection.length === 1 ? s.nodes[s.selection[0]] : null
    if (!n || n.type !== "text" || !n.fixedW) return
    s.checkpoint()
    s.updateNode(n.id, autoSizeTextBox(n) as Partial<SquigNode>)
  }, [st])

  /** Double-clicking a vertical side brings the box back to its content. */
  const resetTextHeight = useCallback(() => {
    const s = st()
    const n = s.selection.length === 1 ? s.nodes[s.selection[0]] : null
    if (!n || n.type !== "text" || !n.fixedH) return
    s.checkpoint()
    s.updateNode(n.id, autoSizeTextHeight(n) as Partial<SquigNode>)
  }, [st])

  const startResize = useCallback(
    (handle: Handle, e: React.PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || gestureRef.current) return
      e.stopPropagation()
      e.preventDefault()
      const s = st()
      const sel = s.selection.map((id) => s.nodes[id]).filter(Boolean) as SquigNode[]
      const b = sel.length === 1 ? { x: sel[0].x, y: sel[0].y, w: sel[0].w, h: sel[0].h }
        : unionBounds(sel.map(nodeVisualBounds))
      if (!b) return

      // the second press on the same handle, soon enough after the first
      const prev = lastHandlePress.current
      lastHandlePress.current = { handle, t: e.timeStamp, selection: s.selection.join(",") }
      const doubled = !!prev && prev.handle === handle && prev.selection === s.selection.join(",") && e.timeStamp - prev.t < 400
      const lone = sel.length === 1 ? sel[0] : null

      // double-clicking a side handle of a fixed-width text layer un-fixes it
      if (doubled && (handle === "e" || handle === "w") && lone?.type === "text" && lone.fixedW) {
        swallowDblClickUntil.current = e.timeStamp + 600
        resetTextWidth()
        return
      }
      // The same reset on the other axis: collapse the extra room without
      // moving the words, taking vertical alignment and flips into account.
      if (doubled && (handle === "n" || handle === "s") && lone?.type === "text" && lone.fixedH) {
        swallowDblClickUntil.current = e.timeStamp + 600
        resetTextHeight()
        return
      }

      // and double-clicking a corner handle of a picture puts it back on the
      // ratio its own pixels have. Corners rather than sides because a corner
      // is already the handle you reach for when you want the shape kept, so
      // it's the one to ask for the shape back — and the sides are spoken for
      // above. The swallow happens even when the maths turns out to be a
      // no-op: the press was a handle double-press either way, and letting it
      // through would step into the crop window instead.
      if (doubled && handle.length === 2 && lone?.type === "image") {
        swallowDblClickUntil.current = e.timeStamp + 600
        s.restoreAspect([lone.id])
        return
      }
      modsRef.current = readMods(e)
      const [wx, wy] = toWorld(e)
      beginGesture(
        {
          kind: "resize",
          handle,
          wx,
          wy,
          sx: e.clientX,
          sy: e.clientY,
          pointerId: e.pointerId,
          exceeded: false,
          ids: sel.map((n) => n.id),
          origNodes: structuredClone(sel),
          origBounds: b,
          dirty: false,
        },
        e
      )
    },
    [st, beginGesture, toWorld, resetTextWidth, resetTextHeight]
  )

  const startRotate = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || gestureRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const s = st()
    const origNodes = s.selection.map((id) => s.nodes[id]).filter((n) => n && !n.locked)
    const b = unionBounds(origNodes.map(nodeVisualBounds))
    if (!b) return
    const center: [number, number] = [b.x + b.w / 2, b.y + b.h / 2]
    const [wx, wy] = toWorld(e)
    beginGesture({ kind: "rotate", sx: e.clientX, sy: e.clientY, pointerId: e.pointerId, exceeded: false,
      center, startAngle: Math.atan2(center[1] - wy, wx - center[0]) * 180 / Math.PI,
      initialRotation: origNodes.length === 1 ? origNodes[0].rotation ?? 0 : 0,
      origNodes: structuredClone(origNodes), dirty: false }, e)
  }, [st, toWorld, beginGesture])

  /**
   * A press on one of a lone arrow's two end dots.
   *
   * Dragging an end onto a box attaches it; dragging it back out into empty
   * space lets go. There's no third state and no menu — the gesture is the
   * whole interface, the way it is for a resize handle.
   */
  const startEndpoint = useCallback(
    (end: 0 | 1, e: React.PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || gestureRef.current) return
      e.stopPropagation()
      e.preventDefault()
      const s = st()
      const n = s.selection.length === 1 ? s.nodes[s.selection[0]] : null
      if (n?.type !== "arrow") return
      modsRef.current = readMods(e)
      const [wx, wy] = toWorld(e)
      beginGesture(
        {
          kind: "endpoint",
          wx,
          wy,
          sx: e.clientX,
          sy: e.clientY,
          pointerId: e.pointerId,
          exceeded: false,
          id: n.id,
          end,
          orig: structuredClone(n),
          dirty: false,
        },
        e
      )
    },
    [st, beginGesture, toWorld]
  )

  /** Pick up the active connector's elbow segment or curved midpoint. */
  const startRoute = useCallback(
    (handle: RouteHandle, e: React.PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || gestureRef.current) return
      e.stopPropagation()
      e.preventDefault()
      const s = st()
      const n = s.selection.length === 1 ? s.nodes[s.selection[0]] : null
      if (n?.type !== "arrow") return
      modsRef.current = readMods(e)
      const [wx, wy] = toWorld(e)
      beginGesture(
        {
          kind: "route",
          wx,
          wy,
          sx: e.clientX,
          sy: e.clientY,
          pointerId: e.pointerId,
          exceeded: false,
          id: n.id,
          style: handle.kind,
          axis: handle.kind === "elbow" ? handle.axis : undefined,
          routeAxis: handle.kind === "elbow" ? handle.routeAxis : undefined,
          origOffset: [...handle.offset],
          flipX: !!n.flipX,
          flipY: !!n.flipY,
          dirty: false,
        },
        e
      )
    },
    [st, beginGesture, toWorld]
  )

  /** A press on one of the eight crop handles. */
  const startCrop = useCallback(
    (handle: Handle, e: React.PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || gestureRef.current) return
      e.stopPropagation()
      e.preventDefault()
      const s = st()
      const n = cropTarget(s.nodes, s.selection, s.croppingId)
      if (!n) return
      modsRef.current = readMods(e)
      const [wx, wy] = toWorld(e)
      beginGesture(
        {
          kind: "crop",
          handle,
          wx,
          wy,
          sx: e.clientX,
          sy: e.clientY,
          pointerId: e.pointerId,
          exceeded: false,
          id: n.id,
          origWin: { x: n.x, y: n.y, w: n.w, h: n.h },
          rotation: n.rotation ?? 0,
          origSheet: imageSheet(n),
          flipX: !!n.flipX,
          flipY: !!n.flipY,
          dirty: false,
        },
        e
      )
    },
    [st, beginGesture, toWorld]
  )

  /**
   * The touch tally, and the moment a second finger turns it into a pinch.
   *
   * This runs in the capture phase, ahead of everything else that answers a
   * press — the resize handles, the crop handles, the arrow endpoints, the
   * canvas itself. A finger that happens to land on a handle is still the
   * second half of a pinch, and letting the handle have it would start a
   * resize with another finger already down on the paper.
   */
  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (e.isPrimary && !gestureRef.current && (e.button === 1 || (e.button === 0 && isSpacebarHeld))) {
        e.stopPropagation()
        e.preventDefault()
        containerRef.current?.focus({ preventScroll: true })
        const v = st().viewport
        beginGesture({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y,
          pointerId: e.pointerId, exceeded: false }, e)
        return
      }
      if (e.pointerType !== "touch") return
      const pts = touchesRef.current
      pts.set(e.pointerId, toLocal(e))

      // one finger is a pencil: let it through to draw, select, drag, resize
      if (pts.size < 2) return

      // from here the press belongs to the pinch and nothing else sees it —
      // including a third finger or a resting palm, which must not re-aim a
      // pinch already in flight or start some other gesture underneath it
      e.stopPropagation()
      e.preventDefault()
      if (pts.size > 2) return

      const [[idA, a], [idB, b]] = [...pts]

      // Whatever the first finger had started gives way. Cancelling rather
      // than finishing is the deliberate part: a stroke, a drag or a marquee
      // that turned out to be the first half of a pinch was never meant to
      // land, so it reverts to its checkpoint and leaves nothing behind —
      // no stray one-pixel scribble, no node nudged half a step, and no undo
      // step to spend on either.
      if (gestureRef.current) cancelGesture()

      beginGesture(
        {
          kind: "pinch",
          sx: e.clientX,
          sy: e.clientY,
          pointerId: idA,
          idB,
          // a pinch is a drag from its first frame — there's no click hiding
          // inside it that a threshold would need to protect
          exceeded: true,
          start: { viewport: st().viewport, a, b },
          a,
          b,
        },
        e
      )
    },
    [toLocal, st, beginGesture, cancelGesture, isSpacebarHeld]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // secondary buttons and stray extra touches never start a gesture
      if (e.button > 1 || !e.isPrimary || gestureRef.current) return
      const s = st()
      // a press on the editor's textarea belongs to the caret — grabbing
      // focus here would blur the editor mid-click and end the edit
      if (s.editingId && (e.target as HTMLElement).closest?.("textarea")) return
      containerRef.current?.focus({ preventScroll: true })
      // a press re-arms Tab even when the canvas already had focus, which the
      // focus handler below would never hear about. It also puts the ring
      // away: a pointer is its own answer to "where am I", and the ring is
      // there for the people who don't have one.
      tabReleased.current = false
      setRing(false)

      if (s.editingId) {
        // let the click both dismiss the editor and land where it was aimed,
        // instead of costing two clicks
        s.setEditing(null)
      }

      modsRef.current = readMods(e)
      lastPointRef.current = { clientX: e.clientX, clientY: e.clientY }
      const mods = modsRef.current
      const [wx, wy] = toWorld(e)
      const common = { sx: e.clientX, sy: e.clientY, pointerId: e.pointerId, exceeded: false }

      // middle mouse or space = pan, any tool
      if (e.button === 1 || isSpacebarHeld) {
        beginGesture({ kind: "pan", ...common, ox: s.viewport.x, oy: s.viewport.y }, e)
        return
      }
      if (e.button !== 0) return

      // -- crop mode --------------------------------------------------------
      // While it's on it owns the canvas: the eight handles are their own
      // targets (startCrop), a press anywhere over the picture slides it, and
      // a press off the picture is how you leave.
      if (s.croppingId) {
        const n = cropTarget(s.nodes, s.selection, s.croppingId)
        if (n && inRect(imageSheet(n), ...unrotatePoint(n, wx, wy))) {
          beginGesture(
            {
              kind: "crop",
              ...common,
              wx,
              wy,
              id: n.id,
              handle: "pan",
              origWin: { x: n.x, y: n.y, w: n.w, h: n.h },
              rotation: n.rotation ?? 0,
              origSheet: imageSheet(n),
              flipX: !!n.flipX,
              flipY: !!n.flipY,
              dirty: false,
            },
            e
          )
          return
        }
        // the same bargain the text editor strikes: the click that dismisses
        // the mode also lands where it was aimed, instead of costing two
        s.setCropping(null)
      }

      // placing a component from the library
      if (s.placing) {
        dropComponent(s.placing, wx, wy)
        s.setPlacing(null)
        s.setPanel(null)
        return
      }

      if (tool === "draw") {
        s.checkpoint()
        beginGesture({ kind: "draw", ...common, points: [[wx, wy]] }, e)
        return
      }
      if (tool === "shape" || tool === "arrow") {
        // an arrow that starts on top of a box starts attached to it, so the
        // common case — draw from this thing to that thing — needs no second
        // step at all
        const tailTarget = tool === "arrow" ? anchorTargetAt(s.nodes, s.order, wx, wy, s.viewport.zoom) : null
        beginGesture(
          {
            kind: "create",
            ...common,
            wx,
            wy,
            id: null,
            what: tool === "shape" ? "shape" : "arrow",
            tailTarget,
            headTarget: null,
          },
          e
        )
        return
      }
      if (tool === "text") {
        // the editor mounts and focuses inside this handler, so the compat
        // mousedown that follows would hand focus straight back to the canvas —
        // blurring the editor into a commit that deletes the still-empty node
        e.preventDefault()
        const fontSize = 18
        const h = textBlockHeight(1, fontSize)
        const id = s.addNode({
          type: "text",
          text: "",
          fontSize,
          x: wx,
          // the click lands in the middle of the line it just started
          y: wy - h / 2,
          w: 120,
          h,
        } as Omit<SquigNode, "id" | "seed">)
        s.setTool("select")
        s.setEditing(id)
        return
      }

      // -- select tool ------------------------------------------------------
      const target = canvasTarget(s.nodes, s.order, s.selection, wx, wy, s.viewport.zoom, mods)
      const hitId = target.kind === "node" ? target.id : null

      if (target.kind !== "marquee") {
        const grouped = !!hitId && !!s.nodes[hitId]?.groupIds?.length
        // ⌘/Ctrl reaches past a group to the one thing under the cursor. With
        // nothing to reach past it has no such job, so outside a group it
        // falls back to toggling — which is what a Ctrl+click is everywhere
        // that isn't a design tool.
        const deep = mods.toggle && grouped
        const picked = !hitId
          ? { ids: s.selection, groupId: s.selectionGroupId }
          : deep
            ? { ids: [hitId], groupId: null }
            : groupPickForHit(hitId, s.selection, s.selectionGroupId, s.nodes, s.order)
        const { press, click: clickSelection } = selectionForPress(
          { ids: s.selection, groupId: s.selectionGroupId }, picked,
          !!hitId && (mods.shift || (!deep && mods.toggle)), deep
        )
        const sel = press.ids
        const sourceGroupId = press.groupId
        s.setSelection(sel, sourceGroupId)

        const sourcePos: Record<string, { x: number; y: number }> = {}
        const sourceBounds: Record<string, Bounds> = {}
        const sourceIds: string[] = []
        // document order, matching what cloneSelectionInPlace returns
        for (const id of s.order) {
          if (!sel.includes(id)) continue
          const n = s.nodes[id]
          if (n && !n.locked) {
            sourcePos[id] = { x: n.x, y: n.y }
            sourceBounds[id] = nodeVisualBounds(n)
            sourceIds.push(id)
          }
        }
        if (!sourceIds.length) return
        beginGesture({
          kind: "move",
          ...common,
          wx,
          wy,
          sourceIds,
          sourceGroupId,
          sourcePos,
          sourceBounds,
          cloneIds: null,
          dirty: false,
          snapLock: { x: null, y: null },
          clickSelection,
        }, e)
        return
      }

      // no ink under the press — marquee, with the current selection as its
      // base. If the press sits inside a hollow shape, that shape rides along
      // as the thing a mere click would mean.
      const softHitId = target.softHitId
      beginGesture({
        kind: "marquee",
        ...common,
        wx,
        wy,
        base: s.selection,
        baseGroupId: s.selectionGroupId,
        softHitId,
      }, e)
    },
    [st, tool, isSpacebarHeld, toWorld, beginGesture, dropComponent]
  )

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // the tail of a handle double-press — see startResize
      if (e.timeStamp < swallowDblClickUntil.current) {
        swallowDblClickUntil.current = 0
        return
      }
      const s = st()
      const hitId = pick(e)
      if (!hitId) {
        // double-clicking bare canvas starts typing there, the way tldraw
        // does — a dismissed empty draft deletes itself, so a stray
        // double-click costs nothing
        if (s.tool !== "select" || s.placing) return
        const [wx, wy] = toWorld(e)
        const fontSize = 18
        const h = textBlockHeight(1, fontSize)
        const id = s.addNode({
          type: "text",
          text: "",
          fontSize,
          x: wx,
          // the click lands in the middle of the line it just started
          y: wy - h / 2,
          w: 120,
          h,
        } as Omit<SquigNode, "id" | "seed">)
        s.setEditing(id)
        return
      }
      const n = s.nodes[hitId]
      if (!n) return
      // Each double-click crosses one group boundary. Keeping the exact active
      // group in store is what makes G/A/B reachable as G, then A, then B,
      // rather than jumping from the outside straight to the leaf.
      if (n.groupIds?.length && (s.selectionGroupId || s.selection.length !== 1 || s.selection[0] !== hitId)) {
        const next = stepIntoGroup(hitId, s.selection, s.selectionGroupId, s.nodes, s.order)
        s.setSelection(next.ids, next.groupId)
        return
      }
      // double-clicking inside a multi-selection narrows to what you clicked
      if (s.selection.length !== 1 || s.selection[0] !== hitId) s.setSelection([hitId])
      // A configurable glyph is a property of the component, not a detached
      // layer. Hand that property to the inspector just like an aimed text run
      // is handed to the inline editor below.
      if (n.type === "component") {
        const [wx, wy] = unrotatePoint(n, ...toWorld(e))
        const key = iconControlAt(n, wx - n.x, wy - n.y)
        if (key) {
          setAim(null)
          s.setEditing(null)
          s.setInspectorFocus({ id: hitId, key })
          return
        }
      }
      // a picture has no words to step into, so the same press steps into its
      // crop instead — the one edit a picture has
      if (n.type === "image") s.setCropping(hitId)
      else if (hasEditableText(n)) {
        // the run under the pointer decides which label opens — see
        // textControlAt, which answers null when the click landed on words no
        // control backs, and then the first control opens as it always did
        if (n.type === "component") {
          const [wx, wy] = unrotatePoint(n, ...toWorld(e))
          const key = textControlAt(n, wx - n.x, wy - n.y)
          setAim(key ? { id: hitId, key } : null)
        }
        s.setEditing(hitId)
      }
    },
    [st, pick, toWorld]
  )

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const s = st()
      // a ctrl+click has already toggled the selection under the select tool;
      // don't stack a menu on top of the thing it just did
      if (e.ctrlKey && tool === "select" && !s.placing) return
      // whatever drag the right button interrupted is abandoned, not committed
      if (gestureRef.current) cancelGesture()
      // The right button is the one press a locked layer still answers, and
      // the reason it has to: with no click-select there would otherwise be no
      // way to point at one and ask for it back. Aiming at something and
      // asking for a menu is deliberate in a way a stray drag never is.
      const hitId = pick(e, { locked: true })
      const locked = !!(hitId && s.nodes[hitId]?.locked)
      // right-clicking outside the current selection re-targets it — but a
      // locked layer is never selected, so the menu targets it directly and
      // whatever was selected before is left alone
      if (hitId && !locked && !s.selection.includes(hitId)) {
        const picked = groupPickForHit(hitId, s.selection, s.selectionGroupId, s.nodes, s.order)
        s.setSelection(picked.ids, picked.groupId)
      }
      if (!hitId) s.setSelection([])
      s.setContextMenu({ x: e.clientX, y: e.clientY, nodeId: hitId })
    },
    [st, tool, pick, cancelGesture]
  )

  // hover feedback + placement ghost, throttled to one pass per frame
  const onPointerMoveLocal = useCallback(
    (e: React.PointerEvent) => {
      const s = st()
      pointerWorld.current = toWorld(e)
      // the ghost is driven at the window level instead — see below
      if (s.placing) return
      if (gestureRef.current || isSpacebarHeld || s.editingId || (s.tool !== "select" && s.tool !== "arrow")) {
        if (hover) setHover(null)
        if (!gestureRef.current) setBindHint(null)
        return
      }
      if (hoverRafRef.current !== null) return
      const { clientX, clientY } = e
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null
        // the same predicate the click uses — an affordance drawn from
        // different geometry than the hit test is just a lie
        const cur = st()
        const [wx, wy] = toWorld({ clientX, clientY })
        if (cur.tool === "arrow") {
          setHover(null)
          setBindHint(anchorTargetAt(cur.nodes, cur.order, wx, wy, cur.viewport.zoom))
          return
        }
        setBindHint(null)
        // locked layers are in this pick and in no other: a click won't take
        // one, but the hover has to say so, or a held-down rectangle is
        // indistinguishable from a wedged app. What it draws is different too
        // — see the hint below
        const target = canvasTarget(cur.nodes, cur.order, cur.selection, wx, wy, cur.viewport.zoom, readMods(e))
        if (target.kind === "selection") {
          setHover({ id: cur.selection[0], soft: false, locked: false })
        } else if (target.kind === "node") {
          setHover({ id: target.id, soft: false, locked: false })
        } else {
          const id = target.softHitId ?? pickAt(cur.nodes, cur.order, wx, wy, cur.viewport.zoom, { locked: true })
            ?? pickSoftAt(cur.nodes, cur.order, wx, wy, { locked: true })
          setHover(id ? { id, soft: true, locked: !!cur.nodes[id]?.locked } : null)
        }
      })
    },
    [st, toWorld, hover, isSpacebarHeld]
  )

  const onPointerLeave = useCallback(() => {
    if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current)
    hoverRafRef.current = null
    setHover(null)
    if (!gestureRef.current) setBindHint(null)
  }, [])

  /**
   * The placement ghost tracks the pointer on `window`, not on the canvas, so a
   * press that started inside the library panel is already being followed by the
   * time it crosses onto the canvas. Same preview either way: pick-then-click and
   * drag-out are the same pending placement, just ended differently.
   */
  useEffect(() => {
    if (!placing) return
    const onMove = (e: PointerEvent) => setCursor(toWorld(e))
    window.addEventListener("pointermove", onMove)
    return () => {
      window.removeEventListener("pointermove", onMove)
      // drop the stale position with the placement, so the next pick doesn't
      // flash its ghost wherever the last one was
      setCursor(null)
    }
  }, [placing, toWorld])

  /**
   * A library item dragged out of the panel lands where the pointer is released.
   * The press began in the panel, so the canvas never sees a pointerdown for it —
   * this listener is the whole gesture's ending.
   */
  useEffect(() => {
    if (!placingDrag) return
    const ac = new AbortController()
    const finish = (e: PointerEvent) => {
      const s = st()
      const kind = s.placing
      s.setPlacing(null)
      if (!kind || e.type !== "pointerup") return
      // released over the rail, the panel, the context row or any other chrome —
      // nothing lands. The context row floats *inside* the canvas, so being
      // inside the container isn't enough on its own.
      const el = containerRef.current
      const under = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || !under || !el.contains(under) || under.closest("[data-squig-chrome]")) return
      const [wx, wy] = toWorld(e)
      dropComponent(kind, wx, wy)
    }
    window.addEventListener("pointerup", finish, { signal: ac.signal })
    window.addEventListener("pointercancel", finish, { signal: ac.signal })
    return () => ac.abort()
  }, [placingDrag, st, toWorld, dropComponent])

  useEffect(
    () => () => {
      stopAutoPan()
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current)
    },
    [stopAutoPan]
  )

  // -- keyboard -------------------------------------------------------------

  // ⌘S belongs to squig wherever the cursor is — mid-word, mid-rename, palette
  // open. On the capture phase, because every field that swallows keystrokes
  // sits downstream of here, and the browser's "save page" is never the point.
  useEffect(() => {
    const onSave = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.code !== "KeyS") return
      e.preventDefault()
      if (e.shiftKey) exportDoc()
      else st().saveNow()
    }
    window.addEventListener("keydown", onSave, { capture: true })
    return () => window.removeEventListener("keydown", onSave, { capture: true })
  }, [st])

  useEffect(() => {
    const ac = new AbortController()
    const onAlt = (e: KeyboardEvent) => setAltHeld(e.altKey)
    window.addEventListener("keydown", onAlt, { signal: ac.signal })
    window.addEventListener("keyup", onAlt, { signal: ac.signal })
    window.addEventListener("blur", () => setAltHeld(false), { signal: ac.signal })
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canvasOwnsKeyboard(e.target)) return
      const s = st()
      // AltGr reports as ctrl+alt on several layouts — don't eat those keys
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey
      // match the letter the user actually sees on the key: `e.code` is a
      // physical position, so on AZERTY it fires the tool printed elsewhere
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      /** One held-key run is one undo step; changing command or selection is not. */
      const beginNudge = (kind: "move" | "resize") => {
        const sig = s.selection.join(",")
        const nudge = nudgeRef.current
        const separate =
          nudge.timer === null ||
          nudge.sel !== sig ||
          nudge.kind !== kind ||
          nudge.top !== s.past[s.past.length - 1]
        if (nudge.timer !== null) clearTimeout(nudge.timer)
        if (separate) {
          s.checkpoint()
          nudge.sel = sig
          nudge.kind = kind
          const after = st().past
          nudge.top = after[after.length - 1]
        }
        nudge.timer = setTimeout(() => (nudge.timer = null), 900)
      }

      // a gesture in flight owns the keyboard — including ⌘K, or the palette
      // opens over a drag that is still moving nodes underneath it, and the
      // Escape meant to close it gets eaten cancelling the drag instead
      if (gestureRef.current) {
        if (e.key !== "Escape" && e.key !== "Shift" && e.key !== "Alt") e.preventDefault()
        return
      }

      if (mod && e.code === "KeyK") {
        e.preventDefault()
        // ⌘K over text means "link this", the way it does in every editor
        const hasText = s.selection.some((id) => s.nodes[id]?.type === "text")
        if (hasText && !s.commandOpen) s.setLinkOpen(true)
        else s.setCommandOpen(!s.commandOpen)
        return
      }
      if (mod && e.code === "Slash") {
        e.preventDefault()
        s.setCommandOpen(!s.commandOpen)
        return
      }
      if (s.commandOpen) return

      if (e.code === "Slash" && e.shiftKey && !mod) {
        e.preventDefault()
        s.setShortcutsOpen(!s.shortcutsOpen)
        return
      }
      if (s.shortcutsOpen && e.key !== "Escape") return

      if (mod) {
        // `e.code` under a modifier: ⌥] is "‘" on a Mac, but the key under the
        // finger is still BracketRight
        switch (e.code) {
          case "KeyZ":
            e.preventDefault()
            if (e.shiftKey) s.redo()
            else s.undo()
            return
          case "KeyD":
            e.preventDefault()
            s.duplicateSelected()
            return
          case "KeyA":
            e.preventDefault()
            s.selectAll()
            return
          case "KeyG":
            e.preventDefault()
            if (e.shiftKey) s.ungroupSelected()
            else s.groupSelected()
            return
          case "KeyB":
            e.preventDefault()
            // ⌥⌘B is Figma's detach; ⌘B is bold
            if (e.altKey) s.detachSelected()
            else s.toggleTextStyle("bold")
            return
          case "KeyI":
            e.preventDefault()
            s.toggleTextStyle("italic")
            return
          case "KeyU":
            e.preventDefault()
            s.toggleTextStyle("underline")
            return
          // ⇧⌘L is Figma's lock, while plain L activates the Arrow tool. It
          // only locks — unlocking is the right button's job, because by then
          // there is nothing selected to unlock.
          case "KeyL":
            if (!e.shiftKey) return
            e.preventDefault()
            s.lockSelected()
            return
          // ⌘⇧C is the picture, and that one is ours to intercept. Plain ⌘C
          // is the objects, and so are ⌘X and ⌘V: they ride the browser's own
          // copy/cut/paste events, which preventing the default here is
          // exactly what would stop from firing. See lib/canvas/use-clipboard.
          case "KeyC":
            if (!e.shiftKey) return
            e.preventDefault()
            copyAsPngWithNotice()
            return
          // one step on its own; all the way with ⌥ (Mac) or ⇧ (Windows)
          case "BracketRight":
            e.preventDefault()
            if (e.altKey || e.shiftKey) s.bringToFront(s.selection)
            else s.bringForward(s.selection)
            return
          case "BracketLeft":
            e.preventDefault()
            if (e.altKey || e.shiftKey) s.sendToBack(s.selection)
            else s.sendBackward(s.selection)
            return
          case "Equal":
          case "NumpadAdd":
            // the canvas zooms; the interface stays exactly the size it was
            e.preventDefault()
            s.zoomBy(1.25)
            return
          case "Minus":
          case "NumpadSubtract":
            e.preventDefault()
            s.zoomBy(1 / 1.25)
            return
          case "Digit0":
          case "Numpad0":
            e.preventDefault()
            s.setViewport({ x: 0, y: 0, zoom: 1 })
            return
          case "Backslash":
            e.preventDefault()
            s.setUiHidden(!s.uiHidden)
            return
          case "ArrowLeft":
          case "ArrowRight":
          case "ArrowUp":
          case "ArrowDown": {
            e.preventDefault()
            if (!s.selection.length) return
            const selected = s.selection.map((id) => s.nodes[id]).filter(Boolean) as SquigNode[]
            const bounds = unionBounds(selected.map(nodeVisualBounds))
            if (!bounds) return
            const amount = e.shiftKey ? s.bigNudge : SMALL_NUDGE
            const axis = e.code === "ArrowLeft" || e.code === "ArrowRight" ? "width" : "height"
            const delta = e.code === "ArrowLeft" || e.code === "ArrowUp" ? -amount : amount
            const patches = resizeNodesBy(selected, bounds, axis, delta)
            const changed = Object.entries(patches).some(([id, patch]) => {
              const node = s.nodes[id] as unknown as Record<string, unknown> | undefined
              return !!node && Object.entries(patch).some(([field, value]) => !Object.is(node[field], value))
            })
            if (!changed) return
            beginNudge("resize")
            s.updateNodes(patches)
            return
          }
        }
        return // every other ⌘ combo is the browser's business
      }

      if (e.shiftKey) {
        // the printed character for a shifted digit depends entirely on the
        // layout, so go by the physical number-row key
        switch (e.code) {
          case "Digit0":
            e.preventDefault()
            s.zoomTo100()
            return
          case "Digit1":
            e.preventDefault()
            s.zoomToFit()
            return
          case "Digit2":
            e.preventDefault()
            s.zoomToSelection()
            return
        }
        switch (e.key.toLowerCase()) {
          case "h":
            s.flipSelected("x")
            return
          case "v":
            s.flipSelected("y")
            return
          case "l":
            s.setTool("arrow")
            return
        }
      }

      if (e.code === "Equal" || e.code === "NumpadAdd") {
        s.zoomBy(1.25)
        return
      }
      if (e.code === "Minus" || e.code === "NumpadSubtract") {
        s.zoomBy(1 / 1.25)
        return
      }
      // `[` and `]` need Alt or AltGr on German, French, Spanish and Nordic
      // layouts, so they have to be caught before the Alt bail below — and by
      // physical position too, since the printed character is unreachable
      if (key === "[" || e.code === "BracketLeft") {
        e.preventDefault()
        s.sendToBack(s.selection)
        return
      }
      if (key === "]" || e.code === "BracketRight") {
        e.preventDefault()
        s.bringToFront(s.selection)
        return
      }
      if (e.altKey) return

      switch (key) {
        case "Backspace":
        case "Delete":
          // backspace with nothing selected would navigate back in old browsers
          e.preventDefault()
          s.deleteSelected()
          break
        case "Escape":
          if (s.shortcutsOpen) s.setShortcutsOpen(false)
          else if (s.linkOpen) s.setLinkOpen(false)
          else if (s.editingId) s.setEditing(null)
          // leaving keeps the crop, the way leaving an edit keeps the words
          else if (cropTarget(s.nodes, s.selection, s.croppingId)) s.setCropping(null)
          else if (s.contextMenu) s.setContextMenu(null)
          else if (s.placing) s.setPlacing(null)
          else if (s.panel) s.setPanel(null)
          else if (s.selection.length) s.selectNone()
          else {
            s.setTool("select")
            // and with nothing left to step out of, Escape steps out of the
            // canvas itself: the ring goes and the next Tab is the browser's
            // again. Focus stays put on purpose — the tool keys go on working,
            // and a click is not needed to get the selection cycling back.
            tabReleased.current = true
            setRing(false)
          }
          break
        case "Enter": {
          // Return steps into the words of whatever is selected — the same
          // edit a double-click opens, without having to aim at the glyphs.
          // Only on a lone node: with several selected there's no "the" text.
          if (e.shiftKey) break
          // in crop mode Return is the commit, so it steps back out again
          if (cropTarget(s.nodes, s.selection, s.croppingId)) {
            e.preventDefault()
            s.setCropping(null)
            break
          }
          if (s.selection.length !== 1) break
          const n = s.nodes[s.selection[0]]
          if (!n) break
          if (n.type === "image") {
            e.preventDefault()
            s.setCropping(n.id)
            break
          }
          if (!hasEditableText(n)) break
          e.preventDefault()
          // no pointer, no aim: Return opens the first label, whatever the
          // last double-click on this layer happened to reach for
          setAim(null)
          s.setEditing(n.id)
          break
        }
        case "Tab": {
          // Tab means two things and the canvas only gets one of them. While
          // the canvas itself holds focus, Tab steps through the drawing; the
          // moment focus is anywhere else it is the browser's, and stepping
          // through the drawing instead would trap the keyboard on the first
          // click on the rail.
          //
          // Which leaves the way back out, now that the canvas is in the tab
          // order and is the first thing in the document: Escape releases it
          // (see above), and this one Tab goes where it would have gone. The
          // release lasts until focus comes back, so it can't strand anyone
          // who reaches for Tab a second time.
          if (document.activeElement !== containerRef.current) break
          if (tabReleased.current) break
          e.preventDefault()
          s.cycleSelection(e.shiftKey ? -1 : 1)
          break
        }
        case "v": s.setTool("select"); break
        case "r": s.setShapeKind("rect"); s.setTool("shape"); break
        case "o": s.setShapeKind("ellipse"); s.setTool("shape"); break
        case "p": s.setTool("draw"); break
        case "t": s.setTool("text"); break
        case "l":
        case "a": s.setTool("arrow"); break
        case "c": s.setPanel("components"); break
        case "b": s.setPanel("blocks"); break
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!s.selection.length) break
          e.preventDefault()
          beginNudge("move")
          const d = e.shiftKey ? s.bigNudge : SMALL_NUDGE
          const dx = key === "ArrowLeft" ? -d : key === "ArrowRight" ? d : 0
          const dy = key === "ArrowUp" ? -d : key === "ArrowDown" ? d : 0
          const patches: Record<string, Partial<SquigNode>> = {}
          for (const id of s.selection) {
            const n = s.nodes[id]
            if (n) patches[id] = { x: n.x + dx, y: n.y + dy }
          }
          s.updateNodes(patches)
          break
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [st])

  /**
   * When an edit ends, the canvas takes the keyboard back.
   *
   * The editor's textarea holds focus while it's up, and removing it drops
   * focus on the floor — activeElement goes to <body>, where Tab no longer
   * steps through the drawing. So a keyboard user who typed a label would
   * have had to reach for the mouse to carry on, which is the whole thing
   * this was meant to fix. Only when focus really did fall to nowhere: an
   * edit dismissed by clicking a control in the inspector leaves that control
   * with the keyboard, and it should keep it.
   */
  const wasEditing = useRef(false)
  useEffect(() => {
    if (editingId) {
      wasEditing.current = true
      return
    }
    if (!wasEditing.current) return
    wasEditing.current = false
    const focused = document.activeElement
    if (!focused || focused === document.body) containerRef.current?.focus({ preventScroll: true })
  }, [editingId])

  // any selection change ends the nudge burst
  useEffect(() => {
    const nudge = nudgeRef.current
    if (nudge.timer !== null && nudge.sel !== selection.join(",")) {
      clearTimeout(nudge.timer)
      nudge.timer = null
    }
  }, [selection])

  // -- render ---------------------------------------------------------------

  const v = viewport
  const selectedNodes = useMemo(
    () => selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[],
    [selection, nodes]
  )
  const placingDef = placing ? getDef(placing) : null
  // the picture being cropped comes out of the document order and is redrawn
  // on top, under its own dimmed ghost — the mode is a spotlight, and a node
  // that happened to be stacked above it shouldn't sit in the middle of it
  const cropNode = cropTarget(nodes, selection, croppingId)
  const hoverNode = hover && !selection.includes(hover.id) && !cropNode ? nodes[hover.id] : null
  const hoverBounds = hoverNode ? unionBounds(groupPickForHit(hoverNode.id, selection, st().selectionGroupId, nodes, order)
    .ids.map((id) => nodeVisualBounds(nodes[id]))) ?? nodeVisualBounds(hoverNode) : null
  const bindNode = bindHint ? nodes[bindHint.id] : null
  /**
   * The world worth drawing. Recomputed on every pan and zoom, which is
   * cheap — four divisions — and has to be, since it is what decides which
   * nodes are in the DOM this frame. See lib/canvas/cull for what it is not
   * allowed to affect.
   */
  const view = useMemo(() => visibleBox(v, stage.w, stage.h), [v, stage.w, stage.h])

  // a soft hover keeps the default cursor: a click there selects, but a drag
  // marquees, and a move cursor would promise a drag this press won't do
  const cursorStyle = isSpacebarHeld && !gestureKind
    ? "grab"
    : placing || tool === "shape" || tool === "arrow" || tool === "draw" || tool === "text"
      ? "crosshair"
      : gestureKind === "pan" || gestureKind === "pinch"
        ? "grabbing"
        : gestureKind === "rotate"
          ? ROTATE_CURSOR
        : gestureCursor
          ? gestureCursor
      : gestureKind === "move"
        ? (altHeld ? "copy" : "move")
        // a crop drag captures the pointer, so the cursor comes from here once
        // it leaves the handle it started on
        : gestureKind === "crop" || gestureKind === "endpoint" || gestureKind === "route"
          ? "move"
          : cropNode
            ? "default"
            // a locked layer keeps the default arrow for the same reason a soft
            // hover does: a move cursor over something that won't move is a lie
            : hover && !hover.soft && !hover.locked && tool === "select"
              ? (altHeld ? "copy" : "move")
              : "default"

  return (
    <div
      ref={containerRef}
      // In the tab order, and first in the document, so the drawing is the
      // first thing a keyboard reaches rather than the last. Everything a
      // no-mouse edit needs was already here — Tab cycles the selection, the
      // arrows nudge, Return steps into the words — and none of it could be
      // got at without a click.
      tabIndex={0}
      role="region"
      // One label, no more. A hand-drawn canvas is never going to be
      // meaningfully navigable by screen reader, and a tree of ARIA saying
      // otherwise would be a promise squig can't keep.
      aria-label="Drawing canvas. Tab steps through the layers, Escape hands the keyboard back."
      // touch-none hands us every finger: one to draw with instead of
      // scrolling the page away, and two for the pinch — which has to be ours
      // rather than the browser's, because the browser would zoom the document
      // and the drawing lives in a viewport of its own
      className="absolute inset-0 overflow-hidden touch-none outline-none select-none"
      style={{
        cursor: cursorStyle,
        backgroundColor: "var(--sq-bg)",
        backgroundImage: grid ? "radial-gradient(circle, var(--sq-grid) 1px, transparent 1px)" : "none",
        backgroundSize: `${24 * v.zoom}px ${24 * v.zoom}px`,
        backgroundPosition: `${v.x}px ${v.y}px`,
      }}
      onFocus={() => {
        tabReleased.current = false
        // the ring is for the people who can't see where the click went. A
        // pointer already said where it landed, and a 2px rule round the whole
        // window on every press would read as a flicker, so the ring is asked
        // for by :focus-visible rather than by focus.
        setRing(containerRef.current?.matches(":focus-visible") ?? false)
      }}
      onBlur={() => setRing(false)}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMoveLocal}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
        {/* past the gesture floor the pen would print thinner than a pixel and
            the whole board would fade out — see the rule in app/globals.css */}
        <g data-squig-far={v.zoom < MIN_ZOOM ? "" : undefined} transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
          {order.map((id) => {
            const n = nodes[id]
            if (!n || id === cropNode?.id) return null
            // off the glass, so no paths for it — except for the one being
            // edited, which the editor is standing over and whose runs the
            // renderer has to keep agreeing with
            if (id !== editingId && !inViewBox(nodeVisualBounds(n), view)) return null
            return (
              <g key={id} transform={`translate(${n.x} ${n.y})`}>
                <NodeSketch node={n} hiddenText={id === editingId ? editing?.hidden : undefined} />
              </g>
            )
          })}
          {cropNode && <CropStage node={cropNode} />}
          {livePoints && livePoints.length > 1 && (
            <polyline
              points={livePoints.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke="var(--sq-ink)"
              strokeWidth={2 / v.zoom < 2 ? 2 : 2 / v.zoom}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {placingDef && cursor && (
            <g
              transform={`translate(${cursor[0] - placingDef.size.w / 2} ${cursor[1] - placingDef.size.h / 2})`}
              opacity={0.45}
            >
              <SketchPrims
                prims={renderComponent(placingDef.kind, placingDef.defaults, placingDef.size.w, placingDef.size.h)}
                seed={7}
              />
            </g>
          )}
        </g>
      </svg>

      {/* Hover hint — shows what a click would grab.

          A locked layer gets the same outline drawn dashed, which is the whole
          of its feedback: enough to tell "held down" from "broken",
          gone the moment the pointer moves off, and never a badge that would
          print itself into a screenshot. */}
      {hoverNode && hoverBounds && !editingId && !gestureKind && (
        <div
          className="pointer-events-none absolute rounded-sm"
          style={{
            left: hoverBounds.x * v.zoom + v.x,
            top: hoverBounds.y * v.zoom + v.y,
            width: hoverBounds.w * v.zoom,
            height: hoverBounds.h * v.zoom,
            // dashes lay down less ink than a solid rule, so the locked one is
            // mixed stronger to land at the same weight on the page — the dash
            // is meant to be the difference, not the dimness
            border: hover?.locked
              ? "1px dashed color-mix(in srgb, var(--sq-select) 60%, transparent)"
              : "1px solid color-mix(in srgb, var(--sq-select) 45%, transparent)",
          }}
        />
      )}

      {/* what the arrow end in hand would attach to — the same hint the hover
          draws, turned up, because this one is a promise about what happens
          when you let go rather than a note about what's under the cursor */}
      {bindNode && bindHint && <AnchorZones node={bindNode} active={bindHint.anchor} viewport={v} />}

      {/* selection rings + handles (screen space) — the crop window replaces
          them outright while it's up: two boxes with two meanings, one of them
          stale, is the worst of both */}
      {cropNode ? (
        <CropOverlay node={cropNode} viewport={v} onStartCrop={startCrop} />
      ) : (
        <SelectionOverlay
          selectedNodes={selectedNodes}
          viewport={v}
          onStartResize={startResize}
          onStartEndpoint={startEndpoint}
          onStartRoute={startRoute}
          onStartRotate={startRotate}
          rotationLabel={rotationLabel}
          rotationFrame={rotationFrame}
          editing={!!editingId && selection.includes(editingId)}
          gestureKind={gestureKind}
          interactive={tool === "select" && !placing}
        />
      )}

      {/* smart guides — transient alignment hairlines and equal-gap measures */}
      {(guides.length > 0 || snapDistances.length > 0) && (
        <SmartGuides guides={guides} distances={snapDistances} />
      )}

      {/* marquee */}
      {marquee && (
        <div
          className="pointer-events-none absolute border border-dashed"
          style={{
            left: marquee.x * v.zoom + v.x,
            top: marquee.y * v.zoom + v.y,
            width: marquee.w * v.zoom,
            height: marquee.h * v.zoom,
            borderColor: "var(--sq-select)",
            backgroundColor: "color-mix(in srgb, var(--sq-select) 8%, transparent)",
          }}
        />
      )}

      {/* a file is hovering over the window: the same dashed line the marquee
          draws, run round the edge of the paper. Enough to say "let go and it
          lands here", and nothing moves to say it */}
      {dropping && (
        <div
          className="pointer-events-none absolute inset-3 rounded-lg border border-dashed"
          style={{
            borderColor: "color-mix(in srgb, var(--sq-select) 45%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--sq-select) 5%, transparent)",
          }}
        />
      )}

      {/* inline text editing */}
      {/* keyed by the prop as well as the layer: aiming at a different label
          is a different edit, and the editor starts over on its words */}
      {editingNode && editing && (
        <TextEditOverlay key={`${editingNode.id}:${editing.propKey ?? ""}`} node={editingNode} target={editing} />
      )}

      {/* context row */}
      <ContextRow selectedNodes={selectedNodes} viewport={v} busy={!!gestureKind || !!cropNode} />

      {/* empty-canvas nudge */}
      {order.length === 0 && !placing && <EmptyCanvas />}

      {/* The focus ring — the same 2px at 40% the rail buttons wear, run round
          the inside of the window because an outline on a box at inset-0 would
          be drawn outside the glass and never seen. It is a DOM element and
          the export writes its own SVG from the prims, so it can't print into
          a PNG, an SVG or a ⌘⇧C. */}
      {ring && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--sq-ink) 40%, transparent)" }}
        />
      )}
    </div>
  )
}
