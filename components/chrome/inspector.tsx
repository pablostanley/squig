"use client"

// ---------------------------------------------------------------------------
// Inspector — deliberately small. Position, variants, text. That's it.
// If this ever looks like Figma's panel, something has gone wrong.
//
// It edits a selection, never "the selected node". One node is a selection of
// one; anything the selection disagrees on shows a dash you can type over.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import type { SquigNode, ComponentNode, ShapeNode, ArrowNode, TextNode } from "@/lib/types"
import { getDef } from "@/lib/library/registry"
import { selectionSummary, shared, sharedControls, sharedNumber, unionBounds } from "@/lib/selection"
import { scaleNodes, MIN_SIZE } from "@/lib/canvas/transform"
import { VariantControl } from "./variant-controls"
import { MixedNumberField, MixedSwitch, MixedTextField } from "./mixed-fields"
import { AlignRow } from "./align-row"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Unlink, Trash2, Link as LinkIcon } from "lucide-react"
import { kbd } from "@/lib/shortcuts"

export function Inspector() {
  const nodes = useSquig((s) => s.nodes)
  const selection = useSquig((s) => s.selection)
  const contextRow = useSquig((s) => s.contextRow)
  const st = useSquig.getState

  const selected = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]

  return (
    <div
      data-squig-chrome
      className="absolute top-4 right-4 z-30 flex max-h-[calc(100vh-2rem)] w-[232px] flex-col overflow-hidden rounded-xl border bg-background shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ScrollArea className="min-h-0">
        {/* remounting on a selection change drops any half-typed draft, which
            is what you want — the field now describes different objects */}
        <div key={selection.join(",")} className="flex flex-col gap-4 p-3.5">
          {!selected.length ? (
            <>
              <div>
                <h3 className="text-sm font-medium">nothing selected</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  drop a component, scribble a shape, make a mess. it&apos;s a wireframe, not the Sistine Chapel.
                </p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-normal">Context menu</Label>
                  <p className="text-[11px] text-muted-foreground">quick controls above selection</p>
                </div>
                <Switch checked={contextRow} onCheckedChange={(on) => st().setContextRow(on)} className="scale-90" />
              </div>
            </>
          ) : (
            <SelectionEditor selected={selected} />
          )}
        </div>
      </ScrollArea>

      {selected.length > 0 && <Footer selected={selected} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function SelectionEditor({ selected }: { selected: SquigNode[] }) {
  const st = useSquig.getState
  const multi = selected.length > 1

  const patchAll = (make: (n: SquigNode) => Partial<SquigNode> | null) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of selected) {
      const p = make(n)
      if (p) patches[n.id] = p
    }
    if (Object.keys(patches).length) st().updateNodes(patches, { checkpoint: true })
  }

  const grouped = selected.some((n) => n.groupIds?.length)
  const components = selected.filter((n): n is ComponentNode => n.type === "component")
  const shapes = selected.filter((n): n is ShapeNode => n.type === "shape")
  const arrows = selected.filter((n): n is ArrowNode => n.type === "arrow")
  const texts = selected.filter((n): n is TextNode => n.type === "text")

  const controls = components.length === selected.length ? sharedControls(components) : []
  const variantControls = controls.filter((c) => c.type !== "text")
  const textControls = controls.filter((c) => c.type === "text")

  const heading = multi
    ? `${selected.length} selected`
    : selected[0].type === "component"
      ? (getDef((selected[0] as ComponentNode).kind)?.name ?? (selected[0] as ComponentNode).kind)
      : selected[0].type

  return (
    <>
      <div>
        <h3 className="text-sm font-medium">{heading}</h3>
        {multi && <p className="mt-0.5 text-[11px] text-muted-foreground">{selectionSummary(selected)}</p>}
      </div>

      {grouped && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          grouped — {kbd("mod+click")} to reach one piece, {kbd("mod+shift+g")} to undo the grouping.
        </p>
      )}

      {/* position & size — a dash means they disagree; type to make them agree.
          Typing sets every node to that value (Figma does the same); arrow keys
          nudge each from its own, so a mixed field stays mixed. */}
      <div className="grid grid-cols-2 gap-1.5">
        <MixedNumberField
          label="x"
          shared={sharedNumber(selected, (n) => n.x)}
          onCommit={(v) => patchAll(() => ({ x: v }))}
          onStep={(d) => patchAll((n) => ({ x: n.x + d }))}
        />
        <MixedNumberField
          label="y"
          shared={sharedNumber(selected, (n) => n.y)}
          onCommit={(v) => patchAll(() => ({ y: v }))}
          onStep={(d) => patchAll((n) => ({ y: n.y + d }))}
        />
        <MixedNumberField
          label="w"
          shared={sharedNumber(selected, (n) => n.w)}
          onCommit={(v) => patchAll((n) => resizeTo(n, Math.max(MIN_SIZE, v), n.h))}
          onStep={(d) => patchAll((n) => resizeTo(n, Math.max(MIN_SIZE, n.w + d), n.h))}
        />
        <MixedNumberField
          label="h"
          shared={sharedNumber(selected, (n) => n.h)}
          onCommit={(v) => patchAll((n) => resizeTo(n, n.w, Math.max(MIN_SIZE, v)))}
          onStep={(d) => patchAll((n) => resizeTo(n, n.w, Math.max(MIN_SIZE, n.h + d)))}
        />
      </div>

      {multi && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Arrange</span>
          <AlignRow count={selected.length} />
        </div>
      )}

      {/* component variants, intersected across whatever is selected */}
      {components.length > 0 && components.length === selected.length && (
        <>
          {variantControls.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Variant</span>
              {variantControls.map((c) => (
                <VariantControl key={c.key} nodes={components} control={c} />
              ))}
            </div>
          )}
          {textControls.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Text</span>
              {textControls.map((c) => (
                <VariantControl key={c.key} nodes={components} control={c} />
              ))}
            </div>
          )}
          {multi && !controls.length && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              these components don&apos;t share any settings. select fewer kinds at once to tweak them.
            </p>
          )}
        </>
      )}

      {/* mixed bags still get the knobs that apply to part of the selection */}
      {shapes.length > 0 && (
        <div className="flex items-center justify-between">
          <Label className="text-xs font-normal text-muted-foreground">
            Fill{shapes.length !== selected.length && ` (${shapes.length})`}
          </Label>
          <MixedSwitch
            ariaLabel="Fill"
            shared={shared(shapes.map((n) => n.fill))}
            onChange={(on) => patchAll((n) => (n.type === "shape" ? ({ fill: on } as Partial<SquigNode>) : null))}
          />
        </div>
      )}

      {arrows.length > 0 && (
        <div className="flex items-center justify-between">
          <Label className="text-xs font-normal text-muted-foreground">
            Arrowhead{arrows.length !== selected.length && ` (${arrows.length})`}
          </Label>
          <MixedSwitch
            ariaLabel="Arrowhead"
            shared={shared(arrows.map((n) => n.head))}
            onChange={(on) => patchAll((n) => (n.type === "arrow" ? ({ head: on } as Partial<SquigNode>) : null))}
          />
        </div>
      )}

      {texts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-normal text-muted-foreground">
              Text{texts.length !== selected.length && ` (${texts.length})`}
            </Label>
            <MixedTextField
              shared={shared(texts.map((n) => n.text))}
              onCommit={(v) =>
                patchAll((n) => (n.type === "text" ? (reflowText(n, v, n.fontSize) as Partial<SquigNode>) : null))
              }
            />
          </div>
          <div className="flex items-center gap-1">
            {(["bold", "italic", "underline"] as const).map((style) => {
              const on = shared(texts.map((n) => !!n[style]))
              return (
                <StyleToggle
                  key={style}
                  label={style[0].toUpperCase() + style.slice(1)}
                  hint={kbd(`mod+${style[0]}`)}
                  on={!on.mixed && on.value}
                  mixed={on.mixed}
                  onClick={() => st().toggleTextStyle(style)}
                >
                  <span className={style === "bold" ? "font-bold" : style === "italic" ? "font-serif italic" : "underline"}>
                    {style[0].toUpperCase()}
                  </span>
                </StyleToggle>
              )
            })}
            <StyleToggle
              label="Link"
              hint={kbd("mod+k")}
              on={texts.every((n) => !!n.link)}
              mixed={shared(texts.map((n) => !!n.link)).mixed}
              onClick={() => st().setLinkOpen(true)}
            >
              <LinkIcon className="size-3.5" />
            </StyleToggle>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label className="shrink-0 text-xs font-normal text-muted-foreground">Size</Label>
            <MixedNumberField
              compact
              label=""
              className="w-[70px]"
              shared={sharedNumber(texts, (n) => (n as TextNode).fontSize)}
              onCommit={(v) =>
                patchAll((n) => (n.type === "text" && v > 0 ? (reflowText(n, n.text, v) as Partial<SquigNode>) : null))
              }
              onStep={(d) =>
                patchAll((n) =>
                  n.type === "text" ? (reflowText(n, n.text, Math.max(4, n.fontSize + d)) as Partial<SquigNode>) : null
                )
              }
            />
          </div>
        </div>
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
    <div className="flex shrink-0 gap-1.5 border-t p-2.5">
      {components.length > 0 && (
        <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => st().detachSelected()}>
          <Unlink className="size-3" /> Detach
          {components.length > 1 && <span className="tabular-nums">({components.length})</span>}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 flex-1 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => st().deleteSelected()}
      >
        <Trash2 className="size-3" /> Delete
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------

function StyleToggle({
  label,
  hint,
  on,
  mixed = false,
  onClick,
  children,
}: {
  label: string
  hint: string
  on: boolean
  /** the selection disagrees — shown as a dash, like every other control */
  mixed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={mixed ? "mixed" : on}
      title={mixed ? `${label} · mixed · ${hint}` : `${label} · ${hint}`}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-md border text-xs transition-colors ${
        on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      } ${mixed ? "border-dashed" : ""}`}
    >
      {children}
    </button>
  )
}
