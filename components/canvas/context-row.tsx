"use client"

// ---------------------------------------------------------------------------
// Context row — optional floating quick-controls above the selection.
// Off by default; toggled in the inspector's settings.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import type { SquigNode, Viewport, ComponentNode } from "@/lib/types"
import { getDef } from "@/lib/library/registry"
import { VariantControl } from "@/components/chrome/variant-controls"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function ContextRow({ selectedNodes, viewport }: { selectedNodes: SquigNode[]; viewport: Viewport }) {
  const enabled = useSquig((s) => s.contextRow)
  const editingId = useSquig((s) => s.editingId)
  const uiHidden = useSquig((s) => s.uiHidden)
  const st = useSquig.getState

  if (!enabled || uiHidden || editingId || selectedNodes.length !== 1) return null
  const node = selectedNodes[0]

  // Centered on the selection: anchor at its horizontal midpoint, then pull
  // back by half the row's own width.
  const left = (node.x + node.w / 2) * viewport.zoom + viewport.x
  const top = node.y * viewport.zoom + viewport.y - 46
  const style = { left, top: Math.max(top, 8), transform: "translateX(-50%)" }

  if (node.type === "component") {
    const def = getDef(node.kind)
    const quick = def?.controls.filter((c) => c.quick && c.type !== "text").slice(0, 3) ?? []
    if (!quick.length) return null
    return (
      <div
        className="absolute z-20 flex items-center gap-3 rounded-lg border bg-background px-2.5 py-1.5 shadow-md"
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {quick.map((c) => (
          <VariantControl key={c.key} node={node as ComponentNode} control={c} compact />
        ))}
      </div>
    )
  }

  if (node.type === "shape" || node.type === "arrow") {
    const isShape = node.type === "shape"
    const checked = isShape ? node.fill : node.head
    return (
      <div
        className="absolute z-20 flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 shadow-md"
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Label className="text-xs font-normal text-muted-foreground">{isShape ? "Fill" : "Arrowhead"}</Label>
        <Switch
          checked={checked}
          className="scale-90"
          onCheckedChange={(on) => {
            const s = st()
            s.checkpoint()
            s.updateNode(node.id, (isShape ? { fill: on } : { head: on }) as Partial<SquigNode>)
          }}
        />
      </div>
    )
  }

  return null
}
