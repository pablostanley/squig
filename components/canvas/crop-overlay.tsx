"use client"

// ---------------------------------------------------------------------------
// Crop mode's overlay — the window you drag, over the whole picture behind it.
//
// It borrows the selection ring's handle geometry on purpose: while crop is on
// this *is* the thing you have hold of, so it has to look like one.
// ---------------------------------------------------------------------------

import { imageSheet } from "@/lib/canvas/crop"
import { HANDLES, type Handle } from "@/lib/canvas/transform"
import { imagePlacement, mirrorBox } from "@/lib/sketch/paths"
import type { ImageNode } from "@/lib/types"
import { NodeSketch } from "./sketch"
import { resizeCursor, grabPad, handleHitBox, HANDLE_DOT, HANDLE_ROOM } from "@/lib/canvas/handles"

/** How much of the picture still shows where the crop has cut it away. */
const GHOST_OPACITY = 0.28

/**
 * A picture in crop mode: the whole of it, faint, with the part that survives
 * the crop printed over the top at full strength.
 *
 * The ghost is the node's own render minus the clip — same placement, same
 * mirror, one `<svg>` fewer — so the two can't drift apart no matter what the
 * crop or the flips are doing.
 */
export function CropStage({ node }: { node: ImageNode }) {
  const p = imagePlacement(node)
  return (
    <g transform={`translate(${node.x} ${node.y}) rotate(${-(node.rotation ?? 0)} ${node.w / 2} ${node.h / 2})`}>
      <g transform={mirrorBox(node.w, node.h, node.flipX, node.flipY)} opacity={GHOST_OPACITY}>
        <image href={node.src} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="none" />
      </g>
      <NodeSketch node={{ ...node, rotation: undefined }} />
    </g>
  )
}

/**
 * The crop window — eight handles on the box, over a picture that keeps going
 * past them.
 *
 * It stands in for the selection ring while the mode is on, so it draws the
 * same white dot on the same blue, at the same sizes: this is still "the thing
 * you have hold of", just a different thing. The rest of the picture gets a
 * dashed outline, which is the only honest way to say how much room a drag
 * still has left.
 */
export function CropOverlay({
  node,
  viewport,
  onStartCrop,
}: {
  node: ImageNode
  viewport: { x: number; y: number; zoom: number }
  onStartCrop: (h: Handle, e: React.PointerEvent) => void
}) {
  const v = viewport
  const sheet = imageSheet(node)
  const left = node.x * v.zoom + v.x
  const top = node.y * v.zoom + v.y
  const w = node.w * v.zoom
  const h = node.h * v.zoom

  const showWide = w >= HANDLE_ROOM
  const showTall = h >= HANDLE_ROOM
  const visible = (hd: Handle) => (hd === "n" || hd === "s" ? showWide : hd === "e" || hd === "w" ? showTall : true)
  const padX = grabPad(w, showWide)
  const padY = grabPad(h, showTall)

  return (
    <div className="pointer-events-none absolute inset-0" style={{
      transform: node.rotation ? `rotate(${-node.rotation}deg)` : undefined,
      transformOrigin: `${left + w / 2}px ${top + h / 2}px`,
    }}>
      {/* the whole picture: how far a drag can still go, and the surface that
          slides under the window — it takes the press and lets it bubble to
          the canvas, which is where the pan gesture actually starts */}
      <div
        className="pointer-events-auto absolute"
        style={{
          left: sheet.x * v.zoom + v.x,
          top: sheet.y * v.zoom + v.y,
          width: sheet.w * v.zoom,
          height: sheet.h * v.zoom,
          border: "1px dashed color-mix(in srgb, var(--sq-select) 45%, transparent)",
          cursor: "move",
        }}
      />

      <div className="pointer-events-none absolute" style={{ left, top, width: w, height: h }}>
        <div className="absolute inset-0" style={{ border: "2px solid var(--sq-select)" }} />
        {/* thirds — the one guide a crop is actually composed against */}
        {showWide && showTall && (
          <>
            {[1, 2].map((i) => (
              <div
                key={`v${i}`}
                className="absolute top-0 bottom-0"
                style={{ left: `${(i * 100) / 3}%`, borderLeft: "1px solid color-mix(in srgb, var(--sq-select) 30%, transparent)" }}
              />
            ))}
            {[1, 2].map((i) => (
              <div
                key={`h${i}`}
                className="absolute right-0 left-0"
                style={{ top: `${(i * 100) / 3}%`, borderTop: "1px solid color-mix(in srgb, var(--sq-select) 30%, transparent)" }}
              />
            ))}
          </>
        )}
        {/* corners last, for the same reason SelectionOverlay does it */}
        {HANDLES.filter(visible)
          .slice()
          .sort((a, b) => a.length - b.length)
          .map((hd) => {
            const box = handleHitBox(hd, w, h, padX, padY)
            return (
              <div
                key={hd}
                className="pointer-events-auto absolute"
                style={{ left: box.left, top: box.top, width: box.width, height: box.height, cursor: resizeCursor(hd, node.rotation) }}
                onPointerDown={(e) => onStartCrop(hd, e)}
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
    </div>
  )
}
