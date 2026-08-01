// ---------------------------------------------------------------------------
// Text wrap and reflow checks.
//
//   node --experimental-strip-types scripts/test-text.ts
//
// Off the browser there is no canvas to measure with, so every width here
// comes from the deterministic fallback in text-metrics: each character is
// 0.46 em wide. The numbers below are chosen around that ratio.
// ---------------------------------------------------------------------------

import { wrapText, measureTextWidth } from "../lib/canvas/text-metrics.ts"
import { fitTextBox, setTextWidth, autoSizeTextBox, minTextWidth } from "../lib/canvas/text-reflow.ts"
import { textBlockHeight } from "../lib/sketch/text-layout.ts"
import { scaleNodes } from "../lib/canvas/transform.ts"
import { unionBox, type TextNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

function close(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps
}

const STYLE = { size: 10 } // fallback char width: 4.6

const text = (over: Partial<TextNode>): TextNode => ({
  id: "t1",
  type: "text",
  text: "hello world",
  fontSize: 10,
  x: 0,
  y: 0,
  w: 100,
  h: textBlockHeight(1, 10),
  seed: 1,
  ...over,
})

// -- wrapText ---------------------------------------------------------------

check("wide enough — one line", wrapText("hello world", 100, STYLE).length === 1)

{
  // "hello" is 23px; "hello world" is 50.6 — a 30px measure breaks at the space
  const lines = wrapText("hello world", 30, STYLE)
  check("breaks at the space", lines.length === 2, lines.join("|"))
  check("break consumes the space", lines[0] === "hello" && lines[1] === "world", lines.join("|"))
}

{
  const lines = wrapText("hi\nthere", 1000, STYLE)
  check("hard returns always break", lines.length === 2, lines.join("|"))
}

{
  const lines = wrapText("one\n\ntwo", 1000, STYLE)
  check("blank lines survive", lines.length === 3 && lines[1] === "", lines.join("|"))
}

{
  // "abcdefghij" is 46px — wider than a 20px measure on its own, so it has to
  // break mid-word, and every piece has to fit
  const lines = wrapText("abcdefghij", 20, STYLE)
  check("long word breaks mid-word", lines.length > 1, lines.join("|"))
  check(
    "every broken piece fits",
    lines.every((l) => measureTextWidth(l, STYLE) <= 20),
    lines.join("|")
  )
  check("no glyph lost breaking", lines.join("") === "abcdefghij", lines.join("|"))
}

{
  // a measure narrower than one glyph must still make progress
  const lines = wrapText("abc", 1, STYLE)
  check("degenerate measure terminates", lines.length === 3, lines.join("|"))
}

check("empty text still has a line", wrapText("", 100, STYLE).length === 1)

// -- fitTextBox -------------------------------------------------------------

{
  // auto-sized: the box hugs the words
  const n = text({})
  const fit = fitTextBox(n, "hello world")
  check("auto fit hugs the run", close(fit.w!, measureTextWidth("hello world", STYLE) + 2))
  check("auto fit single-line height", close(fit.h!, textBlockHeight(1, 10)))
}

{
  // fixed-width: the box holds, the height answers to the wrap
  const n = text({ fixedW: true, w: 30 })
  const fit = fitTextBox(n, "hello world")
  check("fixed fit keeps the measure", fit.w === undefined && fit.x === undefined)
  check("fixed fit height follows the wrap", close(fit.h!, textBlockHeight(2, 10)))
}

{
  // centred auto text grows around its centre
  const n = text({ align: "center", x: 50, w: 20 })
  const fit = fitTextBox(n, "hello world")
  check("centred fit stays centred", close(n.x + n.w / 2, fit.x! + fit.w! / 2))
}

// -- setTextWidth / autoSizeTextBox ----------------------------------------

{
  const n = text({})
  const patch = setTextWidth(n, 30)
  check("side drag fixes the width", patch.fixedW === true && patch.w === 30)
  check("side drag reflows the height", close(patch.h!, textBlockHeight(2, 10)))
}

{
  const n = text({ fontSize: 40 })
  const patch = setTextWidth(n, 1)
  check("width clamps at one em", patch.w === Math.max(24, 40), String(patch.w))
  check("minTextWidth agrees", minTextWidth(n) === 40)
}

{
  const n = text({ fixedW: true, w: 30, h: textBlockHeight(2, 10) })
  const patch = autoSizeTextBox(n)
  check("reset un-fixes the width", patch.fixedW === false)
  check("reset hugs the run again", close(patch.w!, measureTextWidth("hello world", STYLE) + 2))
  check("reset back to one line", close(patch.h!, textBlockHeight(1, 10)))
}

// -- scaleNodes on fixed-width text ----------------------------------------

{
  // uniform scale: wrap points are scale-invariant, height scales with the box
  const n = text({ fixedW: true, w: 30, h: textBlockHeight(2, 10) })
  const from = { x: 0, y: 0, w: 30, h: n.h }
  const patch = scaleNodes([n], from, { x: 0, y: 0, w: 60, h: n.h * 2 })[n.id] as Partial<TextNode>
  check("uniform scale doubles the type", close(patch.fontSize!, 20))
  check("uniform scale keeps two lines", close(patch.h!, textBlockHeight(2, 20)), String(patch.h))
}

{
  // widening only: the words re-break, the height comes from the new wrap
  const n = text({ fixedW: true, w: 30, h: textBlockHeight(2, 10) })
  const from = { x: 0, y: 0, w: 30, h: n.h }
  const patch = scaleNodes([n], from, { x: 0, y: 0, w: 100, h: n.h })[n.id] as Partial<TextNode>
  check("off-ratio scale keeps the type", close(patch.fontSize!, 10))
  check("off-ratio scale reflows to one line", close(patch.h!, textBlockHeight(1, 10)), String(patch.h))
}

// unionBox import keeps this file honest about types.ts still exporting it —
// and a box of one node is that node
check("unionBox sanity", unionBox([text({})])!.maxX === 100)

// -- report -----------------------------------------------------------------

if (failures.length) {
  console.error(`✗ ${failures.length} failed, ${passed} passed`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`✓ text: all ${passed} checks passed`)
