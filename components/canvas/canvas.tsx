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
import type { SquigNode } from "@/lib/types"
import { screenToWorld } from "@/lib/types"
import { computeSnap, computeResizeSnap, makeSnapRect, type GuideLine, type SnapRect } from "@/lib/canvas/snap-engine"
import { useSpacebarPan } from "@/lib/canvas/use-spacebar-pan"
import { HANDLES, HANDLE_CURSORS, handleOffset, resizeBounds, scaleNodes, type Handle } from "@/lib/canvas/transform"
import { pickAt, pickInRect } from "@/lib/canvas/hit-test"
import { unionBounds, type Bounds } from "@/lib/selection"
import { NodeSketch, SketchPrims } from "./sketch"
import { getDef, renderComponent } from "@/lib/library/registry"
import { exportDoc } from "@/lib/file-io"
import { ContextRow } from "./context-row"
import { TextEditOverlay } from "./text-edit-overlay"

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const SNAP_THRESHOLD = 6
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

type Gesture =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; pointerId: number; exceeded: boolean }
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
      /** positions at gesture start, keyed by source id */
      sourcePos: Record<string, { x: number; y: number }>
      /** ids of the alt-drag copies, while alt is held */
      cloneIds: string[] | null
      /** whether a checkpoint has been taken for this gesture */
      dirty: boolean
      /** set when the press landed inside a bigger selection: a click with no
       *  drag narrows to exactly this set. Carries the set rather than the id
       *  because ⌘-click means "just this piece" while a plain click means
       *  "this piece's whole group". */
      collapseTo: string[] | null
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

const canAutoPan = (g: Gesture | null) =>
  !!g && (g.kind === "marquee" || g.kind === "move" || g.kind === "resize" || g.kind === "create")

/**
 * Does the canvas get to act on this keystroke?
 *
 * Only two things take the keyboard away: somewhere you're typing, and an open
 * menu/listbox/dialog whose own typeahead would otherwise fire alongside the
 * tool hotkeys. Radix portals those outside the panel's DOM subtree, so this
 * looks for their roles document-wide rather than walking up from the target.
 *
 * Deliberately NOT here: chrome buttons, which keep DOM focus after a click —
 * gating on those meant one tap on the rail silently killed every shortcut.
 * Tooltips are excluded too: they're `role="tooltip"`, and hovering the button
 * that advertises a hotkey must not be what stops the hotkey working.
 */
// NOT `[role=combobox]`: that is Radix's Select *trigger*, which sits in the
// inspector permanently and keeps focus after use — matching it would kill the
// keyboard for good. The open listbox it portals in is what matters.
const KEYBOARD_OWNERS = "[role=dialog],[role=menu],[role=listbox]"

function canvasOwnsKeyboard(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el && el !== document.body) {
    const tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false
    if (el.isContentEditable) return false
    if (el.closest?.(KEYBOARD_OWNERS)) return false
  }
  return !document.querySelector(KEYBOARD_OWNERS)
}

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const gestureAbort = useRef<AbortController | null>(null)
  const nudgeRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; sel: string; top: unknown }>({
    timer: null,
    sel: "",
    top: null,
  })
  const modsRef = useRef<Mods>(NO_MODS)
  const lastPointRef = useRef<{ clientX: number; clientY: number } | null>(null)
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

  const placing = useSquig((s) => s.placing)
  const placingDrag = useSquig((s) => s.placingDrag)
  const editingId = useSquig((s) => s.editingId)

  /** marquee box in WORLD units — screen conversion happens at render time */
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const [guides, setGuides] = useState<GuideLine[]>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [livePoints, setLivePoints] = useState<[number, number][] | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [gestureKind, setGestureKind] = useState<Gesture["kind"] | null>(null)

  const { isSpacebarHeld } = useSpacebarPan()

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
    (e: { clientX: number; clientY: number }): string | null => {
      const s = st()
      const [wx, wy] = toWorld(e)
      return pickAt(s.nodes, s.order, wx, wy, s.viewport.zoom)
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
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
        const scale = zoom / v.zoom
        st().setViewport({ zoom, x: sx - (sx - v.x) * scale, y: sy - (sy - v.y) * scale })
      } else {
        st().setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [st])

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
        out.push(makeSnapRect(id, n.x * v.zoom + v.x, n.y * v.zoom + v.y, n.w * v.zoom, n.h * v.zoom))
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
          g.collapseTo = null
        }

        // alt engages and disengages drag-a-copy, live, mid-gesture
        if (mods.alt && !g.cloneIds) {
          st().setSelection(g.sourceIds)
          // put the sources back first so the copies land exactly on them
          st().updateNodes(Object.fromEntries(g.sourceIds.map((id) => [id, { ...g.sourcePos[id] }])))
          const ids = st().cloneSelectionInPlace()
          if (ids.length === g.sourceIds.length) g.cloneIds = ids
        } else if (!mods.alt && g.cloneIds) {
          st().removeNodes(g.cloneIds, { checkpoint: false })
          st().setSelection(g.sourceIds)
          g.cloneIds = null
        }

        const live = st()
        const ids = g.cloneIds ?? g.sourceIds
        // sourceIds and cloneSelectionInPlace are both in document order, so
        // index i refers to the same original either way
        const startPos = (i: number) => g.sourcePos[g.sourceIds[i]]

        let dx = wx - g.wx
        let dy = wy - g.wy
        let lockedAxis: "x" | "y" | null = null
        if (mods.shift) {
          // axis lock, on whichever direction you committed to
          if (Math.abs(dx) > Math.abs(dy)) {
            dy = 0
            lockedAxis = "y"
          } else {
            dx = 0
            lockedAxis = "x"
          }
        }

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (let i = 0; i < ids.length; i++) {
          const n = live.nodes[ids[i]]
          const o = startPos(i)
          if (!n || !o) continue
          if (o.x + dx < minX) minX = o.x + dx
          if (o.y + dy < minY) minY = o.y + dy
          if (o.x + dx + n.w > maxX) maxX = o.x + dx + n.w
          if (o.y + dy + n.h > maxY) maxY = o.y + dy + n.h
        }
        if (!Number.isFinite(minX)) return

        // the toggle key is the escape hatch from a magnetised board
        let sdx = 0
        let sdy = 0
        if (!mods.toggle) {
          const dragged = makeSnapRect(
            "__drag__",
            minX * v.zoom + v.x,
            minY * v.zoom + v.y,
            (maxX - minX) * v.zoom,
            (maxY - minY) * v.zoom
          )
          const snap = computeSnap(dragged, collectCandidates(ids), SNAP_THRESHOLD)
          // a locked axis stays locked; only the free one may be nudged
          sdx = lockedAxis === "x" ? 0 : snap.dx
          sdy = lockedAxis === "y" ? 0 : snap.dy
          setGuides(
            snap.guides.filter((gl) => (lockedAxis === "x" ? gl.axis !== "x" : lockedAxis === "y" ? gl.axis !== "y" : true))
          )
        } else {
          setGuides([])
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

      if (g.kind === "resize") {
        if (!g.dirty) {
          if (!g.exceeded) return
          s.checkpoint()
          g.dirty = true
        }
        const dx = wx - g.wx
        const dy = wy - g.wy

        const raw = resizeBounds(g.origBounds, g.handle, dx, dy, { aspect: mods.shift, fromCenter: mods.alt })
        let next = raw

        if (!mods.toggle && !mods.shift) {
          // measure the snap on the unsnapped box, then fold the correction
          // back through the same resize so the result stays self-consistent
          const rectS = makeSnapRect("__bbox__", raw.x * v.zoom + v.x, raw.y * v.zoom + v.y, raw.w * v.zoom, raw.h * v.zoom)
          const snap = computeResizeSnap(rectS, g.handle, collectCandidates(g.ids), SNAP_THRESHOLD)
          setGuides(snap.guides)
          next = resizeBounds(g.origBounds, g.handle, dx + snap.dx / v.zoom, dy + snap.dy / v.zoom, {
            aspect: false,
            fromCenter: mods.alt,
          })
        } else {
          // snapping an edge would break the ratio, so aspect lock wins
          setGuides([])
        }

        s.updateNodes(scaleNodes(g.origNodes, g.origBounds, next))
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
          s.updateNode(g.id, { x, y, w: Math.max(w, 2), h: Math.max(h, 2), points: pts } as Partial<SquigNode>)
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
    if (g && el?.hasPointerCapture?.(g.pointerId)) {
      try {
        el.releasePointerCapture(g.pointerId)
      } catch {
        // the pointer is already gone — nothing to release
      }
    }
    gestureRef.current = null
    gestureAbort.current?.abort()
    gestureAbort.current = null
    st().setTransforming(false)
    setGestureKind(null)
    setGuides([])
    setLivePoints(null)
    setMarquee(null)
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
                } as Omit<SquigNode, "id" | "seed">,
                { select: false }
              )
      } else {
        const n = st().nodes[id]
        // BOTH dimensions, not either: a horizontal arrow is 2 units tall by
        // construction and a divider rect is deliberately thin. Testing `||`
        // would quietly replace every one of them with a fat diagonal.
        if (n && n.w < 10 && n.h < 10) {
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

    // a click with no drag inside a bigger selection narrows to what was
    // clicked — already resolved to a group or a single piece at press time
    if (g.kind === "move" && !g.exceeded && g.collapseTo) {
      s.setSelection(g.collapseTo)
    }

    teardownGesture()
  }, [st, stopAutoPan, teardownGesture])

  /** Escape or pointercancel: undo whatever the gesture has done so far. */
  const cancelGesture = useCallback(() => {
    const g = gestureRef.current
    if (!g) return
    const s = st()
    stopAutoPan()

    if (g.kind === "marquee") {
      s.setSelection(g.base)
    } else if ((g.kind === "move" || g.kind === "resize") && g.dirty) {
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
      if (!g || e.pointerId !== g.pointerId) return
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
    [updateGesture, maybeAutoPan, finishGesture]
  )

  const beginGesture = useCallback(
    (g: Gesture, e: React.PointerEvent) => {
      gestureRef.current = g
      setGestureKind(g.kind)

      // capture keeps events coming even when the pointer leaves the window
      try {
        containerRef.current?.setPointerCapture(g.pointerId)
      } catch {
        // some pointer types refuse capture; window listeners still cover us
      }

      // one controller per gesture: aborting removes every listener at once, so
      // a handler identity changing mid-drag can't strand a live listener
      gestureAbort.current?.abort()
      const ac = new AbortController()
      gestureAbort.current = ac
      const opts = { signal: ac.signal }

      window.addEventListener("pointermove", onPointerMove, opts)
      window.addEventListener(
        "pointerup",
        (ev: PointerEvent) => {
          if (ev.pointerId === g.pointerId) finishGesture()
        },
        opts
      )
      window.addEventListener(
        "pointercancel",
        (ev: PointerEvent) => {
          if (ev.pointerId === g.pointerId) cancelGesture()
        },
        opts
      )
      // a lost window means we'll never see the release; keep the work
      window.addEventListener("blur", finishGesture, opts)

      // modifiers are live: pressing Shift mid-drag locks the axis now, not on
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
      if (g.kind === "marquee") updateGesture(e.clientX, e.clientY)
    },
    [onPointerMove, finishGesture, cancelGesture, updateGesture]
  )

  const startResize = useCallback(
    (handle: Handle, e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const s = st()
      const sel = s.selection.map((id) => s.nodes[id]).filter(Boolean) as SquigNode[]
      const b = unionBounds(sel)
      if (!b) return
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
    [st, beginGesture, toWorld]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // secondary buttons and stray extra touches never start a gesture
      if (e.button > 1 || !e.isPrimary) return
      const s = st()
      containerRef.current?.focus({ preventScroll: true })

      if (s.editingId) {
        // let the click both dismiss the editor and land where it was aimed,
        // instead of costing two clicks
        if ((e.target as HTMLElement).closest?.("textarea")) return
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
        beginGesture({ kind: "create", ...common, wx, wy, id: null, what: tool === "shape" ? "shape" : "arrow" }, e)
        return
      }
      if (tool === "text") {
        // the editor mounts and focuses inside this handler, so the compat
        // mousedown that follows would hand focus straight back to the canvas —
        // blurring the editor into a commit that deletes the still-empty node
        e.preventDefault()
        const id = s.addNode({
          type: "text",
          text: "",
          fontSize: 18,
          x: wx,
          y: wy - 13,
          w: 120,
          h: 26,
        } as Omit<SquigNode, "id" | "seed">)
        s.setTool("select")
        s.setEditing(id)
        return
      }

      // -- select tool ------------------------------------------------------
      const hitId = pickAt(s.nodes, s.order, wx, wy, s.viewport.zoom)

      if (hitId) {
        const grouped = !!s.nodes[hitId]?.groupIds?.length
        // ⌘/Ctrl reaches past a group to the one thing under the cursor. With
        // nothing to reach past it has no such job, so outside a group it
        // falls back to toggling — which is what a Ctrl+click is everywhere
        // that isn't a design tool.
        const deep = mods.toggle && grouped
        const hitSet = deep ? [hitId] : s.expandSelection([hitId])
        const additive = !deep && (mods.shift || mods.toggle)
        let sel = s.selection
        let collapseTo: string[] | null = null

        if (additive) {
          if (hitSet.every((id) => sel.includes(id))) {
            // toggling something off is the whole interaction — no drag follows
            s.setSelection(sel.filter((i) => !hitSet.includes(i)))
            return
          }
          sel = [...new Set([...sel, ...hitSet])]
          s.setSelection(sel)
        } else if (!hitSet.every((id) => sel.includes(id))) {
          sel = hitSet
          s.setSelection(sel)
        } else if (sel.length > hitSet.length) {
          // already part of a bigger selection: hold the set together so it
          // can be dragged, and only narrow down if this turns out to be a click
          collapseTo = hitSet
        }

        const sourcePos: Record<string, { x: number; y: number }> = {}
        const sourceIds: string[] = []
        // document order, matching what cloneSelectionInPlace returns
        for (const id of s.order) {
          if (!sel.includes(id)) continue
          const n = s.nodes[id]
          if (n) {
            sourcePos[id] = { x: n.x, y: n.y }
            sourceIds.push(id)
          }
        }
        if (!sourceIds.length) return
        beginGesture({ kind: "move", ...common, wx, wy, sourceIds, sourcePos, cloneIds: null, dirty: false, collapseTo }, e)
        return
      }

      // empty canvas — marquee, with the current selection as its base
      beginGesture({ kind: "marquee", ...common, wx, wy, base: s.selection }, e)
    },
    [st, tool, isSpacebarHeld, toWorld, beginGesture, dropComponent]
  )

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const s = st()
      const hitId = pick(e)
      if (!hitId) return
      const n = s.nodes[hitId]
      if (!n) return
      // first double-click steps into a group; the next one edits what's inside
      if (n.groupIds?.length && !(s.selection.length === 1 && s.selection[0] === hitId)) {
        s.setSelection([hitId])
        return
      }
      // double-clicking inside a multi-selection narrows to what you clicked
      if (s.selection.length !== 1 || s.selection[0] !== hitId) s.setSelection([hitId])
      if (n.type === "text") s.setEditing(hitId)
      if (n.type === "component") {
        const def = getDef(n.kind)
        if (def?.controls.some((c) => c.type === "text")) s.setEditing(hitId)
      }
    },
    [st, pick]
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
      const hitId = pick(e)
      // right-clicking outside the current selection re-targets it
      if (hitId && !s.selection.includes(hitId)) s.setSelection(s.expandSelection([hitId]))
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
      if (gestureRef.current || s.tool !== "select" || isSpacebarHeld || s.editingId) {
        if (hoverId) setHoverId(null)
        return
      }
      if (hoverRafRef.current !== null) return
      const { clientX, clientY } = e
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null
        // the same predicate the click uses — an affordance drawn from
        // different geometry than the hit test is just a lie
        setHoverId(pick({ clientX, clientY }))
      })
    },
    [st, toWorld, hoverId, isSpacebarHeld, pick]
  )

  const onPointerLeave = useCallback(() => setHoverId(null), [])

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
          case "KeyC":
            e.preventDefault()
            s.copySelected()
            return
          case "KeyX":
            e.preventDefault()
            s.cutSelected()
            return
          case "KeyV": {
            e.preventDefault()
            if (e.shiftKey) {
              // paste in place — right back where it was copied from
              const cb = s.clipboard
              if (cb.length) s.pasteClipboard([Math.min(...cb.map((n) => n.x)), Math.min(...cb.map((n) => n.y))])
            } else {
              s.pasteClipboard(pointerWorld.current ?? undefined)
            }
            return
          }
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
          // the canvas ignores these, so stop the browser navigating away
          case "ArrowLeft":
          case "ArrowRight":
          case "ArrowUp":
          case "ArrowDown":
            e.preventDefault()
            return
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
            s.setArrowHead(true)
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
          else if (s.contextMenu) s.setContextMenu(null)
          else if (s.placing) s.setPlacing(null)
          else if (s.panel) s.setPanel(null)
          else if (s.selection.length) s.selectNone()
          else {
            s.setTool("select")
            containerRef.current?.blur()
          }
          break
        case "Tab": {
          // Tab is how you move between controls. Only claim it when the
          // canvas itself has focus — otherwise a click on the rail traps the
          // keyboard and every Tab cycles the selection instead of moving on.
          const focused = document.activeElement
          if (focused !== containerRef.current && focused !== document.body) break
          e.preventDefault()
          s.cycleSelection(e.shiftKey ? -1 : 1)
          break
        }
        case "v": s.setTool("select"); break
        case "r": s.setShapeKind("rect"); s.setTool("shape"); break
        case "o": s.setShapeKind("ellipse"); s.setTool("shape"); break
        case "p": s.setTool("draw"); break
        case "t": s.setTool("text"); break
        case "l": s.setArrowHead(false); s.setTool("arrow"); break
        case "a": s.setArrowHead(true); s.setTool("arrow"); break
        case "c": s.setPanel("components"); break
        case "b": s.setPanel("blocks"); break
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!s.selection.length) break
          e.preventDefault()
          // coalesce a burst of nudges into one undo step, but only while it's
          // the same selection — otherwise ⌘Z reverts a move to another object
          const sig = s.selection.join(",")
          const nudge = nudgeRef.current
          // the burst also has to still be writing against its own checkpoint.
          // Compare the entry itself, not the stack depth: past is capped at
          // MAX_HISTORY, so past a hundred edits the length stops changing and
          // a count would happily coalesce onto someone else's entry.
          if (nudge.timer === null || nudge.sel !== sig || nudge.top !== s.past[s.past.length - 1]) {
            s.checkpoint()
            nudge.sel = sig
            const after = st().past
            nudge.top = after[after.length - 1]
          } else {
            clearTimeout(nudge.timer)
          }
          nudge.timer = setTimeout(() => (nudge.timer = null), 900)
          const d = e.shiftKey ? 10 : 1
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
  const hoverNode = hoverId && !selection.includes(hoverId) ? nodes[hoverId] : null

  const cursorStyle = isSpacebarHeld && !gestureKind
    ? "grab"
    : placing || tool === "shape" || tool === "arrow" || tool === "draw" || tool === "text"
      ? "crosshair"
      : gestureKind === "move"
        ? (altHeld ? "copy" : "move")
        : hoverId && tool === "select"
          ? (altHeld ? "copy" : "move")
          : "default"

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="absolute inset-0 overflow-hidden touch-none outline-none select-none"
      style={{
        cursor: cursorStyle,
        backgroundColor: "var(--sq-bg)",
        backgroundImage: "radial-gradient(circle, var(--sq-grid) 1px, transparent 1px)",
        backgroundSize: `${24 * v.zoom}px ${24 * v.zoom}px`,
        backgroundPosition: `${v.x}px ${v.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMoveLocal}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
        <g transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
          {order.map((id) => {
            const n = nodes[id]
            if (!n) return null
            return (
              <g key={id} transform={`translate(${n.x} ${n.y})`}>
                <NodeSketch node={n} />
              </g>
            )
          })}
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

      {/* hover hint — shows what a click would grab */}
      {hoverNode && !editingId && !gestureKind && (
        <div
          className="pointer-events-none absolute rounded-sm"
          style={{
            left: hoverNode.x * v.zoom + v.x,
            top: hoverNode.y * v.zoom + v.y,
            width: hoverNode.w * v.zoom,
            height: hoverNode.h * v.zoom,
            border: "1px solid color-mix(in srgb, var(--sq-select) 45%, transparent)",
          }}
        />
      )}

      {/* selection rings + handles (screen space) */}
      <SelectionOverlay
        selectedNodes={selectedNodes}
        viewport={v}
        onStartResize={startResize}
        editing={!!editingId}
        gestureKind={gestureKind}
      />

      {/* smart guides */}
      {guides.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {guides.map((g, i) =>
            g.axis === "x" ? (
              <line key={i} x1={g.position} y1={g.start} x2={g.position} y2={g.end} stroke="var(--sq-select)" strokeWidth={1} />
            ) : (
              <line key={i} x1={g.start} y1={g.position} x2={g.end} y2={g.position} stroke="var(--sq-select)" strokeWidth={1} />
            )
          )}
        </svg>
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

      {/* inline text editing */}
      {editingId && <TextEditOverlay key={editingId} />}

      {/* context row */}
      <ContextRow selectedNodes={selectedNodes} viewport={v} busy={!!gestureKind} />

      {/* empty-canvas nudge */}
      {order.length === 0 && !placing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-xs -rotate-2 text-center text-xl" style={{ color: "var(--sq-muted)", fontFamily: "var(--sq-font)" }}>
            draw the idea
            <br />
            before shipping the code.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** roughly three handles' worth of box, below which they'd overlap into mush */
const HANDLE_ROOM = 34

/** the white square you actually see, in screen px */
const HANDLE_DOT = 10

/**
 * How far past the selection box a handle still answers to the pointer.
 *
 * Nothing else is grabbable out there, so the handles may as well be greedy
 * in that direction — aiming at a 10px square is the whole problem.
 */
const GRAB_OUT = 8

/** and how far inward, at most — see `grabPad` for why it's a maximum */
const GRAB_IN = 8

/**
 * Inward slop along one axis, in screen px.
 *
 * Reaching inward is where handles compete with each other, so the pad shrinks
 * on small boxes: `crowded` says a third handle sits halfway along this axis,
 * which halves the room each one gets. Without this a 40px box would resize
 * from its middle handle when you aimed at its corner.
 */
function grabPad(len: number, crowded: boolean): number {
  const room = (crowded ? len / 4 : len / 2) - HANDLE_DOT / 2
  return Math.max(0, Math.min(GRAB_IN, room))
}

/** The handle's hit rect and the offset of its dot inside it, in screen px. */
function handleHitBox(hd: Handle, w: number, h: number, padX: number, padY: number) {
  const [hx, hy] = handleOffset(hd, w, h)
  const r = HANDLE_DOT / 2
  const span = (edgeLow: boolean, edgeHigh: boolean, pad: number): [number, number] => {
    const lo = -r - (edgeLow ? GRAB_OUT : pad)
    const hi = r + (edgeHigh ? GRAB_OUT : pad)
    return [lo, hi - lo]
  }
  const [dx, width] = span(hd.includes("w"), hd.includes("e"), padX)
  const [dy, height] = span(hd.includes("n"), hd.includes("s"), padY)
  return { left: hx + dx, top: hy + dy, width, height, dotLeft: -dx - r, dotTop: -dy - r }
}

function SelectionOverlay({
  selectedNodes,
  viewport,
  onStartResize,
  editing,
  gestureKind,
}: {
  selectedNodes: SquigNode[]
  viewport: { x: number; y: number; zoom: number }
  onStartResize: (h: Handle, e: React.PointerEvent) => void
  editing: boolean
  gestureKind: Gesture["kind"] | null
}) {
  const b = unionBounds(selectedNodes)
  // the text editor draws its own dashed box; two boxes on one node is noise
  if (!b || editing) return null

  const v = viewport
  const left = b.x * v.zoom + v.x
  const top = b.y * v.zoom + v.y
  const w = b.w * v.zoom
  const h = b.h * v.zoom
  const multi = selectedNodes.length > 1

  // while a marquee is sweeping, the hit set is the message — a union box and
  // handles around a set that changes every frame is just flicker
  const marqueeing = gestureKind === "marquee"
  const showHandles = !gestureKind && w > 12 && h > 12
  const showWide = w >= HANDLE_ROOM
  const showTall = h >= HANDLE_ROOM

  const visible = (hd: Handle) => {
    if (hd === "n" || hd === "s") return showWide
    if (hd === "e" || hd === "w") return showTall
    return true
  }

  // the n/s handles are the ones that crowd the x axis, and e/w the y axis
  const padX = grabPad(w, showWide)
  const padY = grabPad(h, showTall)

  return (
    <>
      {/* each member gets a hairline, so you can see exactly what's in the set */}
      {(multi || marqueeing) &&
        selectedNodes.map((n) => (
          <div
            key={n.id}
            className="pointer-events-none absolute rounded-sm"
            style={{
              left: n.x * v.zoom + v.x,
              top: n.y * v.zoom + v.y,
              width: n.w * v.zoom,
              height: n.h * v.zoom,
              border: "1px solid color-mix(in srgb, var(--sq-select) 50%, transparent)",
            }}
          />
        ))}

      {!marqueeing && (
        <div className="pointer-events-none absolute" style={{ left, top, width: w, height: h }}>
          <div className="absolute inset-0 rounded-sm" style={{ border: "2px solid var(--sq-select)" }} />
          {showHandles &&
            // Corners last, so they sit on top: their pads can meet a side's on
            // a tight box, and a mis-grab costs more on a corner than a side.
            // Ordering does it — a z-index here would also lift the handles
            // over the panels that come after the canvas.
            HANDLES.filter(visible)
              .slice()
              .sort((a, b) => a.length - b.length)
              .map((hd) => {
                const box = handleHitBox(hd, w, h, padX, padY)
                return (
                  <div
                    key={hd}
                    className="pointer-events-auto absolute"
                    style={{
                      left: box.left,
                      top: box.top,
                      width: box.width,
                      height: box.height,
                      cursor: HANDLE_CURSORS[hd],
                    }}
                    onPointerDown={(e) => onStartResize(hd, e)}
                  >
                    <div
                      className="pointer-events-none absolute rounded-[3px] bg-white"
                      style={{
                        left: box.dotLeft,
                        top: box.dotTop,
                        width: HANDLE_DOT,
                        height: HANDLE_DOT,
                        border: "2px solid var(--sq-select)",
                      }}
                    />
                  </div>
                )
              })}
        </div>
      )}
    </>
  )
}
