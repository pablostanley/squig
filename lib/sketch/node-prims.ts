// ---------------------------------------------------------------------------
// A node's marks, before anything draws them.
//
// The canvas renders these; the inline editor reads them to find out where a
// label actually sits. Both need the same answer, so the geometry lives here
// rather than inside the renderer.
// ---------------------------------------------------------------------------

import { HAND, mirrorPrims, type Prim, type PrimOpts } from "./kit"
import { textAnchorX, textBaseline, textBoxPadding, textContentWidth } from "./text-layout"
import { wrapText } from "@/lib/canvas/text-metrics"
import { localArrowRoute, localRouteEndTangent } from "@/lib/canvas/line-routing"
import {
  normalizeFill,
  normalizeInk,
  normalizeStroke,
  type FillTone,
  type Outlined,
  type SquigNode,
  type StrokeWeight,
} from "@/lib/types"
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

/** How far a picture's frame is drawn outside the picture, in world units. */
const FRAME_GAP = 2.5

/** Merge a node's outline settings into the options for one of its marks. */
function outline(node: Outlined, baseWidth: number, o?: PrimOpts): PrimOpts {
  return {
    ...o,
    strokeWidth: baseWidth * PEN_SCALE[normalizeStroke(node.stroke)],
    // pressure and tone are two different knobs: how hard the pen presses, and
    // which of the three inks it was dipped in
    tone: normalizeInk(node.ink),
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
      // freehand is already the user's own line — barely roughen it.
      //
      // The copy is the cheap half of a bargain the store makes elsewhere: a
      // checkpoint keeps references to live nodes rather than cloning them, so
      // the array behind `points` is shared with every undo step that node
      // appears in. Handing it out to rough.js and the SVG exporter as-is is
      // safe today — both only read it — but "only reads it" is a promise made
      // by a dependency we upgrade, and the day one of them sorts or reverses
      // the points in place, it would rewrite history under itself with
      // nothing to catch it. One array per stroke per render is the whole
      // price of not having to trust that. scripts/test-history.ts says so.
      return [{ t: "poly", pts: [...node.points], o: outline(node, 1.9, { roughness: 0.2 }) }]
    case "arrow": {
      const route = localArrowRoute(node)
      const end = route.kind === "curve" ? route.end : route.points[route.points.length - 1]
      const [x2, y2] = end
      const o = outline(node, 1.6)
      const out: Prim[] = route.kind === "curve"
        ? [{ t: "curve", x1: route.start[0], y1: route.start[1], cx: route.control[0], cy: route.control[1], x2, y2, o }]
        : route.style === "elbow"
          ? [{ t: "poly", pts: route.points, o }]
          : [{ t: "line", x1: route.points[0][0], y1: route.points[0][1], x2, y2, o }]
      if (node.head) {
        const [tx, ty] = localRouteEndTangent(route)
        const a = Math.atan2(ty, tx)
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
    // the picture itself is drawn by the renderer, which is the one thing here
    // that isn't made of pen marks. What the hand contributes is the frame
    // around it, so a pasted screenshot still sits on the same paper.
    //
    // Drawn just outside the box rather than on it: half a line sitting on the
    // picture disappears into whatever colour it happens to land on, and a red
    // screenshot in a red ink would come out with no frame at all.
    case "image": {
      const g = FRAME_GAP
      return [{ t: "rect", x: -g, y: -g, w: node.w + g * 2, h: node.h + g * 2, r: 2, o: { stroke: "muted" } }]
    }
    case "text": {
      const boxed = !!node.boxed
      const pad = textBoxPadding(node.fontSize, boxed)
      const measure = textContentWidth(node.w, node.fontSize, boxed)
      const anchor = pad.x + textAnchorX(node.align, measure)
      // an auto-sized layer's lines are its hard returns; a fixed-width layer
      // re-breaks them to the measure the side handles set
      const lines = node.fixedW
        ? wrapText(node.text, measure, { size: node.fontSize, bold: node.bold, italic: node.italic })
        : node.text.split("\n")
      const words = lines.map((lineText, i): Prim => ({
        t: "text",
        x: anchor,
        y: textBaseline(i, node.fontSize, boxed),
        text: lineText,
        size: node.fontSize,
        align: node.align,
        color: normalizeInk(node.ink),
        bold: node.bold,
        italic: node.italic,
        // a link is a link because it's underlined — no blue in a wireframe
        underline: node.underline || !!node.link,
      }))
      if (!boxed) return words

      const frame: Prim = {
        t: "rect",
        x: 0,
        y: 0,
        w: node.w,
        h: node.h,
        r: 6,
        o: {
          ...(FILL_OPTS[normalizeFill(node.boxFill)] ?? {}),
          strokeWidth: node.boxBorder === false ? 0 : HAND.strokeWidth * PEN_SCALE[normalizeStroke(node.boxStroke)],
          tone: normalizeInk(node.boxInk),
          dashed: node.boxDashed,
        },
      }
      return [frame, ...words]
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
