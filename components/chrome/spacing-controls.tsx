"use client"

import { SquaresFourIcon } from "@phosphor-icons/react"
import { useSquig } from "@/lib/store"
import { changeMatchingGaps, spacingTracks } from "@/lib/canvas/spacing"
import type { SquigNode } from "@/lib/types"
import { MixedTextField } from "./mixed-fields"
import { IconAction } from "@/components/ui/segmented"

export function SpacingControls({ nodes }: { nodes: SquigNode[] }) {
  const tracks = spacingTracks(nodes)
  const s = useSquig.getState
  return <div className="flex flex-col gap-1.5">
    <IconAction label="Tidy up" onClick={() => s().tidySelected()}><SquaresFourIcon className="size-4" /></IconAction>
    {(["x", "y"] as const).map((axis) => {
      const gaps = tracks.filter((t) => t.axis === axis).map((t) => t.gap)
      if (!gaps.length) return null
      const value = gaps[0]
      return <label key={axis} className="flex items-center gap-2 text-label"><span className="shrink-0">{axis === "x" ? "Horizontal gap" : "Vertical gap"}</span><MixedTextField ariaLabel={axis === "x" ? "Horizontal gap" : "Vertical gap"}
        shared={value !== null && gaps.every((g) => g === value) ? { mixed: false, value: String(Math.round(value * 100) / 100) } : { mixed: true }}
        onCommit={(raw) => { const gap = Number(raw); if (raw.trim() && Number.isFinite(gap) && gap >= 0) s().edit(() => s().updateNodes(changeMatchingGaps(nodes, axis, null, gap))) }} /></label>
    })}
  </div>
}
