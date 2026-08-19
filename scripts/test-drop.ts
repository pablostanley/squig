// ---------------------------------------------------------------------------
// Dropping files on the canvas — what gets taken, and where it goes.
//
// The DOM half of a drop can only be tried by hand, so what's here is the two
// decisions that don't need a browser: which files squig will accept, and the
// row it lays them out in.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-drop.ts
// ---------------------------------------------------------------------------

import { layoutDrop, planDrop, type DropSize, type DroppedFile } from "../lib/canvas/drop.ts"

let passed = 0
const failures: string[] = []
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

function file(name: string, type = ""): DroppedFile {
  return { name, type }
}

function box(w = 200, h = 100): DropSize {
  return { w, h }
}

// -- what a drop is made of -------------------------------------------------

{
  const one = planDrop([file("shot.png", "image/png")])
  check("a picture is a picture", one.kind === "images" && one.indices.length === 1)

  const many = planDrop([file("a.png", "image/png"), file("b.jpg", "image/jpeg"), file("c.gif", "image/gif")])
  check(
    "three pictures come back in the order they were dropped",
    many.kind === "images" && many.indices.join(",") === "0,1,2"
  )

  // a drag out of a file manager often arrives with no type at all, and a name
  // is the only thing left to go on
  const bare = planDrop([file("Screenshot 2026-08-19.PNG")])
  check("a typeless file is judged on its name", bare.kind === "images")
  check("…and the extension is case-blind", planDrop([file("LOGO.SVG")]).kind === "images")

  const nope = planDrop([file("contract.pdf", "application/pdf")])
  check("a PDF is turned away", nope.kind === "nothing" && nope.count === 1)

  const mixed = planDrop([file("a.png", "image/png"), file("notes.pdf", "application/pdf")])
  check(
    "the pictures out of a mixed drop still land, and the rest is counted",
    mixed.kind === "images" && mixed.indices.join(",") === "0" && mixed.skipped === 1
  )
}

// -- documents --------------------------------------------------------------

{
  const doc = planDrop([file("wires.squig.json", "application/json")])
  check("a squig doc opens", doc.kind === "doc" && doc.index === 0)
  check("…and so does one the OS didn't type", planDrop([file("wires.squig.json")]).kind === "doc")

  // opening replaces the whole canvas, which is much too big a thing to do to
  // somebody who was dragging in reference art
  const both = planDrop([file("wires.squig.json", "application/json"), file("shot.png", "image/png")])
  check("a doc alongside a picture doesn't open", both.kind === "images" && both.skipped === 1)

  const two = planDrop([file("a.squig.json"), file("b.squig.json")])
  check("two docs open the first, not both", two.kind === "doc" && two.index === 0)
}

// -- where they land --------------------------------------------------------

{
  const [only] = layoutDrop([box(200, 100)], [500, 400])
  check("one picture lands centred under the pointer", only[0] === 400 && only[1] === 350)

  const pair = layoutDrop([box(200, 100), box(200, 100)], [500, 400])
  check("two go side by side, with a gap", pair[1][0] - (pair[0][0] + 200) === 20)
  check("…on the same line", pair[0][1] === pair[1][1])
  check(
    "…and the pair is centred on the drop, not hung off it",
    (pair[0][0] + pair[1][0] + 200) / 2 === 500
  )

  const tall = layoutDrop([box(200, 100), box(200, 300)], [0, 0])
  check("a short picture sits on the row's middle line", tall[0][1] + 50 === tall[1][1] + 150)

  // a row that runs off toward the horizon is no use to anybody
  const wrapped = layoutDrop(Array.from({ length: 4 }, () => box(400, 200)), [0, 0])
  const rows = new Set(wrapped.map(([, y]) => y))
  check("a long drop wraps onto more than one row", rows.size > 1)
  check("…and the rows are a gap apart", Math.max(...rows) - Math.min(...rows) === 220)

  const stacked = new Set(wrapped.map((p) => p.join(",")))
  check("no two pictures land in the same place", stacked.size === wrapped.length)

  check("world coordinates come out whole", layoutDrop([box(201, 101)], [0, 0]).every((p) => p.every(Number.isInteger)))
  check("an empty drop lays out nothing", layoutDrop([], [0, 0]).length === 0)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} drop checks passed`)
