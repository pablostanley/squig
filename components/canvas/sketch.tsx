"use client"

// ---------------------------------------------------------------------------
// Sketch renderers — turn prims / nodes into SVG paths.
//
// The look is early-web risograph: one saturated ink on warm paper, confident
// closed lines, and flat shaded fills — two tones, no patterns — carrying the
// printed feel. Irregularity is deliberately small — a line should read as
// drawn, not as a napkin, and corners must actually meet. Icons stay crisp.
// ---------------------------------------------------------------------------

import { memo, useMemo } from "react"
import rough from "roughjs"
import type { Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import { INK, SHADE, mirrorPrims, type InkColor, type Prim, type PrimOpts } from "@/lib/sketch/kit"
import type { SquigNode } from "@/lib/types"
import { renderComponent } from "@/lib/library/registry"

const gen: RoughGenerator = rough.generator()

/**
 * House defaults.
 *
 * The hand is deliberately restrained: enough irregularity that a line reads
 * as drawn rather than generated, but not so much that corners fall open.
 * `preserveVertices` pins every endpoint to its exact coordinate, so closed
 * shapes actually close — the wobble lives in the middle of each segment.
 */
const HAND = {
  roughness: 0.25,
  bowing: 0.35,
  strokeWidth: 1.4,
  /** default corner rounding for rects that don't ask for one */
  radius: 3,
}

/** How far the early-desktop block shadow sits behind a surface. */
const SHADOW_OFFSET = 4

/**
 * A shaded fill prints as one of two flat tones — never at full ink strength.
 * Defs say `fillColor: "ink"` to mean "this surface is emphasised", but a
 * full-strength fill swallows any label sitting on it, so emphasis reads
 * through tone and the text keeps the darkest ink to itself.
 *
 * Two shades is the whole vocabulary: `shade` for inert areas (image
 * placeholders, tracks, empty states, alternating rows) and `shadeStrong` for
 * the one thing on a surface that should come forward (primary button,
 * selected row, chart bars).
 */
const SHADE_FOR: Partial<Record<InkColor, keyof typeof SHADE>> = {
  ink: "shadeStrong",
  accent: "shadeStrong",
  muted: "shadeStrong",
  faint: "shade",
}

/**
 * `solid` keeps the literal colour — it exists for genuinely opaque marks
 * (menu panels on paper, a toggle knob, a status dot) where a tint would
 * either let the canvas show through or vanish at small sizes. `paper` is
 * always literal for the same reason: it is there to occlude, not to tint.
 */
function fillPaint(o: PrimOpts): string {
  const tone: InkColor = o.fillColor ?? "faint"
  if (o.fill === "solid" || tone === "paper") return INK[tone]
  return SHADE[SHADE_FOR[tone] ?? "shade"]
}

/**
 * One pen draws the whole wireframe.
 *
 * Every line prints in the same ink — a divider is not a paler blue than the
 * border above it, it is the same pen pressed lighter. So `stroke` no longer
 * picks a colour; it picks how hard the pen presses, and the tone names it
 * inherited now read as weights. Anything that needs to recede further than
 * a hairline should be carrying a shaded fill instead of a paler line.
 */
const PEN: Record<InkColor, number> = {
  ink: 1,
  accent: 1,
  muted: 0.8,
  faint: 0.62,
  paper: 1,
}

function primOptions(p: Prim, seed: number): Options {
  const o = "o" in p ? p.o : undefined
  const opts: Options = {
    seed,
    roughness: o?.roughness ?? HAND.roughness,
    bowing: HAND.bowing,
    stroke: INK.ink,
    // an explicit strokeWidth is already a considered weight — leave it alone
    strokeWidth: o?.strokeWidth ?? (HAND.strokeWidth * PEN[o?.stroke ?? "ink"]),
    fill: undefined,
    disableMultiStroke: true,
    disableMultiStrokeFill: true,
    preserveVertices: true,
  }
  if (o?.fill && o.fill !== "none") {
    opts.fillStyle = "solid"
    opts.fill = fillPaint(o)
  }
  return opts
}

/** Plain ellipse as path data, for shadows that skip rough.js entirely. */
function ellipsePath(cx: number, cy: number, w: number, h: number): string {
  const rx = w / 2
  const ry = h / 2
  return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${w} 0 a${rx} ${ry} 0 1 0 ${-w} 0 Z`
}

/** Rounded-rect as SVG path data — rough.js has no radius of its own. */
function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
  if (rr < 0.5) return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`
  return [
    `M${x + rr} ${y}`,
    `L${x + w - rr} ${y}`,
    `Q${x + w} ${y} ${x + w} ${y + rr}`,
    `L${x + w} ${y + h - rr}`,
    `Q${x + w} ${y + h} ${x + w - rr} ${y + h}`,
    `L${x + rr} ${y + h}`,
    `Q${x} ${y + h} ${x} ${y + h - rr}`,
    `L${x} ${y + rr}`,
    `Q${x} ${y} ${x + rr} ${y}`,
    "Z",
  ].join(" ")
}

interface PathBit {
  d: string
  stroke: string
  strokeWidth: number
  fill: string
  dash?: string
}

/** Icon / raw-path prims, rendered crisp rather than through rough.js. */
interface CrispBit {
  d: string[]
  transform: string
  mode: "fill" | "stroke"
  color: string
  strokeWidth: number
}

function drawableToPaths(drawable: ReturnType<RoughGenerator["rectangle"]>, dash?: string): PathBit[] {
  return gen.toPaths(drawable).map((pi) => ({
    d: pi.d,
    stroke: pi.stroke,
    strokeWidth: pi.strokeWidth,
    fill: pi.fill ?? "none",
    // only dash real strokes — dashing a fill path looks like static
    dash: dash && pi.stroke !== "none" ? dash : undefined,
  }))
}

export function primsToPaths(
  prims: Prim[],
  seed: number
): { paths: PathBit[]; texts: Extract<Prim, { t: "text" }>[]; crisp: CrispBit[] } {
  const paths: PathBit[] = []
  const texts: Extract<Prim, { t: "text" }>[] = []
  const crisp: CrispBit[] = []

  prims.forEach((p, i) => {
    const s = ((seed + i * 7919) % 2 ** 31) || 1
    const dash = "o" in p && p.o?.dashed ? "6 4" : undefined
    try {
      // block shadow first, so the surface prints over it
      if ("o" in p && p.o?.shadow && (p.t === "rect" || p.t === "ellipse")) {
        const d =
          p.t === "rect"
            ? roundRectPath(p.x + SHADOW_OFFSET, p.y + SHADOW_OFFSET, p.w, p.h, p.r ?? p.o?.r ?? HAND.radius)
            : null
        if (d) {
          paths.push({ d, stroke: "none", strokeWidth: 0, fill: SHADE.shadeStrong })
        } else {
          paths.push({
            d: ellipsePath(p.x + SHADOW_OFFSET + p.w / 2, p.y + SHADOW_OFFSET + p.h / 2, p.w, p.h),
            stroke: "none",
            strokeWidth: 0,
            fill: SHADE.shadeStrong,
          })
        }
      }
      switch (p.t) {
        case "rect": {
          const r = p.r ?? p.o?.r ?? HAND.radius
          paths.push(...drawableToPaths(gen.path(roundRectPath(p.x, p.y, p.w, p.h, r), primOptions(p, s)), dash))
          break
        }
        case "ellipse":
          paths.push(...drawableToPaths(gen.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, primOptions(p, s)), dash))
          break
        case "line":
          paths.push(...drawableToPaths(gen.line(p.x1, p.y1, p.x2, p.y2, primOptions(p, s)), dash))
          break
        case "poly":
          if (p.close) paths.push(...drawableToPaths(gen.polygon(p.pts, primOptions(p, s)), dash))
          else paths.push(...drawableToPaths(gen.linearPath(p.pts, primOptions(p, s)), dash))
          break
        case "path": {
          // Phosphor glyphs are filled outlines, so pen pressure has nothing to
          // push on — an icon is simply drawn in the ink, like everything else.
          // The weight below only bites on the handful of stroke-mode paths.
          const k = p.size / p.vb
          crisp.push({
            d: p.d,
            transform: `translate(${p.x} ${p.y}) scale(${k})`,
            mode: p.mode,
            color: INK.ink,
            strokeWidth: ((p.o?.strokeWidth ?? 12) * PEN[p.o?.stroke ?? "ink"]) / k,
          })
          break
        }
        case "text":
          texts.push(p)
          break
      }
    } catch {
      // rough.js throws on degenerate geometry mid-resize — drop that prim
    }
  })
  return { paths, texts, crisp }
}

export const SketchPrims = memo(function SketchPrims({ prims, seed }: { prims: Prim[]; seed: number }) {
  const { paths, texts, crisp } = useMemo(() => primsToPaths(prims, seed), [prims, seed])
  return (
    <>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill={p.fill}
          strokeDasharray={p.dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {crisp.map((c, i) => (
        <g key={`c${i}`} transform={c.transform}>
          {c.d.map((d, j) => (
            <path
              key={j}
              d={d}
              fill={c.mode === "fill" ? c.color : "none"}
              stroke={c.mode === "stroke" ? c.color : "none"}
              strokeWidth={c.mode === "stroke" ? c.strokeWidth : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
      {texts.map((t, i) => (
        <text
          key={`t${i}`}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          fontFamily="var(--sq-font)"
          fontWeight={t.bold ? 700 : 400}
          fontStyle={t.italic ? "italic" : undefined}
          textDecoration={t.underline ? "underline" : undefined}
          fill={INK[t.color ?? "ink"]}
          textAnchor={t.align === "center" ? "middle" : t.align === "right" ? "end" : "start"}
        >
          {t.text}
        </text>
      ))}
    </>
  )
})

/**
 * Render a node's visual content (no hit area, no selection ring).
 *
 * Geometry is memoized on the shape-affecting fields only — NOT on x/y, which
 * the parent <g transform> handles. Without that, dragging a template would
 * re-run rough.js over hundreds of prims on every pointer move.
 */
export const NodeSketch = memo(function NodeSketch({ node }: { node: SquigNode }) {
  const shapeKey = useMemo(() => {
    const flip = `${node.flipX ? 1 : 0}${node.flipY ? 1 : 0}`
    switch (node.type) {
      case "component":
        return `c:${node.kind}:${node.w}:${node.h}:${flip}:${JSON.stringify(node.props)}`
      case "shape":
        return `s:${node.shape}:${node.w}:${node.h}:${flip}:${node.fill}`
      case "draw":
        return `d:${node.points.length}:${node.w}:${node.h}:${flip}:${node.points[0]?.join()}:${node.points.at(-1)?.join()}`
      case "arrow":
        return `a:${node.w}:${node.h}:${flip}:${node.head}:${node.points.flat().join()}`
      case "text":
        return `t:${node.text}:${node.fontSize}:${flip}:${node.bold ? 1 : 0}${node.italic ? 1 : 0}${node.underline || node.link ? 1 : 0}`
    }
  }, [node])

  const prims = useMemo<Prim[]>(() => {
    const base = basePrims(node)
    return mirrorPrims(base, node.w, node.h, !!node.flipX, !!node.flipY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, node.type])

  return <SketchPrims prims={prims} seed={node.seed} />
})

/** A node's prims before any flip is applied. */
function basePrims(node: SquigNode): Prim[] {
  switch (node.type) {
    case "component":
      return renderComponent(node.kind, node.props, node.w, node.h)
    case "shape":
      if (node.shape === "ellipse")
        return [
          { t: "ellipse", x: 0, y: 0, w: node.w, h: node.h, o: node.fill ? { fill: "shade", fillColor: "ink" } : undefined },
        ]
      return [
        { t: "rect", x: 0, y: 0, w: node.w, h: node.h, r: 6, o: node.fill ? { fill: "shade", fillColor: "ink" } : undefined },
      ]
    case "draw":
      // freehand is already the user's own line — barely roughen it
      return [{ t: "poly", pts: node.points, o: { roughness: 0.2, strokeWidth: 1.9 } }]
    case "arrow": {
      const [[x1, y1], [x2, y2]] = node.points
      const out: Prim[] = [{ t: "line", x1, y1, x2, y2, o: { strokeWidth: 1.6 } }]
      if (node.head) {
        const a = Math.atan2(y2 - y1, x2 - x1)
        const L = 12
        out.push({
          t: "poly",
          pts: [
            [x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)],
            [x2, y2],
            [x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)],
          ],
          o: { strokeWidth: 1.6 },
        })
      }
      return out
    }
    case "text":
      return node.text.split("\n").map((lineText, i): Prim => ({
        t: "text",
        x: 0,
        y: node.fontSize * (i + 1),
        text: lineText,
        size: node.fontSize,
        bold: node.bold,
        italic: node.italic,
        // a link is a link because it's underlined — no blue in a wireframe
        underline: node.underline || !!node.link,
      }))
  }
}
