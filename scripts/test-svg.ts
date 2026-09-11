// ---------------------------------------------------------------------------
// A drawing as SVG markup, without a browser to draw it in.
//
//   node --experimental-strip-types scripts/test-svg.ts
//
// renderSvg is the half of image export that runs anywhere, which is what lets
// an agent look at what it made from node, and lets this file check the markup
// at all. The things worth pinning down are the ones a picture would not tell
// you: that the frame is big enough for strokes that overshoot their box, that
// a stray angle bracket in somebody's label can't rewrite the document, that a
// pasted screenshot travels inside the file rather than as a link to a blob
// url that will be dead by the time anyone opens it — and that the same
// drawing renders the same bytes twice, since a seeded scribble that wobbled
// between two exports would make every diff useless.
// ---------------------------------------------------------------------------

import { componentNode, shapeNode, textNode } from "../lib/doc.ts"
import { EXPORT_PAD, loadIconsFor, renderSvg } from "../lib/sketch/svg.ts"
import { bgOf, DEFAULT_LOOK, paletteOf, type Look } from "../lib/theme.ts"
import type { ImageNode, SquigNode } from "../lib/types.ts"
import { check, report } from "./harness.ts"

// -- fixtures ---------------------------------------------------------------

const LOOK: Look = { theme: "graphite", paper: "white", font: "sans", grid: false }

// a one-pixel PNG: the smallest thing that is unmistakably a pasted picture
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

const box = shapeNode("rect", { id: "box", seed: 11, x: 10, y: 20, w: 100, h: 50 })
const label = textNode("hello", { id: "label", seed: 12, x: 200, y: 0 })
const btn = componentNode("button", { id: "btn", seed: 13, x: 0, y: 100 })

const gs = (svg: string) => (svg.match(/<g transform="translate\(/g) ?? []).length

// -- nothing to draw --------------------------------------------------------

{
  // an empty string rather than a blank picture, so a caller can tell "there
  // was nothing here" from "here is a very small nothing"
  check("an empty drawing renders no svg at all", renderSvg([], LOOK) === "")
}

// -- one group per node -----------------------------------------------------

{
  check("one node, one group", gs(renderSvg([box], LOOK)) === 1)
  check("three nodes, three groups", gs(renderSvg([box, label, btn], LOOK)) === 3)

  const svg = renderSvg([box, label, btn], LOOK)
  // the groups come out in the order they were handed over — which is draw
  // order, which is the only order anything should read a document in
  check(
    "…placed where their nodes are, in the order given",
    svg.indexOf('translate(10 20)') < svg.indexOf('translate(200 0)') &&
      svg.indexOf('translate(200 0)') < svg.indexOf('translate(0 100)')
  )
}

// -- the frame --------------------------------------------------------------

{
  // Rough strokes overshoot the box they belong to, so a viewBox drawn tight
  // to the geometry crops the drawing by a hair on every side.
  const svg = renderSvg([box], LOOK)
  const pad = EXPORT_PAD
  const want = `viewBox="${10 - pad} ${20 - pad} ${100 + pad * 2} ${50 + pad * 2}"`
  check("the viewBox is the bounds, padded", svg.includes(want), want)
  check("…and the picture is that size", svg.includes(`width="${100 + pad * 2}" height="${50 + pad * 2}"`))
}

// -- paper, or none ---------------------------------------------------------

{
  const paper = renderSvg([box], LOOK)
  const bg = bgOf(paletteOf(LOOK.theme), LOOK.paper)
  check("on paper, the sheet is painted", paper.includes("<rect") && paper.includes(bg), bg)

  // a transparent export is for dropping into someone else's document, where
  // a white rectangle behind the marks is the whole problem
  check("asked for transparent, nothing is painted", !renderSvg([box], LOOK, "transparent").includes("<rect"))
}

// -- somebody's label is not markup -----------------------------------------

{
  const svg = renderSvg([textNode("<b>bold</b> & \"quoted\"", { id: "t", seed: 14, x: 0, y: 0 })], LOOK)
  check("angle brackets in a label are escaped", svg.includes("&lt;b&gt;bold&lt;/b&gt;"))
  check("…and so is the ampersand", svg.includes("&amp;"))
  check("…leaving no tag behind", !svg.includes("<b>"))
}

// -- a pasted picture travels with the file ---------------------------------

{
  // the one node that isn't made of marks. Its pixels have to be written into
  // the svg itself: an external src would leave the file depending on a blob
  // url that dies with the tab, and would taint the canvas on rasterise.
  const img: ImageNode = { id: "img", seed: 15, type: "image", src: PIXEL, x: 0, y: 0, w: 20, h: 20, naturalW: 1, naturalH: 1 }
  const svg = renderSvg([img as SquigNode], LOOK)
  check("a pasted picture is written into the svg", svg.includes('<image href="data:image/png;base64,'))
  check("…in full", svg.includes(PIXEL))
}

// -- the same drawing renders the same bytes --------------------------------

{
  // rough.js scribbles from the node's seed, so this holds only for as long as
  // nothing reaches for Math.random on the way out. A wobble here would make
  // every exported diff noise.
  const list = [box, label, btn]
  check("rendering twice gives the same bytes", renderSvg(list, LOOK) === renderSvg(list, LOOK))
  check("…and so does a fresh copy of the same nodes", renderSvg(list.map((n) => ({ ...n })), LOOK) === renderSvg(list, LOOK))
}

// -- icons from a lazy catalog -----------------------------------------------

{
  const heavy = componentNode("icon", { x: 0, y: 0, id: "i", seed: 1, props: { name: "acorn", weight: "fill" } })
  await loadIconsFor([heavy])
  const svg = renderSvg([heavy], DEFAULT_LOOK)
  check("an icon from a weight that had to be fetched still prints its glyph", /<g transform="translate\(\d[^"]*\) scale\([^"]*\)"><path/.test(svg))
}


{
  const svg = renderSvg([{ ...box, rotation: 90 }], LOOK)
  check("SVG rotates the same local node as the canvas", svg.includes('rotate(-90 50 25)'))
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1].split(" ").map(Number)
  check("SVG bounds include the rotated width and height", !!vb && vb[2] === 50 + EXPORT_PAD * 2 && vb[3] === 100 + EXPORT_PAD * 2)
}

report("svg checks passed")
