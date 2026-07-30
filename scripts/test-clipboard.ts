// ---------------------------------------------------------------------------
// Checks for what squig writes to the clipboard and what it accepts back.
//
// The reading half matters most: a paste is the one door into the document
// that anyone can knock on, so the tests below are as interested in what gets
// turned away as in what round-trips.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-clipboard.ts
// ---------------------------------------------------------------------------

import {
  decodeNodes,
  encodeNodes,
  payloadFromHtml,
  payloadHtml,
  validNode,
  wordsOf,
} from "../lib/clipboard-payload.ts"
import type { ImageNode, ShapeNode, SquigNode, TextNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const rect = (id: string, x = 0, y = 0): ShapeNode => ({
  id,
  type: "shape",
  shape: "rect",
  fill: "none",
  x,
  y,
  w: 100,
  h: 40,
  seed: 7,
})

const label = (id: string, text: string): TextNode => ({
  id,
  type: "text",
  text,
  fontSize: 18,
  x: 0,
  y: 0,
  w: 80,
  h: 24,
  seed: 7,
})

// a declaration, not an arrow: an object-returning arrow immediately before a
// bare `{` block is a parse the compiler resolves the other way
function pic(src: string): ImageNode {
  return { id: "p", type: "image", src, naturalW: 100, naturalH: 50, x: 0, y: 0, w: 100, h: 50, seed: 7 }
}

// -- round trips ------------------------------------------------------------

{
  const nodes = [rect("a"), label("b", "hello"), pic("data:image/png;base64,AAA")]
  const back = decodeNodes(encodeNodes(nodes))
  check("a payload round-trips through text", back?.length === 3, JSON.stringify(back?.length))
  check("and keeps what each node was", back?.map((n) => n.type).join() === "shape,text,image", back?.map((n) => n.type).join())

  const html = payloadHtml(encodeNodes(nodes))
  check("the html carrier round-trips too", decodeNodes(payloadFromHtml(html))?.length === 3)
  // Chrome wraps pasted HTML in a charset meta and fragment comments
  const wrapped = `<meta charset="utf-8"><!--StartFragment-->${html}<!--EndFragment-->`
  check("even once the browser has rewrapped it", decodeNodes(payloadFromHtml(wrapped))?.length === 3)
  check("quotes in the payload can't close the attribute", !payloadHtml('{"a":"b"}').includes('"}"'))
}

// -- things that are not a payload -----------------------------------------

{
  check("prose is not a payload", decodeNodes("just some words I copied") === null)
  check("neither is empty", decodeNodes("") === null && decodeNodes(null) === null)
  check("nor broken json", decodeNodes('{"app":"squig","kind":"nodes","nodes":[') === null)
  check("nor someone else's json", decodeNodes('{"app":"figma","nodes":[]}') === null)
  check("nor a payload with nothing usable in it", decodeNodes(encodeNodes([])) === null)
  check("html with no payload in it yields nothing", payloadFromHtml("<p>hello</p>") === null)
}

// -- vetting incoming nodes -------------------------------------------------

{
  check("a good node comes back", validNode(rect("a")) !== null)
  check("an unknown type does not", validNode({ ...rect("a"), type: "video" }) === null)
  check("nor does a NaN coordinate", validNode({ ...rect("a"), x: NaN }) === null)
  check("nor an infinite one", validNode({ ...rect("a"), w: Infinity }) === null)
  check("nor a missing box", validNode({ id: "a", type: "shape", shape: "rect" }) === null)
  check("nor a shape that isn't one", validNode({ ...rect("a"), shape: "hexagon" }) === null)
  check("nor a text node with no words", validNode({ ...label("a", "hi"), text: 42 }) === null)
  check("nor group ids that aren't strings", validNode({ ...rect("a"), groupIds: [1, 2] }) === null)
  check("a negative size is clamped, not refused", validNode({ ...rect("a"), w: -5 })?.w === 0)
  check("a node with no seed still gets one", typeof validNode({ ...rect("a"), seed: undefined })?.seed === "number")

  check("an arrow needs both ends", validNode({ id: "a", type: "arrow", x: 0, y: 0, w: 10, h: 10, seed: 1, head: true, points: [[0, 0]] }) === null)
  check("a scribble needs points", validNode({ id: "a", type: "draw", x: 0, y: 0, w: 10, h: 10, seed: 1, points: [] }) === null)

  check("a picture may carry its own pixels", validNode(pic("data:image/png;base64,AAA")) !== null)
  check("but never a url we'd go and fetch", validNode(pic("https://example.com/tracker.png")) === null)
  check("and not a script either", validNode(pic("javascript:alert(1)")) === null)
  check("a payload drops the bad ones and keeps the rest", decodeNodes(encodeNodes([rect("a"), pic("http://x/y.png") as SquigNode]))?.length === 1)
}

// -- the plain-text carrier -------------------------------------------------

{
  check("words come out in order", wordsOf([label("a", "one"), rect("b"), label("c", "two")]) === "one\ntwo")
  check("a selection with no words has none", wordsOf([rect("a")]) === "")
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} clipboard checks passed`)
