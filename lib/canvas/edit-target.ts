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
//
// A card usually has more than one thing worth saying. A stat has a label, a
// value and a delta; a kanban board has column names and card tags. Pointing
// at the one you mean is the whole gesture, so a double-click carries the
// point it landed on and we work back from the drawn run to the control that
// prints it — which is the same marker trick, run once per text control. Only
// runs backed by a control count: a lorem line or a timestamp isn't a prop, so
// aiming at one falls back to the first control rather than editing something
// you weren't pointing at.
// ---------------------------------------------------------------------------

import { INK, type Prim } from "@/lib/sketch/kit"
import { measureTextWidth, wrapText } from "@/lib/canvas/text-metrics"
import { nodePrims } from "@/lib/sketch/node-prims"
import { anchorFactor, textAnchorX, textBaseline } from "@/lib/sketch/text-layout"
import { getDef } from "@/lib/library/registry"
import { normalizeInk } from "@/lib/types"
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

/**
 * The marker's first character — an invisible separator, which is what a run
 * still carries after a def has truncated, uppercased or sliced the label we
 * fed it. Anything that keeps the front of a string keeps this.
 */
const SIGIL = MARKER[0]

/** An index no run has — "the editor is standing in for nothing drawn". */
const NO_RUN = -1

/**
 * The label, swapped for markers — one per comma-separated item.
 *
 * A control holds one string, but plenty of defs read it as a list: a board's
 * column names, a band's values, a menu's items. Handing such a def a single
 * marker leaves it a one-item list, and every item past the first falls back
 * to a stock string — so only the first run would come back marked and the
 * rest would look like someone else's. Marking item by item keeps the shape of
 * the list, and a label with no commas in it is still just the marker.
 */
function markLike(value: string): string {
  const parts = value.split(",")
  return parts.length > 1 ? parts.map(() => MARKER).join(", ") : MARKER
}

function textPrims(prims: Prim[]): TextPrim[] {
  return prims.filter((p): p is TextPrim => p.t === "text")
}

/** Every text control a def declares, in the order the inspector lists them. */
export function textControlKeys(node: ComponentNode): string[] {
  return (getDef(node.kind)?.controls ?? []).filter((c) => c.type === "text").map((c) => c.key)
}

/** The text control an unaimed edit lands on — the first one the def declares. */
export function textControlKey(node: ComponentNode): string | null {
  return textControlKeys(node)[0] ?? null
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

/**
 * Which of the node's drawn runs print `key` — usually one, but a comma-list
 * control (a kanban board's column names, a stat band's values) spreads itself
 * across several, and all of them should answer to a click.
 *
 * `runs` is the node's own text, passed in so a caller asking about every
 * control renders the plain node once rather than once per key.
 */
function labelRuns(node: ComponentNode, key: string, runs: TextPrim[]): number[] {
  if (!runs.length) return []

  const value = currentValue(node, key)
  const marked = textPrims(nodePrims({ ...node, props: { ...node.props, [key]: markLike(value) } }))
  if (marked.length === runs.length) {
    // Runs carrying the marker are the honest answer, and worth preferring
    // over a plain diff: a def that sizes one run off another's width — the
    // stat card truncates its period to whatever the delta leaves — redraws
    // that neighbour too, and a diff would hand the neighbour over as well.
    const carried = marked.flatMap((run, i) => (run.text.includes(SIGIL) ? [i] : []))
    if (carried.length) return carried
    // Nothing carried it: the def has passed the label through something that
    // drops the front of the string. What changed is still what it prints.
    const changed = runs.flatMap((run, i) => (run.text !== marked[i].text ? [i] : []))
    if (changed.length) return changed
  }

  // A def whose layout changes with the label's length renders a different
  // number of runs for the marker. Fall back to matching the string itself,
  // truncation and all — an empty label matches nothing, since every run that
  // happens to print nothing would otherwise look like a hit.
  if (!value) return []
  const i = runs.findIndex((run) => run.text === value || (run.text.endsWith("…") && value.startsWith(run.text.slice(0, -1))))
  return i >= 0 ? [i] : []
}

/**
 * The vertical span a run of this face inks, as multiples of its type size:
 * ascenders above the baseline, descenders below. The same two numbers
 * mirrorPrims uses to box a run when it turns one over.
 */
const ASCENT = 0.8
const DESCENT = 0.2

/**
 * How far outside its own ink a run still answers to a click, as a multiple of
 * its type size. A caption is a target six pixels tall and the gap between a
 * card's title and its subtitle is smaller than either, so the slop has to
 * scale with the type: a 12px label claims 6px of margin all round, a 40px
 * number claims 20. Past that the click was aimed at the card, not the words.
 */
const REACH = 0.5

/** The rectangle a run roughly covers, node-local. */
function runBox(p: TextPrim): { x0: number; y0: number; x1: number; y1: number } {
  const w = measureTextWidth(p.text, { size: p.size, bold: p.bold, italic: p.italic })
  const x0 = p.x - anchorFactor(p.align) * w
  return { x0, x1: x0 + w, y0: p.y - p.size * ASCENT, y1: p.y + p.size * DESCENT }
}

/** How far a point sits outside a box — zero anywhere inside it. */
function gapTo(b: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1))
}

/**
 * Which text control owns the run under a node-local point, or null when the
 * point didn't land on one — either because the nearest words aren't backed by
 * a control (filler, a count, a timestamp) or because nothing is within reach.
 *
 * Null is not a failure: it means "no aim", and `editTarget` answers it with
 * the def's first control, which is what a double-click has always opened. So
 * pointing at a card's lorem lines still gets you its title, rather than
 * nothing at all or whichever label happens to be closest.
 *
 * Runs are ranked by distance and ties go to whichever the def drew first.
 * Overlapping boxes are common — a stat's label and its value are a few px
 * apart and each one's slop reaches the other's baseline — so ranking on the
 * ink itself, before the slop is added, is what decides those.
 */
export function textControlAt(node: ComponentNode, x: number, y: number): string | null {
  const keys = textControlKeys(node)
  // one control, or none: there is nothing to choose between, and the marker
  // renders below would be spent finding that out
  if (keys.length < 2) return null

  const runs = textPrims(nodePrims(node))
  const owner = new Map<number, string>()
  for (const key of keys) {
    for (const i of labelRuns(node, key, runs)) if (!owner.has(i)) owner.set(i, key)
  }

  let best: string | null = null
  let bestGap = Infinity
  runs.forEach((run, i) => {
    const gap = gapTo(runBox(run), x, y)
    if (gap > run.size * REACH || gap >= bestGap) return
    bestGap = gap
    best = owner.get(i) ?? null
  })
  return best
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
    color: INK[normalizeInk(node.ink)],
    multiline: true,
    hidden: "all",
  }
}

/**
 * Where — and how — a node's text should be edited, or null if it has none.
 *
 * `controlKey` is the run a double-click aimed at, from `textControlAt`.
 * Leave it out — a Return on a selected layer, anything without a pointer —
 * and the edit opens on the def's first text control, as it always has. A key
 * this def doesn't declare is treated the same way: an aim that no longer
 * points at anything is no aim.
 */
export function editTarget(node: SquigNode, controlKey?: string): EditTarget | null {
  if (node.type === "text") return textNodeTarget(node)
  if (node.type !== "component") return null

  const keys = textControlKeys(node)
  const key = controlKey && keys.includes(controlKey) ? controlKey : keys[0]
  if (!key) return null
  const value = currentValue(node, key)
  // A control that prints in several places is edited as the one string it
  // is, so the editor stands on the first of its runs: there the words in the
  // box start with the words it covers. Standing it on the third column name
  // while it holds all four would print the list twice over.
  const runs = textPrims(nodePrims(node))
  const at = labelRuns(node, key, runs)[0]
  const found = at === undefined ? null : { prim: runs[at], index: at }

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
