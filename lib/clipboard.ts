"use client"

// ---------------------------------------------------------------------------
// The system clipboard.
//
// squig keeps its own private clipboard for ⌘C/⌘V inside one canvas, but that
// stops at the tab. This is the other half: layers written out in a form a
// second squig tab can read back, and everything else the world might hand us
// — a screenshot, a logo, a paragraph — turned into something on the paper.
//
// The payload's own format, and the vetting every incoming node goes through,
// live next door in clipboard-payload.
// ---------------------------------------------------------------------------

import { nanoid } from "nanoid"

import { decodeNodes, encodeNodes, payloadFromHtml, payloadHtml, wordsOf } from "./clipboard-payload"
import { useSquig } from "./store"
import { measureTextWidth } from "./canvas/text-metrics"
import { fitTextBox } from "./canvas/text-reflow"
import { screenToWorld, type ImageNode, type SquigNode, type TextNode } from "./types"

// -- copying out ------------------------------------------------------------

/** Put a selection on the clipboard, both ways round. */
export function writeNodes(dt: DataTransfer, nodes: readonly SquigNode[]): void {
  const json = encodeNodes(nodes)
  dt.setData("text/html", payloadHtml(json))
  dt.setData("text/plain", wordsOf(nodes) || json)
}

/**
 * Copy from a click rather than a keystroke — the palette and the menu.
 *
 * There is no copy event to hang this on: the palette's own input has the
 * focus by then, and a copy aimed at a text field is that field's business.
 * So the same two carriers go on through the async clipboard instead, and
 * squig's private one is filled either way, so ⇧⌘V still has something to put
 * back even where the browser refuses the write.
 */
export function copySelection(): void {
  const s = useSquig.getState()
  const sel = s.order.filter((id) => s.selection.includes(id)).map((id) => s.nodes[id]).filter(Boolean)
  if (!sel.length) return
  s.copySelected()
  const json = encodeNodes(sel)
  try {
    void navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([payloadHtml(json)], { type: "text/html" }),
        "text/plain": new Blob([wordsOf(sel) || json], { type: "text/plain" }),
      }),
    ])
  } catch {
    // squig's own clipboard already has it; the system one can sit this out
  }
}

/** Cut from a click — the same copy, and then the layers go. */
export function cutSelection(): void {
  copySelection()
  useSquig.getState().deleteSelected()
}

// -- pictures ---------------------------------------------------------------

/**
 * How big a pasted picture is allowed to be once it's in the document.
 *
 * Documents live in localStorage, which is a handful of megabytes for the
 * whole drawer — and a full-quota save doesn't fail quietly, it starts
 * evicting other files to make room (see saveFile). So a screenshot gets
 * re-encoded down before it's ever a node, and the budget is set by how many
 * of them one document should be able to hold rather than by how good any one
 * of them could look: ~10 at a few hundred KB each, which is more reference
 * than a wireframe has ever needed.
 */
const MAX_EDGE = 1280
/** past this, re-encode rather than keep the original bytes */
const KEEP_ORIGINAL_BYTES = 120_000
/** the ceiling a re-encode aims to come in under, in data-URL characters */
const MAX_STORED = 400_000

/**
 * Quality then scale, tried in order.
 *
 * Quality first because it's free — a screenshot at 0.7 is indistinguishable
 * at wireframe size. Scale only when a picture is genuinely enormous, and only
 * as far as the point where it stops being worth pasting at all.
 */
const ATTEMPTS: { scale: number; quality: number }[] = [
  { scale: 1, quality: 0.85 },
  { scale: 1, quality: 0.7 },
  { scale: 0.75, quality: 0.7 },
  { scale: 0.5, quality: 0.65 },
  { scale: 0.35, quality: 0.6 },
]

/** How wide a picture lands on the canvas — big enough to see, small enough to move. */
const PLACED_EDGE = 420

let webpOk: boolean | null = null

/** Does this browser's canvas encode WebP? Asked once, answered forever. */
function supportsWebp(): boolean {
  if (webpOk === null) {
    try {
      const c = document.createElement("canvas")
      c.width = 1
      c.height = 1
      webpOk = c.toDataURL("image/webp").startsWith("data:image/webp")
    } catch {
      webpOk = false
    }
  }
  return webpOk
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image failed to load"))
    img.src = src
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error("could not read the file"))
    r.readAsDataURL(blob)
  })
}

/**
 * Redraw a picture small enough to keep, and hand back a data URL.
 *
 * WebP where there is one — it holds transparency and beats both JPEG and PNG
 * on a screenshot. Where there isn't, a photo falls back to JPEG and anything
 * that might have an alpha channel stays PNG, which the size loop then has to
 * shrink its way out of instead.
 */
function reencode(img: HTMLImageElement, nw: number, nh: number, sourceType: string): string | null {
  const type = supportsWebp() ? "image/webp" : sourceType === "image/jpeg" ? "image/jpeg" : "image/png"
  const base = Math.min(1, MAX_EDGE / Math.max(nw, nh))
  let last: string | null = null

  for (const attempt of ATTEMPTS) {
    const k = base * attempt.scale
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(nw * k))
    canvas.height = Math.max(1, Math.round(nh * k))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    // JPEG has no alpha, and an unpainted canvas behind a transparent PNG
    // comes out black rather than absent
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    try {
      last = canvas.toDataURL(type, attempt.quality)
    } catch {
      return null
    }
    if (last.length <= MAX_STORED) return last
  }
  // even the smallest attempt is over: take it anyway rather than refusing the
  // paste. One oversized picture is a document that saves slowly, not a lost one
  return last
}

/** Turn a picture off the clipboard into a node, or null if it isn't one. */
export async function imageNodeFrom(blob: Blob, name?: string): Promise<ImageNode | null> {
  if (!blob.type.startsWith("image/")) return null
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height
    if (!nw || !nh) return null

    // small enough already: keep the original bytes rather than re-encoding
    // them. That's what keeps a crisp UI screenshot crisp — and an animated
    // GIF animated, since a redraw would flatten it to its first frame
    const asIs = blob.size <= KEEP_ORIGINAL_BYTES && Math.max(nw, nh) <= MAX_EDGE
    const src = asIs ? await blobToDataUrl(blob) : reencode(img, nw, nh, blob.type)
    if (!src) return null

    const k = Math.min(1, PLACED_EDGE / Math.max(nw, nh))
    return {
      id: nanoid(8),
      type: "image",
      src,
      naturalW: nw,
      naturalH: nh,
      name,
      x: 0,
      y: 0,
      w: Math.round(nw * k),
      h: Math.round(nh * k),
      seed: Math.floor(Math.random() * 2 ** 31),
    }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

// -- words ------------------------------------------------------------------

/** The size pasted words land at — the same one the text tool starts from. */
const PASTED_FONT_SIZE = 18
/** How wide a pasted run is allowed to run before it's broken up. */
const PASTED_WIDTH = 420

/**
 * Break a pasted line to a readable width.
 *
 * squig text doesn't wrap — a line ends where you pressed Return — so this is
 * not a layout rule, it's a one-time decision about where the returns go. A
 * paragraph off a web page arrives as a single line, and a single line is
 * three thousand units wide and no use to anybody.
 */
function wrap(line: string, style: { size: number }): string[] {
  if (measureTextWidth(line, style) <= PASTED_WIDTH) return [line]
  const out: string[] = []
  let current = ""
  for (const word of line.split(/(?<=\s)/)) {
    const next = current + word
    if (current && measureTextWidth(next.trimEnd(), style) > PASTED_WIDTH) {
      out.push(current.trimEnd())
      current = word.trimStart()
    } else {
      current = next
    }
  }
  if (current.trimEnd()) out.push(current.trimEnd())
  return out.length ? out : [line]
}

function textNodeFrom(text: string, at: [number, number]): TextNode | null {
  // a clipboard full of newlines and nothing else is not a paste worth making
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\s+$/, "")
  if (!normalized.trim()) return null
  const cleaned = normalized
    .split("\n")
    .flatMap((line) => wrap(line, { size: PASTED_FONT_SIZE }))
    .join("\n")
  const base: TextNode = {
    id: nanoid(8),
    type: "text",
    text: "",
    fontSize: PASTED_FONT_SIZE,
    x: at[0],
    y: at[1],
    w: 0,
    h: 0,
    seed: Math.floor(Math.random() * 2 ** 31),
  }
  return { ...base, ...fitTextBox(base, cleaned) }
}

// -- putting it down --------------------------------------------------------

/** Where a paste lands when the pointer has never been over the canvas. */
function viewportCentre(): [number, number] {
  const v = useSquig.getState().viewport
  return screenToWorld(v, window.innerWidth / 2, window.innerHeight / 2)
}

/** Stagger, so pasting four pictures at once doesn't stack them into one. */
const CASCADE = 24

interface Incoming {
  html?: string | null
  text?: string | null
  images: Blob[]
}

/**
 * Everything a paste could be, in the order it should be tried.
 *
 * Layers first: a squig payload arrives as text, so reading the words before
 * looking for the payload would turn every cross-tab paste into a paragraph of
 * JSON. Pictures next, then whatever text is left over.
 *
 * `at` is the top-left corner the paste lands on — the same convention ⌘V has
 * always had here. `inPlace` ignores it and puts the layers back at the
 * coordinates they were copied from.
 */
async function place(c: Incoming, at?: [number, number], inPlace = false): Promise<boolean> {
  const s = useSquig.getState()

  const nodes = decodeNodes(payloadFromHtml(c.html)) ?? decodeNodes(c.text)
  if (nodes) {
    const corner: [number, number] | undefined = inPlace
      ? [Math.min(...nodes.map((n) => n.x)), Math.min(...nodes.map((n) => n.y))]
      : at
    s.pasteNodes(nodes, corner)
    return true
  }

  if (c.images.length) {
    const made: ImageNode[] = []
    for (const blob of c.images) {
      const node = await imageNodeFrom(blob, blob instanceof File ? blob.name : undefined)
      if (node) made.push(node)
    }
    // a picture that won't decode leaves the canvas exactly as it was, so the
    // paste would otherwise read as a keystroke that did nothing
    if (!made.length) {
      s.setNotice(c.images.length > 1 ? "couldn't read those pictures" : "couldn't read that picture")
      return false
    }
    // the pointer may well have moved while those were decoding, so the
    // position captured when the paste began is the one that counts. With no
    // pointer at all we're aiming at the middle of the view, and "top-left
    // there" would hang the picture off the corner — centre it instead
    const [px, py] = at ?? viewportCentre()
    const [ox, oy] = at ? [px, py] : [px - made[0].w / 2, py - made[0].h / 2]
    made.forEach((n, i) => {
      n.x = Math.round(ox + i * CASCADE)
      n.y = Math.round(oy + i * CASCADE)
    })
    s.addNodes(made)
    return true
  }

  if (c.text) {
    const node = textNodeFrom(c.text, at ?? viewportCentre())
    if (node) {
      s.addNodes([node])
      return true
    }
  }

  return false
}

/** Pictures on a paste or a drop, in the order the clipboard listed them. */
function imagesIn(dt: DataTransfer): Blob[] {
  const out: Blob[] = []
  for (const item of dt.items) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file && file.type.startsWith("image/")) out.push(file)
  }
  return out
}

/** Handle a real paste event. Returns whether anything landed. */
export function pasteFrom(dt: DataTransfer, at?: [number, number]): Promise<boolean> {
  // everything comes off the DataTransfer now: it is only alive for this turn
  // of the event loop, and placing a picture takes several
  return place({ html: dt.getData("text/html"), text: dt.getData("text/plain"), images: imagesIn(dt) }, at)
}

/**
 * How long to wait for a browser to hand over the clipboard before giving up
 * on it. Some refuse the read outright, which is fine — and some never answer
 * at all, which would leave the menu item quietly doing nothing for ever.
 */
const SYSTEM_READ_TIMEOUT = 1200

/**
 * Paste without a paste event — the command palette and the context menu.
 *
 * Reading the clipboard from a click means asking the browser for it, which
 * some will refuse and others will prompt about. Either way there's still a
 * private clipboard underneath, so the menu item does something whenever squig
 * itself has something to give. Whichever route gets there first wins; the
 * other one stands down rather than pasting twice.
 */
export async function pasteFromSystem(at?: [number, number], inPlace = false): Promise<void> {
  let settled = false
  const ownClipboard = () => {
    if (settled) return
    settled = true
    useSquig.getState().pasteClipboard(at)
  }

  const giveUp = setTimeout(ownClipboard, SYSTEM_READ_TIMEOUT)
  try {
    const items = await navigator.clipboard.read()
    if (settled) return
    settled = true
    const c: Incoming = { images: [] }
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"))
      if (imageType) {
        c.images.push(await item.getType(imageType))
        continue
      }
      if (!c.html && item.types.includes("text/html")) c.html = await (await item.getType("text/html")).text()
      if (!c.text && item.types.includes("text/plain")) c.text = await (await item.getType("text/plain")).text()
    }
    // nothing on it we could use — squig's own clipboard is still an answer
    if (!(await place(c, at, inPlace))) useSquig.getState().pasteClipboard(at)
  } catch {
    ownClipboard()
  } finally {
    clearTimeout(giveUp)
  }
}
