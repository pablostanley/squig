import type { Bounds } from "../selection"
import type { SquigNode } from "../types"

/** Figma's convention: positive degrees turn counterclockwise. */
export function normalizeRotation(degrees: number): number {
  const angle = ((degrees + 180) % 360 + 360) % 360 - 180
  return Math.abs(angle) < 1e-9 ? 0 : angle
}

export function rotatePoint(x: number, y: number, cx: number, cy: number, degrees: number): [number, number] {
  const r = -degrees * Math.PI / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]
}

export function unrotatePoint(n: Bounds & { rotation?: number }, x: number, y: number): [number, number] {
  return rotatePoint(x, y, n.x + n.w / 2, n.y + n.h / 2, -(n.rotation ?? 0))
}

export function rotatedCorners(n: Bounds & { rotation?: number }): [number, number][] {
  return [[n.x, n.y], [n.x + n.w, n.y], [n.x + n.w, n.y + n.h], [n.x, n.y + n.h]]
    .map(([x, y]) => rotatePoint(x, y, n.x + n.w / 2, n.y + n.h / 2, n.rotation ?? 0))
}

export function rotatedBounds(n: Bounds & { rotation?: number }): Bounds {
  if (!n.rotation) return { x: n.x, y: n.y, w: n.w, h: n.h }
  const points = rotatedCorners(n)
  const x = Math.min(...points.map((p) => p[0]))
  const y = Math.min(...points.map((p) => p[1]))
  return { x, y, w: Math.max(...points.map((p) => p[0])) - x, h: Math.max(...points.map((p) => p[1])) - y }
}

/** Applied inside a node's translation, shared by the canvas and SVG export. */
export function rotationTransform(n: Bounds & { rotation?: number }): string | undefined {
  return n.rotation ? `rotate(${-n.rotation} ${n.w / 2} ${n.h / 2})` : undefined
}

/** Convert a resize in the original local axes back into document coordinates. */
export function orientResize(n: Bounds & { rotation?: number }, patch: Partial<SquigNode>): Partial<SquigNode> {
  if (!n.rotation) return patch
  const w = patch.w ?? n.w
  const h = patch.h ?? n.h
  const [cx, cy] = rotatePoint((patch.x ?? n.x) + w / 2, (patch.y ?? n.y) + h / 2,
    n.x + n.w / 2, n.y + n.h / 2, n.rotation)
  return { ...patch, x: cx - w / 2, y: cy - h / 2 }
}

/** Rotation is always recomputed from the gesture snapshot, including groups. */
export function rotateNodes(nodes: readonly SquigNode[], center: [number, number], angle: number): Record<string, Partial<SquigNode>> {
  const patches: Record<string, Partial<SquigNode>> = {}
  if (Math.abs(angle) < 1e-9) return Object.fromEntries(nodes.filter((n) => !n.locked).map((n) => [n.id, n]))
  for (const n of nodes) {
    if (n.locked) continue
    if (n.type === "arrow") {
      // Connectors keep endpoints as their geometry. Bound ends settle back
      // onto their targets after all the rotated nodes have been written.
      const points = n.points.map(([x, y]) => rotatePoint(n.x + (n.flipX ? n.w - x : x),
        n.y + (n.flipY ? n.h - y : y), ...center, angle))
      const x = Math.min(points[0][0], points[1][0])
      const y = Math.min(points[0][1], points[1][1])
      const bend = n.curveBend && rotatePoint(n.curveBend[0] * (n.flipX ? -1 : 1),
        n.curveBend[1] * (n.flipY ? -1 : 1), 0, 0, angle)
      patches[n.id] = { x, y, w: Math.abs(points[1][0] - points[0][0]), h: Math.abs(points[1][1] - points[0][1]),
        points: points.map(([px, py]) => [px - x, py - y]), flipX: undefined, flipY: undefined,
        curveBend: bend, elbowOffset: undefined, elbowAxis: undefined } as Partial<SquigNode>
    } else {
      const [cx, cy] = rotatePoint(n.x + n.w / 2, n.y + n.h / 2, ...center, angle)
      patches[n.id] = { x: cx - n.w / 2, y: cy - n.h / 2, rotation: normalizeRotation((n.rotation ?? 0) + angle) || undefined }
    }
  }
  return patches
}

export function rotationDelta(start: number, current: number, initial: number, snap: boolean): number {
  const delta = normalizeRotation(current - start)
  return snap ? Math.round((initial + delta) / 15) * 15 - initial : delta
}
