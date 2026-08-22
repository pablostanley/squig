"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({ delay = 700, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  side = "top",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> & {
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"]
  sideOffset?: number
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-chrome-sm bg-foreground px-2.5 py-1.5 text-label text-background transition-[transform,opacity] duration-100 motion-reduce:transition-none",
            "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

/**
 * Quiet, on-demand help for a visible label. The label is the affordance: no
 * permanent info icon, but it remains a real button so keyboard and assistive
 * technology users can ask the same question as someone hovering with a mouse.
 * Delay comes from the nearest provider (700ms by default).
 */
function HelpTooltip({
  label,
  help,
  className,
  side = "left",
}: {
  label: React.ReactNode
  help: React.ReactNode
  className?: string
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"]
}) {
  const accessibleLabel = typeof label === "string" ? `About ${label}` : "More information"

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={accessibleLabel}
        className={cn(
          "cursor-help rounded-chrome-xs text-left decoration-dotted underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40",
          className
        )}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-56 text-pretty leading-snug">
        {help}
      </TooltipContent>
    </Tooltip>
  )
}

export { HelpTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
