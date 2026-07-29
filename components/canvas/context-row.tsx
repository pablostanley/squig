"use client"

// ---------------------------------------------------------------------------
// Context row — optional floating quick-controls above the selection.
// Off by default; toggled in the inspector's settings.
//
// With more than one thing selected it shows the align cluster plus whichever
// quick controls the whole selection has in common.
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react"

import { useSquig } from "@/lib/store"
import type { SquigNode, Viewport, ComponentNode, ShapeNode, ArrowNode } from "@/lib/types"
import { shared, sharedControls, unionBounds } from "@/lib/selection"
import { VariantControl } from "@/components/chrome/variant-controls"
import { MixedSwitch } from "@/components/chrome/mixed-fields"
import { AlignRow } from "@/components/chrome/align-row"
import { Label } from "@/components/ui/label"

/** how many knobs fit before the row stops being a "quick" anything */
const MAX_QUICK = 3

export function ContextRow({
  selectedNodes,
  viewport,
  busy = false,
}: {
  selectedNodes: SquigNode[]
  viewport: Viewport
  /** a gesture is in flight — get out of the way */
  busy?: boolean
}) {
  const enabled = useSquig((s) => s.contextRow)
  const editingId = useSquig((s) => s.editingId)
  const st = useSquig.getState

  const [size, setSize] = useState({ w: 0, h: 36 })

  // The row's own size decides whether it fits above the selection and whether
  // it needs pulling in from the edge, so it has to be measured — the control
  // set changes with what's selected. A ref callback rather than an effect,
  // because this component returns null when nothing is selected: a mount-time
  // effect would run once, with no element, and never observe anything.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return
    const r = el.getBoundingClientRect()
    setSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }))
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.contentRect
      setSize((prev) => (prev.w === box.width && prev.h === box.height ? prev : { w: box.width, h: box.height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const bounds = unionBounds(selectedNodes)
  if (!enabled || editingId || busy || !bounds) return null

  const boxLeft = bounds.x * viewport.zoom + viewport.x
  const boxTop = bounds.y * viewport.zoom + viewport.y
  const boxBottom = (bounds.y + bounds.h) * viewport.zoom + viewport.y
  const boxRight = (bounds.x + bounds.w) * viewport.zoom + viewport.x

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth
  const vh = typeof window === "undefined" ? 800 : window.innerHeight
  // a selection scrolled entirely off screen shouldn't leave its controls
  // pinned to the edge with nothing to point at
  if (boxRight < 0 || boxLeft > vw || boxBottom < 0 || boxTop > vh) return null

  const gap = 10
  const above = boxTop - size.h - gap
  const style = {
    left: Math.min(Math.max(boxLeft, 8), Math.max(8, vw - size.w - 8)),
    // flip below when there's no room above
    top: above >= 8 ? above : Math.min(boxBottom + gap, vh - size.h - 8),
  }

  const components = selectedNodes.filter((n): n is ComponentNode => n.type === "component")
  const shapes = selectedNodes.filter((n): n is ShapeNode => n.type === "shape")
  const arrows = selectedNodes.filter((n): n is ArrowNode => n.type === "arrow")

  const quick =
    components.length === selectedNodes.length
      ? sharedControls(components)
          .filter((c) => c.quick && c.type !== "text")
          .slice(0, MAX_QUICK)
      : []

  const multi = selectedNodes.length > 1
  const showFill = shapes.length === selectedNodes.length && shapes.length > 0
  const showHead = arrows.length === selectedNodes.length && arrows.length > 0

  if (!quick.length && !showFill && !showHead && !multi) return null

  const patch = (make: (n: SquigNode) => Partial<SquigNode> | null) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of selectedNodes) {
      const p = make(n)
      if (p) patches[n.id] = p
    }
    if (Object.keys(patches).length) st().updateNodes(patches, { checkpoint: true })
  }

  return (
    <div
      ref={measure}
      data-squig-chrome
      className="absolute z-20 flex items-center gap-3 rounded-lg border bg-background px-2.5 py-1.5 shadow-md"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {multi && <AlignRow count={selectedNodes.length} />}
      {multi && (quick.length > 0 || showFill || showHead) && <span className="h-4 w-px bg-border" />}

      {quick.map((c) => (
        <VariantControl key={c.key} nodes={components} control={c} compact />
      ))}

      {showFill && (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-normal text-muted-foreground">Fill</Label>
          <MixedSwitch
            ariaLabel="Scribble fill"
            shared={shared(shapes.map((n) => n.fill))}
            onChange={(on) => patch((n) => (n.type === "shape" ? ({ fill: on } as Partial<SquigNode>) : null))}
          />
        </div>
      )}

      {showHead && (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-normal text-muted-foreground">Arrowhead</Label>
          <MixedSwitch
            ariaLabel="Arrowhead"
            shared={shared(arrows.map((n) => n.head))}
            onChange={(on) => patch((n) => (n.type === "arrow" ? ({ head: on } as Partial<SquigNode>) : null))}
          />
        </div>
      )}
    </div>
  )
}
