"use client"

// ---------------------------------------------------------------------------
// The narrow-screen line.
//
// A phone can draw on squig now — one finger inks, two fingers pan and zoom.
// What a phone can't do is get out of the way of its own chrome: the inspector
// is a fixed 272px pinned to the right and the tool rail sits on the left, so
// under about 700px the panels are lying on most of the paper.
//
// This is a note, not a redesign and not a wall. It says the honest thing once,
// takes a tap to put away, and then never comes back — the canvas underneath
// still works, and someone who wants to sketch on a phone anyway is not doing
// anything wrong. A modal here would be the tool telling a person their device
// is a mistake, which it isn't; it's just smaller than the panels assume.
// ---------------------------------------------------------------------------

import { useState, useSyncExternalStore } from "react"

import { Panel } from "@/components/ui/panel"

const KEY = "squig:small-screen:v1"
/** roughly the width below which the two panels stop leaving usable paper */
const NARROW = "(max-width: 700px)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(NARROW)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function wasDismissed() {
  try {
    return localStorage.getItem(KEY) === "seen"
  } catch {
    // a browser with storage turned off just gets told once per visit
    return false
  }
}

export function SmallScreenNote() {
  // The server has no width to measure, so it always says "not narrow" — and
  // so does the hydration pass, which is what keeps the markup agreeing. The
  // real answer arrives on the render straight after.
  const narrow = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false
  )
  const [dismissed, setDismissed] = useState(wasDismissed)

  if (!narrow || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(KEY, "seen")
    } catch {
      // nothing to do about it — it stays away for this visit either way
    }
  }

  return (
    <Panel className="absolute bottom-16 left-4 z-30 max-w-[calc(100vw-2rem)] flex-row items-center gap-3 py-2 pr-2 pl-gutter">
      <p className="text-label text-muted-foreground">
        squig wants a bigger screen — down here the panels sit on most of the paper.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-chrome-sm px-2 py-1 text-label text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40"
      >
        got it
      </button>
    </Panel>
  )
}
