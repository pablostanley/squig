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
// ---------------------------------------------------------------------------

import type { Bounds } from "../selection"
import { cropOf, normalizeCrop, type ImageCrop, type ImageNode } from "../types"
import { MIN_SIZE, type Handle } from "./transform"

const EPS = 1e-6

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * Where the whole picture lies in world space — the sheet the window sits on.
 *
 * An uncropped picture returns its own box, so every caller below works the
 * same on a picture that has never been cropped as on one that has.
 */
export function imageSheet(n: ImageNode): Bounds {
  const c = cropOf(n)
  const w = n.w / c.w
  const h = n.h / c.h
  return { x: n.x - c.x * w, y: n.y - c.y * h, w, h }
}

/** Where a window sits on a sheet, as the 0..1 crop the node stores. */
export function windowToCrop(win: Bounds, sheet: Bounds): ImageCrop {
  const sw = sheet.w > EPS ? sheet.w : 1
  const sh = sheet.h > EPS ? sheet.h : 1
  return {
    x: (win.x - sheet.x) / sw,
    y: (win.y - sheet.y) / sh,
    w: win.w / sw,
    h: win.h / sh,
  }
}

/**
 * The patch a gesture writes: the box it landed on, and the crop that box
 * means. `crop` is undefined when the window has been opened back out to the
 * whole sheet — see normalizeCrop on why that isn't {0,0,1,1}.
 */
export function cropPatch(win: Bounds, sheet: Bounds): Partial<ImageNode> {
  return { x: win.x, y: win.y, w: win.w, h: win.h, crop: normalizeCrop(windowToCrop(win, sheet)) }
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
 */
export function uncropPatch(n: ImageNode): Partial<ImageNode> {
  const sheet = imageSheet(n)
  return { x: sheet.x, y: sheet.y, w: sheet.w, h: sheet.h, crop: undefined }
}
