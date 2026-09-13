"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { CaretDownIcon } from "@phosphor-icons/react"
import { SelectionIndicator } from "@/components/ui/selection-indicator"

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-chrome-sm border border-input bg-transparent py-2 pr-2 pl-2.5 text-label whitespace-nowrap transition-colors outline-none select-none",
        "hover:border-border focus-visible:border-[var(--sq-ink)] focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/15",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "data-[size=default]:h-ctl-lg data-[size=sm]:h-ctl",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <CaretDownIcon className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" weight="bold" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> & {
  align?: React.ComponentProps<typeof SelectPrimitive.Positioner>["align"]
  sideOffset?: number
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-chrome-md bg-popover p-1.5 text-popover-foreground shadow-popup ring-1 ring-foreground/10 transition-[transform,opacity] duration-100",
            "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-ctl w-full cursor-default items-center gap-2 rounded-chrome-sm pr-8 pl-2 text-row outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<SelectionIndicator />} />
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
