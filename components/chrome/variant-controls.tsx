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
import { Row, StackRow } from "@/components/ui/panel"
import { Segmented } from "@/components/ui/segmented"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function asShared<T>(s: Shared<unknown>, coerce: (v: unknown) => T): Shared<T> {
  return s.mixed ? s : { mixed: false, value: coerce(s.value) }
}

/**
 * A short list of short words is better shown than hidden.
 *
 * "sm / md / lg" as a menu costs a click to see three characters. The limits
 * are deliberately mean: four options or five characters and the segments
 * start truncating, at which point a select genuinely reads better.
 */
function fitsSegments(options: readonly string[]): boolean {
  return options.length > 1 && options.length <= 3 && options.every((o) => o.length <= 5)
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
  const setValue = (next: unknown, opts?: { checkpoint?: boolean }) => {
    const patches: Record<string, Partial<SquigNode>> = {}
    for (const n of nodes) {
      patches[n.id] = { props: { ...n.props, [control.key]: next } } as Partial<SquigNode>
    }
    st().updateNodes(patches, { checkpoint: opts?.checkpoint ?? true })
  }

  if (control.type === "toggle") {
    const field = (
      <MixedSwitch
        ariaLabel={control.label}
        shared={asShared(current, Boolean)}
        onChange={(v) => setValue(v)}
      />
    )
    if (compact) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-label text-muted-foreground">{control.label}</span>
          {field}
        </div>
      )
    }
    return (
      <Row spread label={control.label}>
        {field}
      </Row>
    )
  }

  if (control.type === "select") {
    const options = control.options ?? []

    if (fitsSegments(options)) {
      const segments = (
        <Segmented
          ariaLabel={control.label}
          options={options.map((o) => ({ value: o, label: o }))}
          shared={asShared(current, (v) => String(v ?? ""))}
          onChange={(v) => setValue(v)}
        />
      )
      if (compact) return <div className="flex w-auto min-w-[104px] items-center">{segments}</div>
      return <Row label={control.label}>{segments}</Row>
    }

    const select = (
      <Select value={current.mixed ? "" : String(current.value ?? "")} onValueChange={(v) => setValue(v)}>
        <SelectTrigger
          size="sm"
          aria-label={control.label}
          className={compact ? "h-ctl w-auto gap-1 px-2" : "h-ctl w-full"}
        >
          <SelectValue placeholder={MIXED_LABEL} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
    if (compact) return select
    return <Row label={control.label}>{select}</Row>
  }

  if (control.type === "number") {
    const field = (
      <MixedNumberField
        label=""
        min={control.min}
        max={control.max}
        className={compact ? "w-16" : "w-[72px]"}
        shared={asShared(current, (v) => Number(v ?? 0))}
        // the field groups a whole drag into one checkpoint; writing another
        // per tick underneath it would undo the grouping it just did
        onGestureStart={() => st().checkpoint()}
        // rounded because every variant number is a count, an index or a
        // percent — components index arrays and divide grids by these, so a
        // typed "2.5" isn't a smaller 2, it's a broken layout. Dragging and
        // the arrow keys already step whole units; this catches the typed
        // path. Geometry fields (x/y/w/h) use MixedNumberField directly and
        // keep their fractions.
        onCommit={(n) =>
          setValue(Math.round(Math.min(control.max ?? Infinity, Math.max(control.min ?? -Infinity, n))), {
            checkpoint: false,
          })
        }
      />
    )
    if (compact) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-label text-muted-foreground">{control.label}</span>
          {field}
        </div>
      )
    }
    return <Row label={control.label}>{field}</Row>
  }

  // text — a label can be long, so it gets the full width under its name
  return (
    <StackRow label={control.label}>
      <MixedTextField
        ariaLabel={control.label}
        shared={asShared(current, (v) => String(v ?? ""))}
        onCommit={(v) => setValue(v)}
      />
    </StackRow>
  )
}
