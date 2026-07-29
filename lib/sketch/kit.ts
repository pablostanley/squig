// ---------------------------------------------------------------------------
// Sketch kit — the primitive DSL every component renders into.
// A component's render() returns Prim[]; the canvas draws them with rough.js.
// Break-apart works by converting these same prims into real canvas nodes.
// ---------------------------------------------------------------------------

export type InkColor = "ink" | "muted" | "faint" | "paper" | "accent"

/**
 * Colours resolve through CSS custom properties, so switching theme restyles
 * every node without regenerating a single path. See lib/theme.ts.
 */
export const INK: Record<InkColor, string> = {
  ink: "var(--sq-ink)",
  muted: "var(--sq-muted)",
  faint: "var(--sq-faint)",
  paper: "var(--sq-paper)",
  accent: "var(--sq-ink)",
}

/** Printed textures, in place of a flat tint. */
export type Texture = "halftone" | "checker" | "dither" | "diagonal" | "grid" | "cross"

export interface PrimOpts {
  stroke?: InkColor
  strokeWidth?: number
  /**
   * "hachure" is the emphasis fill — it renders as a printed texture.
   * "solid" is genuinely opaque (menus, popovers, knobs).
   */
  fill?: "none" | "hachure" | "solid"
  fillColor?: InkColor
  /** which texture an emphasis fill uses; defaults to halftone */
  texture?: Texture
  roughness?: number
  dashed?: boolean
  /** corner radius — rects only; `rect(x, y, w, h, { r: 6 })` */
  r?: number
  /** offset block shadow behind the shape, early-desktop style */
  shadow?: boolean
}

export type Prim =
  | ({ t: "rect"; x: number; y: number; w: number; h: number; r?: number } & { o?: PrimOpts })
  | ({ t: "ellipse"; x: number; y: number; w: number; h: number } & { o?: PrimOpts })
  | ({ t: "line"; x1: number; y1: number; x2: number; y2: number } & { o?: PrimOpts })
  | ({ t: "poly"; pts: [number, number][]; close?: boolean } & { o?: PrimOpts })
  | {
      t: "text"
      x: number
      y: number // baseline
      text: string
      size: number
      align?: "left" | "center" | "right"
      color?: InkColor
      bold?: boolean
      italic?: boolean
      underline?: boolean
      maxW?: number
    }
  /**
   * Raw SVG path data in a square viewBox, drawn crisp (not roughened) —
   * icons read better sharp, and it keeps big templates fast.
   * (x, y) is the top-left of the size×size box the icon is scaled into.
   */
  | ({
      t: "path"
      d: string[]
      x: number
      y: number
      size: number
      vb: number
      mode: "fill" | "stroke"
      /** icon name, so break-apart can rebuild this as a real Icon component */
      name?: string
    } & { o?: PrimOpts })

// -- constructors -----------------------------------------------------------

export const rect = (x: number, y: number, w: number, h: number, o?: PrimOpts): Prim => ({ t: "rect", x, y, w, h, o })
/**
 * A pill: a rectangle with fully rounded ends. Chips, badges, tags and tabs
 * are all this shape — never an ellipse, which bows the top and bottom edges
 * inward and squeezes the label.
 */
export const pill = (x: number, y: number, w: number, h: number, o?: PrimOpts): Prim => ({
  t: "rect",
  x,
  y,
  w,
  h,
  r: Math.min(w, h) / 2,
  o,
})
export const ellipse = (x: number, y: number, w: number, h: number, o?: PrimOpts): Prim => ({ t: "ellipse", x, y, w, h, o })
export const line = (x1: number, y1: number, x2: number, y2: number, o?: PrimOpts): Prim => ({ t: "line", x1, y1, x2, y2, o })
export const poly = (pts: [number, number][], close?: boolean, o?: PrimOpts): Prim => ({ t: "poly", pts, close, o })
export const text = (
  x: number,
  y: number,
  content: string,
  size: number,
  extra?: Partial<Extract<Prim, { t: "text" }>>
): Prim => ({ t: "text", x, y, text: content, size, ...extra })

/** Translate a batch of prims — lets template blocks compose smaller components. */
export function place(prims: Prim[], dx: number, dy: number): Prim[] {
  return prims.map((p) => {
    switch (p.t) {
      case "rect":
      case "ellipse":
      case "text":
      case "path":
        return { ...p, x: p.x + dx, y: p.y + dy }
      case "line":
        return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
      case "poly":
        return { ...p, pts: p.pts.map(([px, py]) => [px + dx, py + dy] as [number, number]) }
    }
  })
}

/**
 * Mirror a batch of prims inside a w×h box.
 *
 * Layout flips; glyphs don't. Mirroring the whole node with `scale(-1, 1)`
 * would be one line, but it would also print every label backwards, and a
 * wireframe with backwards labels reads as a bug rather than as a flip. So the
 * geometry moves and the text stays upright, swapping its alignment instead.
 */
export function mirrorPrims(prims: Prim[], w: number, h: number, fx: boolean, fy: boolean): Prim[] {
  if (!fx && !fy) return prims
  const mx = (x: number) => (fx ? w - x : x)
  const my = (y: number) => (fy ? h - y : y)
  return prims.map((p): Prim => {
    switch (p.t) {
      case "rect":
      case "ellipse":
        return { ...p, x: fx ? w - p.x - p.w : p.x, y: fy ? h - p.y - p.h : p.y }
      case "path":
        return { ...p, x: fx ? w - p.x - p.size : p.x, y: fy ? h - p.y - p.size : p.y }
      case "line":
        return { ...p, x1: mx(p.x1), y1: my(p.y1), x2: mx(p.x2), y2: my(p.y2) }
      case "poly":
        return { ...p, pts: p.pts.map(([px, py]) => [mx(px), my(py)] as [number, number]) }
      case "text": {
        // a left-anchored run grows rightward; mirrored, it has to end where it started
        const align = fx
          ? p.align === "center"
            ? "center"
            : p.align === "right"
              ? "left"
              : "right"
          : p.align
        // y is a baseline: the box around it sits roughly [y - 0.8em, y + 0.2em]
        return { ...p, x: mx(p.x), y: fy ? h - p.y + p.size * 0.6 : p.y, align }
      }
    }
  })
}

/** Approx text width in px for the sketch font (Patrick Hand ≈ 0.46em avg). */
export function textWidth(s: string, size: number): number {
  return s.length * size * 0.46
}

export function truncate(s: string, size: number, maxW: number): string {
  if (textWidth(s, size) <= maxW) return s
  const chars = Math.max(1, Math.floor(maxW / (size * 0.46)) - 1)
  return s.slice(0, chars) + "…"
}

/**
 * A few squiggly "lorem" lines — the classic wireframe placeholder text.
 * Rendered as slightly wavy horizontal lines.
 */
export function loremLines(x: number, y: number, w: number, count: number, gap = 12): Prim[] {
  const prims: Prim[] = []
  for (let i = 0; i < count; i++) {
    const lw = i === count - 1 ? w * 0.6 : w * (0.85 + (i % 3) * 0.05)
    prims.push(line(x, y + i * gap, x + lw, y + i * gap, { stroke: "muted", strokeWidth: 1.15, roughness: 0.7 }))
  }
  return prims
}

// -- icons ------------------------------------------------------------------
// Phosphor-backed; see ./icons for the name list and aliases.

export { icon, ICON_NAMES, resolveIconName, type IconName } from "./icons"
