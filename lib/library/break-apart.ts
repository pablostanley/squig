// ---------------------------------------------------------------------------
// Break apart — one-way conversion of a component instance into primitive
// nodes. The same prims that draw the component become real canvas nodes.
// ---------------------------------------------------------------------------

import { nanoid } from "nanoid"
import type { ComponentNode, SquigNode } from "@/lib/types"
import { mirrorPrims } from "@/lib/sketch/kit"
import { renderComponent } from "./registry"

const seed = () => Math.floor(Math.random() * 2 ** 31)

export function breakApart(node: ComponentNode): SquigNode[] {
  const prims = mirrorPrims(
    renderComponent(node.kind, node.props, node.w, node.h),
    node.w,
    node.h,
    !!node.flipX,
    !!node.flipY
  )
  const out: SquigNode[] = []
  for (const p of prims) {
    switch (p.t) {
      case "rect":
        out.push({
          id: nanoid(8), type: "shape", shape: "rect",
          x: node.x + p.x, y: node.y + p.y, w: p.w, h: p.h,
          fill: p.o?.fill === "hachure" || p.o?.fill === "solid",
          seed: seed(),
        })
        break
      case "ellipse":
        out.push({
          id: nanoid(8), type: "shape", shape: "ellipse",
          x: node.x + p.x, y: node.y + p.y, w: p.w, h: p.h,
          fill: p.o?.fill === "hachure" || p.o?.fill === "solid",
          seed: seed(),
        })
        break
      case "line": {
        const x = Math.min(p.x1, p.x2)
        const y = Math.min(p.y1, p.y2)
        const w = Math.abs(p.x2 - p.x1)
        const h = Math.abs(p.y2 - p.y1)
        out.push({
          id: nanoid(8), type: "arrow", head: false,
          x: node.x + x, y: node.y + y, w: Math.max(w, 1), h: Math.max(h, 1),
          points: [
            [p.x1 - x, p.y1 - y],
            [p.x2 - x, p.y2 - y],
          ],
          seed: seed(),
        })
        break
      }
      case "poly": {
        const xs = p.pts.map(([px]) => px)
        const ys = p.pts.map(([, py]) => py)
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        const pts = p.pts.map(([px, py]) => [px - x, py - y] as [number, number])
        if (p.close && pts.length) pts.push([...pts[0]])
        out.push({
          id: nanoid(8), type: "draw",
          x: node.x + x, y: node.y + y,
          w: Math.max(Math.max(...xs) - x, 1), h: Math.max(Math.max(...ys) - y, 1),
          points: pts,
          seed: seed(),
        })
        break
      }
      case "path": {
        // icons have no primitive equivalent — rebuild them as Icon components
        // so they survive the break instead of silently vanishing
        if (!p.name) break
        out.push({
          id: nanoid(8), type: "component", kind: "icon",
          props: { name: p.name, shape: "none" },
          x: node.x + p.x, y: node.y + p.y, w: p.size, h: p.size,
          seed: seed(),
        })
        break
      }
      case "text": {
        const approxW = p.text.length * p.size * 0.46
        const x = p.align === "center" ? p.x - approxW / 2 : p.align === "right" ? p.x - approxW : p.x
        out.push({
          id: nanoid(8), type: "text",
          x: node.x + x, y: node.y + p.y - p.size,
          w: Math.max(approxW, 20), h: p.size * 1.4,
          text: p.text, fontSize: p.size,
          seed: seed(),
        })
        break
      }
    }
  }
  return out
}
