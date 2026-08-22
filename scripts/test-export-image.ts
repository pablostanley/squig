// ---------------------------------------------------------------------------
// Image-export surface checks. These stay browser-free: the expensive drawing
// and rasterising paths are covered by the build, while this locks down the
// alpha contract at the SVG boundary where it can regress.
// ---------------------------------------------------------------------------

import { copiedSurface, svgDocument, type ExportDrawing } from "../lib/export-image-document.ts"

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail = "") {
  if (condition) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const drawing: ExportDrawing = {
  body: '<path id="selected-mark" d="M0 0L10 10"/>',
  css: "path{stroke:#2438ff}",
  x: -12,
  y: 8,
  w: 44,
  h: 64,
  paper: "#fbfaf5",
}

check("a selected object asks for transparency", copiedSurface(false) === "transparent")
check("the whole canvas asks for paper", copiedSurface(true) === "paper")

const transparent = svgDocument(drawing, 88, 128, copiedSurface(false))
check("a transparent export has no paper rectangle", !transparent.includes('fill="#fbfaf5"'), transparent)
check("a transparent export keeps the selected marks", transparent.includes('id="selected-mark"'))
check("a transparent export keeps embedded font CSS", transparent.includes("<defs><style"))
check("the raster dimensions and world bounds stay independent", transparent.includes('width="88" height="128" viewBox="-12 8 44 64"'))

const paper = svgDocument(drawing, 44, 64, copiedSurface(true))
check("a whole-canvas export paints the document paper", paper.includes('<rect x="-12" y="8" width="44" height="64" fill="#fbfaf5"/>'))
check("saved exports default to paper", svgDocument(drawing, 44, 64) === paper)

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const failure of failures) console.error("  ✗ " + failure)
  process.exit(1)
}

console.log(`✓ ${passed} image export checks passed`)
