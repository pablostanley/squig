// ---------------------------------------------------------------------------
// "Where is the checkout flow?" — searching the canvas by the words on it.
//
// Nodes have no names, and they are not getting any. A `name` field sounds
// small and isn't: it wants a layers tree to show it in, a rename gesture, and
// the quiet obligation to keep it tidy — a naming discipline, on a napkin.
//
// But a drawing is already full of words. A text layer *is* its text. A block
// carries the strings its variant controls expose — a frame's label is the
// closest thing squig has to a screen name, and it is sitting right there in
// `props`. And a component knows what it is: "login", drawn from a def called
// "Login screen". That is enough to answer the question without inventing a
// second, parallel set of names for people to keep in sync with the drawing.
//
// What this deliberately does NOT search, because ⌘K re-filters on every
// keystroke and a board can hold thousands of nodes:
//
//   · rendered prims. Walking def.render() for every node on every keystroke
//     would be the most words and by far the slowest way to get them — a
//     dashboard alone emits a few hundred prims. Only `props` and `text` are
//     read here, both of them plain fields already in memory.
//   · shapes, drawings and arrows. They carry no words at all, so there is
//     nothing to match; a rectangle stays findable the way it always was, by
//     being looked at.
//   · image data. `name` on a pasted picture is a filename, not something
//     anyone reads off the canvas, and the pixels are a data URL nobody wants
//     a substring search running over.
//   · locked layers. A locked layer is never in the selection, so offering to
//     jump to one would be a door that opens onto a wall.
// ---------------------------------------------------------------------------

import { getDef } from "../library/registry"
import type { ComponentNode, SquigNode, TextNode } from "../types"

export interface NodeHit {
  id: string
  /** the words that matched, as they read on the canvas */
  label: string
  /** what the thing is — "Frame", "Login screen", "Text" */
  detail: string
  /** which icon the row gets */
  type: SquigNode["type"]
  score: number
}

/**
 * The prop keys that are a thing's name rather than its contents. `label` is
 * the frame's, and the one this whole feature is really for.
 */
const NAMING_KEYS = new Set(["label", "title", "name", "heading"])

// A frame someone renamed beats a heading, which beats the component's own
// library name, which beats a word buried in a paragraph. The gaps are wide
// enough that no bonus below can leapfrog a tier — the tier is the answer to
// "what kind of word is this", and that matters more than how it matched.
const W_NAME = 100
const W_HEADING = 80
const W_KIND = 60
const W_PROP = 45
const W_KEYWORD = 35
const W_BODY = 30

/** A short single line is a heading; anything longer is prose. */
const HEADING_CHARS = 40

/** Longer than this in a palette row is a wall of text, not a label. */
const CLIP_CHARS = 60

/**
 * One letter matches half the board, and a palette that answers "a" with forty
 * rows is noise. Two is where a search starts meaning something.
 */
const MIN_QUERY = 2

/**
 * How well one string answers the query, or 0 for not at all.
 *
 * Beyond the tier weight: hitting the start of the string, or the start of a
 * word inside it, beats landing in the middle of one — "check" should find the
 * "Checkout" frame before it finds "spellcheck" in a note. And a short string
 * mostly made of the query is a better answer than a long one that happens to
 * contain it.
 */
function scoreOf(hay: string, q: string, weight: number): number {
  const h = hay.toLowerCase()
  const i = h.indexOf(q)
  if (i < 0) return 0
  let s = weight
  if (h.length === q.length) s += 16
  else if (i === 0) s += 10
  else if (!/[a-z0-9]/.test(h[i - 1])) s += 6
  s += Math.round(8 * (q.length / h.length))
  return s
}

function clip(s: string): string {
  const t = s.trim().replace(/\s+/g, " ")
  return t.length > CLIP_CHARS ? t.slice(0, CLIP_CHARS - 1) + "…" : t
}

/** The line of a text layer the match is on — a paragraph shows the bit that hit. */
function matchingLine(text: string, q: string): string {
  if (!text.includes("\n")) return text
  return text.split("\n").find((l) => l.toLowerCase().includes(q)) ?? text
}

function textHit(n: TextNode, q: string): NodeHit | null {
  const body = n.text
  if (!body) return null
  const heading = body.trim().length <= HEADING_CHARS && !body.includes("\n")
  const score = scoreOf(body, q, heading ? W_HEADING : W_BODY)
  if (!score) return null
  return { id: n.id, label: clip(matchingLine(body, q)), detail: "Text", type: "text", score }
}

function componentHit(n: ComponentNode, q: string): NodeHit | null {
  const def = getDef(n.kind)
  const detail = def?.name ?? n.kind
  let best = 0
  let label = ""

  // the component's own identity — "login screen", "kanban board"
  for (const [hay, weight] of [
    [detail, W_KIND],
    [n.kind, W_KIND],
    ...(def?.keywords ?? []).map((k): [string, number] => [k, W_KEYWORD]),
  ] as [string, number][]) {
    const s = scoreOf(hay, q, weight)
    if (s > best) {
      best = s
      label = detail
    }
  }

  // the words it carries. Only the controls typed "text" — a toggle or a
  // number has nothing to read, and the def's control list is the document's
  // own answer to "which props are words", so no key list has to be kept here.
  for (const c of def?.controls ?? []) {
    if (c.type !== "text") continue
    const raw = c.key in n.props ? n.props[c.key] : def?.defaults[c.key]
    if (typeof raw !== "string" || !raw) continue
    const s = scoreOf(raw, q, NAMING_KEYS.has(c.key) ? W_NAME : W_PROP)
    if (s > best) {
      best = s
      label = clip(raw)
    }
  }

  if (!best) return null
  return { id: n.id, label: label || detail, detail, type: "component", score: best }
}

/**
 * Every node whose words answer the query, best first, at most `limit` of them.
 *
 * Walked in document order so that equal scores come back in the order the
 * canvas stacks them — stable, and the same list twice for the same drawing.
 */
export function searchNodes(
  nodes: Record<string, SquigNode>,
  order: readonly string[],
  query: string,
  limit = 6
): NodeHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_QUERY) return []
  const hits: NodeHit[] = []
  for (const id of order) {
    const n = nodes[id]
    if (!n || n.locked) continue
    const hit = n.type === "text" ? textHit(n, q) : n.type === "component" ? componentHit(n, q) : null
    if (hit) hits.push(hit)
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
