"use client"

// ---------------------------------------------------------------------------
// Variant controls — one widget per ControlDef, shared by the inspector and
// the floating context row.
//
// Every control edits a *set* of components. One is just a set of one, so
// there is no separate single-selection path to keep in sync.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import type { ComponentNode, SquigNode } from "@/lib/types"
import type { ControlDef } from "@/lib/library/registry"
import { MIXED_LABEL, sharedProp, type Shared } from "@/lib/selection"
import { MixedNumberField, MixedSwitch, MixedTextField } from "./mixed-fields"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function asShared<T>(s: Shared<unknown>, coerce: (v: unknown) => T): Shared<T> {
  return s.mixed ? s : { mixed: false, value: coerce(s.value) }
}

export function VariantControl({
  nodes,
  control,
  compact = false,
}: {
  nodes: ComponentNode[]
  control: ControlDef
  compact?: boolean
}) {
  const st = useSquig.getState
  const current = sharedProp(nodes, control.key)

  /** one checkpoint, one patch, one undo step — however many nodes there are */
  const setValue = (next: unknown) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of nodes) {
      patches[n.id] = { props: { ...n.props, [control.key]: next } } as Partial<SquigNode>
    }
    st().updateNodes(patches, { checkpoint: true })
  }

  if (control.type === "toggle") {
    return (
      <div className={compact ? "flex items-center gap-1.5" : "flex items-center justify-between"}>
        <Label className="text-xs font-normal text-muted-foreground">{control.label}</Label>
        <MixedSwitch ariaLabel={control.label} shared={asShared(current, Boolean)} onChange={setValue} />
      </div>
    )
  }

  if (control.type === "select") {
    return (
      <div className={compact ? "flex items-center gap-1.5" : "flex items-center justify-between gap-2"}>
        {!compact && <Label className="shrink-0 text-xs font-normal text-muted-foreground">{control.label}</Label>}
        <Select value={current.mixed ? "" : String(current.value ?? "")} onValueChange={setValue}>
          <SelectTrigger
            size="sm"
            aria-label={control.label}
            className={compact ? "h-7 w-auto gap-1 px-2 text-xs" : "h-7 w-[110px] text-xs"}
          >
            <SelectValue placeholder={MIXED_LABEL} />
          </SelectTrigger>
          <SelectContent>
            {control.options?.map((o) => (
              <SelectItem key={o} value={o} className="text-xs">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (control.type === "number") {
    return (
      <div className={compact ? "flex items-center gap-1.5" : "flex items-center justify-between gap-2"}>
        <Label className="shrink-0 text-xs font-normal text-muted-foreground">{control.label}</Label>
        <MixedNumberField
          compact
          label=""
          className={compact ? "w-14" : "w-[70px]"}
          shared={asShared(current, (v) => Number(v ?? 0))}
          onCommit={(n) => setValue(Math.min(control.max ?? Infinity, Math.max(control.min ?? -Infinity, n)))}
        />
      </div>
    )
  }

  // text
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-normal text-muted-foreground">{control.label}</Label>
      <MixedTextField shared={asShared(current, (v) => String(v ?? ""))} onCommit={setValue} />
    </div>
  )
}
