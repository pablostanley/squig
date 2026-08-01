// ---------------------------------------------------------------------------
// Keeping a text node's box honest about what's in it.
// ---------------------------------------------------------------------------

import { anchorFactor, textBlockHeight } from "@/lib/sketch/text-layout"
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
  if (n.fixedW) {
    return { text, fontSize, h: textBlockHeight(wrapText(text, n.w, style).length, fontSize) }
  }
  const lines = (text || " ").split("\n")
  const measured = measureLinesWidth(lines, style)
  const w = Math.max(MIN_WIDTH, measured + SLACK)
  const pinned = n.flipX ? 1 - anchorFactor(n.align) : anchorFactor(n.align)
  return {
    text,
    fontSize,
    x: n.x + (n.w - w) * pinned,
    w,
    h: textBlockHeight(lines.length, fontSize),
  }
}

/**
 * The narrowest a wrap width may be dragged: never below a click target, and
 * never below one em — a glyph wider than its own box would spill past the
 * selection ring, and the char-breaker needs room for at least one glyph per
 * line to make progress.
 */
export function minTextWidth(n: TextNode): number {
  return Math.max(MIN_WIDTH, n.fontSize)
}

/**
 * What dragging a side handle does to a text layer: the width becomes the
 * measure, the words re-break to it, and the height follows the line count.
 * From here on the layer is fixed-width — `autoSizeTextBox` is the way back.
 */
export function setTextWidth(n: TextNode, w: number): Partial<TextNode> {
  const cw = Math.max(minTextWidth(n), w)
  const lines = wrapText(n.text, cw, { size: n.fontSize, bold: n.bold, italic: n.italic })
  return { fixedW: true, w: cw, h: textBlockHeight(lines.length, n.fontSize) }
}

/** Back to hugging the words — what double-clicking a side handle means. */
export function autoSizeTextBox(n: TextNode): Partial<TextNode> {
  return { ...fitTextBox({ ...n, fixedW: false }, n.text), fixedW: false }
}
