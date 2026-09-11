"use client"

// ---------------------------------------------------------------------------
// What a selection looks like — the ring, its eight handles, an arrow's two
// ends, the anchor zones a connector is aiming at, and the guides a drag lines
// itself up against.
//
// All of it is screen-space chrome laid over the canvas: nothing here reads or
// writes the document, it only draws what Canvas has hold of and hands presses
// back. Selection and crop share the same handle geometry in lib/canvas.
// ---------------------------------------------------------------------------

import { anchorPoint, arrowEnds, bindOf } from "@/lib/canvas/arrow-binding"
import { nodeVisualBounds, worldRouteHandle, type RouteHandle } from "@/lib/canvas/line-routing"
import type { DistanceIndicator, GuideLine } from "@/lib/canvas/snap-engine"
import { type Handle } from "@/lib/canvas/transform"
import { resizeCursor, rotateCursor, type CornerHandle, GRAB_OUT, grabPad, handleHitBox, edgeHitBox, visibleHandles, HANDLE_DOT, HANDLE_ROOM } from "@/lib/canvas/handles"
import type { Bounds } from "@/lib/selection"
import { unionBounds } from "@/lib/selection"
import { ARROW_ANCHORS, type ArrowAnchor, type ArrowNode, type SquigNode } from "@/lib/types"
// type-only, so the two files don't actually depend on each other at runtime
import type { Gesture } from "./canvas"

/** The target's complete connection vocabulary, with the nearest zone active. */
export function AnchorZones({
  node,
  active,
  viewport,
}: {
  node: SquigNode
  active: ArrowAnchor
  viewport: { x: number; y: number; zoom: number }
}) {
  const v = viewport
  return (
    <>
      <div
        className="pointer-events-none absolute"
        style={{
          left: node.x * v.zoom + v.x,
          top: node.y * v.zoom + v.y,
          width: node.w * v.zoom,
          height: node.h * v.zoom,
          transform: node.rotation ? `rotate(${-node.rotation}deg)` : undefined,
          borderRadius: node.type === "shape" && node.shape === "ellipse" ? "9999px" : "4px",
          border: "1px solid color-mix(in srgb, var(--sq-select) 58%, transparent)",
        }}
      />
      {ARROW_ANCHORS.map((anchor) => {
        const [wx, wy] = anchorPoint(node, anchor)
        const selected = anchor === active
        const size = selected ? 12 : 9
        return (
          <div
            key={anchor}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: wx * v.zoom + v.x - size / 2,
              top: wy * v.zoom + v.y - size / 2,
              width: size,
              height: size,
              background: selected ? "var(--sq-select)" : "var(--sq-bg)",
              border: "2px solid var(--sq-select)",
              boxShadow: selected ? "0 0 0 3px color-mix(in srgb, var(--sq-select) 18%, transparent)" : undefined,
            }}
          />
        )
      })}
    </>
  )
}

/**
 * The two ends of a lone arrow, as dots you can pick up.
 *
 * Round, where the eight box handles are square — that's the whole
 * distinction, and it's an honest one: those sit on the corners and edges of a
 * rectangle, these are points. Same size, same white-on-blue, so they still
 * read as "the bit you have hold of".
 *
 * An end that's attached to a box prints solid instead of hollow. It's the
 * only place the attachment shows once a drag is over, and it's the difference
 * between an arrow that will follow the box and one that only looks like it
 * will — worth a dot's worth of ink.
 */
function ArrowEnds({
  node,
  viewport,
  onStart,
  show,
}: {
  node: ArrowNode
  viewport: { x: number; y: number; zoom: number }
  onStart: (end: 0 | 1, e: React.PointerEvent) => void
  /** false while some other gesture is running: the dots follow along, but
   *  they don't take presses that belong to the drag already in progress */
  show: boolean
}) {
  const v = viewport
  const bind = bindOf(node)
  const reach = HANDLE_DOT / 2 + GRAB_OUT
  return (
    <>
      {arrowEnds(node).map(([wx, wy], i) => (
        <div
          key={i}
          className={`absolute ${show ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{
            left: wx * v.zoom + v.x - reach,
            top: wy * v.zoom + v.y - reach,
            width: reach * 2,
            height: reach * 2,
            cursor: "move",
          }}
          onPointerDown={show ? (e) => onStart(i as 0 | 1, e) : undefined}
        >
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: GRAB_OUT,
              top: GRAB_OUT,
              width: HANDLE_DOT,
              height: HANDLE_DOT,
              background: bind[i] ? "var(--sq-select)" : "#fff",
              border: "2px solid var(--sq-select)",
            }}
          />
        </div>
      ))}
    </>
  )
}

/** The one route handle a selected elbow or curve exposes. */
function ConnectorRouteHandle({
  node,
  viewport,
  onStart,
  show,
}: {
  node: ArrowNode
  viewport: { x: number; y: number; zoom: number }
  onStart: (handle: RouteHandle, e: React.PointerEvent) => void
  show: boolean
}) {
  const handle = worldRouteHandle(node)
  if (!handle) return null
  const v = viewport
  const dot = 9
  const reach = dot / 2 + GRAB_OUT
  const hx = handle.point[0] * v.zoom + v.x
  const hy = handle.point[1] * v.zoom + v.y

  if (handle.kind === "curved") {
    const [start, end] = arrowEnds(node)
    const midX = ((start[0] + end[0]) / 2) * v.zoom + v.x
    const midY = ((start[1] + end[1]) / 2) * v.zoom + v.y
    return (
      <>
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <line
            x1={midX}
            y1={midY}
            x2={hx}
            y2={hy}
            stroke="var(--sq-select)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.55}
          />
        </svg>
        <div
          className={`absolute ${show ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{ left: hx - reach, top: hy - reach, width: reach * 2, height: reach * 2, cursor: "move" }}
          onPointerDown={show ? (e) => onStart(handle, e) : undefined}
        >
          <div
            className="pointer-events-none absolute rotate-45 rounded-[2px] bg-white"
            style={{ left: GRAB_OUT, top: GRAB_OUT, width: dot, height: dot, border: "2px solid var(--sq-select)" }}
          />
        </div>
      </>
    )
  }

  const [[ax, ay], [bx, by]] = handle.segment
  const x1 = ax * v.zoom + v.x
  const y1 = ay * v.zoom + v.y
  const x2 = bx * v.zoom + v.x
  const y2 = by * v.zoom + v.y
  const vertical = handle.axis === "x"
  const pad = reach
  const left = vertical ? x1 - pad : Math.min(x1, x2) - pad
  const top = vertical ? Math.min(y1, y2) - pad : y1 - pad
  const width = vertical ? pad * 2 : Math.abs(x2 - x1) + pad * 2
  const height = vertical ? Math.abs(y2 - y1) + pad * 2 : pad * 2

  return (
    <div
      className={`absolute ${show ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ left, top, width, height, cursor: vertical ? "ew-resize" : "ns-resize" }}
      onPointerDown={show ? (e) => onStart(handle, e) : undefined}
    >
      <div
        className="pointer-events-none absolute bg-[var(--sq-select)] opacity-[0.55]"
        style={
          vertical
            ? { left: pad - 0.5, top: pad, width: 1, height: Math.max(1, Math.abs(y2 - y1)) }
            : { left: pad, top: pad - 0.5, width: Math.max(1, Math.abs(x2 - x1)), height: 1 }
        }
      />
      <div
        className="pointer-events-none absolute rotate-45 rounded-[2px] bg-white"
        style={{
          left: hx - left - dot / 2,
          top: hy - top - dot / 2,
          width: dot,
          height: dot,
          border: "2px solid var(--sq-select)",
        }}
      />
    </div>
  )
}

export function SelectionOverlay({
  selectedNodes,
  viewport,
  onStartResize,
  onStartEndpoint,
  onStartRoute,
  editing,
  gestureKind,
  interactive,
  onStartRotate,
  rotationLabel,
  rotationFrame,
}: {
  selectedNodes: SquigNode[]
  viewport: { x: number; y: number; zoom: number }
  onStartResize: (h: Handle, e: React.PointerEvent) => void
  onStartEndpoint: (end: 0 | 1, e: React.PointerEvent) => void
  onStartRoute: (handle: RouteHandle, e: React.PointerEvent) => void
  editing: boolean
  gestureKind: Gesture["kind"] | null
  interactive: boolean
  onStartRotate: (h: CornerHandle, e: React.PointerEvent) => void
  rotationLabel: number | null
  rotationFrame?: Bounds
}) {
  const visualBounds = selectedNodes.map(nodeVisualBounds)
  const solo = selectedNodes.length === 1 ? selectedNodes[0] : null
  const b = rotationFrame ?? (solo && solo.type !== "arrow" ? solo : unionBounds(visualBounds))
  const rotation = rotationFrame ? rotationLabel ?? 0 : solo?.rotation ?? 0
  // the text editor draws its own dashed box; two boxes on one node is noise.
  // Only when it's the *selected* node being edited, mind: a picture dropped in
  // while the caret is still blinking somewhere else is selected and has every
  // right to say so
  if (!b || editing) return null

  // A lone arrow gets its two ends instead of the usual box and eight handles.
  // Its box isn't a thing anyone sets — the ends are, and scaling the box is
  // just a clumsier way of moving them both — so drawing a rectangle round it
  // would offer a grip that means nothing, and a fully attached arrow doesn't
  // even own its own box any more.
  const soloArrow =
    selectedNodes.length === 1 && selectedNodes[0].type === "arrow" ? (selectedNodes[0] as ArrowNode) : null
  if (soloArrow && gestureKind !== "marquee") {
    return (
      <>
        <ConnectorRouteHandle
          node={soloArrow}
          viewport={viewport}
          onStart={onStartRoute}
          show={interactive && (!gestureKind || gestureKind === "route")}
        />
        <ArrowEnds
          node={soloArrow}
          viewport={viewport}
          onStart={onStartEndpoint}
          // they stay up through their own drag, the way the resize handles do
          show={interactive && (!gestureKind || gestureKind === "endpoint")}
        />
      </>
    )
  }

  const v = viewport
  const left = b.x * v.zoom + v.x
  const top = b.y * v.zoom + v.y
  const w = b.w * v.zoom
  const h = b.h * v.zoom
  const multi = selectedNodes.length > 1

  // while a marquee is sweeping, the hit set is the message — a union box and
  // handles around a set that changes every frame is just flicker
  const marqueeing = gestureKind === "marquee"
  // handles stay up through a resize: they track the box the way tldraw's do,
  // and unmounting them between the two presses of a double-click would hand
  // the second press to the canvas underneath
  const showHandles = interactive && (!gestureKind || gestureKind === "resize")
  const showWide = w >= HANDLE_ROOM
  const showTall = h >= HANDLE_ROOM

  // Text exposes all four container edges. Narrow or short selections still
  // hide the midpoint that would collide with their corner handles.
  const soloText = selectedNodes.length === 1 && selectedNodes[0].type === "text"


  // the n/s handles are the ones that crowd the x axis, and e/w the y axis
  const padX = grabPad(w, showWide)
  const padY = grabPad(h, showTall)

  return (
    <>
      {/* each member gets a hairline, so you can see exactly what's in the set */}
      {(multi || marqueeing) &&
        selectedNodes.map((n, i) => (
          <div
            key={n.id}
            className="pointer-events-none absolute rounded-sm"
            style={{
              left: visualBounds[i].x * v.zoom + v.x,
              top: visualBounds[i].y * v.zoom + v.y,
              width: visualBounds[i].w * v.zoom,
              height: visualBounds[i].h * v.zoom,
              border: "1px solid color-mix(in srgb, var(--sq-select) 50%, transparent)",
            }}
          />
        ))}

      {!marqueeing && (
        <div className="pointer-events-none absolute" style={{ left, top, width: w, height: h,
          transform: rotation ? `rotate(${-rotation}deg)` : undefined }}>
          <div className="absolute inset-0 rounded-sm" style={{ border: "2px solid var(--sq-select)" }} />
          {showHandles && (["nw", "ne", "se", "sw"] as const).map((hd) => (
            <div key={`rotate-${hd}`} data-rotate-handle={hd} className="pointer-events-auto absolute"
              style={{ left: hd.includes("w") ? -20 : w, top: hd.includes("n") ? -20 : h,
                width: 20, height: 20, cursor: rotateCursor(hd, rotation) }} onPointerDown={(e) => onStartRotate(hd, e)} />
          ))}
          {showHandles && (["n", "e", "s", "w"] as const).map((hd) => {
            const box = edgeHitBox(hd, w, h)
            return box.width > 0 && box.height > 0 ? (
              <div key={`edge-${hd}`} data-resize-edge={hd} className="pointer-events-auto absolute"
                style={{ ...box, cursor: resizeCursor(hd, rotation) }}
                onPointerDown={(e) => onStartResize(hd, e)} />
            ) : null
          })}
          {showHandles &&
            // Corners last, so they sit on top: their pads can meet a side's on
            // a tight box, and a mis-grab costs more on a corner than a side.
            // Ordering does it — a z-index here would also lift the handles
            // over the panels that come after the canvas.
            //
            // A lone text layer is the one exception, reversed: its box is a
            // line of type, short enough that the corner pads swallow the
            // middle of either edge — exactly where you aim to set the wrap
            // width. There the sides sit on top, and the corners keep the
            // outward slop past the box that only they cover.
            visibleHandles(w, h, soloText)
              .slice()
              .sort((a, b) => (soloText ? b.length - a.length : a.length - b.length))
              .map((hd) => {
                const box = handleHitBox(hd, w, h, padX, padY)
                return (
                  <div
                    key={hd}
                    data-resize-handle={hd}
                    className="pointer-events-auto absolute"
                    style={{
                      left: box.left,
                      top: box.top,
                      width: box.width,
                      height: box.height,
                      cursor: resizeCursor(hd, rotation),
                    }}
                    onPointerDown={(e) => onStartResize(hd, e)}
                  >
                    <div
                      className="pointer-events-none absolute rounded-[3px] bg-white"
                      style={{
                        left: box.dotLeft,
                        top: box.dotTop,
                        width: HANDLE_DOT,
                        height: HANDLE_DOT,
                        border: "2px solid var(--sq-select)",
                      }}
                    />
                  </div>
                )
              })}
        </div>
      )}
      {!marqueeing && interactive && (
        <div className="pointer-events-none absolute rounded bg-[var(--sq-select)] px-1.5 py-0.5 text-micro text-white tabular-nums"
          style={{ left: left + w / 2, top: Math.max(...visualBounds.map((box) => (box.y + box.h) * v.zoom + v.y)) + 16,
            transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
          {rotationLabel !== null ? `${Math.round(rotationLabel)}°` : `${Math.round(b.w)} × ${Math.round(b.h)}`}
        </div>
      )}
    </>
  )
}

/**
 * Screen-space feedback for the snap engine.
 *
 * Alignment uses a light dashed hairline so it reads as a temporary
 * relationship, not another selected object. Equal spacing gets the warmer
 * measuring colour and a compact numeric chip; both disappear with the
 * gesture rather than leaving measurement chrome behind on the canvas.
 */
export function SmartGuides({ guides, distances }: { guides: GuideLine[]; distances: DistanceIndicator[] }) {
  const guidePad = 6
  const tick = 3
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {guides.map((g, i) =>
        g.axis === "x" ? (
          <line
            key={`guide-x-${i}`}
            x1={g.position}
            y1={g.start - guidePad}
            x2={g.position}
            y2={g.end + guidePad}
            stroke="var(--sq-select)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : (
          <line
            key={`guide-y-${i}`}
            x1={g.start - guidePad}
            y1={g.position}
            x2={g.end + guidePad}
            y2={g.position}
            stroke="var(--sq-select)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )
      )}
      {distances.map((d, i) => {
        const label = String(d.distance)
        const labelW = Math.max(24, label.length * 8 + 12)
        const labelH = 20
        return (
          <g key={`distance-${d.axis}-${i}`}>
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="var(--sq-measure)" strokeWidth={1} />
            {d.axis === "x" ? (
              <>
                <line x1={d.x1} y1={d.y1 - tick} x2={d.x1} y2={d.y1 + tick} stroke="var(--sq-measure)" />
                <line x1={d.x2} y1={d.y2 - tick} x2={d.x2} y2={d.y2 + tick} stroke="var(--sq-measure)" />
              </>
            ) : (
              <>
                <line x1={d.x1 - tick} y1={d.y1} x2={d.x1 + tick} y2={d.y1} stroke="var(--sq-measure)" />
                <line x1={d.x2 - tick} y1={d.y2} x2={d.x2 + tick} y2={d.y2} stroke="var(--sq-measure)" />
              </>
            )}
            <rect
              x={d.labelX - labelW / 2}
              y={d.labelY - labelH / 2}
              width={labelW}
              height={labelH}
              rx={4}
              fill="var(--sq-measure)"
            />
            <text
              x={d.labelX}
              y={d.labelY}
              dy="0.34em"
              fill="white"
              fontFamily="var(--font-sans), ui-sans-serif, sans-serif"
              className="text-micro font-medium tabular-nums"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
