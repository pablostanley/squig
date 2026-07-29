"use client"

// ---------------------------------------------------------------------------
// The infinite canvas — pan/zoom, marquee, drag, resize, snap, create tools.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useSquig } from "@/lib/store"
import type { SquigNode, TextNode, ComponentNode } from "@/lib/types"
import { screenToWorld } from "@/lib/types"
import { computeSnap, computeResizeSnap, makeSnapRect, type GuideLine, type SnapRect } from "@/lib/canvas/snap-engine"
import { useSpacebarPan } from "@/lib/canvas/use-spacebar-pan"
import { NodeSketch, SketchPrims } from "./sketch"
import { getDef, renderComponent } from "@/lib/library/registry"
import { ContextRow } from "./context-row"

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const SNAP_THRESHOLD = 6
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
type Handle = (typeof HANDLES)[number]

type Gesture =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { kind: "move"; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; moved: boolean }
  | { kind: "marquee"; sx: number; sy: number }
  | { kind: "draw"; points: [number, number][] }
  | { kind: "create"; sx: number; sy: number; id: string | null; what: "shape" | "arrow" }
  | { kind: "resize"; handle: Handle; id: string; orig: SquigNode; sx: number; sy: number; moved: boolean }

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const gestureAbort = useRef<AbortController | null>(null)
  const nudgeCheckpointed = useRef(false)

  const nodes = useSquig((s) => s.nodes)
  const order = useSquig((s) => s.order)
  const selection = useSquig((s) => s.selection)
  const viewport = useSquig((s) => s.viewport)
  const tool = useSquig((s) => s.tool)

  const placing = useSquig((s) => s.placing)
  const editingId = useSquig((s) => s.editingId)

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [guides, setGuides] = useState<GuideLine[]>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [livePoints, setLivePoints] = useState<[number, number][] | null>(null)

  const { isSpacebarHeld } = useSpacebarPan()

  const st = useSquig.getState

  // -- coordinate helpers ---------------------------------------------------

  const toLocal = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const r = containerRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }, [])

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): [number, number] => {
      const [sx, sy] = toLocal(e)
      return screenToWorld(st().viewport, sx, sy)
    },
    [toLocal, st]
  )

  // -- wheel: pan / pinch-zoom ---------------------------------------------

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = st().viewport
      if (e.ctrlKey || e.metaKey) {
        const [sx, sy] = [e.clientX - el.getBoundingClientRect().left, e.clientY - el.getBoundingClientRect().top]
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

  // -- snap candidate collection -------------------------------------------

  const collectCandidates = useCallback(
    (excludeIds: string[]): SnapRect[] => {
      const { nodes: all, order: ord, viewport: v } = st()
      const out: SnapRect[] = []
      for (const id of ord) {
        if (excludeIds.includes(id)) continue
        const n = all[id]
        if (!n) continue
        out.push(makeSnapRect(id, n.x * v.zoom + v.x, n.y * v.zoom + v.y, n.w * v.zoom, n.h * v.zoom))
      }
      return out
    },
    [st]
  )

  // -- gesture: pointer handlers -------------------------------------------

  const endGesture = useCallback(() => {
    const g = gestureRef.current
    const s = st()
    if (g?.kind === "draw" && g.points.length > 2) {
      const xs = g.points.map((p) => p[0])
      const ys = g.points.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(Math.max(...xs) - x, 2)
      const h = Math.max(Math.max(...ys) - y, 2)
      s.addNode({
        type: "draw",
        x, y, w, h,
        points: g.points.map((p) => [p[0] - x, p[1] - y] as [number, number]),
      } as Omit<SquigNode, "id" | "seed">, { select: false })
    }
    if (g?.kind === "create" && g.id) {
      const n = st().nodes[g.id]
      if (n && (n.w < 4 || n.h < 4) && n.type === "shape") {
        // a click, not a drag — give it a friendly default size
        s.updateNode(g.id, { w: 140, h: 90 })
      }
      s.setTool("select")
      s.setSelection(g.id ? [g.id] : [])
    }
    if (g?.kind === "marquee") setMarquee(null)
    gestureRef.current = null
    gestureAbort.current?.abort()
    gestureAbort.current = null
    setGuides([])
    setLivePoints(null)
  }, [st])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current
      if (!g) return
      const s = st()
      const v = s.viewport
      const [lx, ly] = toLocal(e)

      if (g.kind === "pan") {
        s.setViewport({ ...v, x: g.ox + (e.clientX - g.sx), y: g.oy + (e.clientY - g.sy) })
        return
      }

      if (g.kind === "marquee") {
        const box = { x1: g.sx, y1: g.sy, x2: lx, y2: ly }
        setMarquee(box)
        const [wx1, wy1] = screenToWorld(v, Math.min(box.x1, box.x2), Math.min(box.y1, box.y2))
        const [wx2, wy2] = screenToWorld(v, Math.max(box.x1, box.x2), Math.max(box.y1, box.y2))
        const hits = s.order.filter((id) => {
          const n = s.nodes[id]
          return n && n.x < wx2 && n.x + n.w > wx1 && n.y < wy2 && n.y + n.h > wy1
        })
        s.setSelection(hits)
        return
      }

      if (g.kind === "move") {
        const dxs = e.clientX - g.sx
        const dys = e.clientY - g.sy
        if (!g.moved && Math.abs(dxs) < 3 && Math.abs(dys) < 3) return
        if (!g.moved) {
          s.checkpoint()
          g.moved = true
        }
        // union bbox of the dragged nodes at their would-be position (screen space)
        const ids = Object.keys(g.orig)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const id of ids) {
          const n = s.nodes[id]
          const o = g.orig[id]
          if (!n) continue
          const nx = o.x + dxs / v.zoom
          const ny = o.y + dys / v.zoom
          minX = Math.min(minX, nx); minY = Math.min(minY, ny)
          maxX = Math.max(maxX, nx + n.w); maxY = Math.max(maxY, ny + n.h)
        }
        const dragged = makeSnapRect("__drag__", minX * v.zoom + v.x, minY * v.zoom + v.y, (maxX - minX) * v.zoom, (maxY - minY) * v.zoom)
        const snap = computeSnap(dragged, collectCandidates(ids), SNAP_THRESHOLD)
        setGuides(snap.guides)
        const patches: Record<string, Partial<SquigNode>> = {}
        for (const id of ids) {
          const o = g.orig[id]
          patches[id] = { x: o.x + (dxs + snap.dx) / v.zoom, y: o.y + (dys + snap.dy) / v.zoom }
        }
        s.updateNodes(patches)
        return
      }

      if (g.kind === "resize") {
        if (!g.moved) {
          s.checkpoint()
          g.moved = true
        }
        const n = s.nodes[g.id]
        if (!n) return
        const o = g.orig
        let dx = (e.clientX - g.sx) / v.zoom
        let dy = (e.clientY - g.sy) / v.zoom
        let { x, y, w, h } = { x: o.x, y: o.y, w: o.w, h: o.h }
        if (g.handle.includes("e")) w = o.w + dx
        if (g.handle.includes("s")) h = o.h + dy
        if (g.handle.includes("w")) { x = o.x + dx; w = o.w - dx }
        if (g.handle.includes("n")) { y = o.y + dy; h = o.h - dy }
        // snap edges
        const rectS = makeSnapRect(g.id, x * v.zoom + v.x, y * v.zoom + v.y, w * v.zoom, h * v.zoom)
        const snap = computeResizeSnap(rectS, g.handle, collectCandidates([g.id]), SNAP_THRESHOLD)
        setGuides(snap.guides)
        dx = snap.dx / v.zoom
        dy = snap.dy / v.zoom
        if (g.handle.includes("e")) w += dx
        if (g.handle.includes("s")) h += dy
        if (g.handle.includes("w")) { x += dx; w -= dx }
        if (g.handle.includes("n")) { y += dy; h -= dy }
        if (w < 8) { w = 8; if (g.handle.includes("w")) x = o.x + o.w - 8 }
        if (h < 8) { h = 8; if (g.handle.includes("n")) y = o.y + o.h - 8 }
        const patch: Partial<SquigNode> = { x, y, w, h }
        if (o.type === "draw" || o.type === "arrow") {
          const kx = w / o.w
          const ky = h / o.h
          ;(patch as Partial<Extract<SquigNode, { points: unknown }>>).points = (
            o.points as [number, number][]
          ).map(([px, py]) => [px * kx, py * ky]) as never
        }
        if (o.type === "text") {
          const lines = o.text.split("\n").length
          ;(patch as Partial<TextNode>).fontSize = Math.max(8, h / (1.35 * lines))
        }
        s.updateNode(g.id, patch)
        return
      }

      if (g.kind === "draw") {
        const [wx, wy] = toWorld(e)
        g.points.push([wx, wy])
        setLivePoints([...g.points])
        return
      }

      if (g.kind === "create") {
        const [wx, wy] = toWorld(e)
        const x = Math.min(g.sx, wx)
        const y = Math.min(g.sy, wy)
        const w = Math.abs(wx - g.sx)
        const h = Math.abs(wy - g.sy)
        if (!g.id) {
          if (w < 3 && h < 3) return
          if (g.what === "shape") {
            g.id = s.addNode(
              { type: "shape", shape: s.shapeKind, fill: false, x, y, w: Math.max(w, 2), h: Math.max(h, 2) } as Omit<SquigNode, "id" | "seed">,
              { select: false }
            )
          } else {
            g.id = s.addNode(
              { type: "arrow", head: true, x, y, w: Math.max(w, 2), h: Math.max(h, 2), points: [[0, 0], [Math.max(w, 2), Math.max(h, 2)]] } as Omit<SquigNode, "id" | "seed">,
              { select: false }
            )
          }
          return
        }
        if (g.what === "arrow") {
          // keep true start/end so the arrow points the way you dragged
          const pts: [[number, number], [number, number]] = [
            [g.sx - x, g.sy - y],
            [wx - x, wy - y],
          ]
          s.updateNode(g.id, { x, y, w: Math.max(w, 2), h: Math.max(h, 2), points: pts } as Partial<SquigNode>)
        } else {
          s.updateNode(g.id, { x, y, w: Math.max(w, 2), h: Math.max(h, 2) })
        }
      }
    },
    [st, toLocal, toWorld, collectCandidates]
  )

  const beginGesture = useCallback(
    (g: Gesture) => {
      gestureRef.current = g
      // one controller per gesture: aborting removes both listeners at once, so
      // a handler identity changing mid-drag can't strand a live listener
      gestureAbort.current?.abort()
      const ac = new AbortController()
      gestureAbort.current = ac
      window.addEventListener("pointermove", onPointerMove, { signal: ac.signal })
      window.addEventListener("pointerup", endGesture, { signal: ac.signal })
      window.addEventListener("pointercancel", endGesture, { signal: ac.signal })
    },
    [onPointerMove, endGesture]
  )

  const startResize = useCallback(
    (handle: Handle, id: string, e: React.PointerEvent) => {
      e.stopPropagation()
      const n = st().nodes[id]
      if (!n) return
      beginGesture({ kind: "resize", handle, id, orig: structuredClone(n), sx: e.clientX, sy: e.clientY, moved: false })
    },
    [st, beginGesture]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      const s = st()
      if (s.editingId) return // text editor open — let it handle clicks
      const [lx, ly] = toLocal(e)
      const [wx, wy] = toWorld(e)

      // middle mouse or space = pan, any tool
      if (e.button === 1 || isSpacebarHeld) {
        beginGesture({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: s.viewport.x, oy: s.viewport.y })
        return
      }

      // placing a component from the library
      if (s.placing) {
        const def = getDef(s.placing)
        if (def) {
          s.addNode({
            type: "component",
            kind: def.kind,
            props: { ...def.defaults },
            x: wx - def.size.w / 2,
            y: wy - def.size.h / 2,
            w: def.size.w,
            h: def.size.h,
          } as Omit<SquigNode, "id" | "seed">)
        }
        s.setPlacing(null)
        s.setPanel(null)
        return
      }

      if (tool === "draw") {
        s.checkpoint()
        beginGesture({ kind: "draw", points: [[wx, wy]] })
        return
      }
      if (tool === "shape" || tool === "arrow") {
        beginGesture({ kind: "create", sx: wx, sy: wy, id: null, what: tool === "shape" ? "shape" : "arrow" })
        return
      }
      if (tool === "text") {
        const id = s.addNode({
          type: "text", text: "", fontSize: 18,
          x: wx, y: wy - 13, w: 120, h: 26,
        } as Omit<SquigNode, "id" | "seed">)
        s.setTool("select")
        s.setEditing(id)
        return
      }

      // select tool
      const hitEl = (e.target as Element).closest?.("[data-node-id]")
      const hitId = hitEl?.getAttribute("data-node-id") ?? null
      if (hitId) {
        let sel = s.selection
        if (e.shiftKey) {
          sel = sel.includes(hitId) ? sel.filter((i) => i !== hitId) : [...sel, hitId]
          s.setSelection(sel)
          return // shift-click adjusts selection, no drag
        }
        if (!sel.includes(hitId)) {
          sel = [hitId]
          s.setSelection(sel)
        }
        const orig: Record<string, { x: number; y: number }> = {}
        for (const id of sel) {
          const n = s.nodes[id]
          if (n) orig[id] = { x: n.x, y: n.y }
        }
        beginGesture({ kind: "move", sx: e.clientX, sy: e.clientY, orig, moved: false })
      } else {
        if (!e.shiftKey) s.setSelection([])
        beginGesture({ kind: "marquee", sx: lx, sy: ly })
      }
    },
    [st, tool, isSpacebarHeld, toLocal, toWorld, beginGesture]
  )

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const s = st()
      const hitEl = (e.target as Element).closest?.("[data-node-id]")
      const hitId = hitEl?.getAttribute("data-node-id")
      if (!hitId) return
      const n = s.nodes[hitId]
      if (!n) return
      if (n.type === "text") s.setEditing(hitId)
      if (n.type === "component") {
        const def = getDef(n.kind)
        if (def?.controls.some((c) => c.type === "text")) s.setEditing(hitId)
      }
    },
    [st]
  )

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const s = st()
      const hitId = (e.target as Element).closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null
      // right-clicking outside the current selection re-targets it
      if (hitId && !s.selection.includes(hitId)) s.setSelection([hitId])
      if (!hitId) s.setSelection([])
      s.setContextMenu({ x: e.clientX, y: e.clientY, nodeId: hitId })
    },
    [st]
  )

  // track cursor for placement ghost
  const onPointerMoveLocal = useCallback(
    (e: React.PointerEvent) => {
      if (st().placing) setCursor(toWorld(e))
    },
    [st, toWorld]
  )

  // -- keyboard -------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      const s = st()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        s.setCommandOpen(!s.commandOpen)
        return
      }
      if (s.commandOpen) return

      if (mod && e.key === "z") {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && e.key === "d") {
        e.preventDefault()
        s.duplicateSelected()
        return
      }
      if (mod && e.key === "a") {
        e.preventDefault()
        s.setSelection([...s.order])
        return
      }
      if (mod && e.key === "0") {
        e.preventDefault()
        s.setViewport({ x: 0, y: 0, zoom: 1 })
        return
      }
      if (mod) return

      switch (e.key) {
        case "Backspace":
        case "Delete":
          s.deleteSelected()
          break
        case "Escape":
          if (s.contextMenu) s.setContextMenu(null)
          else if (s.placing) s.setPlacing(null)
          else if (s.panel) s.setPanel(null)
          else if (s.selection.length) s.setSelection([])
          else s.setTool("select")
          break
        case "v": s.setTool("select"); break
        case "r": s.setShapeKind("rect"); s.setTool("shape"); break
        case "o": s.setShapeKind("ellipse"); s.setTool("shape"); break
        case "p": s.setTool("draw"); break
        case "t": s.setTool("text"); break
        case "a": s.setTool("arrow"); break
        case "c": s.setPanel("components"); break
        case "b": s.setPanel("blocks"); break
        case "[": s.sendToBack(s.selection); break
        case "]": s.bringToFront(s.selection); break
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!s.selection.length) break
          e.preventDefault()
          if (!nudgeCheckpointed.current) {
            s.checkpoint()
            nudgeCheckpointed.current = true
            setTimeout(() => (nudgeCheckpointed.current = false), 900)
          }
          const d = e.shiftKey ? 10 : 1
          const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0
          const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0
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

  // -- render ---------------------------------------------------------------

  const v = viewport
  const cursorStyle = isSpacebarHeld
    ? "grab"
    : placing || tool === "shape" || tool === "arrow" || tool === "draw" || tool === "text"
      ? "crosshair"
      : "default"

  const selectedNodes = useMemo(
    () => selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[],
    [selection, nodes]
  )

  const placingDef = placing ? getDef(placing) : null

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden touch-none select-none"
      style={{
        cursor: cursorStyle,
        backgroundColor: "var(--sq-bg)",
        backgroundImage: "radial-gradient(circle, var(--sq-grid) 1px, transparent 1px)",
        backgroundSize: `${24 * v.zoom}px ${24 * v.zoom}px`,
        backgroundPosition: `${v.x}px ${v.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMoveLocal}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
        <g transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
          {order.map((id) => {
            const n = nodes[id]
            if (!n) return null
            return (
              <g key={id} transform={`translate(${n.x} ${n.y})`}>
                <g pointerEvents="none">
                  <NodeSketch node={n} />
                </g>
                <rect
                  data-node-id={id}
                  x={-4 / v.zoom}
                  y={-4 / v.zoom}
                  width={n.w + 8 / v.zoom}
                  height={n.h + 8 / v.zoom}
                  fill="transparent"
                  stroke="none"
                />
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
              pointerEvents="none"
            >
              <SketchPrims
                prims={renderComponent(placingDef.kind, placingDef.defaults, placingDef.size.w, placingDef.size.h)}
                seed={7}
              />
            </g>
          )}
        </g>
      </svg>

      {/* selection rings + handles (screen space) */}
      <SelectionOverlay
        selectedNodes={selectedNodes}
        viewport={v}
        onStartResize={startResize}
        resizable={selection.length === 1 && !editingId}
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
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
            borderColor: "var(--sq-select)",
            backgroundColor: "color-mix(in srgb, var(--sq-select) 8%, transparent)",
          }}
        />
      )}

      {/* inline text editing */}
      {editingId && <TextEditOverlay key={editingId} />}

      {/* context row */}
      <ContextRow selectedNodes={selectedNodes} viewport={v} />

      {/* empty-canvas nudge */}
      {order.length === 0 && !placing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-xs -rotate-2 text-center text-xl" style={{ color: "var(--sq-muted)", fontFamily: "var(--sq-font)" }}>
            draw something ugly.
            <br />
            that&apos;s the point.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function SelectionOverlay({
  selectedNodes,
  viewport,
  onStartResize,
  resizable,
}: {
  selectedNodes: SquigNode[]
  viewport: { x: number; y: number; zoom: number }
  onStartResize: (h: Handle, id: string, e: React.PointerEvent) => void
  resizable: boolean
}) {
  if (!selectedNodes.length) return null
  const v = viewport
  const minX = Math.min(...selectedNodes.map((n) => n.x))
  const minY = Math.min(...selectedNodes.map((n) => n.y))
  const maxX = Math.max(...selectedNodes.map((n) => n.x + n.w))
  const maxY = Math.max(...selectedNodes.map((n) => n.y + n.h))
  const left = minX * v.zoom + v.x
  const top = minY * v.zoom + v.y
  const w = (maxX - minX) * v.zoom
  const h = (maxY - minY) * v.zoom
  const one = selectedNodes.length === 1 ? selectedNodes[0] : null

  const handlePos = (hd: Handle): { left: number; top: number; cursor: string } => {
    const cx = hd.includes("w") ? 0 : hd.includes("e") ? w : w / 2
    const cy = hd.includes("n") ? 0 : hd.includes("s") ? h : h / 2
    const cursors: Record<Handle, string> = {
      nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
      n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
    }
    return { left: cx - 5, top: cy - 5, cursor: cursors[hd] }
  }

  return (
    <div className="pointer-events-none absolute" style={{ left, top, width: w, height: h }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ border: "2px solid var(--sq-select)" }}
      />
      {resizable &&
        one &&
        HANDLES.map((hd) => {
          const pos = handlePos(hd)
          return (
            <div
              key={hd}
              className="pointer-events-auto absolute h-2.5 w-2.5 rounded-[3px] bg-white"
              style={{ left: pos.left, top: pos.top, cursor: pos.cursor, border: "2px solid var(--sq-select)" }}
              onPointerDown={(e) => onStartResize(hd, one.id, e)}
            />
          )
        })}
    </div>
  )
}

// ---------------------------------------------------------------------------

function TextEditOverlay() {
  const editingId = useSquig((s) => s.editingId)
  const nodes = useSquig((s) => s.nodes)
  const viewport = useSquig((s) => s.viewport)
  const st = useSquig.getState
  const node = editingId ? nodes[editingId] : null

  const isText = node?.type === "text"
  const textControlKey = useMemo(() => {
    if (!node || node.type !== "component") return null
    return getDef(node.kind)?.controls.find((c) => c.type === "text")?.key ?? null
  }, [node])

  const initial = isText
    ? (node as TextNode).text
    : node?.type === "component" && textControlKey
      ? String((node as ComponentNode).props[textControlKey] ?? "")
      : ""

  const [value, setValue] = useState(initial)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taRef.current?.focus()
    taRef.current?.select()
  }, [])

  if (!node) return null
  const v = viewport
  const fontSize = isText ? (node as TextNode).fontSize * v.zoom : 15 * v.zoom

  const commit = () => {
    const s = st()
    s.checkpoint()
    if (isText) {
      const trimmed = value.replace(/\s+$/, "")
      if (!trimmed) {
        s.removeNodes([node.id])
      } else {
        const lines = trimmed.split("\n")
        const fs = (node as TextNode).fontSize
        const wGuess = Math.max(...lines.map((l) => l.length)) * fs * 0.5 + 10
        s.updateNode(node.id, { text: trimmed, w: Math.max(40, wGuess), h: lines.length * fs * 1.35 } as Partial<SquigNode>)
      }
    } else if (textControlKey) {
      s.updateNode(node.id, { props: { ...(node as ComponentNode).props, [textControlKey]: value } } as Partial<SquigNode>)
    }
    s.setEditing(null)
  }

  return (
    <textarea
      ref={taRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") commit()
        if (e.key === "Enter" && (e.metaKey || !isText)) {
          e.preventDefault()
          commit()
        }
      }}
      className="absolute resize-none overflow-hidden rounded-md px-2 py-1 outline-none"
      style={{
        left: node.x * v.zoom + v.x - 8,
        top: node.y * v.zoom + v.y - 6,
        minWidth: Math.max(node.w * v.zoom + 16, 140),
        height: Math.max(node.h * v.zoom + 12, fontSize * 1.8),
        fontSize,
        fontFamily: "var(--sq-font)",
        lineHeight: 1.35,
        color: "var(--sq-ink)",
        background: "rgba(255,255,255,0.92)",
        border: "1.5px dashed var(--sq-select)",
      }}
      placeholder={isText ? "say something" : "label"}
    />
  )
}
