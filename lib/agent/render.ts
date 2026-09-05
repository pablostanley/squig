import { primsToPaths, mirrorGlyphs } from "@/lib/sketch/paths"
import { nodePrims } from "@/lib/sketch/node-prims"
import { INK } from "@/lib/sketch/kit"
import { paletteOf, bgOf } from "@/lib/theme"
import { cropOf } from "@/lib/types"
import { nodeVisualBounds } from "@/lib/canvas/line-routing"
import { AgentError, type CanvasDocument } from "./engine"
import path from "node:path"
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  )
export function renderSvg(document: CanvasDocument, variationId?: string) {
  const variation = variationId
    ? document.variations.find((v) => v.id === variationId)
    : undefined
  if (variationId && !variation)
    throw new AgentError(404, "Variation not found")
  const ids = new Set(variation?.nodeIds ?? document.order)
  const nodes = document.order
    .filter((id) => ids.has(id))
    .map((id) => document.nodes[id])
  const boxes = nodes.map(nodeVisualBounds)
  const x = boxes.length ? Math.min(...boxes.map((b) => b.x)) - 32 : 0,
    y = boxes.length ? Math.min(...boxes.map((b) => b.y)) - 32 : 0
  const w = boxes.length
      ? Math.max(64, Math.max(...boxes.map((b) => b.x + b.w)) - x + 32)
      : 800,
    h = boxes.length
      ? Math.max(64, Math.max(...boxes.map((b) => b.y + b.h)) - y + 32)
      : 600
  const palette = paletteOf(document.look.theme)
  const colors: Record<string, string> = {
    "--sq-ink": palette.ink,
    "--sq-muted": palette.muted,
    "--sq-faint": palette.faint,
    "--sq-paper": palette.paper,
    "--sq-shade": palette.shade,
    "--sq-shade-strong": palette.shadeStrong,
  }
  const color = (v: string) =>
    v.replace(/var\((--[a-z-]+)\)/g, (_, key) => colors[key] ?? palette.ink)
  const family =
    document.look.font === "serif"
      ? '"Source Serif 4", Georgia, serif'
      : document.look.font === "hand"
        ? '"Patrick Hand", "Comic Sans MS", cursive'
        : "Geist, Arial, sans-serif"
  const body = nodes
    .map((node) => {
      const { paths, texts, crisp } = primsToPaths(nodePrims(node), node.seed)
      let content = paths
        .map(
          (p) =>
            `<path d="${escape(p.d)}" stroke="${escape(color(p.stroke))}" stroke-width="${p.strokeWidth}" fill="${escape(color(p.fill))}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("")
      content += crisp
        .map(
          (c) =>
            `<g transform="${escape(c.transform)}">${c.d.map((d) => `<path d="${escape(d)}" fill="${c.mode === "fill" ? color(c.color) : "none"}" stroke="${c.mode === "stroke" ? color(c.color) : "none"}" stroke-width="${c.strokeWidth}"/>`).join("")}</g>`,
        )
        .join("")
      content += texts
        .map(
          (t) =>
            `<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-family="${escape(family)}" font-weight="${t.bold ? 700 : 400}" font-style="${t.italic ? "italic" : "normal"}" text-decoration="${t.underline ? "underline" : "none"}" fill="${color(INK[t.color ?? "ink"])}" text-anchor="${t.align === "center" ? "middle" : t.align === "right" ? "end" : "start"}"${mirrorGlyphs(t) ? ` transform="${mirrorGlyphs(t)}"` : ""}>${escape(t.text)}</text>`,
        )
        .join("")
      if (node.type === "image") {
        const crop = cropOf(node),
          imageW = node.w / crop.w,
          imageH = node.h / crop.h
        content =
          `<svg width="${node.w}" height="${node.h}" overflow="hidden"><g transform="translate(${node.flipX ? node.w : 0} ${node.flipY ? node.h : 0}) scale(${node.flipX ? -1 : 1} ${node.flipY ? -1 : 1})"><image href="${escape(node.src)}" x="${-crop.x * imageW}" y="${-crop.y * imageH}" width="${imageW}" height="${imageH}" preserveAspectRatio="none"/></g></svg>` +
          content
      }
      return `<g transform="translate(${node.x} ${node.y})">${content}</g>`
    })
    .join("")
  const scale = Math.min(1, 2400 / w, 2400 / h)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(w * scale))}" height="${Math.max(1, Math.round(h * scale))}" viewBox="${x} ${y} ${w} ${h}"><title>${escape(variation?.title ?? document.fileName)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bgOf(palette, document.look.paper)}"/>${body}</svg>`,
    bounds: { x, y, w, h },
  }
}

// Vercel functions have no system fonts, so a PNG rasterised there renders
// every glyph as a tofu box. Ship the editor's own faces next to the code and
// hand resvg their absolute paths; resolving from cwd is what lets Next's file
// tracer see them and bundle them into the function.
const FONT_FILES = [
  "PatrickHand-Regular.ttf",
  "Geist-Regular.ttf",
  "Geist-Bold.ttf",
  "SourceSerif4-Regular.ttf",
  "SourceSerif4-Bold.ttf",
].map((file) => path.join(process.cwd(), "lib/agent/fonts", file))

export async function renderPng(svg: string): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js")
  // renderSvg already caps the SVG at 2400px on its long edge, so rasterise
  // it at its own size rather than scaling twice.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      loadSystemFonts: false,
      fontFiles: FONT_FILES,
      defaultFontFamily: "Patrick Hand",
    },
  })
  return Buffer.from(resvg.render().asPng())
}
