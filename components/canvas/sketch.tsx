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
import { INK, type Prim } from "@/lib/sketch/kit"
import { primsToPaths, mirrorGlyphs } from "@/lib/sketch/paths"
export { primsToPaths, mirrorGlyphs } from "@/lib/sketch/paths"
import { useIconCatalogVersion } from "@/lib/sketch/use-icon-catalog"
import { nodePrims } from "@/lib/sketch/node-prims"
import { cropOf, type ImageNode, type SquigNode } from "@/lib/types"

export const SketchPrims = memo(function SketchPrims({
  prims,
  seed,
  hiddenText,
}: {
  prims: Prim[]
  seed: number
  /**
   * A run the inline editor is standing in for — "all" while a text node is
   * being edited, or the index of one label inside a component. Drawing it as
   * well would print the words twice, half a pixel apart.
   */
  hiddenText?: "all" | number
}) {
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
      {texts.map((t, i) =>
        hiddenText === "all" || hiddenText === i ? null : (
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
            transform={mirrorGlyphs(t)}
          >
            {t.text}
          </text>
        )
      )}
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
export const NodeSketch = memo(function NodeSketch({
  node,
  hiddenText,
}: {
  node: SquigNode
  /** see SketchPrims — the run the inline editor has taken over */
  hiddenText?: "all" | number
}) {
  // components can draw icons whose paths stream in from the lazy catalog —
  // the version bump is what redraws them once the real weight lands
  const catalogVersion = useIconCatalogVersion()

  const shapeKey = useMemo(() => {
    const flip = `${node.flipX ? 1 : 0}${node.flipY ? 1 : 0}`
    // outline settings change the marks — the geometry, or the ink they print
    // in — so they belong in the key. Guarded by type, not by key presence: a
    // fresh shape has none of these keys yet, and the first patch only adds
    // the one it sets, so an `in` check would miss the change entirely.
    const pen =
      node.type === "shape" || node.type === "draw" || node.type === "arrow"
        ? `${node.stroke ?? ""}:${node.dashed ? 1 : 0}:${node.ink ?? ""}`
        : ""
    switch (node.type) {
      case "component":
        return `c:${node.kind}:${node.w}:${node.h}:${flip}:${catalogVersion}:${JSON.stringify(node.props)}`
      case "shape":
        return `s:${node.shape}:${node.w}:${node.h}:${flip}:${node.fill}:${pen}`
      case "draw":
        return `d:${node.points.length}:${node.w}:${node.h}:${flip}:${node.points[0]?.join()}:${node.points.at(-1)?.join()}:${pen}`
      case "arrow":
        return `a:${node.w}:${node.h}:${flip}:${node.head}:${node.points.flat().join()}:${node.anchors?.join() ?? ""}:${node.lineStyle ?? ""}:${node.elbowAxis ?? ""}:${node.elbowOffset?.join() ?? ""}:${node.curveBend?.join() ?? ""}:${pen}`
      case "text":
        // w and align place the anchor, so a resize or a realignment is a
        // different set of marks even when the words haven't changed
        return `t:${node.text}:${node.fontSize}:${node.w}:${node.h}:${node.fixedW ? 1 : 0}:${node.fixedH ? 1 : 0}:${node.align ?? ""}:${node.verticalAlign ?? ""}:${flip}:${node.bold ? 1 : 0}${node.italic ? 1 : 0}${node.underline || node.link ? 1 : 0}:${node.ink ?? ""}:${node.boxed ? 1 : 0}:${node.boxFill ?? ""}:${node.boxBorder === false ? 0 : 1}:${node.boxStroke ?? ""}:${node.boxInk ?? ""}:${node.boxDashed ? 1 : 0}`
      case "image":
        // the src doesn't shape a single mark — only the frame's box does
        return `i:${node.w}:${node.h}:${flip}`
    }
  }, [node, catalogVersion])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prims = useMemo<Prim[]>(() => nodePrims(node), [shapeKey, node.type])

  return (
    <>
      {node.type === "image" && <ImagePixels node={node} />}
      <SketchPrims prims={prims} seed={node.seed} hiddenText={hiddenText} />
    </>
  )
})

/**
 * The picture itself, cropped to its box.
 *
 * A nested `<svg>` is the clip: it opens a viewport of exactly the node's box
 * and hides everything the inner `<image>` puts outside it, with no `clipPath`
 * and so no document-unique id to mint, collide, or forget to update when a
 * node is duplicated. The picture is laid out larger than the box and slid
 * under it — see `imagePlacement`.
 */
function ImagePixels({ node }: { node: ImageNode }) {
  const p = imagePlacement(node)
  return (
    <svg x={0} y={0} width={node.w} height={node.h} overflow="hidden">
      {/* a flip is a property of the node, so the pixels turn with the frame —
          about the box, which means what you see mirrors, not what's hidden */}
      <g transform={mirrorBox(node.w, node.h, node.flipX, node.flipY)}>
        <image
          href={node.src}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          // the box is the truth about how big this is — a resize that squashes
          // it should squash the picture, the way dragging any other node does
          preserveAspectRatio="none"
        />
      </g>
    </svg>
  )
}

/**
 * Where the whole picture goes, in the node's own coordinates, so that the
 * cropped part of it lands exactly on the box.
 *
 * With no crop that's (0, 0, w, h) — the picture fills its box, which is what
 * every picture did before crops existed. With one it's bigger and offset up
 * and left, and the nested `<svg>` above trims the overhang.
 *
 * Exported because the PNG export has to place the same pixels the same way,
 * into a file rather than onto the canvas.
 */
export function imagePlacement(node: ImageNode): { x: number; y: number; w: number; h: number } {
  const c = cropOf(node)
  const w = node.w / c.w
  const h = node.h / c.h
  return { x: -c.x * w, y: -c.y * h, w, h }
}

/**
 * Mirror a picture about its own box — the same flip mirrorPrims gives the
 * marks, in SVG terms. Exported because the PNG export has to draw the same
 * picture the same way round, into a file rather than onto the canvas.
 */
export function mirrorBox(w: number, h: number, flipX?: boolean, flipY?: boolean): string | undefined {
  if (!flipX && !flipY) return undefined
  const sx = flipX ? -1 : 1
  const sy = flipY ? -1 : 1
  return `translate(${flipX ? w : 0} ${flipY ? h : 0}) scale(${sx} ${sy})`
}
