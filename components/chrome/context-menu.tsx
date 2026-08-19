"use client"

// ---------------------------------------------------------------------------
// Right-click menu. Two flavours: one for a node, one for bare canvas.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { copySelection, pasteFromSystem } from "@/lib/clipboard"
import { useSquig } from "@/lib/store"
import { screenToWorld } from "@/lib/types"
import { hasEditableText } from "@/lib/canvas/edit-target"
import { isCropped } from "@/lib/canvas/crop"
import { kbd } from "@/lib/shortcuts"
import { copyAsPngWithNotice } from "@/lib/export-image"
import {
  AlignBottomSimpleIcon,
  AlignCenterHorizontalSimpleIcon,
  AlignCenterVerticalSimpleIcon,
  AlignLeftSimpleIcon,
  AlignRightSimpleIcon,
  AlignTopSimpleIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  ArrowUpIcon,
  ArrowsOutIcon,
  BoundingBoxIcon,
  BroomIcon,
  ClipboardTextIcon,
  CopyIcon,
  CopySimpleIcon,
  CropIcon,
  EyeSlashIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  ImageIcon,
  KeyboardIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MagnifyingGlassIcon,
  NumberSquareOneIcon,
  SelectionAllIcon,
  SelectionIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StackIcon,
  TextTIcon,
  TrashIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"

interface Item {
  label: string
  hint?: string
  icon: PhosphorIcon
  run?: () => void
  danger?: boolean
  separator?: never
}
type Entry = Item | { separator: true }

export function CanvasContextMenu() {
  const menu = useSquig((s) => s.contextMenu)
  const nodes = useSquig((s) => s.nodes)
  const order = useSquig((s) => s.order)
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
  const hasComponent = targets.some((id) => nodes[id]?.type === "component")
  const hasText = targets.some((id) => nodes[id]?.type === "text")
  const hasGroup = targets.some((id) => nodes[id]?.groupIds?.length)
  // A locked layer can't be selected, so the only way one reaches this menu is
  // by being right-clicked on its own — which makes "all of them" and "the one
  // under the pointer" the same set, and the menu a single question.
  const lockedTarget = targets.length > 0 && targets.every((id) => nodes[id]?.locked)
  const locked = order.filter((id) => nodes[id]?.locked)

  let entries: Entry[]

  if (lockedTarget) {
    // Nothing else belongs here. Every other item on the node menu either moves
    // the layer, changes it or throws it away, and this one has been asked to
    // sit still — the menu's whole job is to be the way back.
    entries = [
      { label: "Unlock", icon: LockSimpleOpenIcon, run: () => st().unlockNodes(targets) },
      ...(locked.length > 1
        ? [{ label: `Unlock all (${locked.length})`, icon: LockSimpleOpenIcon, run: () => st().unlockAll() } as Entry]
        : []),
    ]
  } else if (menu.nodeId) {
    entries = [
      { label: "Duplicate", hint: kbd("mod+d"), icon: CopyIcon, run: () => st().duplicateSelected() },
      { label: "Copy", hint: kbd("mod+c"), icon: CopySimpleIcon, run: copySelection },
      { label: "Copy as PNG", hint: kbd("mod+shift+c"), icon: ImageIcon, run: copyAsPngWithNotice },
      ...(targets.length > 1
        ? [{ label: "Group", hint: kbd("mod+g"), icon: BoundingBoxIcon, run: () => st().groupSelected() } as Entry]
        : []),
      ...(hasGroup
        ? [{ label: "Ungroup", hint: kbd("mod+shift+g"), icon: SelectionIcon, run: () => st().ungroupSelected() } as Entry]
        : []),
      ...(hasComponent
        ? [{ label: "Detach instance", hint: kbd("alt+mod+b"), icon: LinkBreakIcon, run: () => st().detachSelected() } as Entry]
        : []),
      ...(hasText
        ? [{ label: "Link text…", hint: kbd("mod+k"), icon: LinkSimpleIcon, run: () => st().setLinkOpen(true) } as Entry]
        : []),
      ...(one && hasEditableText(one)
        ? [{ label: "Edit text", hint: kbd("enter"), icon: TextTIcon, run: () => st().setEditing(one.id) } as Entry]
        : []),
      ...(one?.type === "image"
        ? ([
            { label: "Crop image", hint: kbd("enter"), icon: CropIcon, run: () => st().setCropping(one.id) },
            ...(isCropped(one)
              ? [{ label: "Reset crop", icon: ArrowCounterClockwiseIcon, run: () => st().resetCrop([one.id]) }]
              : []),
          ] as Entry[])
        : []),
      { separator: true },
      { label: "Bring to front", hint: kbd("far+]"), icon: ArrowLineUpIcon, run: () => st().bringToFront(targets) },
      { label: "Bring forward", hint: kbd("mod+]"), icon: ArrowUpIcon, run: () => st().bringForward(targets) },
      { label: "Send backward", hint: kbd("mod+["), icon: ArrowDownIcon, run: () => st().sendBackward(targets) },
      { label: "Send to back", hint: kbd("far+["), icon: ArrowLineDownIcon, run: () => st().sendToBack(targets) },
      { separator: true },
      { label: "Flip horizontal", hint: kbd("shift+h"), icon: FlipHorizontalIcon, run: () => st().flipSelected("x") },
      { label: "Flip vertical", hint: kbd("shift+v"), icon: FlipVerticalIcon, run: () => st().flipSelected("y") },
      ...(selection.length > 1
        ? ([
            { separator: true },
            { label: "Align left", icon: AlignLeftSimpleIcon, run: () => st().alignSelected("left") },
            { label: "Align centres", icon: AlignCenterHorizontalSimpleIcon, run: () => st().alignSelected("hcenter") },
            { label: "Align right", icon: AlignRightSimpleIcon, run: () => st().alignSelected("right") },
            { label: "Align top", icon: AlignTopSimpleIcon, run: () => st().alignSelected("top") },
            { label: "Align middles", icon: AlignCenterVerticalSimpleIcon, run: () => st().alignSelected("vcenter") },
            { label: "Align bottom", icon: AlignBottomSimpleIcon, run: () => st().alignSelected("bottom") },
          ] as Entry[])
        : []),
      { separator: true },
      { label: "Lock", hint: kbd("mod+shift+l"), icon: LockSimpleIcon, run: () => st().lockSelected() },
      { label: "Delete", hint: kbd("del"), icon: TrashIcon, danger: true, run: () => st().removeNodes(targets) },
    ]
  } else {
    entries = [
      { label: "Search everything", hint: kbd("mod+k"), icon: MagnifyingGlassIcon, run: () => st().setCommandOpen(true) },
      { label: "Components", hint: kbd("c"), icon: SquaresFourIcon, run: () => st().setPanel("components") },
      { label: "Blocks", hint: kbd("b"), icon: StackIcon, run: () => st().setPanel("blocks") },
      { separator: true },
      { label: "Select all", hint: kbd("mod+a"), icon: SelectionAllIcon, run: () => st().selectAll() },
      // the escape hatch that needs no aiming — right-clicking the layer works
      // too, but only if you can find it under whatever is stacked on top
      ...(locked.length
        ? [
            {
              label: `Unlock all (${locked.length})`,
              icon: LockSimpleOpenIcon,
              run: () => st().unlockAll(),
            } as Entry,
          ]
        : []),
      // always offered now: whatever is on the system clipboard is something
      // this can paste, and there is no way to know what that is from here
      { label: "Paste here", hint: kbd("mod+v"), icon: ClipboardTextIcon, run: () => pasteAt(menu.x, menu.y) },
      ...(Object.keys(nodes).length
        ? [{ label: "Copy canvas as PNG", hint: kbd("mod+shift+c"), icon: ImageIcon, run: copyAsPngWithNotice } as Entry]
        : []),
      { separator: true },
      { label: "Undo", hint: kbd("mod+z"), icon: ArrowUUpLeftIcon, run: () => st().undo() },
      { label: "Redo", hint: kbd("mod+shift+z"), icon: ArrowUUpRightIcon, run: () => st().redo() },
      { separator: true },
      { label: "Zoom to fit", hint: kbd("shift+1"), icon: ArrowsOutIcon, run: () => st().zoomToFit() },
      { label: "Zoom to 100%", hint: kbd("shift+0"), icon: NumberSquareOneIcon, run: () => st().zoomTo100() },
      {
        label: "Reset zoom",
        hint: kbd("mod+0"),
        icon: ArrowCounterClockwiseIcon,
        run: () => st().setViewport({ x: 0, y: 0, zoom: 1 }),
      },
      {
        label: contextRow ? "Hide context menu" : "Show context menu",
        icon: SlidersHorizontalIcon,
        run: () => st().setContextRow(!contextRow),
      },
      { label: "Hide the interface", hint: kbd("mod+\\"), icon: EyeSlashIcon, run: () => st().setUiHidden(true) },
      { label: "Keyboard shortcuts", hint: kbd("shift+/"), icon: KeyboardIcon, run: () => st().setShortcutsOpen(true) },
      { separator: true },
      { label: "Clear canvas", icon: BroomIcon, danger: true, run: () => st().clearCanvas() },
    ]
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-52 rounded-chrome-lg border border-border/80 bg-background p-1.5 shadow-popup"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        "separator" in entry ? (
          <div key={i} className="-mx-1.5 my-1.5 h-px bg-border" />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => {
              entry.run?.()
              close()
            }}
            className={`group flex h-ctl-lg w-full items-center gap-2.5 rounded-chrome-sm px-2.5 text-left text-row hover:bg-accent ${
              entry.danger ? "text-muted-foreground hover:text-destructive" : ""
            }`}
          >
            <entry.icon
              className={`size-4 shrink-0 ${entry.danger ? "" : "text-muted-foreground group-hover:text-foreground"}`}
              weight="fill"
            />
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.hint && <span className="pl-6 font-mono text-label text-muted-foreground">{entry.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}

/** Drop the clipboard where the menu was opened. */
function pasteAt(sx: number, sy: number) {
  const s = useSquig.getState()
  // a menu click is a gesture, so the browser will let us ask for the real
  // clipboard here — squig's own is the fallback inside pasteFromSystem
  void pasteFromSystem(screenToWorld(s.viewport, sx, sy))
}
