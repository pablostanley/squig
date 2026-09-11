"use client"

// ---------------------------------------------------------------------------
// Fields that know how to say "these don't agree".
//
// A selection where every node holds the same value shows that value. A
// selection that disagrees shows a dash — and typing over the dash is how you
// make them agree. Nothing is written while a field has focus, and every
// commit is exactly one undo step.
//
// Numbers also scrub: drag the label and the value follows the pointer. A
// selection that agrees is set to the value under the cursor; one that
// disagrees is *nudged*, each node from its own number, so dragging a mixed
// field moves everything without first flattening it.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react"
import { NumberField } from "@base-ui/react/number-field"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { MIXED_LABEL, type Shared } from "@/lib/selection"

// ---------------------------------------------------------------------------

/**
 * An input holding a local draft while focused, committing on Enter, Tab or
 * blur. Escape throws the draft away.
 *
 * It also commits on a press anywhere outside itself, in the capture phase —
 * otherwise clicking the canvas changes the selection first, the panel
 * re-keys, and the half-typed value evaporates without ever being applied.
 */
function CommitInput({
  value,
  placeholder,
  type,
  className,
  onCommit,
  onStep,
  ariaLabel,
  unstyled = false,
}: {
  value: string
  placeholder?: string
  type?: "text" | "number"
  className?: string
  onCommit: (raw: string) => void
  /** arrow-key nudge, in the field's own units */
  onStep?: (delta: number) => void
  ariaLabel?: string
  /** the caller draws the box; render a bare input inside it */
  unstyled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  // blur() fires focusout synchronously, so the onBlur that runs is the one
  // from the CURRENT render — it still sees the pre-setDraft value. Without
  // this latch, Escape's blur commits the draft it just threw away, and
  // Enter's blur commits a second time on top of its own commit.
  const handledRef = useRef(false)
  const stateRef = useRef({ draft, value, onCommit })
  // the outside-press listener reads the latest draft without being rebuilt on
  // every keystroke; refreshing after render keeps it out of the render pass
  useEffect(() => {
    stateRef.current = { draft, value, onCommit }
  })

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current
      if (!el || document.activeElement !== el) return
      if ((e.target as HTMLElement)?.closest?.("input") === el) return
      const { draft: d, value: v, onCommit: commit } = stateRef.current
      if (d !== null && d !== v) commit(d)
      setDraft(null)
    }
    window.addEventListener("pointerdown", onDown, true)
    return () => window.removeEventListener("pointerdown", onDown, true)
  }, [])

  const flush = (next: string | null) => {
    // a no-op commit would still cost an undo step, so don't take one
    if (next !== null && next !== value) onCommit(next)
    setDraft(null)
  }

  /** Finish the edit and stop the imminent blur from finishing it again. */
  const settle = (commit: boolean) => {
    handledRef.current = true
    if (commit) flush(draft)
    else setDraft(null)
    ref.current?.blur()
  }

  const shared = {
    ref,
    type,
    inputMode: type === "number" ? ("decimal" as const) : undefined,
    "aria-label": ariaLabel,
    value: draft ?? value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onFocus: () => setDraft(value),
    onBlur: () => {
      if (handledRef.current) {
        handledRef.current = false
        return
      }
      flush(draft)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      // the canvas ignores keys from inputs, but stop them regardless so no
      // future global handler starts eating characters mid-word
      e.stopPropagation()
      if (e.key === "Enter") {
        settle(true)
      } else if (e.key === "Escape") {
        settle(false)
      } else if (onStep && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // step each node from its own value, so a mixed field stays mixed
        // instead of silently flattening the whole selection to one number
        e.preventDefault()
        setDraft(null)
        onStep((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1))
      }
    },
  }

  if (unstyled) return <input {...shared} className={cn(FIELD_INPUT, className)} />
  return <Input {...shared} className={className} />
}

/**
 * `Number("")` is 0, which would silently collapse a whole selection to zero
 * when someone clears a field and clicks away. Parse deliberately instead:
 * empty and unparseable are both "no change".
 */
function parseNumber(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  // "*2" or "+" read as an intended calculation; squig has no calculator, and
  // coercing them to an absolute value is worse than ignoring them
  if (/^[*/]/.test(t) || /^[+-]$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// The numeric field's shell, shared by both halves of the mixed/agreed split
// below so the two are pixel-identical and only their innards differ.

const FIELD_BOX =
  "flex h-ctl min-w-0 items-center gap-1.5 rounded-chrome-sm border border-input bg-transparent pr-2 pl-1.5 transition-colors hover:border-border focus-within:border-[var(--sq-ink)] focus-within:ring-2 focus-within:ring-[var(--sq-ink)]/15"

const FIELD_INPUT =
  "h-full w-full min-w-0 bg-transparent text-label tabular-nums outline-none placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

const FIELD_HANDLE =
  "flex shrink-0 cursor-ew-resize items-center rounded-chrome-xs px-1 py-1 text-micro text-muted-foreground select-none hover:bg-accent hover:text-foreground"

/**
 * The drag target when a field has no axis letter to put there — font size,
 * component variant numbers. Every number in the panel is scrubbable, so every
 * number gets a handle; a field that silently wasn't draggable would be a worse
 * wart than a small grip.
 */
function Grip() {
  return (
    <span aria-hidden className="flex h-3.5 w-2 flex-col items-center justify-center gap-[2px]">
      <span className="block size-[2px] rounded-full bg-current" />
      <span className="block size-[2px] rounded-full bg-current" />
      <span className="block size-[2px] rounded-full bg-current" />
    </span>
  )
}

/** How far the pointer travels per unit of value. Base UI's own default. */
const PIXELS_PER_UNIT = 2

// ---------------------------------------------------------------------------

/**
 * Reasons that stream values continuously — the document should follow along
 * live. Everything else (typing) only lands once the edit is finished, because
 * a controlled field that rewrites its own text mid-word is unusable: clamping
 * "1" up to the minimum size would turn the next keystroke into "80".
 */
const LIVE_REASONS = new Set(["scrub", "wheel", "keyboard", "increment-press", "decrement-press"])

/**
 * Numeric field over a possibly-mixed selection.
 *
 * `onCommit` sets an absolute value on everything; `onStep` nudges each node by
 * a delta. Scrubbing picks whichever is honest for the current selection — an
 * agreed selection can be set outright, a mixed one can only be nudged.
 *
 * Undo is the caller's job, but the *grouping* is this component's: it calls
 * `onGestureStart` exactly once before each run of changes that should collapse
 * into a single undo entry, so a 200px drag costs one step rather than a
 * hundred. `onCommit` and `onStep` must therefore not checkpoint themselves.
 */
export function MixedNumberField({
  label,
  ariaLabel,
  shared,
  onCommit,
  onStep,
  onGestureStart,
  min,
  max,
  className,
}: {
  label: string
  ariaLabel?: string
  shared: Shared<number>
  onCommit: (n: number) => void
  onStep?: (delta: number) => void
  onGestureStart?: () => void
  min?: number
  max?: number
  className?: string
}) {
  // Armed on pointer-down, spent on the drag's first actual change. Taking the
  // checkpoint on pointer-down instead would mean a plain click on the handle
  // left an undo entry that restores the state it was already in — an undo you
  // have to press twice.
  const scrubPending = useRef(false)
  const [draftEpoch, setDraftEpoch] = useState(0)

  // A mixed field has no number to hand a spinbutton, and Base UI would read
  // the empty value as zero the moment you dragged it — so the two states are
  // genuinely different widgets wearing the same clothes.
  if (shared.mixed) {
    return (
      <MixedScrubField
        label={label}
        ariaLabel={ariaLabel}
        onCommit={onCommit}
        onStep={onStep}
        onGestureStart={onGestureStart}
        className={className}
      />
    )
  }

  return (
    <NumberField.Root
      key={draftEpoch}
      value={shared.value}
      min={min}
      max={max}
      largeStep={10}
      className={cn("min-w-0", className)}
      onValueChange={(v, details) => {
        if (v === null || !LIVE_REASONS.has(details.reason)) return
        if (details.reason === "scrub") {
          // one checkpoint for the whole drag, on its first moved pixel
          if (scrubPending.current) {
            scrubPending.current = false
            onGestureStart?.()
          }
        } else {
          // a keypress or wheel tick is its own discrete edit
          onGestureStart?.()
        }
        onCommit(v)
      }}
      onValueCommitted={(v, details) => {
        // the live reasons already applied above — this is the typed path
        if (v === null || LIVE_REASONS.has(details.reason)) return
        onGestureStart?.()
        onCommit(v)
      }}
    >
      <NumberField.Group className={FIELD_BOX}>
        <NumberField.ScrubArea
          pixelSensitivity={PIXELS_PER_UNIT}
          className={FIELD_HANDLE}
          aria-label={`Drag to change ${label || "value"}`}
          onPointerDown={() => {
            scrubPending.current = true
          }}
        >
          <NumberField.ScrubAreaCursor />
          {label || <Grip />}
        </NumberField.ScrubArea>
        <NumberField.Input
          aria-label={ariaLabel || label || undefined}
          className={FIELD_INPUT}
          // the canvas listens globally; a digit typed here is not a shortcut
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") e.currentTarget.blur()
            // Base UI commits on blur. Remounting drops its private draft so
            // Escape has the same cancel meaning as the other inspector fields.
            if (e.key === "Escape") {
              e.preventDefault()
              setDraftEpoch((epoch) => epoch + 1)
            }
          }}
        />
      </NumberField.Group>
    </NumberField.Root>
  )
}

/**
 * The mixed half: a dash you can type over, and a label you can still drag.
 *
 * Dragging emits deltas rather than absolute values, so three nodes at 10, 20
 * and 30 dragged by +5 become 15, 25 and 35 — still mixed, still dragging.
 */
function MixedScrubField({
  label,
  ariaLabel,
  onCommit,
  onStep,
  onGestureStart,
  className,
}: {
  label: string
  ariaLabel?: string
  onCommit: (n: number) => void
  onStep?: (delta: number) => void
  onGestureStart?: () => void
  className?: string
}) {
  // fractional pointer travel banks up here until it's worth a whole unit,
  // otherwise a slow drag rounds to zero on every frame and never moves
  const carry = useRef(0)

  const startScrub = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!onStep) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    carry.current = 0
    // spent on the first whole unit, not here — a click that never moves
    // shouldn't leave an undo entry that undoes nothing
    let pending = true

    const move = (ev: PointerEvent) => {
      carry.current += ev.movementX / PIXELS_PER_UNIT
      const whole = Math.trunc(carry.current)
      if (!whole) return
      carry.current -= whole
      if (pending) {
        pending = false
        onGestureStart?.()
      }
      onStep(whole * (ev.shiftKey ? 10 : 1))
    }
    const end = () => {
      el.releasePointerCapture(e.pointerId)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", end)
      el.removeEventListener("pointercancel", end)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", end)
    el.addEventListener("pointercancel", end)
  }

  return (
    <div className={cn(FIELD_BOX, className)}>
      <span
        role="presentation"
        aria-label={`Drag to change ${label || "value"}`}
        className={FIELD_HANDLE}
        onPointerDown={startScrub}
      >
        {label || <Grip />}
      </span>
      <CommitInput
        unstyled
        type="number"
        ariaLabel={ariaLabel || label || undefined}
        value=""
        placeholder={MIXED_LABEL}
        onStep={
          onStep &&
          ((d) => {
            onGestureStart?.()
            onStep(d)
          })
        }
        onCommit={(raw) => {
          const n = parseNumber(raw)
          if (n === null) return
          onGestureStart?.()
          onCommit(n)
        }}
      />
    </div>
  )
}

/** Free-text field over a possibly-mixed selection. */
export function MixedTextField({
  shared,
  onCommit,
  className,
  ariaLabel,
  placeholder,
}: {
  shared: Shared<string>
  onCommit: (v: string) => void
  className?: string
  ariaLabel?: string
  /** shown when the field is genuinely empty — a dash still wins for mixed */
  placeholder?: string
}) {
  return (
    <CommitInput
      ariaLabel={ariaLabel}
      className={cn("h-ctl rounded-chrome-sm px-2.5 text-label", className)}
      value={shared.mixed ? "" : shared.value}
      placeholder={shared.mixed ? MIXED_LABEL : placeholder}
      onCommit={(raw) => {
        // blanking a mixed field is how you back out of it, not a request to
        // wipe the label off every selected component
        if (shared.mixed && !raw.trim()) return
        onCommit(raw)
      }}
    />
  )
}

// ---------------------------------------------------------------------------

/**
 * A switch with three readings: on, off, and "they disagree".
 *
 * The mixed state parks the thumb in the middle behind a dash. Clicking it
 * turns everything on — the first click resolves the disagreement, and the
 * next one is an ordinary toggle.
 */
export function MixedSwitch({
  shared,
  onChange,
  className,
  ariaLabel,
}: {
  shared: Shared<boolean>
  onChange: (on: boolean) => void
  className?: string
  ariaLabel?: string
}) {
  if (!shared.mixed) {
    return (
      <Switch
        checked={shared.value}
        aria-label={ariaLabel}
        onCheckedChange={onChange}
        className={cn("scale-90", className)}
      />
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked="mixed"
      aria-label={ariaLabel}
      title="mixed — click to turn all on"
      onClick={() => onChange(true)}
      className={cn(
        "relative inline-flex h-[18.4px] w-[32px] shrink-0 scale-90 items-center rounded-full border border-transparent bg-input transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/80",
        className
      )}
    >
      <span className="pointer-events-none block size-4 translate-x-[calc(50%-2px)] rounded-full bg-background dark:bg-foreground" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-micro font-semibold text-muted-foreground">
        {MIXED_LABEL}
      </span>
    </button>
  )
}
