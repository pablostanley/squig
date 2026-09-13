import type { SquigNode } from "../types"
import { unionBounds, type Bounds } from "../selection"
import { nodeVisualBounds } from "./line-routing"

export type AlignEdge = "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter"

/** Arrange the visible boxes, carrying their offset from each stored origin. */
export function alignNodes(nodes: readonly SquigNode[], edge: AlignEdge, target?: Bounds): Record<string, Partial<SquigNode>> {
  const boxes = nodes.map(nodeVisualBounds)
  const union = target ?? unionBounds(boxes)
  if (!union || (!target && nodes.length < 2)) return {}
  return Object.fromEntries(nodes.map((n, i) => {
    const b = boxes[i]
    switch (edge) {
      case "left": return [n.id, { x: n.x + union.x - b.x }]
      case "right": return [n.id, { x: n.x + union.x + union.w - b.x - b.w }]
      case "hcenter": return [n.id, { x: n.x + union.x + union.w / 2 - b.x - b.w / 2 }]
      case "top": return [n.id, { y: n.y + union.y - b.y }]
      case "bottom": return [n.id, { y: n.y + union.y + union.h - b.y - b.h }]
      case "vcenter": return [n.id, { y: n.y + union.y + union.h / 2 - b.y - b.h / 2 }]
    }
  }))
}

/** Equal visible gaps; callers supply document order to settle positional ties. */
export function distributeNodes(nodes: readonly SquigNode[], axis: "x" | "y"): Record<string, Partial<SquigNode>> {
  if (nodes.length < 3) return {}
  const size = axis === "x" ? "w" : "h"
  const sorted = nodes.map((n) => ({ n, b: nodeVisualBounds(n) })).sort((a, b) => a.b[axis] - b.b[axis])
  const start = sorted[0].b[axis]
  // An early, wide object can reach farther than the last leading edge.
  const end = Math.max(...sorted.map(({ b }) => b[axis] + b[size]))
  const gap = (end - start - sorted.reduce((sum, { b }) => sum + b[size], 0)) / (sorted.length - 1)
  let cursor = start
  return Object.fromEntries(sorted.map(({ n, b }) => {
    const patch = { [axis]: n[axis] + cursor - b[axis] }
    cursor += b[size] + gap
    return [n.id, patch]
  }))
}

interface ArrangeSelection {
  nodes: Record<string, SquigNode>
  order: readonly string[]
  selection: readonly string[]
  selectionGroups: readonly string[]
}

/** Explicit group picks survive flattening; deep-picked siblings stay separate. */
export function arrangement(s: ArrangeSelection) {
  if (!s.selection.length) return { items: [], parent: null, canAlign: false, canDistribute: false }
  const selected = new Set(s.selection)
  const all = s.order.map((id) => s.nodes[id]).filter(Boolean)
  const requestedGroups = new Set(s.selectionGroups)
  const groupMembers = new Map<string, SquigNode[]>()
  for (const n of all) {
    if (n.locked) continue
    for (const g of n.groupIds ?? []) {
      if (!requestedGroups.has(g)) continue
      const members = groupMembers.get(g) ?? []
      members.push(n)
      groupMembers.set(g, members)
    }
  }
  const groups = new Set([...groupMembers].filter(([, members]) =>
    members.every((n) => selected.has(n.id))
  ).map(([g]) => g))
  const units = new Map<string, { members: SquigNode[]; parent: string | undefined }>()
  for (const n of all) {
    if (!selected.has(n.id) || n.locked) continue
    const path = n.groupIds ?? []
    const at = path.findIndex((g) => groups.has(g))
    const key = at < 0 ? `node:${n.id}` : `group:${path[at]}`
    const unit = units.get(key) ?? { members: [], parent: at < 0 ? path.at(-1) : path[at - 1] }
    unit.members.push(n)
    units.set(key, unit)
  }
  const items = [...units.entries()].map(([id, unit]) => {
    const bounds = unionBounds(unit.members.map(nodeVisualBounds))!
    const box: SquigNode = { id, type: "shape", shape: "rect", seed: 1, fill: "none", ...bounds }
    return { ...unit, box }
  })
  const parent = items.length === 1 && items[0].parent
    ? unionBounds(all.filter((n) => n.groupIds?.includes(items[0].parent!)).map(nodeVisualBounds))
    : null
  return { items, parent, canAlign: items.length > 1 || !!parent, canDistribute: items.length >= 3 }
}

export function arrangeSelection(s: ArrangeSelection, action: AlignEdge | "distribute-x" | "distribute-y") {
  const { items, parent } = arrangement(s)
  const boxes = items.map((item) => item.box)
  const patches = action.startsWith("distribute-")
    ? distributeNodes(boxes, action === "distribute-x" ? "x" : "y")
    : alignNodes(boxes, action as AlignEdge, parent ?? undefined)
  const out: Record<string, Partial<SquigNode>> = {}
  for (const { box, members } of items) {
    const patch = patches[box.id]
    if (!patch) continue
    for (const n of members) {
      out[n.id] = {
        ...(patch.x !== undefined ? { x: n.x + patch.x - box.x } : {}),
        ...(patch.y !== undefined ? { y: n.y + patch.y - box.y } : {}),
      }
    }
  }
  return out
}
