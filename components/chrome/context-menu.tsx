"use client"

// ---------------------------------------------------------------------------
// Right-click menu. Two flavours: one for a node, one for bare canvas.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSquig } from "@/lib/store"
import { breakApartAll, canBreakApart } from "@/lib/library/break-apart-op"
import { screenToWorld } from "@/lib/types"
import { getDef } from "@/lib/library/registry"

interface Item {
  label: string
  hint?: string
  run?: () => void
  danger?: boolean
  separator?: never
}
type Entry = Item | { separator: true }

export function CanvasContextMenu() {
  const menu = useSquig((s) => s.contextMenu)
  const nodes = useSquig((s) => s.nodes)
  const selection = useSquig((s) => s.selection)
  const contextRow = useSquig((s) => s.contextRow)
  const st = useSquig.getState
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu) return
    const el = ref.current
    const w = el?.offsetWidth ?? 200
    const h = el?.offsetHeight ?? 240
    setPos({
      x: Math.min(menu.x, window.innerWidth - w - 8),
      y: Math.min(menu.y, window.innerHeight - h - 8),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = () => st().setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", onKey)
    window.addEventListener("wheel", close, { passive: true })
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("wheel", close)
    }
  }, [menu, st])

  if (!menu) return null

  const close = () => st().setContextMenu(null)
  const targets = menu.nodeId
    ? selection.includes(menu.nodeId)
      ? selection
      : [menu.nodeId]
    : []
  const one = targets.length === 1 ? nodes[targets[0]] : null

  let entries: Entry[]

  const components = targets.map((id) => nodes[id]).filter((n) => n && canBreakApart(n))
  const many = targets.length > 1

  if (menu.nodeId) {
    entries = [
      { label: "Copy", hint: "⌘C", run: () => st().copySelection() },
      { label: "Cut", hint: "⌘X", run: () => st().cutSelection() },
      { label: many ? `Duplicate ${targets.length}` : "Duplicate", hint: "⌘D", run: () => st().duplicateSelected() },
      ...(components.length
        ? [
            {
              label: components.length > 1 ? `Break apart ${components.length}` : "Break apart",
              run: () => breakApartAll(components.map((c) => c.id)),
            } as Entry,
          ]
        : []),
      ...(one &&
      (one.type === "text" || (one.type === "component" && getDef(one.kind)?.controls.some((c) => c.type === "text")))
        ? [{ label: "Edit text", hint: "double-click", run: () => st().setEditing(one.id) } as Entry]
        : []),
      { separator: true },
      { label: "Bring to front", hint: "]", run: () => st().bringToFront(targets) },
      { label: "Send to back", hint: "[", run: () => st().sendToBack(targets) },
      { separator: true },
      { label: "Select all of this kind", run: () => st().selectSameKind() },
      { label: "Zoom to selection", hint: "⇧2", run: () => st().zoomTo(st().selection) },
      ...(many
        ? ([
            { separator: true },
            { label: "Align left", run: () => st().alignSelected("left") },
            { label: "Align centres", run: () => st().alignSelected("hcenter") },
            { label: "Align right", run: () => st().alignSelected("right") },
            { label: "Align top", run: () => st().alignSelected("top") },
            { label: "Align middles", run: () => st().alignSelected("vcenter") },
            { label: "Align bottom", run: () => st().alignSelected("bottom") },
            ...(targets.length > 2
              ? ([
                  { label: "Distribute horizontally", run: () => st().distributeSelected("h") },
                  { label: "Distribute vertically", run: () => st().distributeSelected("v") },
                ] as Entry[])
              : []),
          ] as Entry[])
        : []),
      { separator: true },
      {
        label: many ? `Delete ${targets.length}` : "Delete",
        hint: "⌫",
        danger: true,
        run: () => st().removeNodes(targets),
      },
    ]
  } else {
    entries = [
      { label: "Paste-ish… find a component", hint: "⌘K", run: () => st().setCommandOpen(true) },
      { label: "Components", hint: "C", run: () => st().setPanel("components") },
      { label: "Blocks", hint: "B", run: () => st().setPanel("blocks") },
      { separator: true },
      { label: "Select all", hint: "⌘A", run: () => st().selectAll() },
      { label: "Invert selection", run: () => st().invertSelection() },
      ...(st().clipboard.length
        ? [{ label: "Paste here", hint: "⌘V", run: () => pasteAt(menu.x, menu.y) } as Entry]
        : []),
      { separator: true },
      { label: "Undo", hint: "⌘Z", run: () => st().undo() },
      { label: "Redo", hint: "⇧⌘Z", run: () => st().redo() },
      { separator: true },
      { label: contextRow ? "Hide context menu" : "Show context menu", run: () => st().setContextRow(!contextRow) },
      { label: "Zoom to fit", hint: "⇧1", run: () => st().zoomTo() },
      { label: "Reset zoom", hint: "⌘0", run: () => st().setViewport({ x: 0, y: 0, zoom: 1 }) },
      { separator: true },
      { label: "Clear canvas", danger: true, run: () => st().clearCanvas() },
    ]
  }

  return (
    <div
      ref={ref}
      data-squig-chrome
      className="fixed z-50 min-w-[196px] rounded-xl border bg-background p-1 shadow-lg"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        "separator" in entry ? (
          <div key={i} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => {
              entry.run?.()
              close()
            }}
            className={`flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-accent ${
              entry.danger ? "text-muted-foreground hover:text-destructive" : ""
            }`}
          >
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.hint && <span className="font-mono text-[10px] text-muted-foreground">{entry.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}

/** Paste the clipboard centred on a screen point. */
function pasteAt(sx: number, sy: number) {
  const s = useSquig.getState()
  s.paste(screenToWorld(s.viewport, sx, sy))
}
