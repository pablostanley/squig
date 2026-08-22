"use client"

// ---------------------------------------------------------------------------
// Panel — the floating chrome surface, and the one place its look is decided.
//
// Every piece of squig's UI that hovers over the canvas is one of these: the
// inspector, the library, the tool rail, the context row, the command palette.
// They used to each spell out their own border/shadow/radius, which is how you
// end up with five panels that are almost the same. Now there is one.
//
// The surface is deliberately quiet — paper, a hairline, a soft shadow — so the
// drawing stays the loudest thing on screen. What ties it to the drawing is the
// accent: active states borrow the live theme's ink, so switching to Riso red
// moves the chrome too rather than leaving grey knobs on a red wireframe.
// ---------------------------------------------------------------------------

import * as React from "react"
import { Collapsible } from "@base-ui/react/collapsible"
import { CaretRightIcon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------

/**
 * A floating surface.
 *
 * `data-squig-chrome` marks it as UI rather than canvas — the canvas checks for
 * it when deciding whether a pointer press should start a selection.
 */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-squig-chrome
      className={cn(
        "flex flex-col overflow-hidden rounded-chrome-lg border border-border/80 bg-background shadow-panel",
        className
      )}
      // a press on chrome is never a press on the canvas
      onPointerDown={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  )
}

/** Title strip. Sticky so a long inspector keeps saying what it is editing. */
export function PanelHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-gutter py-3",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-row leading-tight font-medium">{title}</h2>
        {subtitle && <p className="mt-1 truncate text-label leading-tight text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-0.5">{right}</div>}
    </div>
  )
}

export function PanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2 border-t border-border/70 p-3", className)}>{children}</div>
  )
}

// ---------------------------------------------------------------------------

/**
 * Which sections are folded shut.
 *
 * Module-level rather than component state: the inspector remounts its body on
 * every selection change (to drop half-typed drafts), so anything held in a
 * hook would spring back open the moment you clicked a different node. Keyed by
 * section id, so "I always keep Position closed" survives the whole session.
 */
const collapsed = new Set<string>()
const listeners = new Set<() => void>()

function toggleSection(id: string) {
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
  listeners.forEach((fn) => fn())
}

/** Reveal a section when the canvas hands one of its nested properties over. */
export function openPanelSection(id: string) {
  if (!collapsed.delete(id)) return
  listeners.forEach((fn) => fn())
}

function useSectionOpen(id: string): boolean {
  return React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => !collapsed.has(id),
    () => true
  )
}

/**
 * A folding group of rows.
 *
 * The header is the whole hit target — a 6px chevron is a cruel thing to ask
 * anyone to hit. `count` prints when a section only applies to part of the
 * selection ("Fill (2)"), which is the honest way to say that this knob will
 * not touch the other three things you have selected.
 */
export function PanelSection({
  id,
  title,
  count,
  right,
  children,
  className,
}: {
  id: string
  title: string
  /** how many of the selected nodes this section actually edits */
  count?: number
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const open = useSectionOpen(id)

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={() => toggleSection(id)}
      className={cn("border-b border-border/60 last:border-b-0", className)}
    >
      <div className="flex items-center gap-1 pr-3">
        {/* The title carries real weight and sits in the foreground colour, so
            the eye lands on "Fill" before it lands on "Tone". A panel where the
            headings are as quiet as the labels has no hierarchy at all — it
            just has rows. */}
        <Collapsible.Trigger className="group flex min-w-0 flex-1 items-center gap-1.5 px-gutter pt-gutter pb-2 text-left outline-none">
          <span className="truncate text-label font-medium text-foreground">{title}</span>
          {count !== undefined && <span className="text-micro text-muted-foreground tabular-nums">({count})</span>}
          <CaretRightIcon
            weight="bold"
            className="ml-auto size-2.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-data-[panel-open]:rotate-90"
          />
        </Collapsible.Trigger>
        {right}
      </div>
      {/* Base UI measures the panel and publishes its height as a custom
          property; the transition is ours to write. overflow-hidden matters —
          without it the rows spill out of the box while it collapses. */}
      <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] data-starting-style:h-0 data-ending-style:h-0">
        <div className="flex flex-col gap-row px-gutter pt-0.5 pb-4">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

// ---------------------------------------------------------------------------

/**
 * One labelled row — the alignment seam the whole panel hangs off.
 *
 * The label column is a fixed width on purpose. Every row in every section
 * lands its control on the same vertical line, which is most of what makes a
 * dense panel read as designed rather than assembled.
 */
export function Row({
  label,
  htmlFor,
  children,
  align = "center",
  spread = false,
  className,
}: {
  label?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  /** "start" lets a tall control (a wrapping toggle grid) sit against the label */
  align?: "center" | "start"
  /**
   * Let the label run to its natural width and push the control to the far
   * edge. For a switch — where the control is a fixed 32px and the label is a
   * sentence like "Context menu" — the seam would otherwise clip the words to
   * make room for whitespace.
   */
  spread?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex gap-3", align === "center" ? "items-center" : "items-start", className)}>
      {label !== undefined && (
        <label
          htmlFor={htmlFor}
          className={cn(
            "shrink-0 truncate text-label text-muted-foreground select-none",
            spread ? "flex-1" : "w-label",
            align === "start" && "pt-2"
          )}
        >
          {label}
        </label>
      )}
      <div className={cn("flex items-center gap-1.5", spread ? "shrink-0" : "min-w-0 flex-1")}>{children}</div>
    </div>
  )
}

/** A row whose control needs the full width — long text, a grid of previews. */
export function StackRow({
  label,
  children,
  className,
}: {
  label?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label !== undefined && <span className="text-label text-muted-foreground select-none">{label}</span>}
      {children}
    </div>
  )
}

/** Explanatory aside — grouping hints, empty states, "these don't share knobs". */
export function PanelNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-label leading-relaxed text-muted-foreground", className)}>{children}</p>
}
