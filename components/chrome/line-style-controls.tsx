"use client"

// ---------------------------------------------------------------------------
// Connector path controls. The inspector lays all three choices out; the
// floating row folds the same choices behind one small button.
// ---------------------------------------------------------------------------

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"

import type { ArrowNode, LineStyle } from "@/lib/types"
import { lineStyleOf } from "@/lib/canvas/line-routing"
import { shared, type Shared } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { IconToggle, Segmented, type SegmentOption } from "@/components/ui/segmented"

const STYLES: { value: LineStyle; label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "elbow", label: "Elbow" },
  { value: "curved", label: "Curved" },
]

/** Tiny route diagrams say more here than three abstract icon metaphors. */
function RouteGlyph({ style }: { style: LineStyle }) {
  const d =
    style === "straight"
      ? "M2 13 L18 3"
      : style === "elbow"
        ? "M2 13 H10 V3 H18"
        : "M2 13 C8 13 11 3 18 3"
  return (
    <svg viewBox="0 0 20 16" className="size-4" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const OPTIONS: readonly SegmentOption<LineStyle>[] = STYLES.map(({ value, label }) => ({
  value,
  label,
  content: <RouteGlyph style={value} />,
}))

export function sharedLineStyle(arrows: readonly ArrowNode[]): Shared<LineStyle> {
  return shared(arrows.map(lineStyleOf))
}

/** The inspector's visible three-way choice. */
export function LineStyleSegments({
  arrows,
  onChange,
}: {
  arrows: readonly ArrowNode[]
  onChange: (style: LineStyle) => void
}) {
  return (
    <Segmented
      ariaLabel="Line path"
      options={OPTIONS}
      shared={sharedLineStyle(arrows)}
      onChange={onChange}
    />
  )
}

/** The context row's one button, opening the same three route diagrams. */
export function LineStyleMenu({
  arrows,
  onChange,
}: {
  arrows: readonly ArrowNode[]
  onChange: (style: LineStyle) => void
}) {
  const [open, setOpen] = useState(false)
  const current = sharedLineStyle(arrows)
  const active = STYLES.find((s) => !current.mixed && s.value === current.value) ?? STYLES[0]

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title={current.mixed ? "Line path · mixed" : `${active.label} path`}
        aria-label="Line path"
        className={cn(
          "flex size-ctl shrink-0 items-center justify-center rounded-chrome-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40",
          current.mixed && "border border-dashed border-border",
          open && "bg-[var(--sq-ink)]/12 text-[var(--sq-ink)] ring-1 ring-inset ring-[var(--sq-ink)]/25"
        )}
      >
        <RouteGlyph style={active.value} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="center" sideOffset={8} className="z-50 outline-none">
          <Popover.Popup
            data-squig-chrome
            className="flex origin-(--transform-origin) items-center gap-0.5 rounded-chrome-lg bg-popover p-1.5 shadow-popup ring-1 ring-foreground/10 outline-none transition-[transform,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            {STYLES.map(({ value, label }) => (
              <IconToggle
                key={value}
                label={`${label} path`}
                pressed={!current.mixed && current.value === value}
                onPressedChange={() => {
                  onChange(value)
                  setOpen(false)
                }}
              >
                <RouteGlyph style={value} />
              </IconToggle>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
