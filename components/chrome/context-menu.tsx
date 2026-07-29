"use client"

// ---------------------------------------------------------------------------
// Right-click menu. Two flavours: one for a node, one for bare canvas.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSquig } from "@/lib/store"
import { breakApart } from "@/lib/library/break-apart"
import type { ComponentNode } from "@/lib/types"
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
  const canBreak = one?.type === "component"

  let entries: Entry[]

  if (menu.nodeId) {
    entries = [
      { label: "Duplicate", hint: "⌘D", run: () => st().duplicateSelected() },
      ...(canBreak
        ? [
            {
              label: "Break apart",
              run: () => {
                const pieces = breakApart(one as ComponentNode)
                st().removeNodes([one!.id])
                st().addNodes(pieces)
              },
            } as Entry,
          ]
        : []),
      ...(one?.type === "text" || (one?.type === "component" && getDef(one.kind)?.controls.some((c) => c.type === "text"))
        ? [{ label: "Edit text", hint: "double-click", run: () => st().setEditing(one.id) } as Entry]
        : []),
      { separator: true },
      { label: "Bring to front", hint: "]", run: () => st().bringToFront(targets) },
      { label: "Send to back", hint: "[", run: () => st().sendToBack(targets) },
      ...(selection.length > 1
        ? ([
            { separator: true },
            { label: "Align left", run: () => st().alignSelected("left") },
            { label: "Align centres", run: () => st().alignSelected("hcenter") },
            { label: "Align right", run: () => st().alignSelected("right") },
            { label: "Align top", run: () => st().alignSelected("top") },
            { label: "Align middles", run: () => st().alignSelected("vcenter") },
            { label: "Align bottom", run: () => st().alignSelected("bottom") },
          ] as Entry[])
        : []),
      { separator: true },
      { label: "Delete", hint: "⌫", danger: true, run: () => st().removeNodes(targets) },
    ]
  } else {
    entries = [
      { label: "Paste-ish… find a component", hint: "⌘K", run: () => st().setCommandOpen(true) },
      { label: "Components", hint: "C", run: () => st().setPanel("components") },
      { label: "Blocks", hint: "B", run: () => st().setPanel("blocks") },
      { separator: true },
      { label: "Select all", hint: "⌘A", run: () => st().setSelection([...st().order]) },
      { label: "Paste here", hint: "⌘V", run: () => pasteAt(menu.x, menu.y) },
      { separator: true },
      { label: "Undo", hint: "⌘Z", run: () => st().undo() },
      { label: "Redo", hint: "⇧⌘Z", run: () => st().redo() },
      { separator: true },
      { label: contextRow ? "Hide context menu" : "Show context menu", run: () => st().setContextRow(!contextRow) },
      { label: "Reset zoom", hint: "⌘0", run: () => st().setViewport({ x: 0, y: 0, zoom: 1 }) },
      { separator: true },
      { label: "Clear canvas", danger: true, run: () => st().clearCanvas() },
    ]
  }

  return (
    <div
      ref={ref}
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

/** Duplicate the current selection to a screen point — the poor man's paste. */
function pasteAt(sx: number, sy: number) {
  const s = useSquig.getState()
  if (!s.selection.length) return
  const sel = s.selection.map((id) => s.nodes[id]).filter(Boolean)
  if (!sel.length) return
  const [wx, wy] = screenToWorld(s.viewport, sx, sy)
  const minX = Math.min(...sel.map((n) => n.x))
  const minY = Math.min(...sel.map((n) => n.y))
  s.duplicateSelected()
  const after = useSquig.getState()
  const patches = Object.fromEntries(
    after.selection.map((id, i) => {
      const src = sel[i]
      return [id, { x: wx + (src.x - minX), y: wy + (src.y - minY) }]
    })
  )
  after.updateNodes(patches)
}
