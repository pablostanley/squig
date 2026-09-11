import type { SquigNode } from "../types"
import { unionBounds } from "../selection"
import { nodeVisualBounds } from "./line-routing"

export type AlignEdge = "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter"

/** Arrange the visible boxes, carrying their offset from each stored origin. */
export function alignNodes(nodes: readonly SquigNode[], edge: AlignEdge): Record<string, Partial<SquigNode>> {
  const boxes = nodes.map(nodeVisualBounds)
  const union = unionBounds(boxes)
  if (!union || nodes.length < 2) return {}
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
