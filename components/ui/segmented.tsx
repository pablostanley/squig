"use client"

// ---------------------------------------------------------------------------
// Segmented controls and icon toggles.
//
// A select is the wrong shape for a choice between three or four things you
// can draw: it hides every option behind a click and shows you a word where a
// picture would do. Fill tone, pen weight and text alignment are all "show me
// the options" choices, so they get segments.
//
// Everything here understands a mixed selection. Nothing pressed plus a dashed
// track means "these disagree" — pressing a segment is how you make them agree.
// ---------------------------------------------------------------------------

import * as React from "react"
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"

import { cn } from "@/lib/utils"
import type { Shared } from "@/lib/selection"

// ---------------------------------------------------------------------------

/**
 * The pressed look, shared by segments and standalone toggles.
 *
 * Active states are the one place the chrome borrows the drawing's ink, which
 * is what stops the panel reading as somebody else's UI parked on a squig. A
 * tint rather than a fill, because a row of four saturated segments would
 * out-shout the wireframe they're describing.
 */
const PRESSED = "bg-[var(--sq-ink)]/12 text-[var(--sq-ink)] ring-1 ring-inset ring-[var(--sq-ink)]/25"
const UNPRESSED = "text-muted-foreground hover:bg-accent hover:text-foreground"

const SEGMENT =
  "flex h-ctl-sm min-w-0 flex-1 items-center justify-center gap-1 rounded-chrome-xs px-1.5 text-label transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40 disabled:pointer-events-none disabled:opacity-40"

/** The sunken rail segments sit in. Shared so every track is the same track. */
const TRACK = "flex w-full min-w-0 items-center gap-0.5 rounded-chrome-md border bg-muted/40 p-[3px]"

/** A standalone toggle's own metrics — a square you press, with no rail. */
const ICON_TOGGLE =
  "flex size-ctl shrink-0 items-center justify-center rounded-chrome-sm text-label transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40 disabled:pointer-events-none disabled:opacity-35"

export interface SegmentOption<T extends string> {
  value: T
  /** tooltip and accessible name — always a word, even when the face is a glyph */
  label: string
  /** what the segment actually shows; defaults to the label */
  content?: React.ReactNode
}

/**
 * One-of-N, laid out as a track.
 *
 * Base UI's ToggleGroup is a multi-select by nature, so single choice is an
 * array of one. Re-pressing the active segment would empty that array, which
 * for an enum means "no value" — a state none of these controls have — so an
 * empty change is ignored rather than written.
 */
export function Segmented<T extends string>({
  options,
  shared,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly SegmentOption<T>[]
  shared: Shared<T>
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={shared.mixed ? [] : [shared.value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined
        if (picked !== undefined) onChange(picked)
      }}
      className={cn(TRACK, shared.mixed ? "border-dashed border-border" : "border-transparent", className)}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          title={o.label}
          aria-label={o.label}
          className={(state) => cn(SEGMENT, state.pressed ? PRESSED : UNPRESSED)}
        >
          {o.content ?? o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

// ---------------------------------------------------------------------------

/**
 * A rail of toggles that don't exclude each other — bold, italic, underline.
 *
 * Same clothes as `Segmented`, different grammar: there's no one answer here,
 * just switches sharing a track. They wear the track anyway. A row of bare
 * glyphs sitting directly above a segmented row reads as two different kinds of
 * control, when picking a weight and picking an alignment are the same kind of
 * choice made about the same words.
 *
 * Mixed lives on the segment rather than the track — one of three can disagree
 * without saying anything about the other two — so this shell has no state of
 * its own. Fill it with `IconToggle segment`.
 */
export function SegmentedToggles({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn(TRACK, "border-transparent", className)}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * A standalone on/off/mixed toggle — bold, italic, arrowheads, dashed lines.
 *
 * Mixed is drawn as a dashed outline rather than a third visual state, so it
 * reads the same way it does everywhere else in the inspector.
 */
export function IconToggle({
  label,
  hint,
  pressed,
  mixed = false,
  disabled,
  segment = false,
  onPressedChange,
  children,
  className,
}: {
  label: string
  /** keyboard shortcut, appended to the tooltip */
  hint?: string
  pressed: boolean
  mixed?: boolean
  disabled?: boolean
  /** take a segment's metrics — for sitting inside a `SegmentedToggles` track */
  segment?: boolean
  onPressedChange: (next: boolean) => void
  children: React.ReactNode
  className?: string
}) {
  const title = [label, mixed ? "mixed" : null, hint].filter(Boolean).join(" · ")

  return (
    <Toggle
      pressed={mixed ? false : pressed}
      disabled={disabled}
      // a mixed selection resolves upward: the first press turns everything on
      onPressedChange={(next) => onPressedChange(mixed ? true : next)}
      aria-label={label}
      aria-pressed={mixed ? "mixed" : pressed}
      title={title}
      className={(state) =>
        cn(
          segment ? SEGMENT : ICON_TOGGLE,
          state.pressed ? PRESSED : UNPRESSED,
          mixed && "border border-dashed border-border",
          className
        )
      }
    >
      {children}
    </Toggle>
  )
}

// ---------------------------------------------------------------------------

/**
 * A plain icon button — no pressed state, just an action. Align, distribute,
 * flip. Shares the toggle's metrics so a row of mixed buttons and toggles still
 * lines up.
 */
export function IconAction({
  label,
  disabled,
  onClick,
  children,
  className,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-ctl shrink-0 items-center justify-center rounded-chrome-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40",
        disabled ? "cursor-not-allowed text-muted-foreground opacity-35" : UNPRESSED,
        className
      )}
    >
      {children}
    </button>
  )
}
