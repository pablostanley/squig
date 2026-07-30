// ---------------------------------------------------------------------------
// Checks for the "what do these N nodes have in common?" layer that the
// inspector's mixed-value fields are built on.
//
//   node --experimental-strip-types --import ./scripts/alias-loader.mjs \
//        scripts/test-selection.ts
// ---------------------------------------------------------------------------

import {
  MIXED_LABEL,
  eqRounded,
  resolveProp,
  shared,
  sharedControls,
  sharedNumber,
  sharedProp,
  selectionSummary,
  unionBounds,
} from "../lib/selection.ts"
import { REGISTRY } from "../lib/library/registry.ts"
import type { ComponentNode, SquigNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const comp = (id: string, kind: string, props: Record<string, unknown> = {}): ComponentNode => ({
  id,
  type: "component",
  kind,
  props,
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  seed: 1,
})

const rect = (id: string, x = 0, y = 0, w = 10, h = 10): SquigNode => ({
  id,
  type: "shape",
  shape: "rect",
  x,
  y,
  w,
  h,
  fill: "none",
  seed: 1,
})

// -- shared / mixed ---------------------------------------------------------

check("the dash is what a disagreement looks like", MIXED_LABEL === "–")
check("one value is never mixed", shared([5]).mixed === false)
check("identical values collapse", shared([5, 5, 5]).mixed === false)
check("a single dissenter makes it mixed", shared([5, 5, 6]).mixed === true)
check("an empty selection reads as mixed", shared([]).mixed === true)

{
  // values that *display* the same must not claim to disagree, or a snapped
  // drag leaves the panel insisting two nodes at "10" are different
  const s = sharedNumber([rect("a", 10.4), rect("b", 9.6)], (n) => n.x)
  check("values that round the same are treated as equal", !s.mixed && s.value === 10, JSON.stringify(s))
  check("the rounding comparator agrees", eqRounded(10.4, 9.6))
  const t = sharedNumber([rect("a", 10), rect("b", 40)], (n) => n.x)
  check("genuinely different values stay mixed", t.mixed === true)
}

// -- prop resolution --------------------------------------------------------

{
  const kind = Object.keys(REGISTRY).find((k) => REGISTRY[k].controls.length > 0)!
  const def = REGISTRY[kind]
  const control = def.controls[0]
  const value = def.defaults[control.key]

  const withProp = comp("a", kind, { [control.key]: value })
  const without = comp("b", kind, {})

  check("a missing prop resolves through the def defaults", resolveProp(without, control.key) === value)
  check(
    "an explicit prop equal to the default isn't 'mixed'",
    sharedProp([withProp, without], control.key).mixed === false,
    `${kind}.${control.key}`
  )
}

// -- control intersection ---------------------------------------------------

{
  const kind = Object.keys(REGISTRY).find((k) => REGISTRY[k].controls.length > 0)!
  const same = sharedControls([comp("a", kind), comp("b", kind)])
  check("two of the same kind share all their controls", same.length === REGISTRY[kind].controls.length, kind)
  check("one component shares its own controls", sharedControls([comp("a", kind)]).length === REGISTRY[kind].controls.length)
  check("no components, no controls", sharedControls([]).length === 0)
}

{
  // find two kinds that genuinely share a key, and two that share nothing
  const kinds = Object.keys(REGISTRY)
  let overlapping: [string, string] | null = null
  let disjoint: [string, string] | null = null
  for (let i = 0; i < kinds.length && (!overlapping || !disjoint); i++) {
    for (let j = i + 1; j < kinds.length && (!overlapping || !disjoint); j++) {
      const a = REGISTRY[kinds[i]].controls
      const b = REGISTRY[kinds[j]].controls
      if (!a.length || !b.length) continue
      const common = a.filter((c) => b.some((d) => d.key === c.key && d.type === c.type))
      if (common.length && !overlapping) overlapping = [kinds[i], kinds[j]]
      if (!common.length && !disjoint) disjoint = [kinds[i], kinds[j]]
    }
  }

  if (overlapping) {
    const out = sharedControls([comp("a", overlapping[0]), comp("b", overlapping[1])])
    const keys = new Set(out.map((c) => c.key))
    const aKeys = REGISTRY[overlapping[0]].controls
    const bKeys = REGISTRY[overlapping[1]].controls
    const legit = [...keys].every((k) => {
      const a = aKeys.find((c) => c.key === k)!
      const b = bKeys.find((c) => c.key === k)
      return !!b && b.type === a.type
    })
    check("mixed kinds expose only genuinely shared keys", legit, overlapping.join(" + "))

    const selects = out.filter((c) => c.type === "select")
    const optionsAreIntersections = selects.every((c) => {
      const a = new Set(aKeys.find((x) => x.key === c.key)?.options ?? [])
      const b = new Set(bKeys.find((x) => x.key === c.key)?.options ?? [])
      return (c.options ?? []).every((o) => a.has(o) && b.has(o))
    })
    check("select options are intersected, never invented", optionsAreIntersections)
  } else {
    check("found an overlapping pair to test", false)
  }

  if (disjoint) {
    check("kinds with nothing in common share nothing", sharedControls([comp("a", disjoint[0]), comp("b", disjoint[1])]).length === 0, disjoint.join(" + "))
  } else {
    passed++ // no disjoint pair in this registry; nothing to assert
  }
}

{
  // a control that is a select on one def and something else on another must
  // not be merged — they are not the same knob
  const kinds = Object.keys(REGISTRY)
  let clash: [string, string, string] | null = null
  for (let i = 0; i < kinds.length && !clash; i++) {
    for (let j = i + 1; j < kinds.length && !clash; j++) {
      for (const c of REGISTRY[kinds[i]].controls) {
        const d = REGISTRY[kinds[j]].controls.find((x) => x.key === c.key)
        if (d && d.type !== c.type) clash = [kinds[i], kinds[j], c.key]
      }
    }
  }
  if (clash) {
    const out = sharedControls([comp("a", clash[0]), comp("b", clash[1])])
    check("a key with clashing types is dropped", !out.some((c) => c.key === clash[2]), clash.join(" / "))
  } else {
    passed++ // registry has no type clashes today
  }
}

// -- summaries and bounds ---------------------------------------------------

{
  const s = selectionSummary([rect("a"), rect("b"), { ...rect("c"), shape: "ellipse" } as SquigNode])
  check("the summary counts and pluralises", s.includes("2 rects") && s.includes("1 ellipse"), s)
  check("an empty selection summarises to nothing", selectionSummary([]) === "")
}

{
  const b = unionBounds([rect("a", 0, 0, 10, 10), rect("b", 90, 40, 10, 10)])!
  check("union bounds span the whole set", b.x === 0 && b.y === 0 && b.w === 100 && b.h === 50, JSON.stringify(b))
  check("no nodes, no bounds", unionBounds([]) === null)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} selection checks passed`)
