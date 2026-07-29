"use client"

// ---------------------------------------------------------------------------
// Inspector — deliberately small. Position, variants, text. That's it.
// If this ever looks like Figma's panel, something has gone wrong.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import type { SquigNode, ComponentNode } from "@/lib/types"
import { getDef } from "@/lib/library/registry"
import { breakApart } from "@/lib/library/break-apart"
import { VariantControl } from "./variant-controls"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Unlink, Trash2 } from "lucide-react"

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-3 text-[11px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        className="h-7 px-1.5 text-xs"
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onCommit(n)
        }}
      />
    </label>
  )
}

export function Inspector() {
  const nodes = useSquig((s) => s.nodes)
  const selection = useSquig((s) => s.selection)
  const contextRow = useSquig((s) => s.contextRow)
  const st = useSquig.getState

  const selected = selection.map((id) => nodes[id]).filter(Boolean) as SquigNode[]
  const one = selected.length === 1 ? selected[0] : null

  return (
    <div
      className="absolute top-4 right-4 z-30 flex max-h-[calc(100vh-2rem)] w-[232px] flex-col overflow-hidden rounded-xl border bg-background shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ScrollArea className="min-h-0">
        <div className="flex flex-col gap-4 p-3.5">
          {!selected.length && (
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
          )}

          {selected.length > 1 && (
            <p className="text-xs text-muted-foreground">{selected.length} things selected — drag to move, arrows to nudge.</p>
          )}

          {one && (
            <>
              <div>
                <h3 className="text-sm font-medium capitalize">
                  {one.type === "component" ? (getDef(one.kind)?.name ?? one.kind) : one.type}
                </h3>
              </div>

              {/* position & size */}
              <div className="grid grid-cols-2 gap-1.5">
                <NumberField label="x" value={one.x} onCommit={(n) => st().updateNode(one.id, { x: n })} />
                <NumberField label="y" value={one.y} onCommit={(n) => st().updateNode(one.id, { y: n })} />
                <NumberField label="w" value={one.w} onCommit={(n) => st().updateNode(one.id, { w: Math.max(8, n) })} />
                <NumberField label="h" value={one.h} onCommit={(n) => st().updateNode(one.id, { h: Math.max(8, n) })} />
              </div>

              {/* variants */}
              {one.type === "component" && <ComponentControls node={one} />}

              {one.type === "shape" && (
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal text-muted-foreground">Scribble fill</Label>
                  <Switch
                    checked={one.fill}
                    className="scale-90"
                    onCheckedChange={(on) => {
                      st().checkpoint()
                      st().updateNode(one.id, { fill: on } as Partial<SquigNode>)
                    }}
                  />
                </div>
              )}

              {one.type === "arrow" && (
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal text-muted-foreground">Arrowhead</Label>
                  <Switch
                    checked={one.head}
                    className="scale-90"
                    onCheckedChange={(on) => {
                      st().checkpoint()
                      st().updateNode(one.id, { head: on } as Partial<SquigNode>)
                    }}
                  />
                </div>
              )}

              {one.type === "text" && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-normal text-muted-foreground">Text</Label>
                    <Input
                      className="h-7 px-2 text-xs"
                      value={one.text}
                      onChange={(e) => st().updateNode(one.id, { text: e.target.value } as Partial<SquigNode>)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="shrink-0 text-xs font-normal text-muted-foreground">Size</Label>
                    <Input
                      type="number"
                      className="h-7 w-[70px] px-2 text-xs"
                      value={Math.round(one.fontSize)}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (n > 0) st().updateNode(one.id, { fontSize: n } as Partial<SquigNode>)
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {selected.length > 0 && (
        <div className="flex shrink-0 gap-1.5 border-t p-2.5">
          {one?.type === "component" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => {
                const pieces = breakApart(one as ComponentNode)
                st().removeNodes([one.id])
                st().addNodes(pieces)
              }}
            >
              <Unlink className="size-3" /> Break apart
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
      )}
    </div>
  )
}

function ComponentControls({ node }: { node: SquigNode }) {
  if (node.type !== "component") return null
  const def = getDef(node.kind)
  if (!def) return null
  const variants = def.controls.filter((c) => c.type !== "text")
  const texts = def.controls.filter((c) => c.type === "text")
  return (
    <>
      {variants.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Variant</span>
          {variants.map((c) => (
            <VariantControl key={c.key} node={node} control={c} />
          ))}
        </div>
      )}
      {texts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Text</span>
          {texts.map((c) => (
            <VariantControl key={c.key} node={node} control={c} />
          ))}
        </div>
      )}
    </>
  )
}
