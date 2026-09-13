import { equalGap, spaceNodes, tidyNodes, changeMatchingGaps, resizeSpacedNodes, spacingReorder } from "../lib/canvas/spacing.ts"
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
import { check, report } from "./harness.ts"

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
  const one = sharedControls([comp("a", kind)])
  check("two of the same kind share the same visible controls", same.map((c) => c.key).join(",") === one.map((c) => c.key).join(","), kind)
  check("one component exposes at least one visible control", one.length > 0 && one.length <= REGISTRY[kind].controls.length)
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
    check("no disjoint pair in this registry, so nothing to assert", true)
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
    check("no clashing control types in this registry, so nothing to assert", true)
  }
}

{
  // "None" is only safe when every selected component knows that sentinel.
  const twoOptional = sharedControls([comp("a", "input"), comp("b", "input")]).find((c) => c.key === "icon")
  check("optional icon selections keep the None action", twoOptional?.type === "icon" && twoOptional.allowNone === true)

  const mixedRequirement = sharedControls([comp("a", "input"), comp("b", "icon-button")]).find((c) => c.key === "icon")
  check(
    "mixed icon selections only offer None when every component allows it",
    mixedRequirement?.type === "icon" && !mixedRequirement.allowNone
  )
}

{
  const bareButton = sharedControls([comp("a", "button")])
  check("button hides its large icon picker while Icon side is None", !bareButton.some((c) => c.key === "glyph"))

  const iconButton = sharedControls([comp("a", "button", { icon: "left" })])
  check("button reveals icon search when an icon side is active", iconButton.some((c) => c.key === "glyph" && c.type === "icon"))

  const mixedMode = sharedControls([comp("a", "button", { icon: "left" }), comp("b", "button")])
  check("conditional controls stay hidden when only part of a selection shows them", !mixedMode.some((c) => c.key === "glyph"))

  const initials = sharedControls([comp("a", "avatar", { content: "initials" })])
  check("avatar hides icon search while it is showing initials", !initials.some((c) => c.key === "glyph"))
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


const spaced = [rect("s1", 0, 0, 20), rect("s2", 30, 0, 40), rect("s3", 80, 0, 10)]
check("unequal widths still have an equal gap", equalGap(spaced, "x") === 10)
const spacedPatches = spaceNodes(spaced, { axis: "x", gap: 24 })
check("exact gap anchors the first object", spacedPatches.s1.x === 0 && spacedPatches.s2.x === 44 && spacedPatches.s3.x === 108)
check("negative spacing is refused", Object.keys(spaceNodes(spaced, { gap: -1 })).length === 0)
check("locked selections do not move", Object.keys(spaceNodes([{ ...spaced[0], locked: true }, ...spaced.slice(1)], { gap: 5 })).length === 0)
check("bad spatial order is refused", Object.keys(spaceNodes(spaced, { order: ["s1", "s1", "s3"] })).length === 0)
const reorder = spaceNodes(spaced, { gap: 10, order: ["s3", "s1", "s2"] })
check("reorder preserves gaps with unequal widths", reorder.s3.x === 0 && reorder.s1.x === 20 && reorder.s2.x === 50)
check("ring crosses an item midpoint", spacingReorder(spaced, "x", "s1", 60).index === 1)
const grid = [rect("g1", 0, 0), rect("g2", 30, 2), rect("g3", 1, 40), rect("g4", 36, 42)]
const tidy = tidyNodes(grid, 16)
check("tidy preserves two rows", tidy.g1.x === 0 && tidy.g2.x === 26 && tidy.g3.y === 26 && tidy.g4.x === 26)
const cleanGrid = grid.map((n) => ({ ...n, ...tidy[n.id] }) as SquigNode)
const changedGrid = changeMatchingGaps(cleanGrid, "x", 16, 32)
check("all matching row gaps change together", changedGrid.g2.x === 42 && changedGrid.g4.x === 42)
const resized = resizeSpacedNodes(spaced, ["s1"], "x", 20)
check("marked resize keeps original gap", resized.s1.w === 40 && resized.s2.x === 50 && resized.s3.x === 100)
check("spacing leaves the source untouched", spaced[1].x === 30 && spaced[0].w === 20)

report("selection checks passed")
