// ---------------------------------------------------------------------------
// Crop maths — the window, the sheet, and the arithmetic between them.
//
//   node --experimental-strip-types scripts/test-crop.ts
//
// lib/canvas/crop imports only types and MIN_SIZE, so this runs standalone
// with no bundler and no test framework.
// ---------------------------------------------------------------------------

import {
  clampWindow,
  cropAnchor,
  cropPatch,
  imageSheet,
  isCropped,
  panSheet,
  uncropPatch,
  windowToCrop,
} from "../lib/canvas/crop.ts"
import { resizeBounds, MIN_SIZE } from "../lib/canvas/transform.ts"
import { normalizeCrop, type ImageCrop, type ImageNode } from "../lib/types.ts"
import type { Bounds } from "../lib/selection.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

function boxIs(name: string, got: Bounds, want: Bounds, eps = 1e-6) {
  const ok =
    close(got.x, want.x, eps) && close(got.y, want.y, eps) && close(got.w, want.w, eps) && close(got.h, want.h, eps)
  check(
    name,
    ok,
    ok ? "" : `got ${JSON.stringify(round(got))}, want ${JSON.stringify(round(want))}`
  )
}

const round = (b: Bounds) => ({
  x: +b.x.toFixed(3),
  y: +b.y.toFixed(3),
  w: +b.w.toFixed(3),
  h: +b.h.toFixed(3),
})

// -- fixtures ---------------------------------------------------------------

function pic(over: Partial<ImageNode> = {}): ImageNode {
  return {
    id: "img",
    type: "image",
    x: 100,
    y: 100,
    w: 200,
    h: 100,
    seed: 1,
    src: "data:image/png;base64,xx",
    naturalW: 400,
    naturalH: 200,
    ...over,
  }
}

// -- the sheet --------------------------------------------------------------

{
  // an uncropped picture is its own sheet — every caller has to work the same
  // on a picture that has never been cropped as on one that has
  boxIs("uncropped: the sheet is the box", imageSheet(pic()), { x: 100, y: 100, w: 200, h: 100 })

  // showing the middle half of each axis means the whole picture is twice the
  // box in each direction, hung a quarter of itself up and to the left
  const half = pic({ crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } })
  boxIs("cropped: the sheet is the picture at the size it looks", imageSheet(half), {
    x: 100 - 0.25 * 400,
    y: 100 - 0.25 * 200,
    w: 400,
    h: 200,
  })

  // and the round trip is lossless — this is the invariant every gesture rests
  // on, because none of them accumulate deltas
  const back = windowToCrop({ x: half.x, y: half.y, w: half.w, h: half.h }, imageSheet(half))
  check(
    "window → crop → sheet round-trips",
    close(back.x, 0.25) && close(back.y, 0.25) && close(back.w, 0.5) && close(back.h, 0.5),
    JSON.stringify(back)
  )
}

// -- normalizeCrop ----------------------------------------------------------

{
  check("a full window isn't a crop at all", normalizeCrop({ x: 0, y: 0, w: 1, h: 1 }) === undefined)
  check("NaN never reaches the document", normalizeCrop({ x: NaN, y: 0, w: 1, h: 1 }) === undefined)
  check("nor does Infinity", normalizeCrop({ x: 0, y: 0, w: Infinity, h: 1 }) === undefined)
  check("nor does a missing crop", normalizeCrop(undefined) === undefined)

  const wide = normalizeCrop({ x: -0.5, y: 0.5, w: 2, h: 0.8 }) as ImageCrop
  check(
    "a crop that runs off the picture is pulled back onto it",
    wide.x === 0 && wide.w === 1 && close(wide.y, 0.2) && close(wide.h, 0.8),
    JSON.stringify(wide)
  )

  const sliver = normalizeCrop({ x: 0.9, y: 0, w: 0, h: 1 }) as ImageCrop
  check("a zero-width crop floors instead of dividing by zero", sliver.w > 0 && sliver.x + sliver.w <= 1)
}

// -- dragging a handle ------------------------------------------------------

{
  const n = pic()
  const sheet = imageSheet(n)
  const win = { x: n.x, y: n.y, w: n.w, h: n.h }

  // pull the east edge 50 to the left: the box narrows, and the crop says so.
  // The pixels that stay put don't move or change size — that's the whole
  // point of pinning the sheet.
  const east = clampWindow(resizeBounds(win, "e", -50, 0), sheet)
  boxIs("east handle narrows the window", east, { x: 100, y: 100, w: 150, h: 100 })
  const patch = cropPatch(east, sheet)
  check(
    "…and the crop drops the right quarter",
    close(patch.crop!.x, 0) && close(patch.crop!.w, 0.75) && close(patch.crop!.h, 1),
    JSON.stringify(patch.crop)
  )

  // the west edge moves the box's origin as well as its size
  const west = clampWindow(resizeBounds(win, "w", 40, 0), sheet)
  boxIs("west handle moves the origin too", west, { x: 140, y: 100, w: 160, h: 100 })
  check("…and the crop starts further into the picture", close(cropPatch(west, sheet).crop!.x, 0.2))

  // dragging outward on an uncropped picture has nowhere to go: the sheet is
  // the box, so the window can't grow past it
  const past = clampWindow(resizeBounds(win, "e", 500, 0), sheet)
  boxIs("an uncropped window can't be opened out any further", past, win)
  check("…and that's still 'no crop'", cropPatch(past, sheet).crop === undefined)
}

// -- opening a crop back out ------------------------------------------------

{
  const n = pic({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 } })
  const sheet = imageSheet(n)
  const win = { x: n.x, y: n.y, w: n.w, h: n.h }

  // the hidden pixels are still there: drag east and they come back, up to the
  // picture's own edge and not one pixel past it
  const out = clampWindow(resizeBounds(win, "e", 1000, 0), sheet)
  check("a crop hands its pixels back when you drag out", close(out.x + out.w, sheet.x + sheet.w))
  check("…and stops at the edge of the picture", out.x + out.w <= sheet.x + sheet.w + 1e-9)

  // reset gives back everything at the size the picture is already drawn
  const reset = uncropPatch(n)
  boxIs("reset restores the whole sheet", reset as Bounds, sheet)
  check("…and clears the crop", reset.crop === undefined)
  check("isCropped reads the field, not the numbers", isCropped(n) && !isCropped(pic()))
}

// -- aspect lock ------------------------------------------------------------

{
  const n = pic({ crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } })
  const sheet = imageSheet(n) // 400 × 200 at (0, 50)
  const win = { x: n.x, y: n.y, w: n.w, h: n.h } // 200 × 100 at (100, 100)
  const ratio = win.w / win.h

  // Shift on a corner: drag far enough that a free resize would run off the
  // picture, and check the clamp gives up size rather than shape
  const anchor = cropAnchor("se", win, false)
  check("the se anchor is the nw corner", anchor[0] === win.x && anchor[1] === win.y)

  const big = clampWindow(resizeBounds(win, "se", 1000, 1000, { aspect: true }), sheet, anchor)
  check("aspect lock survives the clamp", close(big.w / big.h, ratio, 1e-6), `${big.w} × ${big.h}`)
  check("…and the pinned corner holds", close(big.x, win.x) && close(big.y, win.y))
  check(
    "…and the box still fits inside the picture",
    big.x >= sheet.x - 1e-9 &&
      big.y >= sheet.y - 1e-9 &&
      big.x + big.w <= sheet.x + sheet.w + 1e-9 &&
      big.y + big.h <= sheet.y + sheet.h + 1e-9
  )
  // 100px of vertical room below the anchor against 300 horizontal: the short
  // axis is what runs out first, so height maxes and width follows the ratio
  check("…and it grew to the limit of the tighter axis", close(big.y + big.h, sheet.y + sheet.h))

  // from the centre, both directions are pinned to the middle
  const mid = cropAnchor("se", win, true)
  check("alt anchors at the centre", mid[0] === win.x + win.w / 2 && mid[1] === win.y + win.h / 2)
  const sym = clampWindow(resizeBounds(win, "se", 1000, 1000, { aspect: true, fromCenter: true }), sheet, mid)
  check("symmetric aspect lock keeps its ratio", close(sym.w / sym.h, ratio, 1e-6))
  check(
    "…and stays centred where it started",
    close(sym.x + sym.w / 2, mid[0]) && close(sym.y + sym.h / 2, mid[1])
  )
}

// -- sliding the picture ----------------------------------------------------

{
  const n = pic({ crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } })
  const sheet = imageSheet(n)
  const win = { x: n.x, y: n.y, w: n.w, h: n.h }

  const moved = panSheet(sheet, win, 30, -10)
  boxIs("a small slide moves the picture, not the box", moved, {
    x: sheet.x + 30,
    y: sheet.y - 10,
    w: sheet.w,
    h: sheet.h,
  })
  const p = cropPatch(win, moved)
  check("the box holds still", p.x === win.x && p.y === win.y && p.w === win.w && p.h === win.h)
  check("…and the crop follows the picture the other way", p.crop!.x < 0.25 && p.crop!.y > 0.25)

  // shove it far enough and the picture's own edge arrives; bare canvas must
  // never show inside the window
  const shoved = panSheet(sheet, win, 100_000, 100_000)
  check("a slide stops at the picture's edge", close(shoved.x, win.x) && close(shoved.y, win.y))
  const back = panSheet(sheet, win, -100_000, -100_000)
  check(
    "…and at the other edge too",
    close(back.x + back.w, win.x + win.w) && close(back.y + back.h, win.y + win.h)
  )
  const crop = cropPatch(win, shoved).crop!
  check("a slide to the corner reads as a corner crop", close(crop.x, 0) && close(crop.y, 0))

  // an uncropped picture has no slack at all, so a slide is a no-op rather
  // than a way to drag the picture off its own box
  const stuck = pic()
  const stuckWin = { x: stuck.x, y: stuck.y, w: stuck.w, h: stuck.h }
  boxIs("an uncropped picture doesn't slide", panSheet(imageSheet(stuck), stuckWin, 40, 40), stuckWin)
}

// -- the floor --------------------------------------------------------------

{
  const n = pic()
  const sheet = imageSheet(n)
  const win = { x: n.x, y: n.y, w: n.w, h: n.h }
  // squeeze from both sides at once, past the point of no return
  const tiny = clampWindow(resizeBounds(win, "se", -1000, -1000), sheet)
  check("a window can't be squeezed below the handle floor", tiny.w >= MIN_SIZE && tiny.h >= MIN_SIZE)
  check("…and stays on the picture", tiny.x >= sheet.x - 1e-9 && tiny.y >= sheet.y - 1e-9)

  const crop = cropPatch(tiny, sheet).crop!
  check("…and its crop is still a real rectangle", crop.w > 0 && crop.h > 0 && crop.x + crop.w <= 1 + 1e-9)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} crop checks passed`)
