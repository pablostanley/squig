"use client"

// ---------------------------------------------------------------------------
// Align + distribute cluster. Appears once there's more than one thing
// selected — until then there is nothing to align anything to.
// ---------------------------------------------------------------------------

import {
  AlignBottomSimpleIcon,
  AlignCenterHorizontalSimpleIcon,
  AlignCenterVerticalSimpleIcon,
  AlignLeftSimpleIcon,
  AlignRightSimpleIcon,
  AlignTopSimpleIcon,
  ArrowsOutLineHorizontalIcon,
  ArrowsOutLineVerticalIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"

import { useSquig } from "@/lib/store"
import { cn } from "@/lib/utils"
import { IconAction } from "@/components/ui/segmented"

type Edge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom"

const ALIGN: { edge: Edge; label: string; icon: PhosphorIcon }[] = [
  { edge: "left", label: "Align left", icon: AlignLeftSimpleIcon },
  { edge: "hcenter", label: "Align horizontal centres", icon: AlignCenterHorizontalSimpleIcon },
  { edge: "right", label: "Align right", icon: AlignRightSimpleIcon },
  { edge: "top", label: "Align top", icon: AlignTopSimpleIcon },
  { edge: "vcenter", label: "Align vertical centres", icon: AlignCenterVerticalSimpleIcon },
  { edge: "bottom", label: "Align bottom", icon: AlignBottomSimpleIcon },
]

export function AlignRow({ count, className }: { count: number; className?: string }) {
  const st = useSquig.getState
  if (count < 2) return null
  // evening out gaps needs a gap on both sides of something
  const canDistribute = count >= 3

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {ALIGN.map(({ edge, label, icon: Icon }) => (
        <IconAction key={edge} className="size-ctl-sm" label={label} onClick={() => st().alignSelected(edge)}>
          <Icon className="size-3.5" />
        </IconAction>
      ))}
      <span className="mx-0.5 h-4 w-px bg-border" />
      <IconAction
        className="size-ctl-sm"
        label={canDistribute ? "Distribute horizontally" : "Distribute needs 3 or more"}
        disabled={!canDistribute}
        onClick={() => st().distributeSelected("h")}
      >
        <ArrowsOutLineHorizontalIcon className="size-3.5" />
      </IconAction>
      <IconAction
        className="size-ctl-sm"
        label={canDistribute ? "Distribute vertically" : "Distribute needs 3 or more"}
        disabled={!canDistribute}
        onClick={() => st().distributeSelected("v")}
      >
        <ArrowsOutLineVerticalIcon className="size-3.5" />
      </IconAction>
    </div>
  )
}
