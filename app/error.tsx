"use client"

// ---------------------------------------------------------------------------
// The screen for the worst moment squig can have: a render that threw.
//
// Without this the page goes white, and a white page is a dead end — the whole
// drawer is in localStorage on the other side of it, with no way in. Worse, the
// document that threw is the one squig reopens, so a reload lands straight back
// on it. A retry button on its own would be a loop, not a way out.
//
// So the offer here is the drawer itself: every other drawing, one click away,
// and a fresh page for when this browser only ever held the one. Nothing is
// deleted and nothing is repaired — the drawing that threw keeps its place in
// the drawer, because it is still the user's, and squig doesn't get to decide
// otherwise. It is only left off the list below, so that the way out isn't
// sitting next to the way back in.
//
// Everything runs through the store's own openFile / newFile rather than a
// location.reload(): the window is wired to save on unload, and that save
// writes down which document was open — so a reload would faithfully put us
// back on the one we're trying to leave.
// ---------------------------------------------------------------------------

import { useState } from "react"

import { listFiles, loadPrefs, relativeTime, type FileMeta } from "@/lib/files"
import { useSquig } from "@/lib/store"

/** More than this and the escape hatch becomes a file browser. */
const SHOWN = 8

/**
 * Every drawing except the one that just threw.
 *
 * Read off the drawer rather than out of the store: a throw early enough in the
 * life of the page — during the first render, say — leaves the store still
 * holding its empty starting state, and an escape hatch that lists nothing is
 * no escape at all. The drawer's reads swallow a missing localStorage, so this
 * is safe to run wherever it ends up running.
 */
function otherDrawings(): FileMeta[] {
  const s = useSquig.getState()
  const here = s.hydrated ? s.docId : loadPrefs().activeId
  return listFiles()
    .filter((f) => f.id !== here)
    .slice(0, SHOWN)
}

export default function CanvasError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // through useState so the list is taken once, before anything on this screen
  // has had a chance to change what the drawer holds
  const [others] = useState(otherDrawings)

  const open = (id: string) => {
    useSquig.getState().openFile(id)
    reset()
  }

  const fresh = () => {
    const s = useSquig.getState()
    s.newFile()
    // a blank canvas normally stays out of the drawer until it has something
    // on it — but this one has to be there, or the next reload falls back to
    // the most recent file, which is the one we just walked away from
    s.saveNow()
    reset()
  }

  return (
    <main
      className="flex h-full items-center justify-center overflow-auto p-8"
      style={{ backgroundColor: "var(--sq-bg)" }}
    >
      <div className="w-full max-w-sm">
        <h1 className="text-2xl" style={{ color: "var(--sq-ink)", fontFamily: "var(--sq-font)" }}>
          squig lost its place
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sq-muted)", fontFamily: "var(--sq-font)" }}>
          something on this page stopped it drawing. nothing has been thrown away — every drawing is still saved in
          this browser, this one included. try it again, or go and sit with another one for a bit.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-chrome-lg border border-border/80 bg-background px-3 py-1.5 text-row shadow-panel transition-colors hover:bg-accent"
          >
            try again
          </button>
          <button
            type="button"
            onClick={fresh}
            className="rounded-chrome-lg border border-border/80 bg-background px-3 py-1.5 text-row text-muted-foreground shadow-panel transition-colors hover:bg-accent hover:text-foreground"
          >
            start a new drawing
          </button>
        </div>

        {others.length > 0 && (
          <div className="mt-7">
            <p className="text-label text-muted-foreground">your other drawings</p>
            <ul className="mt-2 overflow-hidden rounded-chrome-lg border border-border/80 bg-background shadow-panel">
              {others.map((f) => (
                <li key={f.id} className="border-b border-border/60 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => open(f.id)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-row transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-label text-muted-foreground">{relativeTime(f.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* the one line worth quoting if this ever gets reported */}
        <p className="mt-6 font-mono text-label break-words text-muted-foreground/70">
          {error.message || "no message"}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
      </div>
    </main>
  )
}
