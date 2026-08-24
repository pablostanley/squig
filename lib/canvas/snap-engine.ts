// ---------------------------------------------------------------------------
// Smart Guides — Snap Engine
// ---------------------------------------------------------------------------
// Pure calculation engine for alignment and equal-spacing snapping. No React,
// no store.
// All calculations in screen space (overlay-relative pixels) so the snap
// threshold feels consistent regardless of zoom level.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A rectangle in screen-space overlay coordinates. */
export interface SnapRect {
  id: string
  left: number
  top: number
  width: number
  height: number
  /** center x = left + width / 2 */
  cx: number
  /** center y = top + height / 2 */
  cy: number
}

/** A guide line to render on the overlay. */
export interface GuideLine {
  axis: "x" | "y"
  /** For axis='x' this is the x position; for axis='y' this is the y position */
  position: number
  /** Extent start (min of aligned elements) */
  start: number
  /** Extent end (max of aligned elements) */
  end: number
}

/** A distance indicator between two edges. */
export interface DistanceIndicator {
  axis: "x" | "y"
  /** Distance in design-space units (the number shown in the label). */
  distance: number
  /** Line start */
  x1: number
  y1: number
  /** Line end */
  x2: number
  y2: number
  /** Label position */
  labelX: number
  labelY: number
}

/** Result of a snap calculation. */
export interface SnapResult {
  /** Screen-space delta to apply */
  dx: number
  dy: number
  /** Guide lines to render */
  guides: GuideLine[]
  /** Distance indicators to render */
  distances: DistanceIndicator[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeSnapRect(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number
): SnapRect {
  return { id, left, top, width, height, cx: left + width / 2, cy: top + height / 2 }
}

/** Extract 3 snap positions per axis. */
function getEdges(r: SnapRect): { x: number[]; y: number[] } {
  return {
    x: [r.left, r.cx, r.left + r.width],
    y: [r.top, r.cy, r.top + r.height],
  }
}

type SnapAxis = "x" | "y"

interface AlignmentMatch {
  pos: number
  rects: SnapRect[]
}

interface AlignmentResult {
  delta: number
  matches: AlignmentMatch[]
}

interface SpacingResult {
  delta: number
  distances: DistanceIndicator[]
  /** Prefer the most local equal-spacing relationship when several coincide. */
  span: number
}

const EPSILON = 1e-6

function axisStart(r: SnapRect, axis: SnapAxis): number {
  return axis === "x" ? r.left : r.top
}

function axisSize(r: SnapRect, axis: SnapAxis): number {
  return axis === "x" ? r.width : r.height
}

function axisEnd(r: SnapRect, axis: SnapAxis): number {
  return axisStart(r, axis) + axisSize(r, axis)
}

function crossStart(r: SnapRect, axis: SnapAxis): number {
  return axis === "x" ? r.top : r.left
}

function crossEnd(r: SnapRect, axis: SnapAxis): number {
  return crossStart(r, axis) + (axis === "x" ? r.height : r.width)
}

function laneOverlap(a: SnapRect, b: SnapRect, axis: SnapAxis, padding = 0): boolean {
  return (
    Math.min(crossEnd(a, axis), crossEnd(b, axis)) + padding >=
    Math.max(crossStart(a, axis), crossStart(b, axis))
  )
}

function translated(r: SnapRect, axis: SnapAxis, delta: number): SnapRect {
  return makeSnapRect(
    r.id,
    r.left + (axis === "x" ? delta : 0),
    r.top + (axis === "y" ? delta : 0),
    r.width,
    r.height
  )
}

/** One dimension of ordinary edge / centre alignment. */
function computeAlignment(
  dragged: SnapRect,
  candidates: SnapRect[],
  axis: SnapAxis,
  threshold: number
): AlignmentResult | null {
  const dragEdges = getEdges(dragged)[axis]
  let best = Infinity
  const matches: AlignmentMatch[] = []

  for (const dragPos of dragEdges) {
    for (const cand of candidates) {
      if (cand.id === dragged.id) continue
      for (const candPos of getEdges(cand)[axis]) {
        const delta = candPos - dragPos
        const absDelta = Math.abs(delta)
        if (absDelta > threshold) continue
        if (absDelta < Math.abs(best) - EPSILON) {
          best = delta
          matches.length = 0
        }
        if (Math.abs(delta - best) > EPSILON) continue

        const existing = matches.find((match) => Math.abs(match.pos - candPos) <= EPSILON)
        if (existing) {
          if (!existing.rects.some((r) => r.id === cand.id)) existing.rects.push(cand)
        } else {
          matches.push({ pos: candPos, rects: [cand] })
        }
      }
    }
  }

  return Number.isFinite(best) ? { delta: best, matches } : null
}

function spacingIndicator(
  axis: SnapAxis,
  before: SnapRect,
  after: SnapRect,
  cross: number,
  scale: number
): DistanceIndicator {
  const start = axisEnd(before, axis)
  const end = axisStart(after, axis)
  const gap = Math.max(0, end - start)
  if (axis === "x") {
    return {
      axis,
      distance: Math.round(gap / scale),
      x1: start,
      y1: cross,
      x2: end,
      y2: cross,
      labelX: (start + end) / 2,
      labelY: cross,
    }
  }
  return {
    axis,
    distance: Math.round(gap / scale),
    x1: cross,
    y1: start,
    x2: cross,
    y2: end,
    labelX: cross,
    labelY: (start + end) / 2,
  }
}

/** The two matching gaps around a three-item equal-spacing sequence. */
function spacingIndicators(axis: SnapAxis, rects: SnapRect[], scale: number): DistanceIndicator[] {
  const ordered = [...rects].sort((a, b) => axisStart(a, axis) - axisStart(b, axis))
  const overlapStart = Math.max(...ordered.map((r) => crossStart(r, axis)))
  const overlapEnd = Math.min(...ordered.map((r) => crossEnd(r, axis)))
  const cross = overlapEnd >= overlapStart
    ? (overlapStart + overlapEnd) / 2
    : ordered.reduce((sum, r) => sum + (crossStart(r, axis) + crossEnd(r, axis)) / 2, 0) / ordered.length
  return [
    spacingIndicator(axis, ordered[0], ordered[1], cross, scale),
    spacingIndicator(axis, ordered[1], ordered[2], cross, scale),
  ]
}

/**
 * Find a three-item equal-spacing placement on one axis.
 *
 * This covers both Figma-style cases: dropping an item between two neighbours
 * and extending an existing two-item rhythm before or after the pair. Only
 * items sharing the same perpendicular lane participate, which keeps a busy
 * board from inventing spacing relationships across unrelated rows/columns.
 */
function computeEqualSpacing(
  dragged: SnapRect,
  candidates: SnapRect[],
  axis: SnapAxis,
  threshold: number,
  scale: number
): SpacingResult | null {
  let best: SpacingResult | null = null
  const dragSize = axisSize(dragged, axis)
  const dragStart = axisStart(dragged, axis)

  const consider = (a: SnapRect, b: SnapRect, desiredStart: number, span: number) => {
    const delta = desiredStart - dragStart
    if (Math.abs(delta) > threshold) return
    const snapped = translated(dragged, axis, delta)
    const next: SpacingResult = {
      delta,
      distances: spacingIndicators(axis, [a, b, snapped], scale),
      span,
    }
    if (
      !best ||
      Math.abs(next.delta) < Math.abs(best.delta) - EPSILON ||
      (Math.abs(Math.abs(next.delta) - Math.abs(best.delta)) <= EPSILON && next.span < best.span)
    ) {
      best = next
    }
  }

  // Only neighbours that share the dragged item's lane can be part of its
  // spacing rhythm. Sorting once and testing adjacent neighbours keeps this
  // pass O(n log n), rather than comparing every pair on every pointer frame.
  const lane = candidates
    .filter((candidate) => laneOverlap(dragged, candidate, axis, threshold))
    .sort((a, b) => axisStart(a, axis) - axisStart(b, axis))

  for (let i = 0; i < lane.length - 1; i++) {
    const a = lane[i]
    const b = lane[i + 1]

    // A spacing rhythm needs two separate neighbours in one visible lane.
    if (axisEnd(a, axis) > axisStart(b, axis) || !laneOverlap(a, b, axis)) continue

    const pairGap = axisStart(b, axis) - axisEnd(a, axis)
    const pairSpan = axisEnd(b, axis) - axisStart(a, axis)

    // Extend the pair on either side using its existing gap. A zero gap is
    // edge snapping, not a spacing rhythm, and already has a clearer guide.
    if (pairGap > EPSILON) {
      consider(a, b, axisStart(a, axis) - pairGap - dragSize, pairSpan + pairGap + dragSize)
      consider(a, b, axisEnd(b, axis) + pairGap, pairSpan + pairGap + dragSize)
    }

    // Or fit the dragged box into the available space with an equal gap on
    // both sides. The pair did not have to be evenly spaced beforehand.
    const free = pairGap - dragSize
    if (free > EPSILON) consider(a, b, axisEnd(a, axis) + free / 2, pairSpan)
  }

  return best
}

// ---------------------------------------------------------------------------
// computeSnap — Core snapping algorithm
// ---------------------------------------------------------------------------

/**
 * Compare the dragged rect's edges/centers against all candidate edges.
 * For each axis independently, find the smallest delta within `threshold`.
 * Returns the snap delta (screen px) and guide lines to render.
 */
export function computeSnap(
  dragged: SnapRect,
  candidates: SnapRect[],
  threshold: number,
  parent?: SnapRect,
  scale: number = 1
): SnapResult {
  const allCandidates = parent ? [parent, ...candidates] : candidates
  const xAlign = computeAlignment(dragged, allCandidates, "x", threshold)
  const yAlign = computeAlignment(dragged, allCandidates, "y", threshold)
  // A parent/frame is a useful alignment target but not one item in a sibling
  // spacing rhythm, so equal spacing deliberately considers siblings only.
  const xSpacing = computeEqualSpacing(dragged, candidates, "x", threshold, scale)
  const ySpacing = computeEqualSpacing(dragged, candidates, "y", threshold, scale)

  const chooseDelta = (align: AlignmentResult | null, spacing: SpacingResult | null) => {
    if (!align) return spacing?.delta ?? 0
    if (!spacing) return align.delta
    return Math.abs(spacing.delta) < Math.abs(align.delta) - EPSILON ? spacing.delta : align.delta
  }

  const dx = chooseDelta(xAlign, xSpacing)
  const dy = chooseDelta(yAlign, ySpacing)
  const guides: GuideLine[] = []
  const distances: DistanceIndicator[] = []

  // Build guide lines for X matches (vertical lines)
  const snappedDragged = makeSnapRect(
    dragged.id,
    dragged.left + dx,
    dragged.top + dy,
    dragged.width,
    dragged.height
  )

  for (const match of xAlign && Math.abs(xAlign.delta - dx) <= EPSILON ? xAlign.matches : []) {
    // Compute the vertical extent of the guide line
    const allRects = [...match.rects, snappedDragged]
    let minY = Infinity
    let maxY = -Infinity
    for (const r of allRects) {
      minY = Math.min(minY, r.top)
      maxY = Math.max(maxY, r.top + r.height)
    }
    guides.push({
      axis: "x",
      position: match.pos,
      start: minY,
      end: maxY,
    })
  }

  // Build guide lines for Y matches (horizontal lines)
  for (const match of yAlign && Math.abs(yAlign.delta - dy) <= EPSILON ? yAlign.matches : []) {
    const allRects = [...match.rects, snappedDragged]
    let minX = Infinity
    let maxX = -Infinity
    for (const r of allRects) {
      minX = Math.min(minX, r.left)
      maxX = Math.max(maxX, r.left + r.width)
    }
    guides.push({
      axis: "y",
      position: match.pos,
      start: minX,
      end: maxX,
    })
  }

  // Alignment and equal spacing can both be true on the same frame. Keep the
  // hairline and the paired measurements in that case instead of arbitrarily
  // hiding one piece of useful feedback.
  if (xSpacing && Math.abs(xSpacing.delta - dx) <= EPSILON) distances.push(...xSpacing.distances)
  if (ySpacing && Math.abs(ySpacing.delta - dy) <= EPSILON) distances.push(...ySpacing.distances)

  return { dx, dy, guides, distances }
}

// ---------------------------------------------------------------------------
// computeResizeSnap — Snap only the edges being resized
// ---------------------------------------------------------------------------

/**
 * During resize, only the moving edge(s) should snap.
 * `handle` is the resize handle string like "nw", "e", "se", etc.
 */
export function computeResizeSnap(
  dragged: SnapRect,
  handle: string,
  candidates: SnapRect[],
  threshold: number,
  parent?: SnapRect
): SnapResult {
  const allCandidates = parent ? [parent, ...candidates] : candidates
  const guides: GuideLine[] = []

  // Determine which edges are moving
  const movingLeft = handle.includes("w")
  const movingRight = handle.includes("e")
  const movingTop = handle.includes("n")
  const movingBottom = handle.includes("s")

  // Collect the drag positions to test for each axis
  const testX: number[] = []
  if (movingLeft) testX.push(dragged.left)
  if (movingRight) testX.push(dragged.left + dragged.width)

  const testY: number[] = []
  if (movingTop) testY.push(dragged.top)
  if (movingBottom) testY.push(dragged.top + dragged.height)

  let bestDx = Infinity
  let bestDy = Infinity
  const xMatches: { pos: number; rects: SnapRect[] }[] = []
  const yMatches: { pos: number; rects: SnapRect[] }[] = []

  // X axis
  for (const dragPos of testX) {
    for (const cand of allCandidates) {
      if (cand.id === dragged.id) continue
      const candEdges = getEdges(cand)
      for (const candPos of candEdges.x) {
        const delta = candPos - dragPos
        const absDelta = Math.abs(delta)
        if (absDelta > threshold) continue
        if (absDelta < Math.abs(bestDx)) {
          bestDx = delta
          xMatches.length = 0
          xMatches.push({ pos: candPos, rects: [cand] })
        } else if (absDelta === Math.abs(bestDx) && delta === bestDx) {
          const existing = xMatches.find((m) => m.pos === candPos)
          if (existing) existing.rects.push(cand)
          else xMatches.push({ pos: candPos, rects: [cand] })
        }
      }
    }
  }

  // Y axis
  for (const dragPos of testY) {
    for (const cand of allCandidates) {
      if (cand.id === dragged.id) continue
      const candEdges = getEdges(cand)
      for (const candPos of candEdges.y) {
        const delta = candPos - dragPos
        const absDelta = Math.abs(delta)
        if (absDelta > threshold) continue
        if (absDelta < Math.abs(bestDy)) {
          bestDy = delta
          yMatches.length = 0
          yMatches.push({ pos: candPos, rects: [cand] })
        } else if (absDelta === Math.abs(bestDy) && delta === bestDy) {
          const existing = yMatches.find((m) => m.pos === candPos)
          if (existing) existing.rects.push(cand)
          else yMatches.push({ pos: candPos, rects: [cand] })
        }
      }
    }
  }

  const dx = isFinite(bestDx) ? bestDx : 0
  const dy = isFinite(bestDy) ? bestDy : 0

  // Build guide lines
  const snappedDragged = makeSnapRect(
    dragged.id,
    dragged.left + (movingLeft ? dx : 0),
    dragged.top + (movingTop ? dy : 0),
    dragged.width + (movingRight ? dx : movingLeft ? -dx : 0),
    dragged.height + (movingBottom ? dy : movingTop ? -dy : 0)
  )

  for (const match of xMatches) {
    const allRects = [...match.rects, snappedDragged]
    let minY = Infinity
    let maxY = -Infinity
    for (const r of allRects) {
      minY = Math.min(minY, r.top)
      maxY = Math.max(maxY, r.top + r.height)
    }
    guides.push({ axis: "x", position: match.pos, start: minY, end: maxY })
  }

  for (const match of yMatches) {
    const allRects = [...match.rects, snappedDragged]
    let minX = Infinity
    let maxX = -Infinity
    for (const r of allRects) {
      minX = Math.min(minX, r.left)
      maxX = Math.max(maxX, r.left + r.width)
    }
    guides.push({ axis: "y", position: match.pos, start: minX, end: maxX })
  }

  return { dx, dy, guides, distances: [] }
}

// ---------------------------------------------------------------------------
// computeDistances — Alt+hover distance indicators
// ---------------------------------------------------------------------------

/**
 * For each direction (left, right, up, down), find the nearest element
 * that overlaps on the perpendicular axis and compute the pixel gap.
 * `scale` converts screen distances to world (design-space) distances
 * so labels show the correct value regardless of zoom level.
 */
export function computeDistances(
  selected: SnapRect,
  candidates: SnapRect[],
  parent?: SnapRect,
  scale: number = 1
): DistanceIndicator[] {
  const allCandidates = parent ? [parent, ...candidates] : candidates
  const indicators: DistanceIndicator[] = []

  const selLeft = selected.left
  const selRight = selected.left + selected.width
  const selTop = selected.top
  const selBottom = selected.top + selected.height

  // For each candidate, check if it overlaps on one axis and compute gap on the other
  for (const cand of allCandidates) {
    if (cand.id === selected.id) continue

    const candLeft = cand.left
    const candRight = cand.left + cand.width
    const candTop = cand.top
    const candBottom = cand.top + cand.height

    // Vertical overlap check (for horizontal distance)
    const vOverlapStart = Math.max(selTop, candTop)
    const vOverlapEnd = Math.min(selBottom, candBottom)
    const hasVerticalOverlap = vOverlapEnd > vOverlapStart

    // Horizontal overlap check (for vertical distance)
    const hOverlapStart = Math.max(selLeft, candLeft)
    const hOverlapEnd = Math.min(selRight, candRight)
    const hasHorizontalOverlap = hOverlapEnd > hOverlapStart

    if (hasVerticalOverlap) {
      const midY = (vOverlapStart + vOverlapEnd) / 2

      // Gap to the left
      if (candRight <= selLeft) {
        const dist = selLeft - candRight
        indicators.push({
          axis: "x",
          distance: Math.round(dist / scale),
          x1: candRight,
          y1: midY,
          x2: selLeft,
          y2: midY,
          labelX: candRight + dist / 2,
          labelY: midY,
        })
      }

      // Gap to the right
      if (candLeft >= selRight) {
        const dist = candLeft - selRight
        indicators.push({
          axis: "x",
          distance: Math.round(dist / scale),
          x1: selRight,
          y1: midY,
          x2: candLeft,
          y2: midY,
          labelX: selRight + dist / 2,
          labelY: midY,
        })
      }
    }

    if (hasHorizontalOverlap) {
      const midX = (hOverlapStart + hOverlapEnd) / 2

      // Gap above
      if (candBottom <= selTop) {
        const dist = selTop - candBottom
        indicators.push({
          axis: "y",
          distance: Math.round(dist / scale),
          x1: midX,
          y1: candBottom,
          x2: midX,
          y2: selTop,
          labelX: midX,
          labelY: candBottom + dist / 2,
        })
      }

      // Gap below
      if (candTop >= selBottom) {
        const dist = candTop - selBottom
        indicators.push({
          axis: "y",
          distance: Math.round(dist / scale),
          x1: midX,
          y1: selBottom,
          x2: midX,
          y2: candTop,
          labelX: midX,
          labelY: selBottom + dist / 2,
        })
      }
    }
  }

  // Also compute distance to parent edges if parent is provided
  if (parent) {
    const pLeft = parent.left
    const pRight = parent.left + parent.width
    const pTop = parent.top
    const pBottom = parent.top + parent.height

    // Distance to parent left edge
    if (selLeft > pLeft) {
      const dist = selLeft - pLeft
      indicators.push({
        axis: "x",
        distance: Math.round(dist / scale),
        x1: pLeft,
        y1: selected.cy,
        x2: selLeft,
        y2: selected.cy,
        labelX: pLeft + dist / 2,
        labelY: selected.cy,
      })
    }

    // Distance to parent right edge
    if (selRight < pRight) {
      const dist = pRight - selRight
      indicators.push({
        axis: "x",
        distance: Math.round(dist / scale),
        x1: selRight,
        y1: selected.cy,
        x2: pRight,
        y2: selected.cy,
        labelX: selRight + dist / 2,
        labelY: selected.cy,
      })
    }

    // Distance to parent top edge
    if (selTop > pTop) {
      const dist = selTop - pTop
      indicators.push({
        axis: "y",
        distance: Math.round(dist / scale),
        x1: selected.cx,
        y1: pTop,
        x2: selected.cx,
        y2: selTop,
        labelX: selected.cx,
        labelY: pTop + dist / 2,
      })
    }

    // Distance to parent bottom edge
    if (selBottom < pBottom) {
      const dist = pBottom - selBottom
      indicators.push({
        axis: "y",
        distance: Math.round(dist / scale),
        x1: selected.cx,
        y1: selBottom,
        x2: selected.cx,
        y2: pBottom,
        labelX: selected.cx,
        labelY: selBottom + dist / 2,
      })
    }
  }

  return indicators
}

// ---------------------------------------------------------------------------
// computePairwiseDistances — Alt + hover specific target
// ---------------------------------------------------------------------------

/**
 * Distances between exactly two rects (selected ↔ target). For disjoint rects,
 * emits up to two indicators (one per axis where there is a gap). Unlike
 * `computeDistances`, falls back to a projection when there is no overlap on
 * the perpendicular axis, so users can measure spacing to any element they
 * hover. When one rect fully contains the other (e.g. hovering the parent
 * container), emits inset distances from the inner rect to all four outer
 * edges instead.
 */
export function computePairwiseDistances(
  selected: SnapRect,
  target: SnapRect,
  scale: number = 1
): DistanceIndicator[] {
  if (target.id === selected.id) return []
  const indicators: DistanceIndicator[] = []

  const selLeft = selected.left
  const selRight = selected.left + selected.width
  const selTop = selected.top
  const selBottom = selected.top + selected.height
  const tLeft = target.left
  const tRight = target.left + target.width
  const tTop = target.top
  const tBottom = target.top + target.height

  // Containment: measure the inner rect's inset to each outer edge, matching
  // the parent-edge behavior in `computeDistances`.
  const targetContainsSel =
    tLeft <= selLeft && tRight >= selRight && tTop <= selTop && tBottom >= selBottom
  const selContainsTarget =
    selLeft <= tLeft && selRight >= tRight && selTop <= tTop && selBottom >= tBottom
  if (targetContainsSel || selContainsTarget) {
    const inner = targetContainsSel ? selected : target
    const outer = targetContainsSel ? target : selected
    const inLeft = inner.left
    const inRight = inner.left + inner.width
    const inTop = inner.top
    const inBottom = inner.top + inner.height
    const outLeft = outer.left
    const outRight = outer.left + outer.width
    const outTop = outer.top
    const outBottom = outer.top + outer.height

    if (inLeft > outLeft) {
      const dist = inLeft - outLeft
      indicators.push({
        axis: "x",
        distance: Math.round(dist / scale),
        x1: outLeft,
        y1: inner.cy,
        x2: inLeft,
        y2: inner.cy,
        labelX: outLeft + dist / 2,
        labelY: inner.cy,
      })
    }
    if (inRight < outRight) {
      const dist = outRight - inRight
      indicators.push({
        axis: "x",
        distance: Math.round(dist / scale),
        x1: inRight,
        y1: inner.cy,
        x2: outRight,
        y2: inner.cy,
        labelX: inRight + dist / 2,
        labelY: inner.cy,
      })
    }
    if (inTop > outTop) {
      const dist = inTop - outTop
      indicators.push({
        axis: "y",
        distance: Math.round(dist / scale),
        x1: inner.cx,
        y1: outTop,
        x2: inner.cx,
        y2: inTop,
        labelX: inner.cx,
        labelY: outTop + dist / 2,
      })
    }
    if (inBottom < outBottom) {
      const dist = outBottom - inBottom
      indicators.push({
        axis: "y",
        distance: Math.round(dist / scale),
        x1: inner.cx,
        y1: inBottom,
        x2: inner.cx,
        y2: outBottom,
        labelX: inner.cx,
        labelY: inBottom + dist / 2,
      })
    }
    return indicators
  }

  // Horizontal gap (x-axis). Use vertical-overlap midpoint when overlapping,
  // otherwise project from the selected rect's center y.
  const vOverlapStart = Math.max(selTop, tTop)
  const vOverlapEnd = Math.min(selBottom, tBottom)
  const midY = vOverlapEnd > vOverlapStart ? (vOverlapStart + vOverlapEnd) / 2 : selected.cy

  if (tRight <= selLeft) {
    const dist = selLeft - tRight
    indicators.push({
      axis: "x",
      distance: Math.round(dist / scale),
      x1: tRight,
      y1: midY,
      x2: selLeft,
      y2: midY,
      labelX: tRight + dist / 2,
      labelY: midY,
    })
  } else if (tLeft >= selRight) {
    const dist = tLeft - selRight
    indicators.push({
      axis: "x",
      distance: Math.round(dist / scale),
      x1: selRight,
      y1: midY,
      x2: tLeft,
      y2: midY,
      labelX: selRight + dist / 2,
      labelY: midY,
    })
  }

  // Vertical gap (y-axis). Mirror of the horizontal case.
  const hOverlapStart = Math.max(selLeft, tLeft)
  const hOverlapEnd = Math.min(selRight, tRight)
  const midX = hOverlapEnd > hOverlapStart ? (hOverlapStart + hOverlapEnd) / 2 : selected.cx

  if (tBottom <= selTop) {
    const dist = selTop - tBottom
    indicators.push({
      axis: "y",
      distance: Math.round(dist / scale),
      x1: midX,
      y1: tBottom,
      x2: midX,
      y2: selTop,
      labelX: midX,
      labelY: tBottom + dist / 2,
    })
  } else if (tTop >= selBottom) {
    const dist = tTop - selBottom
    indicators.push({
      axis: "y",
      distance: Math.round(dist / scale),
      x1: midX,
      y1: selBottom,
      x2: midX,
      y2: tTop,
      labelX: midX,
      labelY: selBottom + dist / 2,
    })
  }

  return indicators
}

// ---------------------------------------------------------------------------
// Candidate collectors
// ---------------------------------------------------------------------------

/**
 * Collect snap candidates for a node being dragged.
 * Returns sibling node rects and the parent artboard/group content area rect.
 * All coordinates are in overlay-relative screen space.
 */
export function collectNodeSnapCandidates(
  draggedId: string,
  containerEl: HTMLElement | null
): { siblings: SnapRect[]; parent: SnapRect | null } {
  if (!containerEl) return { siblings: [], parent: null }
  const containerRect = containerEl.getBoundingClientRect()

  // Find the dragged element and its parent container
  const draggedEl = document.querySelector(`[data-studio-id="${draggedId}"]`) as HTMLElement | null
  if (!draggedEl) return { siblings: [], parent: null }

  // Find parent: either an artboard or a group node
  const parentEl =
    (draggedEl.parentElement?.closest("[data-studio-id]") as HTMLElement | null) ??
    (draggedEl.closest("[data-studio-artboard]")?.children[0] as HTMLElement | null)

  // Get parent rect
  let parentRect: SnapRect | null = null
  if (parentEl) {
    // Use artboard content area for parent rect
    const artboardEl = draggedEl.closest("[data-studio-artboard]") as HTMLElement | null
    const contentEl = artboardEl?.children[0] as HTMLElement | null
    if (contentEl) {
      const r = contentEl.getBoundingClientRect()
      parentRect = makeSnapRect(
        artboardEl?.getAttribute("data-studio-artboard") ?? "parent",
        r.left - containerRect.left,
        r.top - containerRect.top,
        r.width,
        r.height
      )
    }
  }

  // Collect siblings: children of the same parent that are not the dragged node
  const siblings: SnapRect[] = []
  const parentContainer = draggedEl.parentElement
  if (parentContainer) {
    for (const child of parentContainer.children) {
      const childEl = child as HTMLElement
      const childId = childEl.getAttribute("data-studio-id")
      if (!childId || childId === draggedId) continue

      const r = childEl.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      siblings.push(
        makeSnapRect(
          childId,
          r.left - containerRect.left,
          r.top - containerRect.top,
          r.width,
          r.height
        )
      )
    }
  }

  return { siblings, parent: parentRect }
}

/**
 * Collect snap candidates for an artboard being dragged.
 * Converts all other artboards from world coordinates to screen space.
 */
export function collectArtboardSnapCandidates(
  draggedId: string,
  artboards: { id: string; x: number; y: number; width: number; height: number }[],
  zoom: number,
  panX: number,
  panY: number
): SnapRect[] {
  const rects: SnapRect[] = []
  for (const ab of artboards) {
    if (ab.id === draggedId) continue
    // World to screen: screenX = ab.x * zoom + panX, relative to container
    const screenLeft = ab.x * zoom + panX
    const screenTop = ab.y * zoom + panY
    const screenWidth = ab.width * zoom
    const screenHeight = ab.height * zoom
    rects.push(makeSnapRect(ab.id, screenLeft, screenTop, screenWidth, screenHeight))
  }
  return rects
}
