// ---------------------------------------------------------------------------
// Where the lines of a text node sit inside its box.
//
// The renderer, the inline editor and the box-fitting maths all have to agree
// on these numbers or the words jump the moment you start — or stop — typing.
// So they live here, and nowhere else.
// ---------------------------------------------------------------------------

import type { TextAlign } from "@/lib/types"

/** Line spacing, as a multiple of the type size. */
export const TEXT_LINE_HEIGHT = 1.35

/**
 * The first baseline, as a multiple of the type size, measured from the top of
 * the box. A browser puts it at half-leading + ascent, which for an ordinary
 * face at this line height lands within a hair of one em — so the editor, which
 * computes it from the real font metrics, sits on the line the renderer drew.
 */
export const TEXT_FIRST_BASELINE = 1

/** Descender room under the last baseline, again as a multiple of the size. */
const DESCENDER = 0.3

/**
 * A boxed run uses type-relative padding, so scaling the type scales the whole
 * element exactly like CSS padding set in em. It is intentionally not a user
 * control yet: Box is a text treatment, not a second layout system.
 */
const BOX_PAD_X_EM = 0.7
const BOX_PAD_Y_EM = 0.45

export function textBoxPadding(fontSize: number, boxed = true): { x: number; y: number } {
  return boxed ? { x: fontSize * BOX_PAD_X_EM, y: fontSize * BOX_PAD_Y_EM } : { x: 0, y: 0 }
}

/** The measure the words receive inside the node's outer box. */
export function textContentWidth(boxWidth: number, fontSize: number, boxed = false): number {
  const { x } = textBoxPadding(fontSize, boxed)
  return Math.max(0, boxWidth - x * 2)
}

export function textBaseline(line: number, fontSize: number, boxed = false): number {
  return textBoxPadding(fontSize, boxed).y + fontSize * (TEXT_FIRST_BASELINE + line * TEXT_LINE_HEIGHT)
}

/** The height a run of lines needs: first baseline, the gaps, the descenders. */
export function textBlockHeight(lineCount: number, fontSize: number, boxed = false): number {
  const text = fontSize * (TEXT_FIRST_BASELINE + Math.max(0, lineCount - 1) * TEXT_LINE_HEIGHT + DESCENDER)
  return text + textBoxPadding(fontSize, boxed).y * 2
}

/**
 * Which edge of the box an alignment pins the text to — 0 is the left edge,
 * 1 the right. Used both to place the anchor and to hold it still while the
 * box grows around it.
 */
export function anchorFactor(align: TextAlign | undefined): number {
  return align === "center" ? 0.5 : align === "right" ? 1 : 0
}

/** Where the anchor for an alignment sits inside a box of width `w`. */
export function textAnchorX(align: TextAlign | undefined, w: number): number {
  return anchorFactor(align) * w
}
