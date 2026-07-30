"use client"

// ---------------------------------------------------------------------------
// Copy as PNG — the selection, rasterised on the spot and handed to the system
// clipboard. The one-keystroke way to get a sketch into a chat window.
//
// The picture is re-rendered from the same prims the canvas draws, into a
// standalone SVG document that is then painted onto a <canvas>. Standalone is
// the whole difficulty: an <img> loading an SVG gets none of the page around
// it, so two things the on-screen canvas takes for granted have to be packed
// into the file itself —
//
//   · colours, which live in CSS custom properties, are resolved to literal
//     hex against the current palette
//   · the hand-lettered font, which is a same-origin woff2, is fetched and
//     inlined as a base64 @font-face
//
// Miss either one and the PNG comes back black-on-nothing in Times New Roman.
// ---------------------------------------------------------------------------

import { mirrorGlyphs, primsToPaths } from "@/components/canvas/sketch"
import { INK } from "./sketch/kit"
import { nodePrims } from "./sketch/node-prims"
import { unionBounds } from "./selection"
import { useSquig } from "./store"
import { paletteOf, type Palette } from "./theme"
import type { SquigNode } from "./types"

/** breathing room around the art, in world units — rough strokes overshoot */
const PAD = 12
/** retina by default: a wireframe pasted into a doc gets read at 1×, not 2× */
const SCALE = 2
/** browsers refuse canvases past ~16k; stay well under and scale down instead */
const MAX_SIDE = 8192

export type CopyResult = "copied" | "downloaded" | "empty" | "failed"

export interface CopyOutcome {
  status: CopyResult
  /** nothing was selected, so the whole canvas went instead */
  whole: boolean
}

// -- the SVG document --------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** `var(--sq-ink)` → `#2438FF`. Anything else passes through untouched. */
function makeResolver(p: Palette): (paint: string) => string {
  const vars: Record<string, string> = {
    "--sq-bg": p.bg,
    "--sq-paper": p.paper,
    "--sq-ink": p.ink,
    "--sq-muted": p.muted,
    "--sq-faint": p.faint,
    "--sq-shade": p.shade,
    "--sq-shade-strong": p.shadeStrong,
    "--sq-grid": p.grid,
    "--sq-select": p.select,
  }
  return (paint) => paint.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => vars[name] ?? whole)
}

/**
 * One node, as SVG markup.
 *
 * Deliberately a mirror of what SketchPrims renders — same paths, same
 * attributes, same order. It is duplicated rather than run through
 * react-dom/server because pulling a server renderer into the client bundle to
 * print thirty lines of markup is a poor trade.
 */
function nodeMarkup(node: SquigNode, resolve: (paint: string) => string, font: string): string {
  const { paths, texts, crisp } = primsToPaths(nodePrims(node), node.seed)
  const out: string[] = []

  for (const p of paths) {
    out.push(
      `<path d="${esc(p.d)}" stroke="${resolve(p.stroke)}" stroke-width="${p.strokeWidth}" fill="${resolve(p.fill)}"` +
        `${p.dash ? ` stroke-dasharray="${p.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>`
    )
  }

  for (const c of crisp) {
    const paint = resolve(c.color)
    const bits = c.d
      .map(
        (d) =>
          `<path d="${esc(d)}" fill="${c.mode === "fill" ? paint : "none"}" stroke="${c.mode === "stroke" ? paint : "none"}"` +
          `${c.mode === "stroke" ? ` stroke-width="${c.strokeWidth}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("")
    out.push(`<g transform="${esc(c.transform)}">${bits}</g>`)
  }

  for (const t of texts) {
    const anchor = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start"
    // a flipped text layer turns its words over about their own anchor, and
    // borrows the renderer's transform rather than working it out again
    const mirror = mirrorGlyphs(t)
    out.push(
      `<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-family="${esc(font)}" font-weight="${t.bold ? 700 : 400}"` +
        `${t.italic ? ` font-style="italic"` : ""}${t.underline ? ` text-decoration="underline"` : ""}` +
        ` fill="${resolve(INK[t.color ?? "ink"])}" text-anchor="${anchor}"` +
        `${mirror ? ` transform="${esc(mirror)}"` : ""} xml:space="preserve">${esc(t.text)}</text>`
    )
  }

  return `<g transform="translate(${node.x} ${node.y})">${out.join("")}</g>`
}

// -- fonts -------------------------------------------------------------------

/** The font stack the canvas is actually drawing with, fully resolved. */
function canvasFontStack(): string {
  const probe = document.createElement("span")
  probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;font-family:var(--sq-font)"
  document.body.appendChild(probe)
  const family = getComputedStyle(probe).fontFamily
  probe.remove()
  return family || "sans-serif"
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "")

function isFontFace(rule: CSSRule): rule is CSSFontFaceRule {
  return typeof CSSFontFaceRule !== "undefined" && rule instanceof CSSFontFaceRule
}

const MIME: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  // chunked, because spreading a 40k-byte array into apply() blows the stack
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  const ext = /\.(\w+)(?:[?#]|$)/.exec(url)?.[1]?.toLowerCase() ?? ""
  return `data:${MIME[ext] ?? "application/octet-stream"};base64,${btoa(binary)}`
}

/**
 * Every @font-face in the page that the given stack names, rewritten with its
 * file inlined. next/font hashes its family names per build, so the match is
 * made against the resolved stack rather than a name written down here.
 */
async function buildFontFaceCss(stack: string): Promise<string> {
  const wanted = new Set(stack.split(",").map((f) => unquote(f).toLowerCase()))
  const out: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // a cross-origin stylesheet won't open — nothing we can inline from it
      continue
    }
    for (const rule of Array.from(rules)) {
      if (!isFontFace(rule)) continue
      const family = unquote(rule.style.getPropertyValue("font-family"))
      if (!wanted.has(family.toLowerCase())) continue
      const src = rule.style.getPropertyValue("src")
      // local() fallbacks (next/font's metric-adjusted stand-in) have no file
      const href = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(src)?.[1]
      if (!href) continue
      try {
        const data = await fetchAsDataUri(new URL(href, sheet.href ?? document.baseURI).href)
        if (!data) continue
        const weight = rule.style.getPropertyValue("font-weight") || "400"
        const style = rule.style.getPropertyValue("font-style") || "normal"
        out.push(
          `@font-face{font-family:'${family}';src:url(${data});font-weight:${weight};font-style:${style};font-display:block;}`
        )
      } catch {
        // one unreachable file shouldn't cost the whole export
      }
    }
  }
  return out.join("")
}

/** Fonts don't change between exports; fetch and encode each stack once. */
const fontCache = new Map<string, Promise<string>>()

function fontFaceCss(stack: string): Promise<string> {
  const hit = fontCache.get(stack)
  if (hit) return hit
  const pending = buildFontFaceCss(stack).catch(() => "")
  fontCache.set(stack, pending)
  return pending
}

// -- rasterising -------------------------------------------------------------

/**
 * A data URI rather than a blob: URL — an SVG image drawn onto a canvas has to
 * be origin-clean or `toBlob` throws, and a data URI is unambiguously so on
 * every browser.
 */
function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("the sketch wouldn't rasterise"))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

async function rasterize(svg: string, w: number, h: number): Promise<Blob> {
  const img = await loadImage(svg)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the canvas gave back nothing"))), "image/png")
  })
}

// -- the export --------------------------------------------------------------

/** What ⌘⇧C acts on: the selection, or the whole canvas when nothing is picked. */
export function pngTargets(): { nodes: SquigNode[]; whole: boolean } {
  const { nodes, order, selection } = useSquig.getState()
  const picked = order.filter((id) => selection.includes(id)).map((id) => nodes[id]).filter(Boolean)
  if (picked.length) return { nodes: picked, whole: false }
  return { nodes: order.map((id) => nodes[id]).filter(Boolean), whole: true }
}

/** Render a set of nodes to a PNG blob, on the current theme's paper. */
export async function renderPng(list: SquigNode[]): Promise<Blob> {
  const b = unionBounds(list)
  if (!b) throw new Error("nothing to draw")

  const s = useSquig.getState()
  const palette = paletteOf(s.theme)
  const resolve = makeResolver(palette)
  const font = canvasFontStack()
  const css = await fontFaceCss(font)

  const x = b.x - PAD
  const y = b.y - PAD
  const w = Math.max(b.w + PAD * 2, 1)
  const h = Math.max(b.h + PAD * 2, 1)
  // a wall-sized template still has to fit in a canvas
  const scale = Math.min(SCALE, MAX_SIDE / w, MAX_SIDE / h)
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))

  const body = list.map((n) => nodeMarkup(n, resolve, font)).join("")
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${x} ${y} ${w} ${h}">` +
    (css ? `<defs><style type="text/css">${css}</style></defs>` : "") +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${palette.bg}"/>` +
    body +
    `</svg>`

  return rasterize(svg, outW, outH)
}

function downloadPng(blob: Blob) {
  const name = useSquig.getState().fileName.replace(/[^\w -]+/g, "").trim() || "squig"
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.png`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * ⌘⇧C. Not async at the top on purpose: Safari only honours a clipboard write
 * that was set up inside the gesture that asked for it, so the ClipboardItem is
 * constructed synchronously around a promise of the blob rather than after
 * awaiting one. A browser that won't take an image lands on a download instead
 * — the sketch still leaves the app, just through the other door.
 */
export function copySelectionAsPng(): Promise<CopyOutcome> {
  const { nodes, whole } = pngTargets()
  if (!nodes.length) return Promise.resolve({ status: "empty", whole })

  const blob = renderPng(nodes)
  // the failure is handled below, but only after the clipboard has had its go —
  // claim it now so a rejection can't be reported as unhandled in between
  blob.catch(() => {})
  const fallback = (): Promise<CopyOutcome> =>
    blob
      .then((b) => {
        downloadPng(b)
        return { status: "downloaded" as const, whole }
      })
      .catch(() => ({ status: "failed" as const, whole }))

  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return fallback()

  try {
    const item = new ClipboardItem({ "image/png": blob })
    return navigator.clipboard
      .write([item])
      .then(() => ({ status: "copied" as const, whole }))
      .catch(fallback)
  } catch {
    return fallback()
  }
}

/** One wording for the flash, wherever the command was run from. */
export function copyNotice({ status, whole }: CopyOutcome): string {
  switch (status) {
    case "copied":
      return whole ? "copied the whole canvas as a PNG" : "copied as a PNG"
    case "downloaded":
      return "this browser won't take images — saved a PNG instead"
    case "empty":
      return "nothing on the canvas to copy"
    case "failed":
      return "couldn't make that PNG"
  }
}

/** ⌘⇧C, wired to the flash — what every entry point actually calls. */
export async function copyAsPngWithNotice(): Promise<void> {
  const s = useSquig.getState()
  const outcome = await copySelectionAsPng()
  s.setNotice(copyNotice(outcome))
}
