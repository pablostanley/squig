"use client"

import * as React from "react"
import { Menu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"
import { CaretRightIcon } from "@phosphor-icons/react"
import { SelectionIndicator } from "@/components/ui/selection-indicator"

const POPUP =
  "max-h-(--available-height) min-w-52 origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-chrome-lg bg-popover p-1.5 text-popover-foreground shadow-popup ring-1 ring-foreground/10 outline-none transition-[transform,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"

/**
 * A menu row is a place to land, not a line of text — it gets a real height and
 * real side padding, and the highlight is a soft pill inset from the popup edge
 * rather than a full-bleed band.
 */
const ITEM =
  "relative flex h-ctl-lg cursor-default items-center gap-2.5 rounded-chrome-sm px-2.5 text-row outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"

function DropdownMenu(props: React.ComponentProps<typeof Menu.Root>) {
  return <Menu.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof Menu.Trigger>) {
  return <Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  children,
  align = "start",
  sideOffset = 8,
  finalFocus,
  ...props
}: React.ComponentProps<typeof Menu.Popup> & {
  align?: React.ComponentProps<typeof Menu.Positioner>["align"]
  sideOffset?: number
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <Menu.Popup data-slot="dropdown-menu-content" finalFocus={finalFocus} className={cn(POPUP, className)} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = "default",
  selected,
  action,
  children,
  ...props
}: React.ComponentProps<typeof Menu.Item> & {
  variant?: "default" | "destructive"
  /** Pass a boolean on every selectable row to reserve the check's rightmost slot. */
  selected?: boolean
  /** A sibling control before the check; null reserves its space on other rows. */
  action?: React.ReactNode
}) {
  const item = (
    <Menu.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      aria-current={selected || undefined}
      className={cn(
        ITEM,
        variant === "destructive" && "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive",
        className,
        selected !== undefined && "pr-8",
        action !== undefined && (selected !== undefined ? "pr-16" : "pr-10")
      )}
      {...props}
    >
      {children}
      {selected !== undefined && <SelectionIndicator selected={selected} />}
    </Menu.Item>
  )

  // A nested button also activates the menu item; keep row actions as siblings.
  return action === undefined ? item : (
    <div data-slot="dropdown-menu-item-row" className="group/row relative">
      {item}
      {action && (
        <div className={cn("absolute top-1/2 -translate-y-1/2", selected !== undefined ? "right-8" : "right-1.5")}>
          {action}
        </div>
      )}
    </div>
  )
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-separator" className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} {...props} />
}

/** Right-aligned hint — a shortcut or a file extension. */
function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto pl-6 text-micro text-muted-foreground", className)}
      {...props}
    />
  )
}

function DropdownMenuSub(props: React.ComponentProps<typeof Menu.SubmenuRoot>) {
  return <Menu.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof Menu.SubmenuTrigger>) {
  return (
    <Menu.SubmenuTrigger data-slot="dropdown-menu-sub-trigger" className={cn(ITEM, className)} {...props}>
      {children}
      <CaretRightIcon className="ml-auto size-3.5 text-muted-foreground" weight="bold" />
    </Menu.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.Popup>) {
  return (
    <Menu.Portal>
      <Menu.Positioner align="start" sideOffset={4} className="z-50 outline-none">
        <Menu.Popup data-slot="dropdown-menu-sub-content" className={cn(POPUP, className)} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
}
