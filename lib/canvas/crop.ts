// ---------------------------------------------------------------------------
// Crop maths — pure.
//
// One picture, two rectangles. The *window* is the node's own box: the part of
// the picture that prints. The *sheet* is where the whole picture would lie in
// world space if none of it were hidden — larger than the window whenever
// there's a crop, exactly the window when there isn't.
//
// Every crop gesture holds one of the two still and moves the other:
//
//   · dragging a handle moves the window's edges over a pinned sheet, which is
//     what makes cropping feel like sliding a mat over a photo rather than
//     resizing the photo — the pixels you keep don't move or change size
//   · dragging inside slides the sheet under a pinned window
//
// Either way the answer is the same arithmetic at the end: where the window
// now sits on the sheet, written down as a 0..1 crop. The node's `crop` is
// never accumulated from deltas, so a drag out and back is lossless.
//
// Both rectangles are world space — where the picture can actually be pointed
// at, mirrored side included. A flip only has to be spelled out at the very
// last step, in windowToCrop, where world distances turn into the 0..1 crop
// the node stores: that number runs with the pixels, and on a flipped picture
// the pixels run the other way. Keeping the mirror there and nowhere else is
// what leaves everything above it — resize, clamp, pan, anchor — plain
// rectangle arithmetic with no way of being flip-blind. It was flip-blind at
// first, and every gesture proved it separately: handles trimmed the edge
// opposite the one under the cursor, and a drag inside sent the picture the
// wrong way down the canvas.
// ---------------------------------------------------------------------------

import type { Bounds } from "../selection"
import { cropOf, normalizeCrop, type ImageCrop, type ImageNode } from "../types"
import { MIN_SIZE, mirrorBounds, type Handle } from "./transform"

const EPS = 1e-6

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * Where the whole picture lies in world space — the sheet the window sits on.
 *
 * An uncropped picture returns its own box, so every caller below works the
 * same on a picture that has never been cropped as on one that has.
 *
 * The hidden part hangs off the box up and to the left of the crop, and then
 * the renderer mirrors the lot about the box — so on a flipped picture it
 * hangs off the other side, and the mirror belongs here. This rectangle is
 * used as the dashed "rest of the picture" outline and as the surface a press
 * slides, both of which have to land on the pixels the eye can see.
 */
export function imageSheet(n: ImageNode): Bounds {
  const c = cropOf(n)
  const w = n.w / c.w
  const h = n.h / c.h
  return mirrorBounds(n, { x: n.x - c.x * w, y: n.y - c.y * h, w, h })
}

/**
 * Where a window sits on a sheet, as the 0..1 crop the node stores.
 *
 * The crop counts from the first pixel of the file, and a flipped picture is
 * drawn with its first pixel at the far end of the sheet — so on a flipped
 * axis the offset is measured back from that end instead. Nothing else about
 * the maths turns over: a width is a width whichever way round it's printed,
 * and the two sizes below are untouched.
 */
export function windowToCrop(win: Bounds, sheet: Bounds, flipX: boolean, flipY: boolean): ImageCrop {
  const sw = sheet.w > EPS ? sheet.w : 1
  const sh = sheet.h > EPS ? sheet.h : 1
  return {
    x: (flipX ? sheet.x + sheet.w - (win.x + win.w) : win.x - sheet.x) / sw,
    y: (flipY ? sheet.y + sheet.h - (win.y + win.h) : win.y - sheet.y) / sh,
    w: win.w / sw,
    h: win.h / sh,
  }
}

/**
 * The patch a gesture writes: the box it landed on, and the crop that box
 * means. `crop` is undefined when the window has been opened back out to the
 * whole sheet — see normalizeCrop on why that isn't {0,0,1,1}.
 *
 * The flips are taken one at a time rather than as the node, because the box
 * this window came from is mid-drag and half of it is already stale; the only
 * thing the crop needs from the node is which way round it prints.
 */
export function cropPatch(win: Bounds, sheet: Bounds, flipX: boolean, flipY: boolean): Partial<ImageNode> {
  return { x: win.x, y: win.y, w: win.w, h: win.h, crop: normalizeCrop(windowToCrop(win, sheet, flipX, flipY)) }
}

/**
 * The point a resize holds still — the one the window grows and shrinks about.
 *
 * This mirrors what `resizeBounds` pins, because the clamp below scales the
 * box about this point and has to leave the dragged edge's opposite exactly
 * where resizeBounds put it. A side handle under aspect lock grows about the
 * centre on the perpendicular axis, so that axis anchors at the centre.
 */
export function cropAnchor(handle: Handle, orig: Bounds, fromCenter: boolean): [number, number] {
  const cx = orig.x + orig.w / 2
  const cy = orig.y + orig.h / 2
  if (fromCenter) return [cx, cy]
  const x = handle.includes("w") ? orig.x + orig.w : handle.includes("e") ? orig.x : cx
  const y = handle.includes("n") ? orig.y + orig.h : handle.includes("s") ? orig.y : cy
  return [x, y]
}

/** One axis, clamped into [lo, hi] and never squeezed below MIN_SIZE. */
function clampSpan(a: number, b: number, lo: number, hi: number): [number, number] {
  let start = Math.max(a, lo)
  let end = Math.min(b, hi)
  if (end - start < MIN_SIZE) {
    // grow back out of whichever end has room; a sheet narrower than MIN_SIZE
    // can't happen — the window it came from was at least that wide
    if (start <= lo) end = Math.min(hi, start + MIN_SIZE)
    else start = Math.max(lo, end - MIN_SIZE)
  }
  return [start, end]
}

/**
 * Pull a window back inside its sheet.
 *
 * Without `anchor` each edge is clamped where it stands, which is what a free
 * drag wants: run past the top of the picture and the top edge stops, the
 * others carry on. With `anchor` — Shift, aspect locked — clamping one edge
 * would quietly break the ratio the user is holding, so the whole box scales
 * down about the point the gesture is pinning instead. It shrinks to the
 * biggest box of that ratio that still fits, and keeps the pinned edge.
 */
export function clampWindow(box: Bounds, sheet: Bounds, anchor?: [number, number]): Bounds {
  const left = sheet.x
  const right = sheet.x + sheet.w
  const top = sheet.y
  const bottom = sheet.y + sheet.h

  if (!anchor) {
    const [x0, x1] = clampSpan(box.x, box.x + box.w, left, right)
    const [y0, y1] = clampSpan(box.y, box.y + box.h, top, bottom)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  const [ax, ay] = anchor
  let s = 1
  // reach: how far the box wants to go from the anchor on this side, against
  // how far it may. Both are measured outward from the anchor, so both are
  // non-negative for an anchor inside the sheet — which it always is, having
  // come from a window that was already there.
  const fit = (want: number, room: number) => {
    if (want > EPS && room < want) s = Math.min(s, Math.max(0, room) / want)
  }
  fit(ax - box.x, ax - left)
  fit(box.x + box.w - ax, right - ax)
  fit(ay - box.y, ay - top)
  fit(box.y + box.h - ay, bottom - ay)

  if (s >= 1) return box
  const scaled = {
    x: ax - (ax - box.x) * s,
    y: ay - (ay - box.y) * s,
    w: box.w * s,
    h: box.h * s,
  }
  // the ratio has already been honoured; a box scaled to nothing still has to
  // be grabbable, so the floor wins over it at the very end
  return clampWindow(scaled, sheet)
}

/**
 * Slide the picture under a fixed window.
 *
 * The clamp is what stops the drag at the edge of the picture: the sheet may
 * not be pulled so far that bare canvas shows inside the window.
 */
export function panSheet(sheet: Bounds, win: Bounds, dx: number, dy: number): Bounds {
  return {
    ...sheet,
    x: clamp(sheet.x + dx, win.x + win.w - sheet.w, win.x),
    y: clamp(sheet.y + dy, win.y + win.h - sheet.h, win.y),
  }
}

/** Is any of this picture hidden? */
export function isCropped(n: ImageNode): boolean {
  return n.crop !== undefined
}

/**
 * Give the hidden pixels back, growing the box to the sheet the crop was cut
 * from — the picture stays exactly the size it looks, and the parts that were
 * outside the window reappear around it.
 *
 * A flipped picture gets the same deal, because the sheet is world space: the
 * new box lands over the pixels that were already showing, and an uncropped
 * picture mirrored about that box is the picture exactly where it was.
 */
export function uncropPatch(n: ImageNode): Partial<ImageNode> {
  const sheet = imageSheet(n)
  return { x: sheet.x, y: sheet.y, w: sheet.w, h: sheet.h, crop: undefined }
}

/**
 * The ratio the picture actually shows: its own pixels, narrowed by the crop.
 *
 * The crop is the whole reason this isn't `naturalW / naturalH`. A photo cut
 * down to a tall sliver is a tall picture now, whatever shape the file it came
 * from was, and handing it the file's ratio back would be a second squash
 * wearing a fix's coat.
 *
 * Null when the numbers can't answer — a picture that decoded to nothing, or
 * one from a document written before natural size was recorded. Callers do
 * nothing rather than divide by it.
 */
export function visibleAspect(n: ImageNode): number | null {
  const c = cropOf(n)
  const w = n.naturalW * c.w
  const h = n.naturalH * c.h
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= EPS || h <= EPS) return null
  return w / h
}

/** Closer than this and nobody could see the difference, so there isn't one. */
const HAIR = 0.5

/**
 * Give a picture its shape back — the same box, unbent.
 *
 * Two choices worth writing down, because both had a plausible other answer.
 *
 * The *area* is what's held, not the width. Keeping the width is a line
 * shorter, but a picture someone had dragged out into a long letterbox would
 * come back nearly as tall as it is wide and tower over whatever was arranged
 * around it. Holding the area means the picture stays about as prominent on
 * the page as it was: its shape changes, its weight doesn't.
 *
 * The *centre* holds still, not the top-left. The gesture that lands here most
 * often is a double-click on a corner handle, and pinning the opposite corner
 * would send the corner under the cursor the entire distance — the picture
 * would read as having fled the pointer. Pinning the centre halves that on
 * both axes, is the same answer whichever of the four corners was clicked, and
 * leaves a row of pictures sitting roughly where the eye left them.
 *
 * A flip is the one thing on the node this can afford to ignore. A ratio has
 * no handedness, and the box is resized about its own centre — which the
 * mirror holds still — so the picture comes back unbent and the same way round
 * whether or not it's turned over.
 *
 * Null means there is nothing to do: the box is already true, or the numbers
 * won't say what true is. Callers skip the checkpoint on null, so this can't
 * leave an undo step that undoes nothing — the same deal a tap with the pen
 * gets in finishGesture.
 */
export function trueShapePatch(n: ImageNode): Partial<ImageNode> | null {
  const ratio = visibleAspect(n)
  if (ratio === null) return null
  if (!Number.isFinite(n.w) || !Number.isFinite(n.h) || n.w <= EPS || n.h <= EPS) return null

  const area = n.w * n.h
  let w = Math.sqrt(area * ratio)
  let h = Math.sqrt(area / ratio)
  // a wild ratio on a small box can push one axis under the handle floor;
  // growing both by one factor keeps the shape we just worked out
  const grow = Math.max(1, MIN_SIZE / w, MIN_SIZE / h)
  w *= grow
  h *= grow

  if (Math.abs(w - n.w) < HAIR && Math.abs(h - n.h) < HAIR) return null
  // the crop rides along untouched: it's normalised, so the same window of the
  // picture fills the new box, and the sheet resizes with it
  return { x: n.x + (n.w - w) / 2, y: n.y + (n.h - h) / 2, w, h }
}
