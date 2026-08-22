// ---------------------------------------------------------------------------
// The small, browser-free half of image export.
//
// Keeping the SVG wrapper and its surface policy here makes the important
// alpha decision testable without a DOM, a canvas, or clipboard permission.
// ---------------------------------------------------------------------------

export type ExportSurface = "paper" | "transparent"

export interface ExportDrawing {
  /** every node as markup, in world coordinates, in draw order */
  body: string
  /** @font-face rules with their files inlined, or "" when there were none */
  css: string
  /** the world box the picture covers, padding included */
  x: number
  y: number
  w: number
  h: number
  /** the paper it prints on when the surface asks for it */
  paper: string
}

/** A selection pastes like an object; the whole canvas pastes like a sheet. */
export function copiedSurface(whole: boolean): ExportSurface {
  return whole ? "paper" : "transparent"
}

/** Wrap a drawing in a standalone SVG document ready to save or rasterise. */
export function svgDocument(
  d: ExportDrawing,
  outW: number,
  outH: number,
  surface: ExportSurface = "paper"
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${d.x} ${d.y} ${d.w} ${d.h}">` +
    (d.css ? `<defs><style type="text/css">${d.css}</style></defs>` : "") +
    (surface === "paper"
      ? `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="${d.paper}"/>`
      : "") +
    d.body +
    `</svg>`
  )
}
