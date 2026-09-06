import { openSync, type Font } from "fontkit"
import path from "node:path"
import type { CanvasDocument } from "./engine"
import type { TypeStyle, TextMeasurer } from "@/lib/canvas/text-metrics"
import { wrapText } from "@/lib/canvas/text-metrics"
import {
  textBlockHeight,
  textBoxPadding,
  textContentWidth,
} from "@/lib/sketch/text-layout"

const fonts = new Map<string, Font>()
function face(mode: CanvasDocument["look"]["font"], bold?: boolean) {
  const name =
    mode === "hand"
      ? "PatrickHand-Regular"
      : `${mode === "serif" ? "SourceSerif4" : "Geist"}-${bold ? "Bold" : "Regular"}`
  if (!fonts.has(name))
    fonts.set(
      name,
      openSync(
        path.join(process.cwd(), "lib/agent/fonts", `${name}.ttf`),
      ) as Font,
    )
  return fonts.get(name)!
}

/** Request-local measurement; simultaneous canvases never share a current font. */
export function textMeasurer(
  mode: CanvasDocument["look"]["font"],
): TextMeasurer {
  const widths = new Map<string, number>()
  return (text: string, style: TypeStyle) => {
    if (!text) return 0
    const key = `${!!style.bold}:${style.size}:${text}`
    const cached = widths.get(key)
    if (cached !== undefined) return cached
    const font = face(mode, style.bold)
    const width =
      (font.layout(text).positions.reduce((sum, p) => sum + p.xAdvance, 0) *
        style.size) /
      font.unitsPerEm
    if (widths.size >= 512) widths.clear()
    widths.set(key, width)
    return width
  }
}

export function measureDocumentText(
  document: CanvasDocument,
  nodeIds?: string[],
) {
  const measure = textMeasurer(document.look.font)
  return (nodeIds ?? document.order).flatMap((id) => {
    const n = document.nodes[id]
    if (n.type !== "text") return []
    const style = { size: n.fontSize, bold: n.bold, italic: n.italic }
    const availableWidth = textContentWidth(n.w, n.fontSize, n.boxed)
    const lines = n.fixedW
      ? wrapText(n.text, availableWidth, style, measure)
      : n.text.split("\n")
    const requiredWidth =
      Math.max(0, ...lines.map((line) => measure(line, style))) +
      2 * textBoxPadding(n.fontSize, !!n.boxed).x
    const requiredHeight = textBlockHeight(
      lines.length,
      n.fontSize,
      !!n.boxed,
    )
    const font = face(document.look.font, n.bold)
    const missingGlyphs = [
      ...new Set(
        [...n.text].filter(
          (c) =>
            !/\s/u.test(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)!),
        ),
      ),
    ].slice(0, 32)
    return [
      {
        id,
        lineCount: lines.length,
        requiredWidth,
        requiredHeight,
        overflowX: requiredWidth > n.w + 0.5,
        overflowY: requiredHeight > n.h + 0.5,
        missingGlyphs,
        ...(n.italic
          ? {
              warning:
                "Italic uses the regular face's advance widths; inspect the rendered slant visually.",
            }
          : {}),
      },
    ]
  })
}
