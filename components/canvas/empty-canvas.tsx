"use client"

// ---------------------------------------------------------------------------
// What a blank canvas says.
//
// It's an illustration, not a shape: it sits above the canvas, ignores the
// pointer, and never enters the document. The drawing is one Pablo made in
// squig, baked to paths by scripts/gen-doodle.mjs, so the empty state is a
// small demo of what the tool is for.
// ---------------------------------------------------------------------------

import { useState } from "react"

import { DOODLE_H, DOODLE_PATHS, DOODLE_W } from "@/lib/sketch/doodle"

/**
 * One of these greets each visit. They're invitations, not instructions — the
 * blank canvas is already the instruction, so the line's job is to make
 * starting feel cheap.
 */
const LINES = [
  "let's doodle your next idea",
  "squig what's on your mind",
  "draw it before you build it",
  "what are we sketching today?",
  "rough it out first",
  "napkin first, pixels later",
  "start with a scribble",
  "think out loud, in ink",
]

/**
 * The line this visit gets, chosen the first time a blank canvas asks for one.
 *
 * It lives outside the component because the empty state unmounts whenever
 * something is on the canvas — including for as long as you hold a component
 * from the library — and a fresh line every time you change your mind about
 * dropping a card would read as a glitch, not as variety.
 */
let visitLine: string | null = null

function pickLine(): string {
  visitLine ??= LINES[Math.floor(Math.random() * LINES.length)]
  return visitLine
}

/** How wide the drawing prints, in screen px. */
const DOODLE_WIDTH = 240

/**
 * The drawing is scaled up to that width, so its stroke has to be scaled back
 * down: this lands the line at the 1.9px a freehand stroke prints at on the
 * canvas at 100%, and the illustration reads as the same pen.
 */
const DOODLE_STROKE = (1.9 * DOODLE_W) / DOODLE_WIDTH

export function EmptyCanvas() {
  // through useState so React only reads it once, on mount. The canvas mounts
  // after the store hydrates on the client, so there's no server render for a
  // random line to disagree with.
  const [line] = useState(pickLine)

  return (
    <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-5">
      <svg
        viewBox={`0 0 ${DOODLE_W} ${DOODLE_H}`}
        width={DOODLE_WIDTH}
        height={(DOODLE_WIDTH * DOODLE_H) / DOODLE_W}
        fill="none"
        stroke="var(--sq-muted)"
        strokeWidth={DOODLE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {DOODLE_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      <p className="text-center text-sm" style={{ color: "var(--sq-muted)", fontFamily: "var(--sq-font)" }}>
        {line}
      </p>
    </div>
  )
}
