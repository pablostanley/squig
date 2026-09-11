import { HANDLE_CURSORS, handleOffset, type Handle } from "./transform"

/** roughly three handles' worth of box, below which they'd overlap into mush */
export const HANDLE_ROOM = 34

/** the white square you actually see, in screen px */
export const HANDLE_DOT = 10

/**
 * How far past the selection box a handle still answers to the pointer.
 *
 * Nothing else is grabbable out there, so the handles may as well be greedy
 * in that direction — aiming at a 10px square is the whole problem.
 */
export const GRAB_OUT = 8

/** and how far inward, at most — see `grabPad` for why it's a maximum */
const GRAB_IN = 8

/**
 * Inward slop along one axis, in screen px.
 *
 * Reaching inward is where handles compete with each other, so the pad shrinks
 * on small boxes: `crowded` says a third handle sits halfway along this axis,
 * which halves the room each one gets. Without this a 40px box would resize
 * from its middle handle when you aimed at its corner.
 */
export function grabPad(len: number, crowded: boolean): number {
  const room = (crowded ? len / 4 : len / 2) - HANDLE_DOT / 2
  return Math.max(0, Math.min(GRAB_IN, room))
}

/** The handle's hit rect and the offset of its dot inside it, in screen px. */
export function handleHitBox(hd: Handle, w: number, h: number, padX: number, padY: number) {
  const [hx, hy] = handleOffset(hd, w, h)
  const r = HANDLE_DOT / 2
  const span = (edgeLow: boolean, edgeHigh: boolean, pad: number): [number, number] => {
    const lo = -r - (edgeLow ? GRAB_OUT : pad)
    const hi = r + (edgeHigh ? GRAB_OUT : pad)
    return [lo, hi - lo]
  }
  const compactSpan = (low: boolean, high: boolean, pad: number, len: number): [number, number] => {
    if (len <= 12 && low) return [-r - GRAB_OUT, r + GRAB_OUT]
    if (len <= 12 && high) return [0, r + GRAB_OUT]
    return span(low, high, pad)
  }
  const [dx, width] = compactSpan(hd.includes("w"), hd.includes("e"), padX, w)
  const [dy, height] = compactSpan(hd.includes("n"), hd.includes("s"), padY, h)
  return { left: hx + dx, top: hy + dy, width, height, dotLeft: -dx - r, dotTop: -dy - r }
}

/** A continuous edge grip, biased outward so the interior remains movable. */
export function edgeHitBox(hd: "n" | "e" | "s" | "w", w: number, h: number) {
  const inset = HANDLE_DOT / 2 + GRAB_OUT
  const inward = Math.min(4, Math.max(0, (hd === "n" || hd === "s" ? h : w) / 4))
  if (hd === "n" || hd === "s") {
    return { left: inset, top: hd === "n" ? -GRAB_OUT : h - inward,
      width: Math.max(0, w - inset * 2), height: GRAB_OUT + inward }
  }
  return { left: hd === "w" ? -GRAB_OUT : w - inward, top: inset,
    width: GRAB_OUT + inward, height: Math.max(0, h - inset * 2) }
}

/** Thin selections retain end grips; tiny selections get one outward corner. */
export function visibleHandles(w: number, h: number, text = false): Handle[] {
  if (w <= 12 && h <= 12) return ["se"]
  if (h <= 12) return ["w", "e"]
  if (w <= 12) return ["n", "s"]
  return (["nw", "ne", "se", "sw", ...(w >= HANDLE_ROOM ? ["n", "s"] : []),
    ...(text || h >= HANDLE_ROOM ? ["e", "w"] : [])] as Handle[])
}

export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 15a8 8 0 1 1 12 4M2 11l3 5 5-3" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 15a8 8 0 1 1 12 4M2 11l3 5 5-3" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')}") 12 12, crosshair`

/** Native resize arrows follow the on-screen orientation of a rotated edge. */
export function resizeCursor(handle: Handle, rotation = 0): string {
  if (!rotation) return HANDLE_CURSORS[handle]
  const angle = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }[handle]
  const index = ((Math.round((angle - rotation) / 45) % 4) + 4) % 4
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][index]
}
