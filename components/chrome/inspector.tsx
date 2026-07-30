"use client"

// ---------------------------------------------------------------------------
// Inspector — the panel that edits whatever is selected.
//
// It edits a *selection*, never "the selected node". One node is a selection of
// one; anything the selection disagrees on shows a dash you can type over.
//
// The layout borrows a design tool's grammar — folding sections, one alignment
// seam every control lands on, scrubbable numbers — but not a design tool's
// appetite. Sections appear only when the selection has something for them to
// edit, so a scribble shows Position, Fill and Outline and nothing else. If you
// ever find yourself adding a section that's usually empty, it belongs
// somewhere else.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import type { ArrowNode, ComponentNode, FillTone, ShapeNode, SquigNode, StrokeWeight, TextNode } from "@/lib/types"
import { normalizeFill } from "@/lib/types"
import { getDef } from "@/lib/library/registry"
import { selectionSummary, shared, sharedControls, sharedNumber, unionBounds } from "@/lib/selection"
import { scaleNodes, MIN_SIZE } from "@/lib/canvas/transform"
import { VariantControl } from "./variant-controls"
import { MixedNumberField, MixedSwitch, MixedTextField } from "./mixed-fields"
import { AlignRow } from "./align-row"
import { Panel, PanelFooter, PanelHeader, PanelNote, PanelSection, Row, StackRow } from "@/components/ui/panel"
import { IconAction, IconToggle, Segmented, type SegmentOption } from "@/components/ui/segmented"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ArrowsOutIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  LinkBreakIcon,
  SelectionAllIcon,
  TextBIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { kbd } from "@/lib/shortcuts"
import { InkPicker } from "./ink-picker"
import { bgOf, paletteOf, PAPER_SHADES, type FontMode, type PaperShade } from "@/lib/theme"

// ---------------------------------------------------------------------------
// Option sets. Declared out here so they aren't rebuilt on every keystroke.

/** A tone chip, drawn from the live palette so it previews the actual ink. */
function ToneChip({ fill, slash = false }: { fill?: string; slash?: boolean }) {
  return (
    <span
      className="relative block size-3.5 rounded-chrome-xs border border-[var(--sq-faint)]"
      style={{ background: fill ?? "transparent" }}
    >
      {slash && (
        <span className="absolute inset-0 overflow-hidden rounded-chrome-xs">
          <span className="absolute top-1/2 -left-1/4 h-px w-[150%] -translate-y-1/2 rotate-45 bg-[var(--sq-faint)]" />
        </span>
      )}
    </span>
  )
}

const FILL_OPTIONS: readonly SegmentOption<FillTone>[] = [
  { value: "none", label: "No fill", content: <ToneChip slash /> },
  { value: "paper", label: "Paper — opaque, hides what's behind", content: <ToneChip fill="var(--sq-paper)" /> },
  { value: "light", label: "Light shade", content: <ToneChip fill="var(--sq-shade)" /> },
  { value: "strong", label: "Strong shade", content: <ToneChip fill="var(--sq-shade-strong)" /> },
]

/**
 * A sheet sample — the literal colour that shade puts behind the drawing,
 * filling its whole segment. Three near-whites can only be told apart at size,
 * so the swatch is the segment rather than a chip beside a word.
 */
function PaperSample({ fill }: { fill: string }) {
  return (
    <span
      // a neutral hairline, not the ink's faint: an inked outline would read as
      // a drawn box rather than as a sheet of paper
      className="block h-[18px] w-full rounded-chrome-xs border border-border"
      style={{ background: fill }}
    />
  )
}

/**
 * The face the canvas letters in, shown rather than named: each segment sets
 * "Aa" in the face it selects. "Sans serif" is a word you have to translate;
 * two letters in the actual font you don't.
 */
const FONT_OPTIONS: readonly SegmentOption<FontMode>[] = [
  { value: "hand", label: "Hand-drawn", content: <FontSample family="var(--font-sketch)" /> },
  { value: "sans", label: "Sans serif", content: <FontSample family="var(--font-sans)" /> },
  { value: "serif", label: "Serif", content: <FontSample family="var(--font-serif)" /> },
]

/** "Aa" set in one face — a little large for the row, because two letters at
    11px don't carry enough of a face to tell it from its neighbour. */
function FontSample({ family }: { family: string }) {
  return (
    <span className="text-[13px] leading-none" style={{ fontFamily: family }}>
      Aa
    </span>
  )
}

/** A pen-weight chip — the actual relative widths, not three identical bars. */
function PenChip({ height }: { height: number }) {
  return <span className="block w-4 rounded-full bg-current" style={{ height }} />
}

const STROKE_OPTIONS: readonly SegmentOption<StrokeWeight>[] = [
  { value: "light", label: "Light pen", content: <PenChip height={1} /> },
  { value: "regular", label: "Regular pen", content: <PenChip height={1.75} /> },
  { value: "heavy", label: "Heavy pen", content: <PenChip height={3} /> },
]

/** Drawn as icons, not as styled letters — a glyph small enough to fit the
    toggle is too small to read as bold-versus-regular at a glance. */
const TEXT_STYLES = [
  { key: "bold", label: "Bold", icon: TextBIcon },
  { key: "italic", label: "Italic", icon: TextItalicIcon },
  { key: "underline", label: "Underline", icon: TextUnderlineIcon },
] as const

// ---------------------------------------------------------------------------

export function Inspector() {
  const nodes = useSquig((s) => s.nodes)
  const selection = useSquig((s) => s.selection)

  const selected = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
  const empty = selected.length === 0

  // Nothing selected is not an absence — it's the page. So the panel keeps its
  // job and changes its subject rather than going blank.
  const heading = empty
    ? "Page"
    : selected.length > 1
      ? `${selected.length} selected`
      : selected[0].type === "component"
        ? (getDef((selected[0] as ComponentNode).kind)?.name ?? (selected[0] as ComponentNode).kind)
        : selected[0].type

  const subtitle = selected.length > 1 ? selectionSummary(selected) : undefined

  return (
    <Panel className="absolute top-4 right-4 z-30 max-h-[calc(100vh-2rem)] w-[272px]">
      <PanelHeader title={heading} subtitle={subtitle} />

      <ScrollArea className="min-h-0">
        {/* remounting on a selection change drops any half-typed draft, which
            is what you want — the field now describes different objects */}
        <div key={selection.join(",")} className="flex flex-col">
          {empty ? <PageSettings /> : <SelectionEditor selected={selected} />}
        </div>
      </ScrollArea>

      {empty ? <PageFooter /> : <Footer selected={selected} />}
    </Panel>
  )
}

// ---------------------------------------------------------------------------

/**
 * With nothing selected the panel edits the page instead of apologising for
 * being empty. Paper and Ink belong to the document and are saved inside it —
 * two drawings can hold two different looks. View is the one app-level section,
 * which is why it sits apart at the bottom.
 */
function PageSettings() {
  const paper = useSquig((s) => s.paper)
  const grid = useSquig((s) => s.grid)
  const font = useSquig((s) => s.font)
  const theme = useSquig((s) => s.theme)
  const contextRow = useSquig((s) => s.contextRow)
  const st = useSquig.getState

  const palette = paletteOf(theme)

  /** Built per palette, not once at module load — the samples preview this
      theme's actual sheet, which is the whole point of showing them. */
  const paperOptions: SegmentOption<PaperShade>[] = PAPER_SHADES.map(({ value, label }) => ({
    value,
    label: `${label} paper`,
    content: <PaperSample fill={bgOf(palette, value)} />,
  }))

  return (
    <>
      <PanelSection id="page-paper" title="Paper">
        <Row label="Shade">
          <Segmented
            ariaLabel="Paper shade"
            options={paperOptions}
            shared={{ mixed: false, value: paper }}
            onChange={(s) => st().setPaper(s)}
          />
        </Row>
        <Row spread label="Dot grid">
          <Switch checked={grid} aria-label="Dot grid" onCheckedChange={(on) => st().setGrid(on)} className="scale-90" />
        </Row>
      </PanelSection>

      <PanelSection id="page-ink" title="Ink">
        <Row label="Palette">
          <InkPicker />
        </Row>
        <Row label="Font">
          <Segmented
            ariaLabel="Font"
            options={FONT_OPTIONS}
            shared={{ mixed: false, value: font }}
            onChange={(f) => st().setFont(f)}
          />
        </Row>
        <PanelNote>saved with this drawing — a new file starts from whatever you set last</PanelNote>
      </PanelSection>

      <PanelSection id="page-view" title="View">
        <Row spread label="Context menu">
          <Switch
            checked={contextRow}
            aria-label="Context menu"
            onCheckedChange={(on) => st().setContextRow(on)}
            className="scale-90"
          />
        </Row>
        <PanelNote>quick controls float above the selection</PanelNote>
      </PanelSection>
    </>
  )
}

/** Footer for the page panel — whole-canvas moves, not selection ones. */
function PageFooter() {
  const count = useSquig((s) => s.order.length)
  const st = useSquig.getState

  return (
    <PanelFooter>
      <Button
        variant="outline"
        size="sm"
        disabled={count === 0}
        className="h-ctl flex-1 rounded-chrome-sm text-label"
        onClick={() => st().zoomToFit()}
      >
        <ArrowsOutIcon className="size-3" /> Fit
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={count === 0}
        className="h-ctl flex-1 rounded-chrome-sm text-label"
        onClick={() => st().selectAll()}
      >
        <SelectionAllIcon className="size-3" /> Select all
      </Button>
    </PanelFooter>
  )
}

// ---------------------------------------------------------------------------

function SelectionEditor({ selected }: { selected: SquigNode[] }) {
  const st = useSquig.getState
  const multi = selected.length > 1

  /**
   * Apply a patch to every node that wants one.
   *
   * `checkpoint: false` is for controls that stream — a scrub takes a single
   * checkpoint when the drag starts and then writes freely, so asking for one
   * per pixel would bury the undo stack.
   */
  const patch = (make: (n: SquigNode) => Partial<SquigNode> | null, opts?: { checkpoint?: boolean }) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of selected) {
      const p = make(n)
      if (p) patches[n.id] = p
    }
    if (Object.keys(patches).length) st().updateNodes(patches, { checkpoint: opts?.checkpoint ?? true })
  }
  const live = (make: (n: SquigNode) => Partial<SquigNode> | null) => patch(make, { checkpoint: false })
  const startGesture = () => st().checkpoint()

  const grouped = selected.some((n) => n.groupIds?.length)
  const components = selected.filter((n): n is ComponentNode => n.type === "component")
  const shapes = selected.filter((n): n is ShapeNode => n.type === "shape")
  const arrows = selected.filter((n): n is ArrowNode => n.type === "arrow")
  const texts = selected.filter((n): n is TextNode => n.type === "text")
  // components draw their own strokes from authored prims — a pen weight set
  // here would have nothing to apply to without rewriting the whole library
  const outlined = selected.filter((n) => n.type === "shape" || n.type === "draw" || n.type === "arrow")

  const controls = components.length === selected.length ? sharedControls(components) : []
  const variantControls = controls.filter((c) => c.type !== "text")
  const textControls = controls.filter((c) => c.type === "text")

  /** Only worth printing a count when the section misses part of the selection. */
  const partial = (n: number) => (n === selected.length ? undefined : n)

  return (
    <>
      {grouped && (
        <div className="border-b border-border/60 px-gutter py-3">
          <PanelNote>
            grouped — {kbd("mod+click")} to reach one piece, {kbd("mod+shift+g")} to undo the grouping.
          </PanelNote>
        </div>
      )}

      {/* Position & size — a dash means they disagree; type to make them agree.
          Typing sets every node to that value (Figma does the same); scrubbing
          and arrow keys nudge each from its own, so a mixed field stays mixed. */}
      <PanelSection id="position" title="Position">
        <div className="grid grid-cols-2 gap-1.5">
          <MixedNumberField
            label="X"
            shared={sharedNumber(selected, (n) => n.x)}
            onGestureStart={startGesture}
            onCommit={(v) => live(() => ({ x: v }))}
            onStep={(d) => live((n) => ({ x: n.x + d }))}
          />
          <MixedNumberField
            label="Y"
            shared={sharedNumber(selected, (n) => n.y)}
            onGestureStart={startGesture}
            onCommit={(v) => live(() => ({ y: v }))}
            onStep={(d) => live((n) => ({ y: n.y + d }))}
          />
          <MixedNumberField
            label="W"
            min={MIN_SIZE}
            shared={sharedNumber(selected, (n) => n.w)}
            onGestureStart={startGesture}
            onCommit={(v) => live((n) => resizeTo(n, Math.max(MIN_SIZE, v), n.h))}
            onStep={(d) => live((n) => resizeTo(n, Math.max(MIN_SIZE, n.w + d), n.h))}
          />
          <MixedNumberField
            label="H"
            min={MIN_SIZE}
            shared={sharedNumber(selected, (n) => n.h)}
            onGestureStart={startGesture}
            onCommit={(v) => live((n) => resizeTo(n, n.w, Math.max(MIN_SIZE, v)))}
            onStep={(d) => live((n) => resizeTo(n, n.w, Math.max(MIN_SIZE, n.h + d)))}
          />
        </div>

        {/* eight icons don't fit beside a label column, so alignment takes the
            full width and flipping — which is always available — keeps the row */}
        {multi && (
          <StackRow label="Align">
            <AlignRow count={selected.length} className="justify-between" />
          </StackRow>
        )}

        <Row label="Flip">
          <IconAction label={`Flip horizontally · ${kbd("shift+h")}`} onClick={() => st().flipSelected("x")}>
            <FlipHorizontalIcon className="size-3.5" />
          </IconAction>
          <IconAction label={`Flip vertically · ${kbd("shift+v")}`} onClick={() => st().flipSelected("y")}>
            <FlipVerticalIcon className="size-3.5" />
          </IconAction>
        </Row>
      </PanelSection>

      {/* --- contextual: text ------------------------------------------- */}
      {texts.length > 0 && (
        <PanelSection id="text" title="Text" count={partial(texts.length)}>
          <StackRow>
            <MixedTextField
              ariaLabel="Text"
              shared={shared(texts.map((n) => n.text))}
              onCommit={(v) => patch((n) => (n.type === "text" ? (reflowText(n, v, n.fontSize) as Partial<SquigNode>) : null))}
            />
          </StackRow>

          <Row label="Style">
            {TEXT_STYLES.map(({ key, label, icon: Icon }) => {
              const on = shared(texts.map((n) => !!n[key]))
              return (
                <IconToggle
                  key={key}
                  label={label}
                  hint={kbd(`mod+${key[0]}`)}
                  pressed={!on.mixed && on.value}
                  mixed={on.mixed}
                  onPressedChange={() => st().toggleTextStyle(key)}
                >
                  <Icon className="size-4" />
                </IconToggle>
              )
            })}
          </Row>

          {/* A link is a value, not a mode — so it gets a field showing where
              the text actually points. Empty means it points nowhere, and
              clearing the field is how you unlink. ⌘K still opens the floating
              editor over the canvas for the same value. */}
          <Row label="Link">
            <MixedTextField
              ariaLabel="Link"
              placeholder="https://…"
              shared={shared(texts.map((n) => n.link ?? ""))}
              onCommit={(v) => st().setLinkOnSelection(v)}
            />
          </Row>

          <Row label="Size">
            <MixedNumberField
              label=""
              min={4}
              className="w-[78px]"
              shared={sharedNumber(texts, (n) => (n as TextNode).fontSize)}
              onGestureStart={startGesture}
              onCommit={(v) =>
                live((n) => (n.type === "text" && v > 0 ? (reflowText(n, n.text, v) as Partial<SquigNode>) : null))
              }
              onStep={(d) =>
                live((n) =>
                  n.type === "text" ? (reflowText(n, n.text, Math.max(4, n.fontSize + d)) as Partial<SquigNode>) : null
                )
              }
            />
          </Row>
        </PanelSection>
      )}

      {/* --- contextual: fill ------------------------------------------- */}
      {shapes.length > 0 && (
        <PanelSection id="fill" title="Fill" count={partial(shapes.length)}>
          <Row label="Tone">
            <Segmented
              ariaLabel="Fill tone"
              options={FILL_OPTIONS}
              shared={shared(shapes.map((n) => normalizeFill(n.fill)))}
              onChange={(tone) => patch((n) => (n.type === "shape" ? ({ fill: tone } as Partial<SquigNode>) : null))}
            />
          </Row>
        </PanelSection>
      )}

      {/* --- contextual: outline ---------------------------------------- */}
      {outlined.length > 0 && (
        <PanelSection id="outline" title="Outline" count={partial(outlined.length)}>
          <Row label="Pen">
            <Segmented
              ariaLabel="Pen weight"
              options={STROKE_OPTIONS}
              shared={shared(outlined.map((n) => ("stroke" in n ? (n.stroke ?? "regular") : "regular")))}
              onChange={(weight) => patch((n) => (isOutlined(n) ? ({ stroke: weight } as Partial<SquigNode>) : null))}
            />
          </Row>
          <Row spread label="Dashed">
            <MixedSwitch
              ariaLabel="Dashed"
              shared={shared(outlined.map((n) => ("dashed" in n ? !!n.dashed : false)))}
              onChange={(on) => patch((n) => (isOutlined(n) ? ({ dashed: on } as Partial<SquigNode>) : null))}
            />
          </Row>
        </PanelSection>
      )}

      {/* --- contextual: arrows ------------------------------------------ */}
      {arrows.length > 0 && (
        <PanelSection id="arrow" title="Arrow" count={partial(arrows.length)}>
          <Row spread label="Head">
            <MixedSwitch
              ariaLabel="Arrowhead"
              shared={shared(arrows.map((n) => n.head))}
              onChange={(on) => patch((n) => (n.type === "arrow" ? ({ head: on } as Partial<SquigNode>) : null))}
            />
          </Row>
        </PanelSection>
      )}

      {/* --- contextual: component variants ------------------------------ */}
      {components.length > 0 && components.length === selected.length && (
        <>
          {variantControls.length > 0 && (
            <PanelSection id="variant" title="Variant">
              {variantControls.map((c) => (
                <VariantControl key={c.key} nodes={components} control={c} />
              ))}
            </PanelSection>
          )}
          {textControls.length > 0 && (
            <PanelSection id="content" title="Content">
              {textControls.map((c) => (
                <VariantControl key={c.key} nodes={components} control={c} />
              ))}
            </PanelSection>
          )}
          {multi && !controls.length && (
            <div className="p-gutter">
              <PanelNote>
                these components don&apos;t share any settings. select fewer kinds at once to tweak them.
              </PanelNote>
            </div>
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Footer({ selected }: { selected: SquigNode[] }) {
  const st = useSquig.getState
  // icons re-emit as icon components, so detaching one changes nothing
  const components = selected.filter((n) => n.type === "component" && n.kind !== "icon")

  return (
    <PanelFooter>
      {components.length > 0 && (
        <Button variant="outline" size="sm" className="h-ctl flex-1 rounded-chrome-sm text-label" onClick={() => st().detachSelected()}>
          <LinkBreakIcon className="size-3" /> Detach
          {components.length > 1 && <span className="tabular-nums">({components.length})</span>}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-ctl flex-1 rounded-chrome-sm text-label text-muted-foreground hover:text-destructive"
        onClick={() => st().deleteSelected()}
      >
        <TrashIcon className="size-3" /> Delete
      </Button>
    </PanelFooter>
  )
}

// ---------------------------------------------------------------------------

/** Nodes that carry their own pen settings. */
function isOutlined(n: SquigNode): boolean {
  return n.type === "shape" || n.type === "draw" || n.type === "arrow"
}

/**
 * Set one node's size through the exact transform the resize handle uses, so
 * typing "200" and dragging to 200 produce the same document rather than two
 * subtly different ones.
 */
function resizeTo(n: SquigNode, w: number, h: number): Partial<SquigNode> {
  const from = unionBounds([n])!
  return scaleNodes([n], from, { x: n.x, y: n.y, w, h })[n.id]
}

/** Text nodes size themselves from their content — keep the box honest. */
function reflowText(n: TextNode, text: string, fontSize: number): Partial<TextNode> {
  const lines = (text || " ").split("\n")
  const wGuess = Math.max(...lines.map((l) => l.length)) * fontSize * 0.5 + 10
  return { text, fontSize, w: Math.max(40, wGuess), h: lines.length * fontSize * 1.35 }
}
