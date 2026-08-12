"use client"

// ---------------------------------------------------------------------------
// The icon control — a picker, because a name field was a quiz.
//
// There are around 1,500 Phosphor icons and no way to type "arrow-square-out"
// from memory. A text field asks you to already know the answer; this asks what
// you mean and shows you the glyphs, which is the only honest way to choose
// between a thousand pictures.
//
// Previews draw at the selection's own weight, so picking from the grid shows
// the thing that will land on the canvas rather than a regular-weight rumour of
// it. The catalog loads in chunks, so a glyph can be a blank square for one
// frame — the version bump fills it in rather than blocking the panel.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"

import { useSquig } from "@/lib/store"
import type { ComponentNode, SquigNode } from "@/lib/types"
import type { ControlDef } from "@/lib/library/registry"
import { MIXED_LABEL, sharedProp } from "@/lib/selection"
import { getIconPaths, loadIconWeight, normalizeIconWeight, type IconWeight } from "@/lib/sketch/icon-catalog"
import { resolveIconName } from "@/lib/sketch/icons"
import { iconIndexReady, loadIconIndex, relatedIcons, searchIcons } from "@/lib/sketch/icon-search"
import { useIconCatalogVersion } from "@/lib/sketch/use-icon-catalog"
import { Input } from "@/components/ui/input"
import { PanelNote, StackRow } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

/** Phosphor draws everything in this box; the catalog hands back raw `d`s. */
const PHOSPHOR_VB = "0 0 256 256"

/** How many hits a query gets, and how many the empty state suggests. */
const SEARCH_LIMIT = 36
const SUGGEST_LIMIT = 24

/**
 * One glyph, straight from the catalog.
 *
 * A miss renders an empty box rather than a placeholder mark: the chunk is
 * already on its way and a redraw follows, so a wrong glyph would flash longer
 * than nothing does. Aliased names ("search", "home") resolve the same way the
 * canvas resolves them, so an older document previews here too.
 */
function Glyph({ name, weight, className }: { name: string; weight: IconWeight; className?: string }) {
  // the brand mark isn't a Phosphor glyph — same two rings icon() draws
  if (name === "logo") {
    return (
      <svg viewBox={PHOSPHOR_VB} className={className} aria-hidden focusable="false">
        <circle cx="128" cy="128" r="112" fill="none" stroke="currentColor" strokeWidth="16" />
        <circle cx="128" cy="128" r="50" fill="none" stroke="currentColor" strokeWidth="16" />
      </svg>
    )
  }
  const resolved = resolveIconName(name)
  const paths = (resolved && getIconPaths(resolved, weight)) || []
  return (
    <svg viewBox={PHOSPHOR_VB} className={className} aria-hidden focusable="false">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  )
}

/**
 * The picker itself. Split from `IconControl` so the compact bail-out happens
 * before any hook does — a control that renders in two places must run the same
 * hooks in both.
 */
function IconPicker({ nodes, control }: { nodes: ComponentNode[]; control: ControlDef }) {
  const st = useSquig.getState
  const [query, setQuery] = useState("")
  // the tags index arrives after mount; without a re-render the grid would keep
  // showing the popular fallback until something else happened to redraw it
  const [, setIndexReady] = useState(iconIndexReady)
  // redraw when a weight chunk lands, so blank previews fill themselves in
  useIconCatalogVersion()

  const current = sharedProp(nodes, control.key)
  // aliases and the grid must agree on a spelling, or the current icon never
  // reads as selected — resolve once and compare against that
  const rawName = current.mixed ? null : String(current.value ?? "")
  const currentName = rawName === "logo" ? "logo" : rawName ? (resolveIconName(rawName) ?? rawName) : null
  const weight = normalizeIconWeight(nodes[0]?.props.weight)

  useEffect(() => {
    void loadIconIndex().then(() => setIndexReady(true))
  }, [])

  // previews must agree with the canvas, so fetch whatever weight is selected
  useEffect(() => {
    void loadIconWeight(weight)
  }, [weight])

  // both calls read the index as it stands, so they're redone every render
  // rather than memoised against it — a scan of 1,500 names costs less than
  // keeping a cache key honest about a chunk that lands whenever it lands
  const q = query.trim()
  let results = q ? searchIcons(q, SEARCH_LIMIT) : relatedIcons(currentName ?? "", SUGGEST_LIMIT)
  // the brand mark lives outside the catalog, so search has to be told —
  // otherwise the one squig-only glyph becomes unreachable once picked away
  if (q.length >= 2 && ("logo".startsWith(q.toLowerCase()) || "squig".startsWith(q.toLowerCase()))) {
    results = ["logo", ...results]
  }

  /** one checkpoint, one patch, one undo step — however many nodes there are */
  const setValue = (next: string) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of nodes) {
      patches[n.id] = { props: { ...n.props, [control.key]: next } } as Partial<SquigNode>
    }
    st().updateNodes(patches, { checkpoint: true })
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* what you have now, spelled out — the grid below scrolls away from the
          current icon the moment you search, and "which one is this?" is the
          question the old text field at least answered */}
      <div className="flex h-ctl items-center gap-2">
        {currentName && <Glyph name={currentName} weight={weight} className="size-5 shrink-0 text-foreground" />}
        <span className="min-w-0 flex-1 truncate text-label text-muted-foreground">
          {current.mixed ? MIXED_LABEL : currentName}
        </span>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          aria-label="Search icons"
          placeholder="search 1,500 icons…"
          className="pl-7 text-label"
          onChange={(e) => setQuery(e.target.value)}
          // the canvas listens globally; a letter typed here is not a tool key
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Escape") setQuery("")
          }}
        />
      </div>

      {!q && <span className="text-label text-muted-foreground select-none">suggested</span>}

      <div className="max-h-[200px] overflow-y-auto overscroll-contain rounded-chrome-sm border border-input p-1">
        {results.length > 0 ? (
          <div className="grid grid-cols-6 justify-items-center gap-0.5">
            {results.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={name === currentName}
                onClick={() => setValue(name)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-chrome-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40",
                  name === currentName
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Glyph name={name} weight={weight} className="size-4" />
              </button>
            ))}
          </div>
        ) : (
          <PanelNote className="px-1 py-3 text-center">nothing matches &ldquo;{q}&rdquo;</PanelNote>
        )}
      </div>
    </div>
  )
}

/**
 * The `icon` ControlDef's widget.
 *
 * The floating context row is one strip of quick knobs; a search field and a
 * scrolling grid have nowhere to stand in it, so there the icon is chosen from
 * the inspector or not at all.
 */
export function IconControl({
  nodes,
  control,
  compact = false,
}: {
  nodes: ComponentNode[]
  control: ControlDef
  compact?: boolean
}) {
  if (compact) return null
  return (
    <StackRow label={control.label}>
      <IconPicker nodes={nodes} control={control} />
    </StackRow>
  )
}
