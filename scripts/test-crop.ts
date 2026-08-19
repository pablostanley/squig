// ---------------------------------------------------------------------------
// Crop maths — the window, the sheet, and the arithmetic between them.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-crop.ts
//
// The maths needs nothing but types and MIN_SIZE. The last section reaches for
// the store, to ask when crop mode ends — hence the loader, and the stand-in
// browser it sets up down there.
// ---------------------------------------------------------------------------

import {
  clampWindow,
  cropAnchor,
  cropPatch,
  cropTarget,
  imageSheet,
  isCropped,
  panSheet,
  trueShapePatch,
  uncropPatch,
  visibleAspect,
  windowToCrop,
} from "../lib/canvas/crop.ts"
import { resizeBounds, MIN_SIZE, type Handle } from "../lib/canvas/transform.ts"
import { cropOf, normalizeCrop, type ImageCrop, type ImageNode, type SquigNode } from "../lib/types.ts"
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
  const back = windowToCrop({ x: half.x, y: half.y, w: half.w, h: half.h }, imageSheet(half), false, false)
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
  const patch = cropPatch(east, sheet, false, false)
  check(
    "…and the crop drops the right quarter",
    close(patch.crop!.x, 0) && close(patch.crop!.w, 0.75) && close(patch.crop!.h, 1),
    JSON.stringify(patch.crop)
  )

  // the west edge moves the box's origin as well as its size
  const west = clampWindow(resizeBounds(win, "w", 40, 0), sheet)
  boxIs("west handle moves the origin too", west, { x: 140, y: 100, w: 160, h: 100 })
  check("…and the crop starts further into the picture", close(cropPatch(west, sheet, false, false).crop!.x, 0.2))

  // dragging outward on an uncropped picture has nowhere to go: the sheet is
  // the box, so the window can't grow past it
  const past = clampWindow(resizeBounds(win, "e", 500, 0), sheet)
  boxIs("an uncropped window can't be opened out any further", past, win)
  check("…and that's still 'no crop'", cropPatch(past, sheet, false, false).crop === undefined)
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
  const p = cropPatch(win, moved, false, false)
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
  const crop = cropPatch(win, shoved, false, false).crop!
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

  const crop = cropPatch(tiny, sheet, false, false).crop!
  check("…and its crop is still a real rectangle", crop.w > 0 && crop.h > 0 && crop.x + crop.w <= 1 + 1e-9)
}

// -- giving a picture its shape back ---------------------------------------

{
  // the fixture is 400 × 200 pixels shown in a 200 × 100 box: already true
  check("an untouched picture is already true", trueShapePatch(pic()) === null)
  check("…and its ratio is the pixels' own", close(visibleAspect(pic())!, 2))

  // squashed into a square: area 200 × 200 = 40000 held at 2:1 gives 283 × 141
  const squashed = pic({ w: 200, h: 200 })
  const fixed = trueShapePatch(squashed)!
  check("a squashed picture comes back at the pixels' ratio", close(fixed.w! / fixed.h!, 2, 1e-9))
  check("…holding the area it took up", close(fixed.w! * fixed.h!, 200 * 200, 1e-6))
  check(
    "…about its centre, so it doesn't jump away from the corner you clicked",
    close(fixed.x! + fixed.w! / 2, 200) && close(fixed.y! + fixed.h! / 2, 200),
    JSON.stringify(round(fixed as Bounds))
  )
  // and it says so out loud: neither axis simply kept its old value
  check("…and neither axis was simply kept", fixed.w! > 200 && fixed.h! < 200)

  // stretched the other way — a tall box on a wide picture — comes back wide
  const tall = trueShapePatch(pic({ w: 60, h: 300 }))!
  check("a stretched picture comes back the other way", tall.w! > tall.h! && close(tall.w! / tall.h!, 2, 1e-9))
}

{
  // A crop is what makes this more than naturalW / naturalH. The picture is
  // 400 × 200; showing a tenth of its width and all of its height leaves
  // 40 × 200 of pixels — a tall sliver, whatever shape the file was.
  const sliver = pic({ crop: { x: 0.3, y: 0, w: 0.1, h: 1 }, w: 200, h: 200 })
  check("a crop changes what 'true' means", close(visibleAspect(sliver)!, 0.2))
  const back = trueShapePatch(sliver)!
  check("…so a tall crop comes back tall", close(back.w! / back.h!, 0.2, 1e-9), `${back.w} × ${back.h}`)
  check("…still holding the area", close(back.w! * back.h!, 200 * 200, 1e-6))
  check("…and leaving the crop alone", back.crop === undefined && !("crop" in back))

  // the same picture cropped the other way is a wide one
  const strip = pic({ crop: { x: 0, y: 0.4, w: 1, h: 0.1 }, w: 200, h: 200 })
  check("a wide crop comes back wide", close(visibleAspect(strip)!, 20))

  // a crop that isn't square on a picture that isn't square: 400 × 0.5 = 200
  // wide by 200 × 0.25 = 50 tall, so 4:1 — neither the crop's ratio (2:1) nor
  // the picture's (2:1) on their own would get here
  const both = pic({ crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.25 } })
  check("…and both ratios multiply, rather than one winning", close(visibleAspect(both)!, 4))

  // a box already at the cropped ratio has nothing to do
  check("a picture already true to its crop is left alone", trueShapePatch(pic({ crop: { x: 0, y: 0, w: 0.5, h: 1 }, w: 100, h: 100 })) === null)
}

{
  // NaN in the geometry gets autosaved and takes the file with it, so every
  // way the numbers can fail has to end in "do nothing" rather than in maths
  check("a picture with no pixels can't say what true is", visibleAspect(pic({ naturalH: 0 })) === null)
  check("…and isn't touched", trueShapePatch(pic({ naturalW: 0, w: 200, h: 200 })) === null)
  check("…nor is one whose natural size never got written down", trueShapePatch(pic({ naturalW: undefined as unknown as number })) === null)
  check("a box with no height is left alone too", trueShapePatch(pic({ h: 0 })) === null)

  const out = trueShapePatch(pic({ w: 200, h: 200 }))!
  check(
    "and what does come out is all finite",
    [out.x!, out.y!, out.w!, out.h!].every((v) => Number.isFinite(v))
  )

  // an extreme ratio on a small box would put one axis under the handle floor;
  // both grow together so the shape survives the floor
  const wisp = trueShapePatch(pic({ naturalW: 4000, naturalH: 4, w: 20, h: 20 }))!
  check("a wisp of a picture still clears the handle floor", wisp.h! >= MIN_SIZE - 1e-9, `${wisp.w} × ${wisp.h}`)
  check("…and keeps its ratio anyway", close(wisp.w! / wisp.h!, 1000, 1e-6))
}

// -- flipped pictures -------------------------------------------------------

/**
 * Where the renderer lands a pixel of the file, in world space.
 *
 * imagePlacement followed by mirrorBox from components/canvas/sketch, written
 * out as one line per axis. The checks below ask it about identifiable pixels
 * instead of reading box numbers, because "the pixels you keep don't move" is
 * the promise this module makes, and a crop and a box can both be wrong in
 * ways that still add up to a plausible-looking rectangle — which is exactly
 * how crop mode shipped blind to flips.
 */
function pixelAt(n: ImageNode, sx: number, sy: number): [number, number] {
  const c = cropOf(n)
  const u = (sx - c.x) * (n.w / c.w)
  const v = (sy - c.y) * (n.h / c.h)
  return [n.x + (n.flipX ? n.w - u : u), n.y + (n.flipY ? n.h - v : v)]
}

/** A patch put back on its node, so the checks can ask where the pixels went. */
const applied = (n: ImageNode, patch: Partial<ImageNode>) => ({ ...n, ...patch }) as ImageNode

/** Corners, edges and middle of the file — enough to catch a mirror or a slide. */
const SAMPLES: [number, number][] = [
  [0, 0],
  [0.25, 0.5],
  [0.5, 0.5],
  [0.75, 0.25],
  [1, 1],
]

/** Every sampled pixel of the file has to have gone exactly (dx, dy). */
function pixelsMoved(name: string, before: ImageNode, after: ImageNode, dx: number, dy: number) {
  const off = SAMPLES.filter(([sx, sy]) => {
    const [x0, y0] = pixelAt(before, sx, sy)
    const [x1, y1] = pixelAt(after, sx, sy)
    return !close(x1 - x0, dx, 1e-6) || !close(y1 - y0, dy, 1e-6)
  })
  const [sx, sy] = off[0] ?? [0, 0]
  check(
    name,
    off.length === 0,
    off.length
      ? `source (${sx}, ${sy}) went ${JSON.stringify(pixelAt(before, sx, sy))} -> ${JSON.stringify(pixelAt(after, sx, sy))}, wanted +(${dx}, ${dy})`
      : ""
  )
}

/** The four ways round a picture can be, run through every gesture below. */
const WAYS: [string, boolean, boolean][] = [
  ["unflipped", false, false],
  ["flipX", true, false],
  ["flipY", false, true],
  ["flipped both ways", true, true],
]

/** Off-centre on both axes, so a mirror can't hide in a symmetry. */
const OFFSET = { x: 0.1, y: 0.15, w: 0.5, h: 0.6 }

const inSheet = (b: Bounds, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h

{
  // The sheet is a hit region and a dashed outline as well as a number, so it
  // has to sit exactly where the faint whole-picture ghost is drawn.
  for (const [what, flipX, flipY] of WAYS) {
    const n = pic({ crop: OFFSET, flipX, flipY })
    const [x0, y0] = pixelAt(n, 0, 0)
    const [x1, y1] = pixelAt(n, 1, 1)
    boxIs(`${what}: the sheet is where the ghost is drawn`, imageSheet(n), {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
    })
  }

  // cropped from the right and then flipped: the hidden half shows as ghost on
  // the left, and pressing it must slide the picture rather than leave the mode
  const n = pic({ crop: { x: 0, y: 0, w: 0.5, h: 1 }, flipX: true })
  const sheet = imageSheet(n)
  const [gx, gy] = pixelAt(n, 0.75, 0.5)
  check(
    "a press on the ghost lands on the picture",
    inSheet(sheet, gx, gy),
    `${gx}, ${gy} not in ${JSON.stringify(round(sheet))}`
  )
  check("…and the same distance the other way is bare canvas", !inSheet(sheet, 2 * (n.x + n.w / 2) - gx, gy))
}

{
  // Dragging a handle pins the sheet: whatever survives the trim is still the
  // same pixels at the same size in the same place, whichever way round the
  // picture is printed.
  for (const [what, flipX, flipY] of WAYS) {
    const n = pic({ crop: OFFSET, flipX, flipY })
    const sheet = imageSheet(n)
    const win = { x: n.x, y: n.y, w: n.w, h: n.h }
    const pulls: [Handle, number, number][] = [
      ["w", 30, 0],
      ["e", -30, 0],
      ["n", 0, 20],
      ["s", 0, -20],
    ]
    for (const [handle, dx, dy] of pulls) {
      const box = clampWindow(resizeBounds(win, handle, dx, dy), sheet)
      const after = applied(n, cropPatch(box, sheet, flipX, flipY))
      boxIs(`${what}: the ${handle} handle follows the pointer`, { x: after.x, y: after.y, w: after.w, h: after.h }, box)
      pixelsMoved(`${what}: …and the ${handle} handle trims without moving the pixels`, n, after, 0, 0)
    }
  }

  // the reviewer's case in plain numbers: the middle half of a photo, flipped,
  // west handle pulled 40 in. The end that goes is the one under the handle —
  // which on a flipped picture is the far end of the file, not the near one
  const n = pic({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, flipX: true })
  const sheet = imageSheet(n)
  const win = { x: n.x, y: n.y, w: n.w, h: n.h }
  const c = applied(n, cropPatch(clampWindow(resizeBounds(win, "w", 40, 0), sheet), sheet, true, false)).crop!
  check("a flipped west drag trims the far end of the file", close(c.x, 0.25) && close(c.x + c.w, 0.65), JSON.stringify(c))
}

{
  // Dragging inside pins the window: the picture goes where the pointer goes,
  // which on a flipped picture means the crop counts backwards to keep up.
  for (const [what, flipX, flipY] of WAYS) {
    const n = pic({ crop: OFFSET, flipX, flipY })
    const win = { x: n.x, y: n.y, w: n.w, h: n.h }
    const after = applied(n, cropPatch(win, panSheet(imageSheet(n), win, 30, -12), flipX, flipY))
    boxIs(`${what}: a slide leaves the box alone`, { x: after.x, y: after.y, w: after.w, h: after.h }, win)
    pixelsMoved(`${what}: …and carries the picture with the pointer`, n, after, 30, -12)
  }
}

{
  // Handing the pixels back is the one gesture with nothing to aim at, so the
  // only thing to check is the whole of it: what you could see before is in
  // exactly the same place after, with more of the picture around it.
  for (const [what, flipX, flipY] of WAYS) {
    const n = pic({ crop: OFFSET, flipX, flipY })
    const back = applied(n, uncropPatch(n))
    pixelsMoved(`${what}: reset leaves what you can see where it was`, n, back, 0, 0)
    check(`${what}: …and clears the crop`, back.crop === undefined)
    boxIs(
      `${what}: …and grows the box to the whole picture`,
      { x: back.x, y: back.y, w: back.w, h: back.h },
      imageSheet(n)
    )
  }

  // and the round trip every gesture rests on holds when it's mirrored
  for (const [what, flipX, flipY] of WAYS) {
    const n = pic({ crop: OFFSET, flipX, flipY })
    const there = windowToCrop({ x: n.x, y: n.y, w: n.w, h: n.h }, imageSheet(n), flipX, flipY)
    check(
      `${what}: the window round-trips to the crop it came from`,
      close(there.x, OFFSET.x) && close(there.y, OFFSET.y) && close(there.w, OFFSET.w) && close(there.h, OFFSET.h),
      JSON.stringify(there)
    )
  }
}

{
  // Unsquash is the one thing here a flip genuinely doesn't reach: a ratio has
  // no handedness, and the box is resized about its centre, which the mirror
  // holds still. Written down as a check rather than left as a hunch, because
  // "a flip probably doesn't matter here" is how this file's bugs got in.
  const squashed = { w: 200, h: 200, crop: OFFSET }
  const plain = trueShapePatch(pic(squashed))!
  for (const [what, flipX, flipY] of WAYS) {
    const turned = pic({ ...squashed, flipX, flipY })
    boxIs(`${what}: unsquash reaches the same box`, trueShapePatch(turned)! as Bounds, plain as Bounds)
    check(`${what}: …off the same visible ratio`, close(visibleAspect(turned)!, visibleAspect(pic(squashed))!))
  }
}

// ---------------------------------------------------------------------------
// The flag, not the maths: when does crop mode end?
//
// Everything above is arithmetic on two rectangles. This last part needs the
// store, because the bug it exists for was never in the numbers. Crop mode is
// derived — one picture, and that picture the whole selection — but deriving
// it only ever *hid* the mode while the selection was elsewhere. The flag
// stayed on the picture, so the mode came back on its own the moment the
// selection landed there again: three Tabs, and the next drag re-framed a
// picture the user was trying to move.
//
// So every path that changes the selection without going through setSelection
// gets a line here. The store heals the flag in one place, after every write,
// which is what makes the list below a check rather than a to-do list.
// ---------------------------------------------------------------------------

;(globalThis as { window?: unknown }).window = {
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
}
const held = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => held.get(k) ?? null,
  setItem: (k: string, v: string) => void held.set(k, v),
  removeItem: (k: string) => void held.delete(k),
}

const { useSquig } = await import("../lib/store.ts")
const s = () => useSquig.getState()
const add = (n: Partial<SquigNode>) => s().addNode(n as unknown as Omit<SquigNode, "id" | "seed">, { checkpoint: false })

/** Two pictures and a rectangle, with crop mode on the first picture. */
function cropping(): string {
  useSquig.setState({
    nodes: {},
    order: [],
    selection: [],
    clipboard: [],
    past: [],
    future: [],
    dupTrail: null,
    editingId: null,
    croppingId: null,
  })
  const img = add({ ...pic(), id: undefined })
  add({ ...pic(), id: undefined, x: 400 })
  add({ type: "shape", shape: "rect", fill: "none", x: 700, y: 0, w: 100, h: 60 } as Partial<SquigNode>)
  s().setCropping(img)
  return img
}

/** The mode as the canvas asks about it. */
const modeOn = () => !!cropTarget(s().nodes, s().selection, s().croppingId)

{
  const img = cropping()
  check("double-clicking a picture puts crop mode on", modeOn() && s().selection.join() === img)

  // the gesture itself: a crop writes to the picture on every pointermove, and
  // none of that is a reason to leave
  s().updateNodes({ [img]: { crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } } as Partial<SquigNode> })
  check("dragging the crop window doesn't end crop mode", modeOn())
}

// Each of these takes the selection off the picture. What's checked is not
// that the overlay is gone while the selection is away — deriving it did that
// much — but that the flag itself is gone, so nothing can re-arm the mode by
// landing on that picture again.
const leaves: [string, (img: string) => void][] = [
  ["Tab steps to the next layer", () => s().cycleSelection(1)],
  ["⇧Tab steps back", () => s().cycleSelection(-1)],
  ["⌘A takes everything", () => s().selectAll()],
  ["invert swaps the selection", () => s().invertSelection()],
  ["select-same-kind grows it", () => s().selectSameKind()],
  ["⌘D leaves the copy selected", () => void s().duplicateSelected()],
  ["⌘V leaves the paste selected", (img) => s().pasteNodes([s().nodes[img]], [800, 800])],
  ["a click on another layer", () => s().setSelection([s().order[2]])],
  ["a click on empty canvas", () => s().selectNone()],
]

for (const [what, run] of leaves) {
  const img = cropping()
  run(img)
  check(`${what}: the crop flag is dropped`, s().croppingId === null, `croppingId ${s().croppingId}`)
  // and then whatever lands the selection back on the picture — another Tab, a
  // click, an undo. The mode must not come back on its own.
  s().setSelection([img])
  check(`${what}: …and selecting that picture again doesn't re-arm crop mode`, !modeOn())
}

{
  // the one selection change that legitimately leaves the mode alone: the one
  // that didn't actually move
  const img = cropping()
  s().setSelection([img])
  check("a selection that never moved keeps crop mode", modeOn() && s().croppingId === img)
}

{
  // and the picture going away takes the mode with it
  const img = cropping()
  s().removeNodes([img])
  check("deleting the picture ends crop mode", s().croppingId === null)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} crop checks passed`)
