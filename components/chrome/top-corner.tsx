"use client"

// ---------------------------------------------------------------------------
// Top-left corner — the wordmark doubles as the file menu, the file name is
// inline-editable. No toolbar chrome beyond that, on purpose.
// ---------------------------------------------------------------------------

import { useRef } from "react"
import { useSquig } from "@/lib/store"
import { exportDoc, importDoc } from "@/lib/file-io"
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { THEMES, THEME_NAMES, type ThemeName } from "@/lib/theme"
import { kbd } from "@/lib/shortcuts"
import { RecentFiles } from "@/components/chrome/recent-files"

/** Two-tone chip showing a palette's paper and ink. */
function Swatch({ name }: { name: ThemeName }) {
  const p = THEMES[name]
  return (
    <span
      className="inline-block size-3.5 shrink-0 rounded-full border"
      style={{ background: `linear-gradient(135deg, ${p.paper} 50%, ${p.ink} 50%)`, borderColor: p.ink }}
    />
  )
}

export function TopCorner() {
  const contextRow = useSquig((s) => s.contextRow)
  const theme = useSquig((s) => s.theme)
  const font = useSquig((s) => s.font)
  const st = useSquig.getState
  // Rename hands focus to the floating name field, so the menu must not yank
  // focus back to its trigger on the way out.
  const keepFocus = useRef(false)

  return (
    <div
      data-squig-chrome
      className="absolute top-4 left-4 z-30 flex items-center gap-1 rounded-xl border bg-background p-1 shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-accent"
            title="file menu"
          >
            <span
              className="font-sans text-[17px] leading-none font-bold tracking-[-0.03em] select-none"
              style={{ color: "var(--sq-ink)" }}
            >
              squig
            </span>
            <CaretDownIcon className="size-3 text-muted-foreground" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
          onCloseAutoFocus={(e) => {
            if (keepFocus.current) {
              keepFocus.current = false
              e.preventDefault()
            }
          }}
        >
          <DropdownMenuItem onSelect={() => st().newFile()}>New file</DropdownMenuItem>
          <RecentFiles />
          <DropdownMenuItem onSelect={importDoc}>Open from disk…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => st().saveNow()}>
            Save
            <DropdownMenuShortcut>{kbd("mod+s")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportDoc}>
            Export a copy
            <DropdownMenuShortcut>{kbd("mod+shift+s")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              keepFocus.current = true
              st().setRenamingFile(true)
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => st().setCommandOpen(true)}>
            Find anything
            <DropdownMenuShortcut>{kbd("mod+k")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => st().setShortcutsOpen(true)}>
            Keyboard shortcuts
            <DropdownMenuShortcut>{kbd("shift+/")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => st().undo()}>
            Undo
            <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => st().redo()}>
            Redo
            <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex items-center gap-2">
                <Swatch name={theme} />
                Ink
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {THEME_NAMES.map((name) => (
                <DropdownMenuItem key={name} onSelect={() => st().setTheme(name)}>
                  <span className="flex items-center gap-2">
                    <Swatch name={name} />
                    {THEMES[name].label}
                  </span>
                  {theme === name && <CheckIcon className="ml-auto size-3.5 text-muted-foreground" weight="bold" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => st().setFont(font === "hand" ? "clean" : "hand")}>
            {font === "hand" ? "Use clean lettering" : "Use hand lettering"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => st().setContextRow(!contextRow)}>
            {contextRow ? "Hide context menu" : "Show context menu"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => st().setViewport({ x: 0, y: 0, zoom: 1 })}>
            Reset zoom
            <DropdownMenuShortcut>{kbd("mod+0")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => st().clearCanvas()}>
            Clear canvas
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function ZoomPill() {
  const zoom = useSquig((s) => s.viewport.zoom)
  const st = useSquig.getState

  const zoomBy = (factor: number) => {
    const v = st().viewport
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const z = Math.min(4, Math.max(0.1, v.zoom * factor))
    const k = z / v.zoom
    st().setViewport({ zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
  }

  return (
    <div
      data-squig-chrome
      className="absolute bottom-4 left-4 z-30 flex items-center gap-0.5 rounded-xl border bg-background px-1 py-0.5 shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="size-7 rounded-lg text-sm text-muted-foreground hover:bg-accent"
        onClick={() => zoomBy(1 / 1.25)}
      >
        −
      </button>
      <button
        type="button"
        className="min-w-11 rounded-lg px-1 py-1 text-center text-xs text-muted-foreground tabular-nums hover:bg-accent"
        onClick={() => st().setViewport({ x: 0, y: 0, zoom: 1 })}
        title="reset view (⌘0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="size-7 rounded-lg text-sm text-muted-foreground hover:bg-accent"
        onClick={() => zoomBy(1.25)}
      >
        +
      </button>
    </div>
  )
}

/** Bottom-right nudge toward ⌘K. */
export function CommandHint() {
  const st = useSquig.getState
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => st().setCommandOpen(true)}
      data-squig-chrome
      className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-xs text-muted-foreground shadow-md hover:text-foreground"
    >
      search everything
      <kbd className="inline-flex h-4 items-center rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
    </button>
  )
}
