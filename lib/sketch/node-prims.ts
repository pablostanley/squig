// ---------------------------------------------------------------------------
// A node's marks, before anything draws them.
//
// The canvas renders these; the inline editor reads them to find out where a
// label actually sits. Both need the same answer, so the geometry lives here
// rather than inside the renderer.
// ---------------------------------------------------------------------------

import { HAND, mirrorPrims, type Prim, type PrimOpts } from "./kit"
import { textAnchorX, textBaseline } from "./text-layout"
import { normalizeFill, type FillTone, type Outlined, type SquigNode, type StrokeWeight } from "@/lib/types"
import { renderComponent } from "@/lib/library/registry"

/**
 * A shape's fill tone, as prim options.
 *
 * These reuse the component ladder rather than inventing a second one: `light`
 * and `strong` are the same two shades every card and button prints with, so a
 * filled scribble sits in the same tonal world as the library. `paper` is
 * genuinely opaque — it's the tone you reach for when a box has to hide what
 * it overlaps rather than tint it.
 */
const FILL_OPTS: Record<FillTone, PrimOpts | undefined> = {
  none: undefined,
  paper: { fill: "solid", fillColor: "paper" },
  light: { fill: "shade", fillColor: "faint" },
  strong: { fill: "shade", fillColor: "ink" },
}

/**
 * Pen pressure, as a multiplier on whatever weight the mark draws at by
 * default. A multiplier rather than three absolute widths because an arrow, a
 * freehand line and a rectangle don't start from the same weight, and "heavy"
 * should mean the same *relative* press on all three.
 */
const PEN_SCALE: Record<StrokeWeight, number> = { light: 0.65, regular: 1, heavy: 1.7 }

/** Merge a node's outline settings into the options for one of its marks. */
function outline(node: Outlined, baseWidth: number, o?: PrimOpts): PrimOpts {
  return {
    ...o,
    strokeWidth: baseWidth * PEN_SCALE[node.stroke ?? "regular"],
    dashed: node.dashed,
  }
}

/** A node's prims before any flip is applied. */
export function basePrims(node: SquigNode): Prim[] {
  switch (node.type) {
    case "component":
      return renderComponent(node.kind, node.props, node.w, node.h)
    case "shape": {
      const o = outline(node, HAND.strokeWidth, FILL_OPTS[normalizeFill(node.fill)])
      if (node.shape === "ellipse") return [{ t: "ellipse", x: 0, y: 0, w: node.w, h: node.h, o }]
      return [{ t: "rect", x: 0, y: 0, w: node.w, h: node.h, r: 6, o }]
    }
    case "draw":
      // freehand is already the user's own line — barely roughen it
      return [{ t: "poly", pts: node.points, o: outline(node, 1.9, { roughness: 0.2 }) }]
    case "arrow": {
      const [[x1, y1], [x2, y2]] = node.points
      const o = outline(node, 1.6)
      const out: Prim[] = [{ t: "line", x1, y1, x2, y2, o }]
      if (node.head) {
        const a = Math.atan2(y2 - y1, x2 - x1)
        const L = 12
        out.push({
          t: "poly",
          pts: [
            [x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)],
            [x2, y2],
            [x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)],
          ],
          // a dashed arrowhead reads as a rendering fault, not a style
          o: { ...o, dashed: false },
        })
      }
      return out
    }
    case "text": {
      const anchor = textAnchorX(node.align, node.w)
      return node.text.split("\n").map((lineText, i): Prim => ({
        t: "text",
        x: anchor,
        y: textBaseline(i, node.fontSize),
        text: lineText,
        size: node.fontSize,
        align: node.align,
        bold: node.bold,
        italic: node.italic,
        // a link is a link because it's underlined — no blue in a wireframe
        underline: node.underline || !!node.link,
      }))
    }
  }
}

/**
 * Everything a node draws, in node-local coordinates, flips applied.
 *
 * A text layer flips for real — the words turn over. Everywhere else the words
 * are labels on a wireframe and stay readable while the layout mirrors around
 * them; see mirrorPrims.
 */
export function nodePrims(node: SquigNode): Prim[] {
  return mirrorPrims(basePrims(node), node.w, node.h, !!node.flipX, !!node.flipY, node.type === "text")
}
