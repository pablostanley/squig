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
import type { SquigNode, Viewport, ComponentNode, ShapeNode, ArrowNode, TextNode, FillTone } from "@/lib/types"
import { normalizeFill } from "@/lib/types"
import { fitTextBox } from "@/lib/canvas/text-reflow"
import { shared, sharedControls, sharedNumber, unionBounds } from "@/lib/selection"
import { VariantControl } from "@/components/chrome/variant-controls"
import { MixedNumberField, MixedSwitch } from "@/components/chrome/mixed-fields"
import { AlignRow } from "@/components/chrome/align-row"
import { TextAlignMenu, TextStyleToggles } from "@/components/chrome/text-controls"
import { Segmented, type SegmentOption } from "@/components/ui/segmented"
import { Panel } from "@/components/ui/panel"

/** Fill tones, as chips — the same four the inspector offers, drawn smaller. */
const FILL_OPTIONS: readonly SegmentOption<FillTone>[] = (
  [
    ["none", "No fill", undefined],
    ["paper", "Paper", "var(--sq-paper)"],
    ["light", "Light shade", "var(--sq-shade)"],
    ["strong", "Strong shade", "var(--sq-shade-strong)"],
  ] as const
).map(([value, label, bg]) => ({
  value,
  label,
  content: (
    <span
      className="block size-3 rounded-chrome-xs border border-[var(--sq-faint)]"
      style={{ background: bg ?? "transparent" }}
    />
  ),
}))

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
  const uiHidden = useSquig((s) => s.uiHidden)
  const editingId = useSquig((s) => s.editingId)
  const st = useSquig.getState

  const [size, setSize] = useState({ w: 0, h: 36 })

  // The row's own size decides whether it fits above the selection and how far
  // to pull it back to stay centred, so it has to be measured — the control set
  // changes with what's selected. A ref callback rather than an effect, because
  // this component returns null when nothing is selected: a mount-time effect
  // would run once, with no element, and never observe anything.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return
    // always the BORDER box: the placement maths below subtracts this from the
    // viewport edge, and `contentRect` would leave out the padding and border,
    // parking the row ~14px too low and letting it hang off the right edge
    const read = () => {
      const r = el.getBoundingClientRect()
      setSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const bounds = unionBounds(selectedNodes)
  if (!enabled || uiHidden || editingId || busy || !bounds) return null

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
  // centred on the selection, then clamped so it can't run off either edge
  const centred = (boxLeft + boxRight) / 2 - size.w / 2
  const style = {
    left: Math.min(Math.max(centred, 8), Math.max(8, vw - size.w - 8)),
    // flip below when there's no room above
    top: above >= 8 ? above : Math.min(boxBottom + gap, vh - size.h - 8),
  }

  const components = selectedNodes.filter((n): n is ComponentNode => n.type === "component")
  const shapes = selectedNodes.filter((n): n is ShapeNode => n.type === "shape")
  const arrows = selectedNodes.filter((n): n is ArrowNode => n.type === "arrow")
  const texts = selectedNodes.filter((n): n is TextNode => n.type === "text")

  const quick =
    components.length === selectedNodes.length
      ? sharedControls(components)
          .filter((c) => c.quick && c.type !== "text")
          .slice(0, MAX_QUICK)
      : []

  const multi = selectedNodes.length > 1
  const showFill = shapes.length === selectedNodes.length && shapes.length > 0
  const showHead = arrows.length === selectedNodes.length && arrows.length > 0
  const showText = texts.length === selectedNodes.length && texts.length > 0

  if (!quick.length && !showFill && !showHead && !showText && !multi) return null

  const patch = (make: (n: SquigNode) => Partial<SquigNode> | null, checkpoint = true) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of selectedNodes) {
      const p = make(n)
      if (p) patches[n.id] = p
    }
    if (Object.keys(patches).length) st().updateNodes(patches, { checkpoint })
  }
  // a scrub takes one checkpoint when the drag starts and then writes freely —
  // one per pixel would bury the undo stack
  const live = (make: (n: SquigNode) => Partial<SquigNode> | null) => patch(make, false)

  return (
    <Panel ref={measure} className="absolute z-20 flex-row items-center gap-3 px-2.5 py-2" style={style}>
      {multi && <AlignRow count={selectedNodes.length} />}
      {multi && (quick.length > 0 || showFill || showHead || showText) && <span className="h-4 w-px bg-border" />}

      {quick.map((c) => (
        <VariantControl key={c.key} nodes={components} control={c} compact />
      ))}

      {/* Text: the size you retype most, the three styles, and alignment folded
          behind one button — the row has no room for a fourth track. */}
      {showText && (
        <div className="flex items-center gap-1.5">
          <MixedNumberField
            label=""
            min={4}
            className="w-[74px]"
            shared={sharedNumber(texts, (n) => (n as TextNode).fontSize)}
            onGestureStart={() => st().checkpoint()}
            onCommit={(v) =>
              live((n) => (n.type === "text" && v > 0 ? (fitTextBox(n, n.text, v) as Partial<SquigNode>) : null))
            }
            onStep={(d) =>
              live((n) =>
                n.type === "text" ? (fitTextBox(n, n.text, Math.max(4, n.fontSize + d)) as Partial<SquigNode>) : null
              )
            }
          />
          <span className="h-4 w-px bg-border" />
          <TextStyleToggles texts={texts} compact />
          <TextAlignMenu texts={texts} />
        </div>
      )}

      {showFill && (
        <div className="flex w-[132px] items-center gap-2">
          <Segmented
            ariaLabel="Fill tone"
            options={FILL_OPTIONS}
            shared={shared(shapes.map((n) => normalizeFill(n.fill)))}
            onChange={(tone) => patch((n) => (n.type === "shape" ? ({ fill: tone } as Partial<SquigNode>) : null))}
          />
        </div>
      )}

      {showHead && (
        <div className="flex items-center gap-2">
          <span className="text-label text-muted-foreground">Arrowhead</span>
          <MixedSwitch
            ariaLabel="Arrowhead"
            shared={shared(arrows.map((n) => n.head))}
            onChange={(on) => patch((n) => (n.type === "arrow" ? ({ head: on } as Partial<SquigNode>) : null))}
          />
        </div>
      )}
    </Panel>
  )
}
