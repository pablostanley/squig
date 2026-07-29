"use client"

// ---------------------------------------------------------------------------
// Align + distribute cluster. Appears once there's more than one thing
// selected — until then there is nothing to align anything to.
// ---------------------------------------------------------------------------

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from "lucide-react"

import { useSquig } from "@/lib/store"
import { cn } from "@/lib/utils"

type Edge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom"

const ALIGN: { edge: Edge; label: string; icon: typeof AlignStartVertical }[] = [
  { edge: "left", label: "Align left", icon: AlignStartVertical },
  { edge: "hcenter", label: "Align horizontal centres", icon: AlignCenterVertical },
  { edge: "right", label: "Align right", icon: AlignEndVertical },
  { edge: "top", label: "Align top", icon: AlignStartHorizontal },
  { edge: "vcenter", label: "Align vertical centres", icon: AlignCenterHorizontal },
  { edge: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
]

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
        disabled ? "cursor-not-allowed opacity-35" : "hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

export function AlignRow({ count, className }: { count: number; className?: string }) {
  const st = useSquig.getState
  if (count < 2) return null
  // evening out gaps needs a gap on both sides of something
  const canDistribute = count >= 3

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {ALIGN.map(({ edge, label, icon: Icon }) => (
        <IconButton key={edge} label={label} onClick={() => st().alignSelected(edge)}>
          <Icon className="size-3.5" />
        </IconButton>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <IconButton
        label={canDistribute ? "Distribute horizontally" : "Distribute needs 3 or more"}
        disabled={!canDistribute}
        onClick={() => st().distributeSelected("h")}
      >
        <AlignHorizontalDistributeCenter className="size-3.5" />
      </IconButton>
      <IconButton
        label={canDistribute ? "Distribute vertically" : "Distribute needs 3 or more"}
        disabled={!canDistribute}
        onClick={() => st().distributeSelected("v")}
      >
        <AlignVerticalDistributeCenter className="size-3.5" />
      </IconButton>
    </div>
  )
}
