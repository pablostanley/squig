import { drawNodes, esc } from "@/lib/sketch/svg"
import { bgOf, paletteOf } from "@/lib/theme"
import { AgentError, type CanvasDocument } from "./engine"
import path from "node:path"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { textMeasurer } from "./text-metrics"

// More margin than the editor's export leaves: this picture is looked at on
// its own rather than pasted into something else.
const PAD = 32

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
  // The marks come from the same builder the editor's export uses, so a PNG an
  // agent looks at and a PNG a person saves are the same picture. The measurer
  // is what makes the line breaks here agree with measure_text.
  const drawn = drawNodes(nodes, document.look, {
    measureText: textMeasurer(document.look.font),
    pad: PAD,
  })
  // an empty canvas still renders, as a blank sheet at a plausible size
  const { body, x, y, w, h, paper } = drawn ?? {
    body: "",
    x: 0,
    y: 0,
    w: 800,
    h: 600,
    paper: bgOf(paletteOf(document.look.theme), document.look.paper),
  }
  const scale = Math.min(1, 2400 / w, 2400 / h)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(w * scale))}" height="${Math.max(1, Math.round(h * scale))}" viewBox="${x} ${y} ${w} ${h}"><title>${esc(variation?.title ?? document.fileName)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${paper}"/>${body}</svg>`,
    bounds: { x, y, w, h },
  }
}

// Local agents run from their own project directories. Source runs find fonts
// beside this module; Next's traced deployment still carries them under cwd.
const FONT_FILES = [
  "PatrickHand-Regular.ttf",
  "Geist-Regular.ttf",
  "Geist-Bold.ttf",
  "SourceSerif4-Regular.ttf",
  "SourceSerif4-Bold.ttf",
].map((file) => {
  const local = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts", file)
  return existsSync(local) ? local : path.join(process.cwd(), "lib/agent/fonts", file)
})

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

// resvg decodes PNG/JPEG/GIF itself. Normalize WebP before rendering so an
// accepted canvas image cannot silently disappear from the agent's preview.
export async function pngDocument(
  document: CanvasDocument,
): Promise<CanvasDocument> {
  const images = Object.values(document.nodes).filter(
    (n) => n.type === "image" && /^data:image\/webp[;,]/i.test(n.src),
  )
  if (!images.length) return document
  const { default: sharp } = await import("sharp")
  const nodes = { ...document.nodes }
  for (const node of images) {
    if (node.type !== "image") continue
    try {
      const data = Buffer.from(
        node.src.slice(node.src.indexOf(",") + 1),
        "base64",
      )
      const png = await sharp(data, { limitInputPixels: 16_000_000 })
        .png()
        .toBuffer()
      nodes[node.id] = {
        ...node,
        src: `data:image/png;base64,${png.toString("base64")}`,
      }
    } catch {
      throw new AgentError(
        400,
        `Image ${node.id} could not be rendered; use a valid raster image up to 16 million pixels.`,
      )
    }
  }
  return { ...document, nodes }
}
