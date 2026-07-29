"use client"

// ---------------------------------------------------------------------------
// ⌘K — a sheet that rises from the bottom. Searches tools, actions, and every
// component and block, and inserts on Enter. One box for the whole app.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSquig } from "@/lib/store"
import { ALL_DEFS, matches, type ComponentDef } from "@/lib/library/registry"
import { SketchPrims } from "@/components/canvas/sketch"
import { breakApart } from "@/lib/library/break-apart"
import { exportDoc, importDoc } from "@/lib/file-io"
import type { ComponentNode } from "@/lib/types"
import {
  MagnifyingGlassIcon,
  CursorIcon,
  SquareIcon,
  CircleIcon,
  PencilSimpleIcon,
  TextTIcon,
  ArrowUpRightIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CopyIcon,
  TrashIcon,
  StackIcon,
  CornersOutIcon,
  FileIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  LinkBreakIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"

interface Action {
  id: string
  label: string
  hint?: string
  section: string
  keywords?: string
  icon: PhosphorIcon
  run: () => void
  disabled?: boolean
}

type Row = { kind: "action"; action: Action } | { kind: "def"; def: ComponentDef }

const SECTION_ORDER = ["Tools", "Edit", "Arrange", "File", "Components", "Blocks"]

/** Mount only while open, so every ⌘K starts from a blank box with no reset dance. */
export function CommandPalette() {
  const open = useSquig((s) => s.commandOpen)
  if (!open) return null
  return <Palette />
}

function Palette() {
  const selection = useSquig((s) => s.selection)
  const nodes = useSquig((s) => s.nodes)
  const st = useSquig.getState

  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => st().setCommandOpen(false), [st])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const hasSel = selection.length > 0
  const oneComponent = selection.length === 1 && nodes[selection[0]]?.type === "component"

  const actions = useMemo<Action[]>(
    () => [
      { id: "select", label: "Select tool", hint: "V", section: "Tools", icon: CursorIcon, run: () => st().setTool("select") },
      { id: "rect", label: "Rectangle", hint: "R", section: "Tools", keywords: "shape box square", icon: SquareIcon, run: () => { st().setShapeKind("rect"); st().setTool("shape") } },
      { id: "ellipse", label: "Ellipse", hint: "O", section: "Tools", keywords: "circle oval shape", icon: CircleIcon, run: () => { st().setShapeKind("ellipse"); st().setTool("shape") } },
      { id: "draw", label: "Draw", hint: "P", section: "Tools", keywords: "pencil pen freehand scribble", icon: PencilSimpleIcon, run: () => st().setTool("draw") },
      { id: "text", label: "Text", hint: "T", section: "Tools", keywords: "type label", icon: TextTIcon, run: () => st().setTool("text") },
      { id: "arrow", label: "Arrow", hint: "A", section: "Tools", keywords: "line connector point", icon: ArrowUpRightIcon, run: () => st().setTool("arrow") },

      { id: "undo", label: "Undo", hint: "⌘Z", section: "Edit", icon: ArrowUUpLeftIcon, run: () => st().undo() },
      { id: "redo", label: "Redo", hint: "⇧⌘Z", section: "Edit", icon: ArrowUUpRightIcon, run: () => st().redo() },
      { id: "dup", label: "Duplicate", hint: "⌘D", section: "Edit", icon: CopyIcon, disabled: !hasSel, run: () => st().duplicateSelected() },
      { id: "del", label: "Delete", hint: "⌫", section: "Edit", icon: TrashIcon, disabled: !hasSel, run: () => st().deleteSelected() },
      {
        id: "break", label: "Break apart", section: "Edit", keywords: "detach explode ungroup",
        icon: LinkBreakIcon, disabled: !oneComponent,
        run: () => {
          const n = st().nodes[st().selection[0]]
          if (n?.type !== "component") return
          const pieces = breakApart(n as ComponentNode)
          st().removeNodes([n.id])
          st().addNodes(pieces)
        },
      },
      { id: "selectall", label: "Select all", hint: "⌘A", section: "Edit", icon: StackIcon, run: () => st().setSelection([...st().order]) },

      { id: "front", label: "Bring to front", hint: "]", section: "Arrange", icon: StackIcon, disabled: !hasSel, run: () => st().bringToFront(st().selection) },
      { id: "back", label: "Send to back", hint: "[", section: "Arrange", icon: StackIcon, disabled: !hasSel, run: () => st().sendToBack(st().selection) },
      { id: "align-l", label: "Align left", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("left") },
      { id: "align-hc", label: "Align centres horizontally", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("hcenter") },
      { id: "align-r", label: "Align right", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("right") },
      { id: "align-t", label: "Align top", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("top") },
      { id: "align-vc", label: "Align middles vertically", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("vcenter") },
      { id: "align-b", label: "Align bottom", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("bottom") },
      { id: "zoom-reset", label: "Reset zoom", hint: "⌘0", section: "Arrange", keywords: "100% fit view", icon: CornersOutIcon, run: () => st().setViewport({ x: 0, y: 0, zoom: 1 }) },

      { id: "new", label: "New file", section: "File", keywords: "blank clear reset", icon: FileIcon, run: () => st().newFile() },
      { id: "export", label: "Export .squig", section: "File", keywords: "save download json", icon: DownloadSimpleIcon, run: exportDoc },
      { id: "import", label: "Import .squig", section: "File", keywords: "open load json", icon: UploadSimpleIcon, run: importDoc },
    ],
    [st, hasSel, oneComponent, selection.length]
  )

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    const acts = actions.filter(
      (a) =>
        !a.disabled &&
        (!q || a.label.toLowerCase().includes(q) || a.section.toLowerCase().includes(q) || (a.keywords?.includes(q) ?? false))
    )
    const defs = ALL_DEFS.filter((d) => matches(d, q))
    // with no query, keep the sheet skimmable rather than dumping 100 items
    const limited = q ? defs : defs.slice(0, 24)
    return [
      ...acts.map((action): Row => ({ kind: "action", action })),
      ...limited.map((def): Row => ({ kind: "def", def })),
    ]
  }, [query, actions])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" })
  }, [active])

  const runRow = useCallback(
    (row: Row) => {
      if (row.kind === "action") row.action.run()
      else st().insertComponent(row.def.kind)
      close()
    },
    [st, close]
  )

  // group consecutive rows by section for headers
  const sections: { title: string; rows: { row: Row; index: number }[] }[] = []
  rows.forEach((row, index) => {
    const title =
      row.kind === "action" ? row.action.section : row.def.category === "components" ? "Components" : "Blocks"
    const last = sections[sections.length - 1]
    if (last?.title === title) last.rows.push({ row, index })
    else sections.push({ title, rows: [{ row, index }] })
  })
  sections.sort((a, b) => SECTION_ORDER.indexOf(a.title) - SECTION_ORDER.indexOf(b.title))

  return (
    <>
      <div data-squig-chrome
      className="fixed inset-0 z-50 flex flex-col justify-end" onPointerDown={close}>
        <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" />
        <div
          className="animate-in slide-in-from-bottom-4 fade-in relative mx-auto flex max-h-[62vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-b-0 bg-background shadow-2xl duration-150"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative shrink-0 border-b">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              placeholder="search anything — buttons, blocks, tools, undo…"
              className="w-full bg-transparent py-4 pr-4 pl-11 text-[15px] outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Escape") close()
                else if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setActive((i) => (rows.length ? (i + 1) % rows.length : 0))
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
                } else if (e.key === "Enter") {
                  e.preventDefault()
                  const row = rows[active]
                  if (row) runRow(row)
                }
              }}
            />
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain p-2">
            {!rows.length && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                nothing matches &ldquo;{query}&rdquo;. try fewer letters.
              </p>
            )}
            {sections.map((section) => (
              <div key={section.title} className="mb-1">
                <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {section.title}
                </div>
                {section.rows.map(({ row, index }) => (
                  <PaletteRow
                    key={row.kind === "action" ? row.action.id : row.def.kind}
                    row={row}
                    active={index === active}
                    onHover={() => setActive(index)}
                    onPick={() => runRow(row)}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span><Kbd>↵</Kbd> pick</span>
            <span><Kbd>esc</Kbd> close</span>
            <span className="ml-auto">components drop in the middle of your view</span>
          </div>
        </div>
      </div>
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px]">
      {children}
    </kbd>
  )
}

function PaletteRow({
  row,
  active,
  onHover,
  onPick,
}: {
  row: Row
  active: boolean
  onHover: () => void
  onPick: () => void
}) {
  return (
    <button
      type="button"
      data-active={active}
      onMouseMove={onHover}
      onClick={onPick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm ${
        active ? "bg-accent text-accent-foreground" : "text-foreground"
      }`}
    >
      {row.kind === "action" ? (
        <>
          <row.action.icon className="size-4 shrink-0 text-muted-foreground" weight="regular" />
          <span className="flex-1 truncate">{row.action.label}</span>
          {row.action.hint && <span className="font-mono text-[11px] text-muted-foreground">{row.action.hint}</span>}
        </>
      ) : (
        <>
          <DefThumb def={row.def} />
          <span className="flex-1 truncate">{row.def.name}</span>
          <span className="text-[11px] text-muted-foreground">{row.def.group}</span>
        </>
      )}
    </button>
  )
}

function DefThumb({ def }: { def: ComponentDef }) {
  const prims = useMemo(() => def.render(def.defaults, def.size.w, def.size.h), [def])
  const box = 22
  const scale = Math.min(box / def.size.w, box / def.size.h)
  return (
    <svg width={box} height={box} className="shrink-0 overflow-visible">
      <g
        transform={`translate(${(box - def.size.w * scale) / 2} ${(box - def.size.h * scale) / 2}) scale(${scale})`}
      >
        <SketchPrims prims={prims} seed={5} />
      </g>
    </svg>
  )
}
