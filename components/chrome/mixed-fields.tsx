"use client"

// ---------------------------------------------------------------------------
// Fields that know how to say "these don't agree".
//
// A selection where every node holds the same value shows that value. A
// selection that disagrees shows a dash — and typing over the dash is how you
// make them agree. Nothing is written while a field has focus, and every
// commit is exactly one undo step.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react"

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
}: {
  value: string
  placeholder?: string
  type?: "text" | "number"
  className?: string
  onCommit: (raw: string) => void
  /** arrow-key nudge, in the field's own units */
  onStep?: (delta: number) => void
  ariaLabel?: string
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

  return (
    <Input
      ref={ref}
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      aria-label={ariaLabel}
      className={className}
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft(value)}
      onBlur={() => {
        if (handledRef.current) {
          handledRef.current = false
          return
        }
        flush(draft)
      }}
      onKeyDown={(e) => {
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
      }}
    />
  )
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

/** Numeric field over a possibly-mixed selection. */
export function MixedNumberField({
  label,
  shared,
  onCommit,
  onStep,
  className,
  compact = false,
}: {
  label: string
  shared: Shared<number>
  onCommit: (n: number) => void
  onStep?: (delta: number) => void
  className?: string
  compact?: boolean
}) {
  return (
    <label className={cn("flex items-center gap-1.5", className)}>
      {label && <span className={cn("shrink-0 text-[11px] text-muted-foreground", compact ? "" : "w-3")}>{label}</span>}
      <CommitInput
        type="number"
        ariaLabel={label || undefined}
        className="h-7 px-1.5 text-xs"
        value={shared.mixed ? "" : String(shared.value)}
        placeholder={shared.mixed ? MIXED_LABEL : undefined}
        onStep={onStep}
        onCommit={(raw) => {
          const n = parseNumber(raw)
          if (n !== null) onCommit(n)
        }}
      />
    </label>
  )
}

/** Free-text field over a possibly-mixed selection. */
export function MixedTextField({
  shared,
  onCommit,
  className,
  ariaLabel,
}: {
  shared: Shared<string>
  onCommit: (v: string) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <CommitInput
      ariaLabel={ariaLabel}
      className={cn("h-7 px-2 text-xs", className)}
      value={shared.mixed ? "" : shared.value}
      placeholder={shared.mixed ? MIXED_LABEL : undefined}
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
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] leading-none font-semibold text-muted-foreground">
        {MIXED_LABEL}
      </span>
    </button>
  )
}
