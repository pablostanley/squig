"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SquaresFourIcon } from "@phosphor-icons/react"
import { useSquig } from "@/lib/store"
import { resizeSpacedNodes, spacingReorder, changeMatchingGaps, spaceNodes, spacingOrder, spacingTracks, type SpacingAxis } from "@/lib/canvas/spacing"
import { nodeVisualBounds } from "@/lib/canvas/line-routing"
import { unionBounds } from "@/lib/selection"
import type { SquigNode, Viewport } from "@/lib/types"

type Drag = { pointer: number; x: number; y: number; nodes: SquigNode[]; axis: SpacingAxis; gap: number; id?: string; resize?: boolean; dirty: boolean }
const pink = "#e84c96"

export function SpacingOverlay({ nodes, viewport: v }: { nodes: SquigNode[]; viewport: Viewport }) {
  const drag = useRef<Drag | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [marked, setMarked] = useState<string[]>([])
  const st = useSquig.getState
  const finish = useCallback((cancel = false) => {
    if (drag.current?.dirty) {
      if (cancel) st().revertToCheckpoint()
      else st().finishCheckpoint()
    }
    drag.current = null
    setLabel(null)
  }, [st])
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (drag.current && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(true) }
    }
    window.addEventListener("keydown", cancel, true)
    return () => { window.removeEventListener("keydown", cancel, true); if (drag.current?.dirty) st().revertToCheckpoint() }
  }, [finish, st])
  const start = useCallback((e: React.PointerEvent<HTMLButtonElement>, options: Pick<Drag, "axis" | "gap" | "id" | "resize">) => {
    e.stopPropagation()
    if (e.button !== 0 || !e.isPrimary || drag.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, nodes, ...options, dirty: false }
  }, [nodes])
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = drag.current
    if (!g || g.pointer !== e.pointerId) return
    e.stopPropagation()
    if (!g.dirty && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return
    if (!g.dirty) {
      if (g.id) {
        const axis = Math.abs(e.clientX - g.x) >= Math.abs(e.clientY - g.y) ? "x" : "y"
        const track = spacingTracks(g.nodes).find((t) => t.axis === axis && t.gap !== null && t.nodes.some((n) => n.id === g.id))
        if (track) { g.axis = axis; g.gap = track.gap! }
      }
      st().checkpoint(); g.dirty = true
    }
    const delta = (g.axis === "x" ? e.clientX - g.x : e.clientY - g.y) / v.zoom
    let patches: Record<string, Partial<SquigNode>>
    if (g.resize) {
      patches = resizeSpacedNodes(g.nodes, marked, g.axis, delta)
      setLabel(`${Math.round(delta)} px`)
    } else if (g.id) {
      const track = spacingTracks(g.nodes).find((t) => t.axis === g.axis && t.nodes.some((n) => n.id === g.id))!
      const { order, index } = spacingReorder(track.nodes, g.axis, g.id, delta)
      patches = spaceNodes(track.nodes, { axis: g.axis, gap: g.gap, order })
      setLabel(`Position ${index + 1}`)
    } else {
      const gap = Math.max(0, Math.round(g.gap + delta))
      patches = changeMatchingGaps(g.nodes, g.axis, g.gap, gap)
      setLabel(`${gap} px`)
    }
    st().updateNodes(patches)
  }
  const handlers = {
    onPointerMove: move,
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => { e.stopPropagation(); if (e.pointerId === drag.current?.pointer) finish() },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.pointerId === drag.current?.pointer) finish(true) },
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.pointerId === drag.current?.pointer) finish(true) },
  }
  const resizeKey = (e: React.KeyboardEvent, axis: SpacingAxis) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return
    e.preventDefault(); e.stopPropagation()
    const delta = (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) * (e.shiftKey ? 10 : 1)
    st().edit(() => st().updateNodes(resizeSpacedNodes(nodes, marked, axis, delta)))
  }
  if (nodes.length < 2 || nodes.some((n) => n.locked)) return null
  const tracks = spacingTracks(nodes)
  const bounds = unionBounds(nodes.map(nodeVisualBounds))!
  return <div className="pointer-events-none absolute inset-0" onDoubleClick={(e) => e.stopPropagation()}>
    <button aria-label="Tidy up" title="Tidy up" className="pointer-events-auto absolute flex size-7 items-center justify-center rounded bg-background shadow-panel hover:bg-accent"
      style={{ left: (bounds.x + bounds.w) * v.zoom + v.x - 28, top: (bounds.y + bounds.h) * v.zoom + v.y + 12, color: pink }}
      onPointerDown={(e) => e.stopPropagation()} onClick={() => st().tidySelected()}><SquaresFourIcon size={16} /></button>
    {tracks.filter((t) => t.gap !== null).flatMap((t) => spacingOrder(t.nodes, t.axis).slice(1).map((n, i) => {
      const a = nodeVisualBounds(spacingOrder(t.nodes, t.axis)[i]); const b = nodeVisualBounds(n)
      const x = t.axis === "x" ? a.x + a.w + t.gap! / 2 : b.x + b.w / 2
      const y = t.axis === "y" ? a.y + a.h + t.gap! / 2 : b.y + b.h / 2
      return <button key={`${t.axis}-${n.id}`} aria-label={`${t.axis === "x" ? "Horizontal" : "Vertical"} gap ${Math.round(t.gap!)} pixels`} title="Drag to change matching gaps"
        className="group pointer-events-auto absolute flex size-7 items-center justify-center" style={{ left: x * v.zoom + v.x - 14, top: y * v.zoom + v.y - 14, cursor: t.axis === "x" ? "ew-resize" : "ns-resize", touchAction: "none" }}
        onPointerDown={(e) => start(e, { axis: t.axis, gap: t.gap! })} {...handlers}
        onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); const gap = Math.max(0, t.gap! + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) * (e.shiftKey ? 10 : 1)); st().edit(() => st().updateNodes(changeMatchingGaps(nodes, t.axis, t.gap, gap))) } }}>
        <span className="rounded-full opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 [@media(hover:none)]:opacity-100" style={{ background: pink, width: t.axis === "x" ? 4 : 16, height: t.axis === "x" ? 16 : 4 }} />
      </button>
    }))}
    {nodes.map((n) => {
      const t = tracks.find((t) => t.gap !== null && t.nodes.some((a) => a.id === n.id))
      if (!t) return null
      const b = nodeVisualBounds(n)
      return <button key={`ring-${n.id}`} aria-label={`Reorder ${n.id}; click to mark for resizing`} aria-pressed={marked.includes(n.id)} title="Drag to reorder. Click to mark for resizing."
        className="pointer-events-auto absolute flex size-7 items-center justify-center" style={{ left: (b.x + b.w / 2) * v.zoom + v.x - 14, top: (b.y + b.h / 2) * v.zoom + v.y - 14, cursor: "grab", touchAction: "none" }}
        onPointerDown={(e) => start(e, { axis: t.axis, gap: t.gap!, id: n.id })} {...handlers}
        onPointerUp={(e) => { e.stopPropagation(); if (e.pointerId !== drag.current?.pointer) return; if (drag.current && !drag.current.dirty) setMarked((ids) => ids.includes(n.id) ? ids.filter((id) => id !== n.id) : [...ids, n.id]); finish() }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault(); e.stopPropagation()
            const axis = ["ArrowLeft", "ArrowRight"].includes(e.key) ? "x" : "y"
            const track = tracks.find((t) => t.axis === axis && t.gap !== null && t.nodes.some((a) => a.id === n.id))
            if (!track) return
            const order = spacingOrder(track.nodes, axis).map((n) => n.id)
            const index = order.indexOf(n.id)
            const next = index + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1)
            if (next < 0 || next >= order.length) return
            order.splice(index, 1); order.splice(next, 0, n.id)
            st().edit(() => st().updateNodes(spaceNodes(track.nodes, { axis, gap: track.gap!, order })))
          }
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setMarked((ids) => ids.includes(n.id) ? ids.filter((id) => id !== n.id) : [...ids, n.id]) } }}>
        <span className="size-2.5 rounded-full border-2" style={{ borderColor: pink, background: marked.includes(n.id) ? pink : "var(--sq-bg)" }} />
      </button>
    })}
    {marked.length > 0 && <>
      <button aria-label="Resize marked width, keep gaps" className="pointer-events-auto absolute h-ctl-sm rounded border bg-background px-2 text-label"
        style={{ left: bounds.x * v.zoom + v.x, top: (bounds.y + bounds.h) * v.zoom + v.y + 44, color: pink, touchAction: "none" }}
        onPointerDown={(e) => start(e, { axis: "x", gap: 0, resize: true })} onKeyDown={(e) => resizeKey(e, "x")} {...handlers}>Resize width</button>
      <button aria-label="Resize marked height, keep gaps" className="pointer-events-auto absolute h-ctl-sm rounded border bg-background px-2 text-label"
        style={{ left: bounds.x * v.zoom + v.x + 100, top: (bounds.y + bounds.h) * v.zoom + v.y + 44, color: pink, touchAction: "none" }}
        onPointerDown={(e) => start(e, { axis: "y", gap: 0, resize: true })} onKeyDown={(e) => resizeKey(e, "y")} {...handlers}>Resize height</button>
    </>}
    {label && <output className="absolute rounded px-2 py-1 text-label text-white" style={{ left: (bounds.x + bounds.w / 2) * v.zoom + v.x, top: bounds.y * v.zoom + v.y - 32, background: pink }}>{label}</output>}
  </div>
}
