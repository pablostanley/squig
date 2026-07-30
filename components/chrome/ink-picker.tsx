"use client"

// ---------------------------------------------------------------------------
// Ink — the palette picker, and the two-tone chip that stands for a palette.
//
// A palette is one saturated ink on one sheet of paper, so the chip is exactly
// that: paper on one diagonal, ink on the other. The same chip serves the
// closed control and the rows inside it — words alone ("Riso red") would make
// you imagine the colour instead of seeing it.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import { THEMES, THEME_NAMES, type ThemeName } from "@/lib/theme"
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Two-tone chip showing a palette's paper and ink. */
function InkSwatch({ name }: { name: ThemeName }) {
  const p = THEMES[name]
  return (
    <span
      className="inline-block size-3.5 shrink-0 rounded-full border"
      style={{ background: `linear-gradient(135deg, ${p.paper} 50%, ${p.ink} 50%)`, borderColor: p.ink }}
    />
  )
}

/** The palette rows. */
function InkMenuItems() {
  const theme = useSquig((s) => s.theme)
  const st = useSquig.getState

  return (
    <>
      {THEME_NAMES.map((name) => (
        <DropdownMenuItem key={name} onClick={() => st().setTheme(name)}>
          <span className="flex items-center gap-2">
            <InkSwatch name={name} />
            {THEMES[name].label}
          </span>
          {theme === name && <CheckIcon className="ml-auto size-3.5 text-muted-foreground" weight="bold" />}
        </DropdownMenuItem>
      ))}
    </>
  )
}

/**
 * The panel's ink control: a field that shows the live colour and its name, and
 * opens the list of palettes. Six is too many for a segmented track and too few
 * to need searching, so it's a dropdown — and it wears the numeric field's shell
 * so it lands on the panel's alignment seam like every other control.
 */
export function InkPicker() {
  const theme = useSquig((s) => s.theme)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // the face is a chip and a palette name, so the control needs to say
        // out loud what it is for anyone not looking at it
        aria-label={`Palette — ${THEMES[theme].label}`}
        className="flex h-ctl w-full min-w-0 items-center gap-2 rounded-chrome-sm border border-input bg-transparent px-2 text-label outline-none transition-colors hover:border-border focus-visible:border-[var(--sq-ink)] focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/15"
      >
        <InkSwatch name={theme} />
        <span className="min-w-0 flex-1 truncate text-left">{THEMES[theme].label}</span>
        <CaretDownIcon className="size-3 shrink-0 text-muted-foreground" weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <InkMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
