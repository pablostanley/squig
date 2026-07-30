"use client"

// ---------------------------------------------------------------------------
// Top-left corner — the wordmark doubles as the file menu, the file name is
// inline-editable. No toolbar chrome beyond that, on purpose.
//
// It is a *file* menu: documents, saving, editing, the view. How the drawing
// looks — ink, paper, lettering, the grid — lives in the Page panel, which is
// what the inspector shows whenever nothing is selected. Two doors onto the
// same setting is how a menu turns into a junk drawer, so appearance has one.
// ---------------------------------------------------------------------------

import { useRef } from "react"
import { useSquig } from "@/lib/store"
import { exportDoc, importDoc } from "@/lib/file-io"
import { CaretDownIcon } from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Panel } from "@/components/ui/panel"
import { kbd } from "@/lib/shortcuts"
import { RecentFiles } from "@/components/chrome/recent-files"

export function TopCorner() {
  const st = useSquig.getState
  // Rename hands focus to the floating name field, so the menu must not yank
  // focus back to its trigger on the way out.
  const keepFocus = useRef(false)

  return (
    <Panel className="absolute top-4 left-4 z-30 flex-row items-center gap-1 p-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          title="file menu"
          className="flex items-center gap-1.5 rounded-chrome-sm px-2.5 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40"
        >
          {/* deliberately off the chrome type scale — this is the wordmark, not a
              control, and it should out-weigh every label around it */}
          <span
            className="font-sans text-[17px] leading-none font-bold tracking-[-0.03em] select-none"
            style={{ color: "var(--sq-ink)" }}
          >
            squig
          </span>
          <CaretDownIcon className="size-3 text-muted-foreground" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
          // Rename hands focus to the floating name field; returning focus to
          // the wordmark here would snatch it straight back.
          finalFocus={() => {
            if (!keepFocus.current) return true
            keepFocus.current = false
            return false
          }}
        >
          <DropdownMenuItem onClick={() => st().newFile()}>New file</DropdownMenuItem>
          <RecentFiles />
          <DropdownMenuItem onClick={importDoc}>Open from disk…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => st().saveNow()}>
            Save
            <DropdownMenuShortcut>{kbd("mod+s")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportDoc}>
            Export a copy
            <DropdownMenuShortcut>{kbd("mod+shift+s")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              keepFocus.current = true
              st().setRenamingFile(true)
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => st().setCommandOpen(true)}>
            Find anything
            <DropdownMenuShortcut>{kbd("mod+k")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => st().setShortcutsOpen(true)}>
            Keyboard shortcuts
            <DropdownMenuShortcut>{kbd("shift+/")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => st().undo()}>
            Undo
            <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => st().redo()}>
            Redo
            <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* ink, paper, lettering and the grid used to sit here; they live in
              the Page panel now — deselect and the inspector is holding them */}
          <DropdownMenuItem onClick={() => st().setViewport({ x: 0, y: 0, zoom: 1 })}>
            Reset zoom
            <DropdownMenuShortcut>{kbd("mod+0")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => st().clearCanvas()}>
            Clear canvas
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Panel>
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
    <Panel className="absolute bottom-4 left-4 z-30 flex-row items-center gap-0.5 px-1 py-0.5">
      <button
        type="button"
        className="size-ctl rounded-chrome-sm text-row text-muted-foreground hover:bg-accent"
        onClick={() => zoomBy(1 / 1.25)}
      >
        −
      </button>
      <button
        type="button"
        className="h-ctl min-w-12 rounded-chrome-sm px-1 text-center text-label text-muted-foreground tabular-nums hover:bg-accent"
        onClick={() => st().setViewport({ x: 0, y: 0, zoom: 1 })}
        title="reset view (⌘0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="size-ctl rounded-chrome-sm text-row text-muted-foreground hover:bg-accent"
        onClick={() => zoomBy(1.25)}
      >
        +
      </button>
    </Panel>
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
      className="absolute bottom-4 left-1/2 z-30 flex h-ctl -translate-x-1/2 items-center gap-2 rounded-full border border-border/80 bg-background px-gutter text-label text-muted-foreground shadow-panel hover:text-foreground"
    >
      search everything
      <kbd className="inline-flex h-4 items-center rounded-chrome-xs border bg-muted px-1 font-mono text-micro">⌘K</kbd>
    </button>
  )
}
