"use client"

// ---------------------------------------------------------------------------
// ⌘K — a sheet that rises from the bottom. Searches tools, actions, every
// component and block, every icon, and — once a drawing has enough words to be
// worth searching — the canvas itself. Inserts, runs or jumps on Enter. One
// box for the whole app.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSquig } from "@/lib/store"
import { ALL_DEFS, matches, type ComponentDef } from "@/lib/library/registry"
import { searchNodes, type NodeHit } from "@/lib/canvas/find"
import { SketchPrims } from "@/components/canvas/sketch"
import { getIconPaths, loadIconWeight } from "@/lib/sketch/icon-catalog"
import { loadIconIndex, searchIcons } from "@/lib/sketch/icon-search"
import { useIconCatalogVersion } from "@/lib/sketch/use-icon-catalog"
import { copySelection, cutSelection, pasteFromSystem } from "@/lib/clipboard"
import { exportDoc, importDoc } from "@/lib/file-io"
import { copyAsPngWithNotice, saveImageWithNotice } from "@/lib/export-image"
import { relativeTime } from "@/lib/files"
import { kbd } from "@/lib/shortcuts"
import { isCropped } from "@/lib/canvas/crop"
import { lockedIds } from "@/lib/selection"
import {
  ArrowCounterClockwiseIcon,
  CropIcon,
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
  ClipboardIcon,
  ScissorsIcon,
  TrashIcon,
  StackIcon,
  StackSimpleIcon,
  SquaresFourIcon,
  CornersOutIcon,
  CornersInIcon,
  FileIcon,
  FilePngIcon,
  FileSvgIcon,
  FloppyDiskIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  LinkBreakIcon,
  LinkIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  BoundingBoxIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  TextBIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  EyeSlashIcon,
  ImageIcon,
  KeyboardIcon,
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

type Row =
  | { kind: "action"; action: Action }
  | { kind: "def"; def: ComponentDef }
  | { kind: "icon"; name: string }
  | { kind: "node"; hit: NodeHit }

// Jump to leads, because it's the only section whose answers are about *this*
// drawing — if the words you typed are already on the canvas, that is almost
// certainly what you meant. It is also the section that is usually empty: a
// board of six rectangles has no words, so the header never appears.
const SECTION_ORDER = ["Jump to", "Tools", "Edit", "Arrange", "Text", "View", "File", "Recent", "Components", "Blocks", "Icons"]

/** a handful of places to go — past that you should be looking, not reading */
const JUMPS_IN_PALETTE = 6

/** the palette lists a handful of files; the file menu holds the rest */
const RECENT_IN_PALETTE = 6

/** icons are a long tail; a few good hits beat a wall of glyphs */
const ICONS_IN_PALETTE = 8

/** Mount only while open, so every ⌘K starts from a blank box with no reset dance. */
export function CommandPalette() {
  const open = useSquig((s) => s.commandOpen)
  if (!open) return null
  return <Palette />
}

function Palette() {
  const selection = useSquig((s) => s.selection)
  const nodes = useSquig((s) => s.nodes)
  const order = useSquig((s) => s.order)
  const files = useSquig((s) => s.files)
  const docId = useSquig((s) => s.docId)
  const st = useSquig.getState

  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [indexReady, setIndexReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // re-render when a weight chunk arrives, so the glyph previews fill in
  useIconCatalogVersion()

  const close = useCallback(() => st().setCommandOpen(false), [st])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // the icon chunks ride along with the sheet, not the app; searches run
  // name-only until the index lands, then re-run with tags
  useEffect(() => {
    void loadIconIndex().then(() => setIndexReady(true))
    void loadIconWeight("regular")
  }, [])

  const hasSel = selection.length > 0
  const hasComponent = selection.some((id) => nodes[id]?.type === "component")
  const hasText = selection.some((id) => nodes[id]?.type === "text")
  const hasGroup = selection.some((id) => nodes[id]?.groupIds?.length)
  // cropping is a mode you step into, so it needs exactly one picture to step into
  const loneImage = selection.length === 1 && nodes[selection[0]]?.type === "image" ? selection[0] : null
  const hasCrop = selection.some((id) => {
    const n = nodes[id]
    return n?.type === "image" && isCropped(n)
  })
  const lockedCount = lockedIds(nodes, order).length

  const actions = useMemo<Action[]>(
    () => [
      { id: "select", label: "Select tool", hint: kbd("v"), section: "Tools", icon: CursorIcon, run: () => st().setTool("select") },
      { id: "rect", label: "Rectangle", hint: kbd("r"), section: "Tools", keywords: "shape box square", icon: SquareIcon, run: () => { st().setShapeKind("rect"); st().setTool("shape") } },
      { id: "ellipse", label: "Ellipse", hint: kbd("o"), section: "Tools", keywords: "circle oval shape", icon: CircleIcon, run: () => { st().setShapeKind("ellipse"); st().setTool("shape") } },
      { id: "draw", label: "Draw", hint: kbd("p"), section: "Tools", keywords: "pencil pen freehand scribble", icon: PencilSimpleIcon, run: () => st().setTool("draw") },
      { id: "text", label: "Text", hint: kbd("t"), section: "Tools", keywords: "type label", icon: TextTIcon, run: () => st().setTool("text") },
      { id: "arrow", label: "Arrow", hint: kbd("l"), section: "Tools", keywords: "line connector point rule divider stroke", icon: ArrowUpRightIcon, run: () => st().setTool("arrow") },

      { id: "undo", label: "Undo", hint: kbd("mod+z"), section: "Edit", icon: ArrowUUpLeftIcon, run: () => st().undo() },
      { id: "redo", label: "Redo", hint: kbd("mod+shift+z"), section: "Edit", icon: ArrowUUpRightIcon, run: () => st().redo() },
      { id: "dup", label: "Duplicate", hint: kbd("mod+d"), section: "Edit", icon: CopyIcon, disabled: !hasSel, run: () => st().duplicateSelected() },
      { id: "copy", label: "Copy", hint: kbd("mod+c"), section: "Edit", icon: CopyIcon, disabled: !hasSel, run: copySelection },
      { id: "copy-png", label: "Copy as PNG", hint: kbd("mod+shift+c"), section: "Edit", keywords: "image picture screenshot share paste slack clipboard export", icon: ImageIcon, run: copyAsPngWithNotice },
      { id: "cut", label: "Cut", hint: kbd("mod+x"), section: "Edit", icon: ScissorsIcon, disabled: !hasSel, run: cutSelection },
      { id: "paste", label: "Paste", hint: kbd("mod+v"), section: "Edit", keywords: "image picture screenshot", icon: ClipboardIcon, run: () => void pasteFromSystem() },
      { id: "del", label: "Delete", hint: kbd("del"), section: "Edit", icon: TrashIcon, disabled: !hasSel, run: () => st().deleteSelected() },
      { id: "group", label: "Group", hint: kbd("mod+g"), section: "Edit", keywords: "combine bundle", icon: BoundingBoxIcon, disabled: selection.length < 2, run: () => st().groupSelected() },
      { id: "ungroup", label: "Ungroup", hint: kbd("mod+shift+g"), section: "Edit", keywords: "split apart", icon: LinkBreakIcon, disabled: !hasGroup, run: () => st().ungroupSelected() },
      {
        id: "break", label: "Detach instance", hint: kbd("alt+mod+b"), section: "Edit",
        keywords: "break apart explode ungroup component",
        icon: LinkBreakIcon, disabled: !hasComponent,
        run: () => st().detachSelected(),
      },
      { id: "selectall", label: "Select all", hint: kbd("mod+a"), section: "Edit", icon: StackIcon, run: () => st().selectAll() },
      // "select every button on this screen so I can restyle them in one go" —
      // no key is free for it and the rail has no room, so the box is its home
      { id: "same-kind", label: "Select all of the same kind", section: "Edit", keywords: "same similar matching type every buttons restyle", icon: SquaresFourIcon, disabled: !hasSel, run: () => st().selectSameKind() },
      { id: "lock", label: "Lock", hint: kbd("mod+shift+l"), section: "Edit", keywords: "freeze pin hold still background protect", icon: LockSimpleIcon, disabled: !hasSel, run: () => st().lockSelected() },
      // the one command that has to be here: with nothing selected and nothing
      // clickable, ⌘K is the only door left into a canvas you've locked down
      { id: "unlock", label: "Unlock all layers", section: "Edit", keywords: "lock free release loose", icon: LockSimpleOpenIcon, disabled: !lockedCount, run: () => st().unlockAll() },

      { id: "forward", label: "Bring forward", hint: kbd("mod+]"), section: "Arrange", icon: StackSimpleIcon, disabled: !hasSel, run: () => st().bringForward(st().selection) },
      { id: "backward", label: "Send backward", hint: kbd("mod+["), section: "Arrange", icon: StackSimpleIcon, disabled: !hasSel, run: () => st().sendBackward(st().selection) },
      { id: "front", label: "Bring to front", hint: kbd("far+]"), section: "Arrange", icon: StackIcon, disabled: !hasSel, run: () => st().bringToFront(st().selection) },
      { id: "back", label: "Send to back", hint: kbd("far+["), section: "Arrange", icon: StackIcon, disabled: !hasSel, run: () => st().sendToBack(st().selection) },
      { id: "flip-h", label: "Flip horizontal", hint: kbd("shift+h"), section: "Arrange", keywords: "mirror reverse", icon: FlipHorizontalIcon, disabled: !hasSel, run: () => st().flipSelected("x") },
      { id: "flip-v", label: "Flip vertical", hint: kbd("shift+v"), section: "Arrange", keywords: "mirror reverse", icon: FlipVerticalIcon, disabled: !hasSel, run: () => st().flipSelected("y") },
      { id: "crop", label: "Crop image", hint: kbd("enter"), section: "Arrange", keywords: "photo picture trim frame mask", icon: CropIcon, disabled: !loneImage, run: () => loneImage && st().setCropping(loneImage) },
      { id: "uncrop", label: "Reset crop", section: "Arrange", keywords: "photo picture uncrop restore full", icon: ArrowCounterClockwiseIcon, disabled: !hasCrop, run: () => st().resetCrop() },
      { id: "align-l", label: "Align left", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("left") },
      { id: "align-hc", label: "Align centres horizontally", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("hcenter") },
      { id: "align-r", label: "Align right", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("right") },
      { id: "align-t", label: "Align top", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("top") },
      { id: "align-vc", label: "Align middles vertically", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("vcenter") },
      { id: "align-b", label: "Align bottom", section: "Arrange", icon: CornersOutIcon, disabled: selection.length < 2, run: () => st().alignSelected("bottom") },

      { id: "bold", label: "Bold", hint: kbd("mod+b"), section: "Text", icon: TextBIcon, disabled: !hasText, run: () => st().toggleTextStyle("bold") },
      { id: "italic", label: "Italic", hint: kbd("mod+i"), section: "Text", icon: TextItalicIcon, disabled: !hasText, run: () => st().toggleTextStyle("italic") },
      { id: "underline", label: "Underline", hint: kbd("mod+u"), section: "Text", icon: TextUnderlineIcon, disabled: !hasText, run: () => st().toggleTextStyle("underline") },
      { id: "link", label: "Link selection", hint: kbd("mod+k"), section: "Text", keywords: "url href", icon: LinkIcon, disabled: !hasText, run: () => st().setLinkOpen(true) },

      { id: "zoom-in", label: "Zoom in", hint: kbd("mod+plus"), section: "View", icon: MagnifyingGlassPlusIcon, run: () => st().zoomBy(1.25) },
      { id: "zoom-out", label: "Zoom out", hint: kbd("mod+-"), section: "View", icon: MagnifyingGlassMinusIcon, run: () => st().zoomBy(1 / 1.25) },
      { id: "zoom-100", label: "Zoom to 100%", hint: kbd("shift+0"), section: "View", keywords: "actual size", icon: MagnifyingGlassIcon, run: () => st().zoomTo100() },
      { id: "zoom-fit", label: "Zoom to fit", hint: kbd("shift+1"), section: "View", keywords: "everything overview", icon: CornersOutIcon, run: () => st().zoomToFit() },
      { id: "zoom-sel", label: "Zoom to selection", hint: kbd("shift+2"), section: "View", icon: CornersInIcon, disabled: !hasSel, run: () => st().zoomToSelection() },
      { id: "zoom-reset", label: "Reset view", hint: kbd("mod+0"), section: "View", keywords: "origin home", icon: CornersOutIcon, run: () => st().setViewport({ x: 0, y: 0, zoom: 1 }) },
      { id: "hide-ui", label: "Hide the interface", hint: kbd("mod+\\"), section: "View", keywords: "clean present chrome", icon: EyeSlashIcon, run: () => st().setUiHidden(true) },
      { id: "keys", label: "Keyboard shortcuts", hint: kbd("shift+/"), section: "View", keywords: "hotkeys help cheat sheet", icon: KeyboardIcon, run: () => st().setShortcutsOpen(true) },

      { id: "new", label: "New file", section: "File", keywords: "blank clear reset", icon: FileIcon, run: () => st().newFile() },
      { id: "save", label: "Save", hint: kbd("mod+s"), section: "File", keywords: "keep store local", icon: FloppyDiskIcon, run: () => st().saveNow() },
      { id: "export", label: "Export .squig", hint: kbd("mod+shift+s"), section: "File", keywords: "save download json copy backup", icon: DownloadSimpleIcon, run: exportDoc },
      { id: "export-png", label: "Export PNG", section: "File", keywords: "save download image picture raster file ticket deck attach", icon: FilePngIcon, run: () => saveImageWithNotice("png") },
      { id: "export-svg", label: "Export SVG", section: "File", keywords: "save download vector image file print sharp scale", icon: FileSvgIcon, run: () => saveImageWithNotice("svg") },
      { id: "import", label: "Import .squig", section: "File", keywords: "open load json disk", icon: UploadSimpleIcon, run: importDoc },

      // every file this browser is holding, so ⌘K can open one too
      ...files
        .filter((f) => f.id !== docId)
        .slice(0, RECENT_IN_PALETTE)
        .map((f) => ({
          id: `open:${f.id}`,
          label: f.name,
          hint: relativeTime(f.updatedAt),
          section: "Recent",
          keywords: "open recent file document",
          icon: FileIcon,
          run: () => st().openFile(f.id),
        })),
    ],
    [st, hasSel, hasComponent, hasText, hasGroup, loneImage, hasCrop, lockedCount, selection.length, files, docId]
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
    // icons only answer a search — there are thousands of them. searchIcons
    // reads a module-level index; indexReady is what re-runs it once tags land
    void indexReady
    const icons = q ? searchIcons(q, ICONS_IN_PALETTE) : []
    // reads `text` and the string props straight off each node — no rendering,
    // no walking prims; lib/canvas/find says what it deliberately skips
    const jumps = q ? searchNodes(nodes, order, q, JUMPS_IN_PALETTE) : []
    return [
      ...jumps.map((hit): Row => ({ kind: "node", hit })),
      ...acts.map((action): Row => ({ kind: "action", action })),
      ...limited.map((def): Row => ({ kind: "def", def })),
      ...icons.map((name): Row => ({ kind: "icon", name })),
    ]
  }, [query, actions, indexReady, nodes, order])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" })
  }, [active])

  const runRow = useCallback(
    (row: Row) => {
      if (row.kind === "action") row.action.run()
      else if (row.kind === "icon") st().insertComponent("icon", { name: row.name })
      else if (row.kind === "node") {
        // selecting it is only half the job — the other half is being able to
        // see what you selected, which is what revealSelection is for
        st().setSelection([row.hit.id])
        st().revealSelection()
      } else st().insertComponent(row.def.kind)
      close()
    },
    [st, close]
  )

  // group consecutive rows by section for headers
  const sections: { title: string; rows: { row: Row; index: number }[] }[] = []
  rows.forEach((row, index) => {
    const title =
      row.kind === "action"
        ? row.action.section
        : row.kind === "icon"
          ? "Icons"
          : row.kind === "node"
            ? "Jump to"
            : row.def.category === "components"
              ? "Components"
              : "Blocks"
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
          className="animate-in slide-in-from-bottom-4 fade-in relative mx-auto flex max-h-[62vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-chrome-lg border border-b-0 border-border/80 bg-background shadow-popup duration-150"
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
              placeholder="search anything — your screens, buttons, blocks, tools…"
              className="w-full bg-transparent py-4 pr-4 pl-11 text-title outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                e.stopPropagation()
                // the keys that opened the sheet also close it
                if ((e.metaKey || e.ctrlKey) && (e.code === "KeyK" || e.code === "Slash")) {
                  e.preventDefault()
                  close()
                } else if (e.key === "Escape") close()
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

          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain p-2.5">
            {!rows.length && (
              <p className="py-10 text-center text-row text-muted-foreground">
                nothing matches &ldquo;{query}&rdquo;. try fewer letters.
              </p>
            )}
            {sections.map((section) => (
              <div key={section.title} className="mb-2">
                <div className="px-2.5 pt-3 pb-1.5 text-label font-medium text-foreground">
                  {section.title}
                </div>
                {section.rows.map(({ row, index }) => (
                  <PaletteRow
                    key={
                      row.kind === "action"
                        ? row.action.id
                        : row.kind === "icon"
                          ? `icon:${row.name}`
                          : row.kind === "node"
                            ? `node:${row.hit.id}`
                            : row.def.kind
                    }
                    row={row}
                    active={index === active}
                    onHover={() => setActive(index)}
                    onPick={() => runRow(row)}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-4 border-t border-border/70 px-4 py-2.5 text-label text-muted-foreground">
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
    <kbd className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded-chrome-xs border bg-muted px-1 font-mono text-micro">
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
      className={`flex h-ctl-lg w-full items-center gap-3 rounded-chrome-sm px-2.5 text-left text-row ${
        active ? "bg-accent text-accent-foreground" : "text-foreground"
      }`}
    >
      {row.kind === "action" ? (
        <>
          <row.action.icon className="size-4 shrink-0 text-muted-foreground" weight="regular" />
          <span className="flex-1 truncate">{row.action.label}</span>
          {row.action.hint && <span className="pl-6 font-mono text-label text-muted-foreground">{row.action.hint}</span>}
        </>
      ) : row.kind === "node" ? (
        <>
          {row.hit.type === "text" ? (
            <TextTIcon className="size-4 shrink-0 text-muted-foreground" weight="regular" />
          ) : (
            <SquaresFourIcon className="size-4 shrink-0 text-muted-foreground" weight="regular" />
          )}
          <span className="flex-1 truncate">{row.hit.label}</span>
          <span className="pl-6 text-label text-muted-foreground">{row.hit.detail}</span>
        </>
      ) : row.kind === "icon" ? (
        <>
          <IconGlyph name={row.name} />
          <span className="flex-1 truncate">{row.name}</span>
          <span className="pl-6 text-label text-muted-foreground">Icon</span>
        </>
      ) : (
        <>
          <DefThumb def={row.def} />
          <span className="flex-1 truncate">{row.def.name}</span>
          <span className="pl-6 text-label text-muted-foreground">{row.def.group}</span>
        </>
      )}
    </button>
  )
}

/** Empty until the weight chunk lands — the version bump paints it in. */
function IconGlyph({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 256 256" className="size-4 shrink-0 text-muted-foreground">
      {(getIconPaths(name, "regular") ?? []).map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
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
