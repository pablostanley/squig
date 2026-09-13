import type { SquigNode } from "../types"
import { resizeNodesBy } from "./transform"
import { nodeVisualBounds } from "./line-routing"

export type SpacingAxis = "x" | "y"
export type SpacingOptions = { axis?: SpacingAxis; gap?: number; order?: string[] }

/** Significant cross-axis overlap keeps loose rows together despite unequal sizes. */
export function spacingRows(nodes: readonly SquigNode[], axis: SpacingAxis = "x"): SquigNode[][] {
  const cross = axis === "x" ? "y" : "x"
  const size = axis === "x" ? "h" : "w"
  const rows: SquigNode[][] = []
  for (const node of [...nodes].sort((a, b) => nodeVisualBounds(a)[cross] - nodeVisualBounds(b)[cross])) {
    const b = nodeVisualBounds(node)
    const row = rows.find((r) => {
      const a = nodeVisualBounds(r[0])
      return Math.min(a[cross] + a[size], b[cross] + b[size]) - Math.max(a[cross], b[cross]) > Math.min(a[size], b[size]) / 4
    })
    if (row) row.push(node)
    else rows.push([node])
  }
  return rows.map((r) => r.sort((a, b) => nodeVisualBounds(a)[axis] - nodeVisualBounds(b)[axis]))
}

export function spacingOrder(nodes: readonly SquigNode[], axis: SpacingAxis) {
  return [...nodes].sort((a, b) => nodeVisualBounds(a)[axis] - nodeVisualBounds(b)[axis])
}

export function equalGap(nodes: readonly SquigNode[], axis: SpacingAxis): number | null {
  if (nodes.length < 2) return null
  const size = axis === "x" ? "w" : "h"
  const boxes = spacingOrder(nodes, axis).map(nodeVisualBounds)
  const gap = boxes[1][axis] - boxes[0][axis] - boxes[0][size]
  return gap >= 0 && boxes.slice(1).every((b, i) => Math.abs(b[axis] - boxes[i][axis] - boxes[i][size] - gap) < 0.01) ? gap : null
}

export function spaceNodes(nodes: readonly SquigNode[], { axis = "x", gap = 16, order }: SpacingOptions = {}): Record<string, Partial<SquigNode>> {
  if (nodes.length < 2 || nodes.some((n) => n.locked) || !Number.isFinite(gap) || gap < 0) return {}
  const sorted = spacingOrder(nodes, axis)
  const arranged = order ? order.map((id) => nodes.find((n) => n.id === id)!) : sorted
  if (arranged.length !== nodes.length || new Set(arranged).size !== nodes.length || arranged.some((n) => !n)) return {}
  const size = axis === "x" ? "w" : "h"
  let cursor = nodeVisualBounds(sorted[0])[axis]
  return Object.fromEntries(arranged.map((n) => {
    const b = nodeVisualBounds(n)
    const patch = { [axis]: n[axis] + cursor - b[axis] }
    cursor += b[size] + gap
    return [n.id, patch]
  }))
}

export function tidyNodes(nodes: readonly SquigNode[], gap?: number): Record<string, Partial<SquigNode>> {
  if (nodes.length < 2 || nodes.some((n) => n.locked)) return {}
  const rows = spacingRows(nodes)
  const horizontal = rows.flatMap((r) => r.slice(1).map((n, i) => nodeVisualBounds(n).x - nodeVisualBounds(r[i]).x - nodeVisualBounds(r[i]).w))
  const vertical = rows.slice(1).map((r, i) => nodeVisualBounds(r[0]).y - Math.max(...rows[i].map((n) => { const b = nodeVisualBounds(n); return b.y + b.h })))
  const gaps = [...horizontal, ...vertical].filter((g) => g >= 0).sort((a, b) => a - b)
  const distance = gap ?? Math.round(gaps[Math.floor(gaps.length / 2)] ?? 16)
  if (!Number.isFinite(distance) || distance < 0) return {}
  const left = Math.min(...nodes.map((n) => nodeVisualBounds(n).x))
  let top = Math.min(...nodes.map((n) => nodeVisualBounds(n).y))
  const patches: Record<string, Partial<SquigNode>> = {}
  for (const row of rows) {
    let x = left
    for (const n of row) {
      const b = nodeVisualBounds(n)
      patches[n.id] = { x: n.x + x - b.x, y: n.y + top - b.y }
      x += b.w + distance
    }
    top += Math.max(...row.map((n) => nodeVisualBounds(n).h)) + distance
  }
  return patches
}

export function spacingTracks(nodes: readonly SquigNode[]) {
  const columns = spacingRows(nodes, "y")
  return [
    ...spacingRows(nodes).filter((r) => r.length > 1).map((nodes) => ({ nodes, axis: "x" as const, gap: equalGap(nodes, "x") })),
    ...columns.filter((r) => r.length > 1).map((nodes) => ({ nodes, axis: "y" as const, gap: equalGap(nodes, "y") })),
  ]
}

export function changeMatchingGaps(nodes: readonly SquigNode[], axis: SpacingAxis, previous: number | null, gap: number) {
  return Object.assign({}, ...spacingTracks(nodes).filter((t) => t.axis === axis && (previous === null || (t.gap !== null && Math.abs(t.gap - previous) < 0.01))).map((t) => spaceNodes(t.nodes, { axis, gap }))) as Record<string, Partial<SquigNode>>
}

export function resizeSpacedNodes(nodes: readonly SquigNode[], marked: readonly string[], axis: SpacingAxis, delta: number) {
  if (nodes.some((n) => n.locked)) return {}
  const patches: Record<string, Partial<SquigNode>> = {}
  for (const n of nodes.filter((n) => marked.includes(n.id))) Object.assign(patches, resizeNodesBy([n], n, axis === "x" ? "width" : "height", delta))
  const resized = nodes.map((n) => ({ ...n, ...patches[n.id] }) as SquigNode)
  for (const t of spacingTracks(nodes).filter((t) => t.gap !== null)) {
    const arranged = spaceNodes(t.nodes.map((n) => resized.find((r) => r.id === n.id)!), { axis: t.axis, gap: t.gap!, order: t.nodes.map((n) => n.id) })
    for (const [id, patch] of Object.entries(arranged)) patches[id] = { ...patches[id], ...patch } as Partial<SquigNode>
  }
  return patches
}

export function spacingReorder(nodes: readonly SquigNode[], axis: SpacingAxis, id: string, delta: number) {
  const ordered = spacingOrder(nodes, axis)
  const n = ordered.find((n) => n.id === id)!
  const size = axis === "x" ? "w" : "h"
  const b = nodeVisualBounds(n)
  const target = b[axis] + b[size] / 2 + delta
  const others = ordered.filter((n) => n.id !== id)
  const index = others.filter((n) => { const b = nodeVisualBounds(n); return b[axis] + b[size] / 2 < target }).length
  others.splice(index, 0, n)
  return { order: others.map((n) => n.id), index }
}
