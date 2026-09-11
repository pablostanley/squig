// ---------------------------------------------------------------------------
// Groups as a hierarchy, by the operations that used to disagree about it.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-groups.ts
// ---------------------------------------------------------------------------

;(globalThis as { window?: unknown }).window = {
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
}
const held = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => held.get(k) ?? null,
  setItem: (k: string, v: string) => void held.set(k, v),
  removeItem: (k: string) => void held.delete(k),
}

const { useSquig } = await import("../lib/store.ts")
const { canGroupSelection, groupPickForHit, selectionForPress, stepIntoGroup } = await import("../lib/canvas/groups.ts")
import type { SquigNode } from "../lib/types.ts"
import { check, report } from "./harness.ts"

const s = () => useSquig.getState()

function reset() {
  useSquig.setState({
    nodes: {},
    order: [],
    selection: [],
    selectionGroupId: null,
    clipboard: [],
    past: [],
    future: [],
    dupTrail: null,
    editingId: null,
    croppingId: null,
  })
}

const rect = (x: number, y = 0) =>
  s().addNode({
    type: "shape",
    shape: "rect",
    fill: "none",
    x,
    y,
    w: 40,
    h: 30,
  } as Omit<SquigNode, "id" | "seed">)

function group(ids: string[]): string {
  s().setSelection(ids)
  s().groupSelected()
  return s().selectionGroupId!
}

const path = (id: string) => s().nodes[id]?.groupIds ?? []

// -- one group remains one object ------------------------------------------

{
  reset()
  const a = rect(0)
  const b = rect(80)
  const g = group([a, b])
  const before = s().past.length

  check("a new group is the active selection", !!g && s().selectionGroupId === g)
  check("an already-selected group cannot be grouped by itself", !canGroupSelection([a, b], s().nodes, s().order))
  s().groupSelected()
  check("grouping one group adds no wrapper and no history", path(a).join() === g && s().past.length === before)
}

// -- ⌘D and Option-drag agree ----------------------------------------------

for (const [label, duplicate] of [
  ["⌘D", () => s().duplicateSelected(16)],
  ["Option-drag", () => s().cloneSelectionInPlace()],
] as const) {
  reset()
  const a = rect(0)
  const b = rect(80)
  const g = group([a, b])
  const copies = duplicate()
  const copiedGroup = path(copies[0])[0]

  check(`${label}: the copied group has a new identity`, !!copiedGroup && copiedGroup !== g)
  check(`${label}: both copies share that new identity`, path(copies[1])[0] === copiedGroup)
  check(`${label}: the copy is selected as its own group`, s().selectionGroupId === copiedGroup)
  check(`${label}: the duplicate is not a member of the original`, s().expandSelection([a]).length === 2)
}

// -- a subgroup copy stays in its parent, not in its source subgroup -------

{
  reset()
  const a = rect(0)
  const b = rect(80)
  const inner = group([a, b])
  const c = rect(160)
  const outer = group([a, b, c])

  check("grouping a group with a leaf creates a two-level path", path(a).join() === `${outer},${inner}`)
  check("the sibling sits directly in the parent", path(c).join() === outer)

  s().setSelection([a, b], inner)
  const copies = s().duplicateSelected(16)
  const copiedInner = path(copies[0])[1]
  check("subgroup duplicate: the parent is retained", path(copies[0])[0] === outer)
  check("subgroup duplicate: the subgroup is remapped", !!copiedInner && copiedInner !== inner)
  check("subgroup duplicate: its members stay together", path(copies[1]).join() === `${outer},${copiedInner}`)
  check("subgroup duplicate: the copy lands beside the source inside the parent", s().order.join() === [a, b, ...copies, c].join())
  check("subgroup duplicate: the original subgroup still selects only itself", s().expandSelection([a]).length === 5)

  const outerPick = groupPickForHit(a, [], null, s().nodes, s().order)
  const innerPick = stepIntoGroup(a, outerPick.ids, outerPick.groupId, s().nodes, s().order)
  const leafPick = stepIntoGroup(a, innerPick.ids, innerPick.groupId, s().nodes, s().order)
  check("plain click takes the outer group", outerPick.groupId === outer && outerPick.ids.length === 5)
  check("one double-click takes the original subgroup", innerPick.groupId === inner && innerPick.ids.join() === [a, b].join())
  check("the next double-click takes the leaf", leafPick.groupId === null && leafPick.ids.join() === a)
  check("a deep-selected leaf stays deep on its next press", groupPickForHit(a, [a], null, s().nodes, s().order).ids.join() === a)
}

// -- grouping and ungrouping at a nested depth -----------------------------

{
  reset()
  const a = rect(0)
  const b = rect(80)
  const inner = group([a, b])
  const c = rect(160)
  const d = rect(240)
  const outer = group([a, b, c, d])

  s().setSelection([a, b, c])
  s().groupSelected()
  const middle = s().selectionGroupId!
  check("grouping siblings inserts below their shared parent", path(a).join() === `${outer},${middle},${inner}`)
  check("the loose sibling enters the same subgroup", path(c).join() === `${outer},${middle}`)
  check("an unselected sibling stays directly in the parent", path(d).join() === outer)

  s().ungroupSelected()
  check("ungroup removes the selected middle depth", path(a).join() === `${outer},${inner}` && path(c).join() === outer)
  check("ungroup preserves the deeper subgroup", path(b).join() === `${outer},${inner}`)
}

// -- deleting the other child removes an invisible one-item wrapper --------

{
  reset()
  const a = rect(0)
  const b = rect(80)
  const g = group([a, b])
  s().setSelection([b], null)
  s().deleteSelected()
  check("deleting one of two leaves the survivor ungrouped", path(a).length === 0, `${g}: ${path(a).join()}`)
  s().setSelection([a])
  const [copy] = s().duplicateSelected()
  check("the survivor duplicates as an ordinary leaf", path(copy).length === 0)
}

// -- detaching inside a group creates a subgroup, not a new outer parent ----

{
  reset()
  const component = s().addNode({
    type: "component",
    kind: "button",
    props: { label: "Continue" },
    x: 0,
    y: 0,
    w: 120,
    h: 40,
  } as Omit<SquigNode, "id" | "seed">)
  const sibling = rect(180)
  const outer = group([component, sibling])
  s().setSelection([component])
  s().detachSelected()
  const pieces = [...s().selection]
  const detachedGroup = path(pieces[0])[1]
  check("detach replaces the component with editable pieces", pieces.length > 1 && !s().nodes[component])
  check("detached pieces retain their existing parent first", !!detachedGroup && path(pieces[0])[0] === outer)
  check("detached pieces form a subgroup inside that parent", pieces.every((id) => path(id).join() === `${outer},${detachedGroup}`))
}

// -- undo/redo keeps the active group depth --------------------------------

{
  reset()
  const a = rect(0)
  const b = rect(80)
  const g = group([a, b])
  const copies = s().duplicateSelected()
  const copiedGroup = s().selectionGroupId
  s().undo()
  s().redo()
  check("redo restores the copied leaves", copies.every((id) => !!s().nodes[id]))
  check("redo restores the copied group as active", !!copiedGroup && s().selectionGroupId === copiedGroup && copiedGroup !== g)
}

// ---------------------------------------------------------------------------


{
  const current = { ids: ["a", "b"], groupId: null }
  const picked = { ids: ["a"], groupId: null }
  const plain = selectionForPress(current, picked, false, false)
  check("plain press preserves the whole selection for dragging", plain.press.ids.join() === "a,b" && plain.click?.ids.join() === "a")
  const shift = selectionForPress(current, picked, true, false)
  check("Shift press defers removal until release", shift.press.ids.join() === "a,b" && shift.click?.ids.join() === "b")
  const deep = selectionForPress(current, picked, false, true)
  check("deep-selection immediately isolates the leaf for dragging", deep.press.ids.join() === "a" && deep.click === null)
  const addDeep = selectionForPress(current, { ids: ["c"], groupId: null }, true, true)
  check("Shift plus deep-selection adds the leaf", addDeep.press.ids.join() === "a,b,c")
}

report("group checks passed")
