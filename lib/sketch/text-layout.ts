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

export function textBaseline(line: number, fontSize: number): number {
  return fontSize * (TEXT_FIRST_BASELINE + line * TEXT_LINE_HEIGHT)
}

/** The height a run of lines needs: first baseline, the gaps, the descenders. */
export function textBlockHeight(lineCount: number, fontSize: number): number {
  return fontSize * (TEXT_FIRST_BASELINE + Math.max(0, lineCount - 1) * TEXT_LINE_HEIGHT + DESCENDER)
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
