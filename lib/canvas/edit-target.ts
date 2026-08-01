// ---------------------------------------------------------------------------
// What double-clicking a node actually puts you into.
//
// Editing should happen where the words are — same baseline, same size, same
// alignment — so the editor needs the geometry of the *drawn* run, not the
// node's bounding box. For a text node that's arithmetic. For a component the
// label is buried somewhere inside authored prims (centred in a button, hung
// off an icon, offset inside a card), so we find it the only way that can't go
// stale: render the component twice, once with the label swapped for a marker,
// and see which run changed.
// ---------------------------------------------------------------------------

import { INK, type Prim } from "@/lib/sketch/kit"
import { wrapText } from "@/lib/canvas/text-metrics"
import { nodePrims } from "@/lib/sketch/node-prims"
import { textAnchorX, textBaseline } from "@/lib/sketch/text-layout"
import { getDef } from "@/lib/library/registry"
import type { ComponentNode, SquigNode, TextAlign, TextNode } from "@/lib/types"

type TextPrim = Extract<Prim, { t: "text" }>

export interface EditTarget {
  /** the string the editor starts on */
  value: string
  /** anchor x, node-local — which edge of the run `align` pins */
  x: number
  /** first baseline, node-local */
  baseline: number
  fontSize: number
  align: TextAlign
  bold: boolean
  italic: boolean
  underline: boolean
  /** the ink this run prints in, as a css colour */
  color: string
  /** a text node takes Return; a component label is one line */
  multiline: boolean
  /** which drawn run the editor stands in for, so the canvas can hide it */
  hidden: "all" | number
  /** for a component, the prop the edited string lives in */
  propKey?: string
}

/** Unlikely to be anyone's label, short enough to survive truncation. */
const MARKER = "⁣zqx"

/** An index no run has — "the editor is standing in for nothing drawn". */
const NO_RUN = -1

function textPrims(prims: Prim[]): TextPrim[] {
  return prims.filter((p): p is TextPrim => p.t === "text")
}

/** The text control a double-click edits — the first one the def declares. */
export function textControlKey(node: ComponentNode): string | null {
  return getDef(node.kind)?.controls.find((c) => c.type === "text")?.key ?? null
}

/**
 * Has this node any words to edit? The cheap answer — same verdict `editTarget`
 * reaches, without rendering anything to find out, so a keystroke can ask.
 */
export function hasEditableText(node: SquigNode): boolean {
  if (node.type === "text") return true
  return node.type === "component" && textControlKey(node) !== null
}

function currentValue(node: ComponentNode, key: string): string {
  const def = getDef(node.kind)
  const value = node.props[key] ?? def?.defaults[key]
  return value == null ? "" : String(value)
}

/** Which of the node's drawn runs prints `key`, and where it sits. */
function locateLabel(node: ComponentNode, key: string): { prim: TextPrim; index: number } | null {
  const runs = textPrims(nodePrims(node))
  if (!runs.length) return null

  const marked = textPrims(nodePrims({ ...node, props: { ...node.props, [key]: MARKER } }))
  if (marked.length === runs.length) {
    const i = runs.findIndex((run, n) => run.text !== marked[n].text)
    if (i >= 0) return { prim: runs[i], index: i }
  }

  // A def whose layout changes with the label's length renders a different
  // number of runs for the marker. Fall back to matching the string itself,
  // truncation and all.
  const value = currentValue(node, key)
  const i = runs.findIndex((run) => run.text === value || (run.text.endsWith("…") && value.startsWith(run.text.slice(0, -1))))
  return i >= 0 ? { prim: runs[i], index: i } : null
}

/**
 * A text node's own geometry.
 *
 * A flipped node prints its words mirrored, but you edit them the right way
 * round — a backwards caret helps nobody. The editor stands upright on the
 * same patch of canvas the mirrored run covers, which is why the alignment is
 * swapped here even though the prims keep theirs: an upright right-aligned run
 * ends where a mirrored left-aligned one does. A flipped *multi*-line node is
 * the one case that can't be honest: the renderer stacks its lines bottom-up,
 * and a textarea only stacks one way, so the editor sits on the topmost
 * baseline and the lines read in typing order.
 */
function textNodeTarget(node: TextNode): EditTarget {
  const lines = node.fixedW
    ? wrapText(node.text, node.w, { size: node.fontSize, bold: node.bold, italic: node.italic })
    : node.text.split("\n")
  const align: TextAlign = node.align ?? "left"
  const flipped: TextAlign = node.flipX ? (align === "left" ? "right" : align === "right" ? "left" : "center") : align

  const x = node.flipX ? node.w - textAnchorX(align, node.w) : textAnchorX(align, node.w)
  const top = node.flipY
    ? node.h - textBaseline(Math.max(0, lines.length - 1), node.fontSize) + node.fontSize * 0.6
    : textBaseline(0, node.fontSize)

  return {
    value: node.text,
    x,
    baseline: top,
    fontSize: node.fontSize,
    align: flipped,
    bold: !!node.bold,
    italic: !!node.italic,
    underline: !!node.underline || !!node.link,
    color: INK.ink,
    multiline: true,
    hidden: "all",
  }
}

/** Where — and how — a node's text should be edited, or null if it has none. */
export function editTarget(node: SquigNode): EditTarget | null {
  if (node.type === "text") return textNodeTarget(node)
  if (node.type !== "component") return null

  const key = textControlKey(node)
  if (!key) return null
  const value = currentValue(node, key)
  const found = locateLabel(node, key)

  // Nothing found means the def draws this prop some way we can't see — an
  // empty label with no placeholder, most likely. Edit at the middle of the
  // node, on the centre line a label would sit on once there was one. The
  // size and the nudge below the middle are what a button label uses.
  if (!found) {
    const fontSize = 15
    return {
      value,
      x: node.w / 2,
      baseline: node.h / 2 + fontSize * 0.35,
      fontSize,
      align: "center",
      bold: false,
      italic: false,
      underline: false,
      color: INK.ink,
      multiline: false,
      hidden: NO_RUN,
      propKey: key,
    }
  }

  const { prim, index } = found
  return {
    value,
    x: prim.x,
    baseline: prim.y,
    fontSize: prim.size,
    align: prim.align ?? "left",
    bold: !!prim.bold,
    italic: !!prim.italic,
    underline: !!prim.underline,
    color: INK[prim.color ?? "ink"],
    multiline: false,
    hidden: index,
    propKey: key,
  }
}
