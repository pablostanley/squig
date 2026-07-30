// ---------------------------------------------------------------------------
// Keeping a text node's box honest about what's in it.
// ---------------------------------------------------------------------------

import { anchorFactor, textBlockHeight } from "@/lib/sketch/text-layout"
import { measureLinesWidth } from "./text-metrics"
import type { TextNode } from "@/lib/types"

/** Narrow enough to hug an "i", wide enough to still be worth clicking. */
const MIN_WIDTH = 24
/** A hair past the last glyph, so the selection ring never clips an overhang. */
const SLACK = 2

/**
 * Fit the box to the words.
 *
 * The box grows and shrinks around whichever edge the alignment pins, so
 * centred text stays centred where it was and right-aligned text keeps its
 * right edge instead of sliding off it. Vertically it always grows downward —
 * the first baseline is the one thing that never moves while you type.
 *
 * A mirrored node pins the opposite edge: flipping swaps which end of the box
 * the run hangs off (see mirrorPrims), so the anchor has to swap with it.
 */
export function fitTextBox(n: TextNode, text: string, fontSize = n.fontSize): Partial<TextNode> {
  const lines = (text || " ").split("\n")
  const measured = measureLinesWidth(lines, { size: fontSize, bold: n.bold, italic: n.italic })
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
