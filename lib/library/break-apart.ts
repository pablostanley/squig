// ---------------------------------------------------------------------------
// Break apart — one-way conversion of a component instance into primitive
// nodes. The same prims that draw the component become real canvas nodes.
// ---------------------------------------------------------------------------

import { nanoid } from "nanoid"
import type { ComponentNode, FillTone, SquigNode } from "@/lib/types"
import { measureTextWidth } from "@/lib/canvas/text-metrics"
import { mirrorPrims, type PrimOpts } from "@/lib/sketch/kit"
import { anchorFactor, textBlockHeight } from "@/lib/sketch/text-layout"
import { renderComponent } from "./registry"

const seed = () => Math.floor(Math.random() * 2 ** 31)

/**
 * Which fill tone a broken-out shape should carry.
 *
 * The inverse of the renderer's FILL_OPTS, and it has to stay that way: a card
 * that broke apart into flat "filled" boxes would lose the tonal step between
 * its inert areas and its emphasised ones, which is most of what the card was
 * saying. Mirrors SHADE_FOR in components/canvas/sketch.tsx.
 */
function fillToneOf(o: PrimOpts | undefined): FillTone {
  if (!o?.fill || o.fill === "none") return "none"
  if (o.fill === "solid") return o.fillColor === "paper" ? "paper" : "strong"
  return o.fillColor === "faint" || o.fillColor === undefined ? "light" : "strong"
}

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
          fill: fillToneOf(p.o),
          seed: seed(),
        })
        break
      case "ellipse":
        out.push({
          id: nanoid(8), type: "shape", shape: "ellipse",
          x: node.x + p.x, y: node.y + p.y, w: p.w, h: p.h,
          fill: fillToneOf(p.o),
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
      case "curve": {
        const x = Math.min(p.x1, p.x2)
        const y = Math.min(p.y1, p.y2)
        const w = Math.abs(p.x2 - p.x1)
        const h = Math.abs(p.y2 - p.y1)
        const midX = (p.x1 + p.x2) / 2
        const midY = (p.y1 + p.y2) / 2
        // Convert the quadratic control point to the on-curve midpoint Squig
        // exposes as its handle: (start + 2*control + end) / 4.
        const handleX = (p.x1 + 2 * p.cx + p.x2) / 4
        const handleY = (p.y1 + 2 * p.cy + p.y2) / 4
        out.push({
          id: nanoid(8), type: "arrow", head: false, lineStyle: "curved",
          x: node.x + x, y: node.y + y, w: Math.max(w, 1), h: Math.max(h, 1),
          points: [
            [p.x1 - x, p.y1 - y],
            [p.x2 - x, p.y2 - y],
          ],
          curveBend: [handleX - midX, handleY - midY],
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
          props: { name: p.name, shape: "none", ...(p.weight ? { weight: p.weight } : {}) },
          x: node.x + p.x, y: node.y + p.y, w: p.size, h: p.size,
          seed: seed(),
        })
        break
      }
      case "text": {
        // the box hangs off the same edge the run was anchored to, so a label
        // that was centred in its component comes out centred on its old spot
        const w = Math.max(measureTextWidth(p.text, { size: p.size, bold: p.bold, italic: p.italic }), 20)
        out.push({
          id: nanoid(8), type: "text",
          x: node.x + p.x - anchorFactor(p.align) * w,
          y: node.y + p.y - p.size,
          w, h: textBlockHeight(1, p.size),
          text: p.text, fontSize: p.size, align: p.align,
          // a label authored in a quieter ink keeps it — the component's tonal
          // hierarchy is most of what it was saying, same as its fills
          ink: p.color === "muted" || p.color === "faint" ? p.color : undefined,
          bold: p.bold, italic: p.italic, underline: p.underline,
          seed: seed(),
        })
        break
      }
    }
  }
  return out
}
