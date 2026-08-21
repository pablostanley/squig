// ---------------------------------------------------------------------------
// Keeping a text node's box honest about what's in it.
// ---------------------------------------------------------------------------

import { anchorFactor, textBlockHeight, textBoxPadding, textContentWidth } from "@/lib/sketch/text-layout"
import { measureLinesWidth, wrapText } from "./text-metrics"
import type { TextNode } from "@/lib/types"

/** Narrow enough to hug an "i", wide enough to still be worth clicking. */
const MIN_WIDTH = 24
/** A hair past the last glyph, so the selection ring never clips an overhang. */
const SLACK = 2

/**
 * Fit the box to the words.
 *
 * An auto-sized layer's box grows and shrinks around whichever edge the
 * alignment pins, so centred text stays centred where it was and right-aligned
 * text keeps its right edge instead of sliding off it. A fixed-width layer
 * holds its box still — the words wrap to it, and only the height answers to
 * the text. Vertically both always grow downward: the first baseline is the
 * one thing that never moves while you type.
 *
 * A mirrored node pins the opposite edge: flipping swaps which end of the box
 * the run hangs off (see mirrorPrims), so the anchor has to swap with it.
 */
export function fitTextBox(n: TextNode, text: string, fontSize = n.fontSize): Partial<TextNode> {
  const style = { size: fontSize, bold: n.bold, italic: n.italic }
  const boxed = !!n.boxed
  if (n.fixedW) {
    const measure = textContentWidth(n.w, fontSize, boxed)
    return { text, fontSize, h: textBlockHeight(wrapText(text, measure, style).length, fontSize, boxed) }
  }
  const lines = (text || " ").split("\n")
  const measured = measureLinesWidth(lines, style)
  const contentW = Math.max(MIN_WIDTH, measured + SLACK)
  const oldPad = textBoxPadding(n.fontSize, boxed)
  const nextPad = textBoxPadding(fontSize, boxed)
  const w = contentW + nextPad.x * 2
  const align = anchorFactor(n.align)
  // Keep the *drawn* anchor still. With a flip that anchor lives on the other
  // side of the outer box; spelling both local positions out also keeps a
  // boxed run still when a font-size change changes its em-based padding.
  const oldAnchor = oldPad.x + align * textContentWidth(n.w, n.fontSize, boxed)
  const nextAnchor = nextPad.x + align * contentW
  const oldVisualAnchor = n.flipX ? n.w - oldAnchor : oldAnchor
  const nextVisualAnchor = n.flipX ? w - nextAnchor : nextAnchor
  return {
    text,
    fontSize,
    x: n.x + oldVisualAnchor - nextVisualAnchor,
    w,
    h: textBlockHeight(lines.length, fontSize, boxed),
  }
}

/**
 * The narrowest a wrap width may be dragged: never below a click target, and
 * never below one em — a glyph wider than its own box would spill past the
 * selection ring, and the char-breaker needs room for at least one glyph per
 * line to make progress.
 */
export function minTextWidth(n: TextNode): number {
  return Math.max(MIN_WIDTH, n.fontSize) + textBoxPadding(n.fontSize, !!n.boxed).x * 2
}

/**
 * What dragging a side handle does to a text layer: the width becomes the
 * measure, the words re-break to it, and the height follows the line count.
 * From here on the layer is fixed-width — `autoSizeTextBox` is the way back.
 */
export function setTextWidth(n: TextNode, w: number): Partial<TextNode> {
  const cw = Math.max(minTextWidth(n), w)
  const boxed = !!n.boxed
  const measure = textContentWidth(cw, n.fontSize, boxed)
  const lines = wrapText(n.text, measure, { size: n.fontSize, bold: n.bold, italic: n.italic })
  return { fixedW: true, w: cw, h: textBlockHeight(lines.length, n.fontSize, boxed) }
}

/** Back to hugging the words — what double-clicking a side handle means. */
export function autoSizeTextBox(n: TextNode): Partial<TextNode> {
  return { ...fitTextBox({ ...n, fixedW: false }, n.text), fixedW: false }
}

/**
 * Put the optional surface around a run, or take it away, without moving a
 * single glyph. The outer node grows symmetrically around the old text box;
 * because the insets are symmetric this remains true when the node is flipped.
 */
export function setTextBoxed(n: TextNode, boxed: boolean): Partial<TextNode> {
  if (!!n.boxed === boxed) return {}
  const pad = textBoxPadding(n.fontSize)
  if (boxed) {
    return {
      boxed: true,
      boxFill: n.boxFill ?? "paper",
      x: n.x - pad.x,
      y: n.y - pad.y,
      w: n.w + pad.x * 2,
      h: n.h + pad.y * 2,
    }
  }
  return {
    boxed: undefined,
    x: n.x + pad.x,
    y: n.y + pad.y,
    w: Math.max(MIN_WIDTH, n.w - pad.x * 2),
    h: Math.max(textBlockHeight(1, n.fontSize), n.h - pad.y * 2),
  }
}
