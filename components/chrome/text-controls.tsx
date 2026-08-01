"use client"

// ---------------------------------------------------------------------------
// Text controls, shared by the inspector and the floating context row.
//
// The panel has room to lay the choices out flat; the row over the canvas does
// not, so it shows the current alignment as one button and opens the three in a
// flyout. Same values, same words, two amounts of space — which is why they
// live together rather than being written twice and drifting.
// ---------------------------------------------------------------------------

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import {
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"

import { useSquig } from "@/lib/store"
import type { TextAlign, TextNode } from "@/lib/types"
import { shared, type Shared } from "@/lib/selection"
import { kbd } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"
import { IconToggle, SegmentedToggles, type SegmentOption } from "@/components/ui/segmented"

// ---------------------------------------------------------------------------

/** Drawn as icons, not as styled letters — a glyph small enough to fit the
    toggle is too small to read as bold-versus-regular at a glance. */
export const TEXT_STYLES = [
  { key: "bold", label: "Bold", icon: TextBIcon },
  { key: "italic", label: "Italic", icon: TextItalicIcon },
  { key: "underline", label: "Underline", icon: TextUnderlineIcon },
] as const

/**
 * Three, not four: a napkin has no reason to justify its lines. What these do
 * decide is which edge the run is pinned to — the edge that holds still while
 * you type on an auto-sized layer, and how the wrapped lines sit inside a
 * fixed-width one.
 */
const ALIGNMENTS: { value: TextAlign; label: string; icon: PhosphorIcon }[] = [
  { value: "left", label: "Align left", icon: TextAlignLeftIcon },
  { value: "center", label: "Align centre", icon: TextAlignCenterIcon },
  { value: "right", label: "Align right", icon: TextAlignRightIcon },
]

/** The panel's flat track. The row folds the same three behind `TextAlignMenu`. */
export const ALIGN_OPTIONS: readonly SegmentOption<TextAlign>[] = ALIGNMENTS.map(({ value, label, icon: Icon }) => ({
  value,
  label,
  content: <Icon className="size-4" />,
}))

/** What the whole selection agrees its alignment is — absent reads as left. */
export function sharedAlign(texts: readonly TextNode[]): Shared<TextAlign> {
  return shared(texts.map((n) => n.align ?? "left"))
}

// ---------------------------------------------------------------------------

/**
 * Bold / italic / underline over a possibly-mixed selection of text nodes.
 *
 * In the panel they ride a track, so the Style row and the Align row beside it
 * are visibly the same kind of control. The context row has no tracks at all —
 * alignment there is a single button — so `compact` drops the rail and leaves
 * three bare toggles, which is what the rest of that row is made of.
 */
export function TextStyleToggles({ texts, compact = false }: { texts: readonly TextNode[]; compact?: boolean }) {
  const st = useSquig.getState

  const toggles = TEXT_STYLES.map(({ key, label, icon: Icon }) => {
    const on = shared(texts.map((n) => !!n[key]))
    return (
      <IconToggle
        key={key}
        segment={!compact}
        label={label}
        hint={kbd(`mod+${key[0]}`)}
        pressed={!on.mixed && on.value}
        mixed={on.mixed}
        onPressedChange={() => st().toggleTextStyle(key)}
      >
        <Icon className="size-4" />
      </IconToggle>
    )
  })

  if (compact) return <>{toggles}</>
  return <SegmentedToggles ariaLabel="Text style">{toggles}</SegmentedToggles>
}

// ---------------------------------------------------------------------------

/**
 * Alignment as one button that opens the three.
 *
 * The button wears the alignment it would set — the current one — so the row
 * still reports the state it's hiding. A mixed selection has nothing to wear,
 * so it falls back to the left icon behind a dashed outline, the same way every
 * other mixed control in squig does.
 *
 * Picking closes the flyout. Alignment is a one-of-three you land on rather
 * than a dial you work, so leaving the menu open would just be something else
 * to dismiss.
 */
export function TextAlignMenu({ texts }: { texts: readonly TextNode[] }) {
  const st = useSquig.getState
  const [open, setOpen] = useState(false)
  const current = sharedAlign(texts)

  const active = ALIGNMENTS.find((a) => !current.mixed && a.value === current.value) ?? ALIGNMENTS[0]
  const Face = active.icon

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title={current.mixed ? "Text alignment · mixed" : active.label}
        aria-label="Text alignment"
        className={cn(
          "flex size-ctl shrink-0 items-center justify-center rounded-chrome-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40",
          current.mixed && "border border-dashed border-border",
          // held open, the button reads as the thing the flyout belongs to
          open && "bg-[var(--sq-ink)]/12 text-[var(--sq-ink)] ring-1 ring-inset ring-[var(--sq-ink)]/25"
        )}
      >
        <Face className="size-4" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="center" sideOffset={8} className="z-50 outline-none">
          {/* the canvas treats anything marked as chrome as not-canvas — without
              it, a press in here would land as a press on the drawing */}
          <Popover.Popup
            data-squig-chrome
            className="flex origin-(--transform-origin) items-center gap-0.5 rounded-chrome-lg bg-popover p-1.5 shadow-popup ring-1 ring-foreground/10 outline-none transition-[transform,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
              <IconToggle
                key={value}
                label={label}
                pressed={!current.mixed && current.value === value}
                // one of three: pressing the pressed one is a no-op, not "off"
                onPressedChange={() => {
                  st().setTextAlign(value)
                  setOpen(false)
                }}
              >
                <Icon className="size-4" />
              </IconToggle>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
