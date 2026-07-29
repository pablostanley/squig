// ---------------------------------------------------------------------------
// Selection helpers — the "what do these N nodes have in common?" layer that
// the inspector and context row both read from.
//
// The rule everywhere: if every selected node agrees, show the value. If they
// disagree, show a dash. Typing over the dash makes them agree.
// ---------------------------------------------------------------------------

import type { ComponentNode, SquigNode } from "./types"
import { getDef, type ControlDef } from "./library/registry"

/** What the inspector renders in place of a value the selection disagrees on. */
export const MIXED_LABEL = "–"

export type Shared<T> = { mixed: true; value?: undefined } | { mixed: false; value: T }

export const MIXED = { mixed: true } as const

/**
 * Collapse a list of values to one shared value, or `mixed`.
 *
 * `eq` defaults to Object.is. Pass a rounding comparator for anything the UI
 * displays rounded — otherwise two nodes at x=10.4 and x=9.6 both *read* "10"
 * while the field insists they're mixed, which looks like a bug.
 */
export function shared<T>(values: readonly T[], eq: (a: T, b: T) => boolean = Object.is): Shared<T> {
  if (!values.length) return MIXED
  const first = values[0]
  for (let i = 1; i < values.length; i++) {
    if (!eq(first, values[i])) return MIXED
  }
  return { mixed: false, value: first }
}

/** Compare as the UI displays them, so "looks equal" and "is equal" agree. */
export const eqRounded = (a: number, b: number) => Math.round(a) === Math.round(b)

/** Numeric field value for a selection: the rounded number, or mixed. */
export function sharedNumber(nodes: readonly SquigNode[], pick: (n: SquigNode) => number): Shared<number> {
  const s = shared(nodes.map(pick), eqRounded)
  return s.mixed ? MIXED : { mixed: false, value: Math.round(s.value) }
}

// -- component variant controls ---------------------------------------------

/** Turn a prop key into something printable when defs disagree on the label. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * The controls every selected component genuinely shares.
 *
 * Matched on `key` + `type`, because a `size` select in one def and a `size`
 * toggle in another are not the same knob. For selects we intersect the option
 * lists too — offering an option half the selection can't render is a lie — and
 * for numbers we intersect the ranges, so a value legal for one member can't be
 * illegal for another. A control that intersects to nothing is dropped.
 *
 * The label only survives if every def agrees on it. `label` is spelled "Label",
 * "Text", "Note" and "Name" across this registry; showing one member's wording
 * for all of them would quietly misdescribe the rest.
 */
export function sharedControls(nodes: readonly ComponentNode[]): ControlDef[] {
  if (!nodes.length) return []
  const defs = nodes.map((n) => getDef(n.kind)).filter(Boolean) as NonNullable<ReturnType<typeof getDef>>[]
  if (defs.length !== nodes.length || !defs.length) return []

  const [first, ...rest] = defs
  const out: ControlDef[] = []

  for (const control of first.controls) {
    let options = control.options ? [...control.options] : undefined
    let quick = control.quick
    let min = control.min
    let max = control.max
    let sameLabel = true
    let ok = true

    for (const def of rest) {
      const other = def.controls.find((c) => c.key === control.key)
      if (!other || other.type !== control.type) {
        ok = false
        break
      }
      if (control.type === "select") {
        const theirs = new Set(other.options ?? [])
        options = (options ?? []).filter((o) => theirs.has(o))
        if (!options.length) {
          ok = false
          break
        }
      }
      if (control.type === "number") {
        if (other.min !== undefined) min = min === undefined ? other.min : Math.max(min, other.min)
        if (other.max !== undefined) max = max === undefined ? other.max : Math.min(max, other.max)
        if (min !== undefined && max !== undefined && min > max) {
          ok = false
          break
        }
      }
      if (other.label !== control.label) sameLabel = false
      // only "quick" if every def agrees it belongs in the context row
      quick = quick && other.quick
    }

    if (!ok) continue
    out.push({ ...control, label: sameLabel ? control.label : humanizeKey(control.key), options, quick, min, max })
  }

  return out
}

/**
 * Resolved value of one prop on one node.
 *
 * A def's defaults are only copied into `props` at insert time, so an older
 * node — or one whose def has since grown a control — can be missing the key
 * entirely. Comparing raw `props` would then call two identical-looking
 * components "mixed".
 */
export function resolveProp(node: ComponentNode, key: string): unknown {
  if (key in node.props) return node.props[key]
  return getDef(node.kind)?.defaults[key]
}

/** Shared value for one variant control across a component selection. */
export function sharedProp(nodes: readonly ComponentNode[], key: string): Shared<unknown> {
  return shared(nodes.map((n) => resolveProp(n, key)))
}

// -- summaries ---------------------------------------------------------------

function nodeLabel(n: SquigNode): string {
  if (n.type === "component") return getDef(n.kind)?.name.toLowerCase() ?? n.kind
  if (n.type === "shape") return n.shape
  if (n.type === "draw") return "scribble"
  return n.type
}

function plural(label: string, count: number): string {
  if (count === 1) return label
  return /(s|x|z|ch|sh)$/.test(label) ? `${label}es` : `${label}s`
}

/**
 * "2 buttons, 1 rectangle" — capped so a 40-node selection doesn't turn the
 * inspector header into an essay.
 */
export function selectionSummary(nodes: readonly SquigNode[], maxKinds = 3): string {
  const counts = new Map<string, number>()
  for (const n of nodes) {
    const label = nodeLabel(n)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const shown = entries.slice(0, maxKinds).map(([label, c]) => `${c} ${plural(label, c)}`)
  const hidden = entries.length - shown.length
  if (hidden > 0) shown.push(`+${hidden} more`)
  return shown.join(", ")
}

// -- geometry ----------------------------------------------------------------

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export function unionBounds(nodes: readonly SquigNode[]): Bounds | null {
  if (!nodes.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x + n.w > maxX) maxX = n.x + n.w
    if (n.y + n.h > maxY) maxY = n.y + n.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
