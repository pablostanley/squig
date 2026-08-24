// ---------------------------------------------------------------------------
// Move constraint maths — pure, so pointer gestures and their tests agree.
// ---------------------------------------------------------------------------

export type DirectionStep = -1 | 0 | 1

/** One of the eight 45-degree directions around a drag's starting point. */
export interface DragDirection {
  x: DirectionStep
  y: DirectionStep
}

export interface ConstrainedMove {
  dx: number
  dy: number
  direction: DragDirection
}

export interface DirectionalSnap {
  dx: number
  dy: number
  /** guide axes whose correction the constrained move actually accepted */
  useX: boolean
  useY: boolean
}

/** tan(22.5°), the boundary halfway between an axis and a diagonal. */
const OCTANT_BOUNDARY = Math.SQRT2 - 1
const SAME_SNAP = 1e-6

/**
 * Project a pointer delta onto its nearest 45-degree line.
 *
 * Projection, rather than keeping the pointer's radial distance, puts the
 * constrained object at the point on that line closest to the pointer. That
 * keeps Shift engaging and disengaging without an avoidable jump.
 */
export function constrainMoveTo45(dx: number, dy: number): ConstrainedMove {
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0, direction: { x: 0, y: 0 } }

  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absY <= absX * OCTANT_BOUNDARY) {
    return { dx, dy: 0, direction: { x: Math.sign(dx) as DirectionStep, y: 0 } }
  }
  if (absX <= absY * OCTANT_BOUNDARY) {
    return { dx: 0, dy, direction: { x: 0, y: Math.sign(dy) as DirectionStep } }
  }

  // Projecting onto y=±x averages the two absolute components.
  const distance = (absX + absY) / 2
  const direction: DragDirection = {
    x: Math.sign(dx) as DirectionStep,
    y: Math.sign(dy) as DirectionStep,
  }
  return {
    dx: distance * direction.x,
    dy: distance * direction.y,
    direction,
  }
}

/**
 * Keep smart-guide correction on a constrained line.
 *
 * A diagonal move cannot accept independent x/y snap deltas: doing so would
 * make the result almost, but not exactly, 45 degrees. Turn each available
 * axis snap into travel along the locked direction and take the nearer one.
 */
export function constrainSnapToDirection(
  direction: DragDirection,
  snap: { dx: number; dy: number },
  availableAxes: { x: boolean; y: boolean }
): DirectionalSnap {
  const xDistance = direction.x !== 0 && availableAxes.x ? snap.dx / direction.x : null
  const yDistance = direction.y !== 0 && availableAxes.y ? snap.dy / direction.y : null

  let distance: number
  if (xDistance === null) {
    if (yDistance === null) return { dx: 0, dy: 0, useX: false, useY: false }
    distance = yDistance
  } else if (yDistance === null || Math.abs(xDistance) <= Math.abs(yDistance)) distance = xDistance
  else distance = yDistance

  return {
    dx: distance * direction.x,
    dy: distance * direction.y,
    useX: xDistance !== null && Math.abs(xDistance - distance) <= SAME_SNAP,
    useY: yDistance !== null && Math.abs(yDistance - distance) <= SAME_SNAP,
  }
}
