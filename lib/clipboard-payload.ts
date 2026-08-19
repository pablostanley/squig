// ---------------------------------------------------------------------------
// What squig puts on the clipboard, and what it will take back off it.
//
// Two carriers go on every copy. `text/html` holds the real payload in a data
// attribute, because a browser hands HTML back untouched and nobody has to
// look at it. `text/plain` holds the words when there are any, so copying a
// label out of a wireframe and pasting it into a message does what you meant —
// and the payload when there aren't, so a paste still lands as layers even
// where the HTML got stripped on the way.
//
// Everything coming in is treated as a stranger: only known node types, only
// finite geometry, only `data:image/…` sources. The clipboard is one of the
// few places a document can arrive from somewhere that isn't this app.
//
// Kept free of the store and the DOM so it can be tested on its own.
// ---------------------------------------------------------------------------

import type { SquigNode, TextNode } from "./types"
import { normalizeCrop } from "./types"

const PAYLOAD_VERSION = 1
/** the attribute the HTML carrier hides the payload in */
const HTML_ATTR = "data-squig"

interface Payload {
  app: "squig"
  kind: "nodes"
  version: number
  nodes: SquigNode[]
}

export function encodeNodes(nodes: readonly SquigNode[]): string {
  const payload: Payload = { app: "squig", kind: "nodes", version: PAYLOAD_VERSION, nodes: [...nodes] }
  return JSON.stringify(payload)
}

/** The layers in a payload, or null for anything that isn't one. */
export function decodeNodes(text: string | null | undefined): SquigNode[] | null {
  if (!text) return null
  const trimmed = text.trim()
  // cheap gate first — most pastes are prose, and JSON.parse on a novel is not
  if (!trimmed.startsWith("{") || !trimmed.includes('"squig"')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const p = parsed as Partial<Payload> | null
  if (!p || p.app !== "squig" || p.kind !== "nodes" || !Array.isArray(p.nodes)) return null
  const clean = p.nodes.map(validNode).filter(Boolean) as SquigNode[]
  return clean.length ? clean : null
}

export function payloadHtml(json: string): string {
  return `<div ${HTML_ATTR}="${encodeURIComponent(json)}"></div>`
}

/**
 * Pull the payload back out of pasted HTML.
 *
 * Browsers rewrap what they hand over — Chrome prepends a `<meta>`, some add
 * fragment comments — but they leave attributes alone, so a match anywhere in
 * the string is the right one. `encodeURIComponent` escapes quotes, so the
 * value can't close the attribute early.
 */
export function payloadFromHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const m = new RegExp(`${HTML_ATTR}="([^"]*)"`).exec(html)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

/** The words in a selection, in document order — what `text/plain` carries. */
export function wordsOf(nodes: readonly SquigNode[]): string {
  return nodes
    .filter((n): n is TextNode => n.type === "text")
    .map((n) => n.text)
    .filter(Boolean)
    .join("\n")
}

// -- reading a stranger's nodes ---------------------------------------------

const NODE_TYPES = new Set(["component", "shape", "draw", "text", "arrow", "image"])
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const str = (v: unknown): v is string => typeof v === "string"

function validPoints(v: unknown): v is [number, number][] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((p) => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]))
  )
}

/**
 * A node we're willing to put on the canvas, or null.
 *
 * Geometry is the part that matters: one NaN through here lands in the
 * document, gets autosaved, and wedges the file across reloads — the same
 * reason `sanitize` exists in the store.
 */
export function validNode(v: unknown): SquigNode | null {
  const n = v as SquigNode | null
  if (!n || typeof n !== "object") return null
  if (!str(n.type) || !NODE_TYPES.has(n.type)) return null
  if (!num(n.x) || !num(n.y) || !num(n.w) || !num(n.h)) return null
  if (n.groupIds !== undefined && !(Array.isArray(n.groupIds) && n.groupIds.every(str))) return null

  switch (n.type) {
    case "component":
      if (!str(n.kind) || !n.props || typeof n.props !== "object") return null
      break
    case "shape":
      if (n.shape !== "rect" && n.shape !== "ellipse") return null
      break
    case "draw":
      if (!validPoints(n.points)) return null
      break
    case "arrow":
      if (!validPoints(n.points) || n.points.length !== 2) return null
      break
    case "text":
      if (!str(n.text) || !num(n.fontSize)) return null
      break
    case "image":
      // the only scheme this app ever writes, and the only one it will read:
      // a pasted document has no business pointing the canvas at a URL
      if (!str(n.src) || !/^data:image\//i.test(n.src)) return null
      // four numbers that divide the box — one NaN renders at infinity
      n.crop = normalizeCrop(n.crop)
      break
  }

  return {
    ...n,
    // both are replaced when the paste is placed, so a payload that forgot
    // them shouldn't be the thing that stops it
    id: str(n.id) ? n.id : "pasted",
    seed: num(n.seed) ? n.seed : 1,
    w: Math.max(0, n.w),
    h: Math.max(0, n.h),
  }
}
