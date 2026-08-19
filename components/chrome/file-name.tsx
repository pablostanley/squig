"use client"

// ---------------------------------------------------------------------------
// The file name floats at the top center of the canvas. It ducks out of the
// way while a layer is being moved, resized, drawn or dragged in from the
// library, so the name never sits between the user and the thing under their
// hand — and it drifts back the moment they let go.
//
// Only hands-on-the-geometry counts. Panning, marquee-selecting and plain
// mousing around leave every layer where it is, and a label that flickered at
// each of those would be its own kind of noise.
//
// The small line under the name is where saving speaks: a receipt after ⌘S,
// and — when the browser has no room left — a standing note that this drawing
// isn't being kept. It sits here rather than in the corner flash because the
// name is what the eye goes to when it wonders where the drawing lives.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react"
import { useSquig } from "@/lib/store"

/** grace period after a drag ends, so nudge-release-nudge doesn't strobe */
const SETTLE_MS = 160

/** how long "saved" hangs around after ⌘S */
const SAVED_MS = 1800

export function FileName() {
  const fileName = useSquig((s) => s.fileName)
  const renaming = useSquig((s) => s.renamingFile)
  const full = useSquig((s) => s.drawerFull)
  const st = useSquig.getState
  const [ducked, setDucked] = useState(false)
  const [saved, setSaved] = useState(false)

  // Out of the way for as long as the drag lasts, back once it settles.
  //
  // Driven off the store's edges rather than a selector: a drag writes to the
  // store on every pointer move, and only the first and last of those tell us
  // anything. `busy` is a plain local, not a ref — nothing renders from it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let busy = false
    const unsub = useSquig.subscribe((s) => {
      // a canvas gesture with hands on a layer, or a library item mid-flight
      const now = s.transforming || s.placingDrag
      if (now === busy) return
      busy = now
      if (timer) clearTimeout(timer)
      timer = null
      if (now) setDucked(true)
      else timer = setTimeout(() => setDucked(false), SETTLE_MS)
    })
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [])

  // ⌘S says so out loud — the autosaves along the way stay quiet
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null
    const unsub = useSquig.subscribe((s, prev) => {
      if (s.saveFlash === prev.saveFlash) return
      setSaved(true)
      if (id) clearTimeout(id)
      id = setTimeout(() => setSaved(false), SAVED_MS)
    })
    return () => {
      unsub()
      if (id) clearTimeout(id)
    }
  }, [])

  // One line under the name, two jobs. "saved" is a receipt and fades; the
  // out-of-room note is a condition and stays until a write gets through, so
  // it takes the line whenever both would speak. It's the only red squig
  // leaves standing — muted would read as one more status and get skimmed
  // past, and what it's reporting is that the drawing on screen is the only
  // copy of itself there is.
  const note = full ? "not saved — export to keep this one" : saved ? "saved to this browser" : ""

  // renaming and the note both outrank the duck: neither should vanish because
  // the other hand started a drag
  const shown = !ducked || renaming || !!note

  return (
    <div
      // `pointer-events-none` while ducked is load-bearing, not just tidy: a
      // library item released over this strip hit-tests through to the canvas
      // and actually lands there.
      className="pointer-events-none absolute top-4 left-1/2 z-30 flex -translate-x-1/2 justify-center transition-opacity"
      // out of the way quickly, back in gently
      style={{ opacity: shown ? 1 : 0, transitionDuration: shown ? "260ms" : "110ms" }}
    >
      {renaming ? (
        <NameInput initial={fileName} />
      ) : (
        <button
          type="button"
          className={`max-w-[60vw] truncate rounded-chrome-sm px-2.5 py-1 text-center text-row text-muted-foreground transition-colors hover:bg-background hover:text-foreground ${shown ? "pointer-events-auto" : ""}`}
          onClick={() => st().setRenamingFile(true)}
          title="rename"
        >
          {fileName}
        </button>
      )}
      <span
        aria-live="polite"
        className={`absolute top-full left-1/2 mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap transition-opacity duration-200 ${
          full ? "text-destructive" : "text-muted-foreground"
        }`}
        style={{ opacity: note ? 1 : 0 }}
      >
        {note}
      </span>
    </div>
  )
}

/** Mounted only while renaming, so the draft starts from the current name. */
function NameInput({ initial }: { initial: string }) {
  const st = useSquig.getState
  const [draft, setDraft] = useState(initial)
  const input = useRef<HTMLInputElement>(null)

  // The file menu may still be handing focus back as we mount, which beats
  // React's autoFocus — claim it once that settles.
  useEffect(() => {
    const id = setTimeout(() => {
      input.current?.focus()
      input.current?.select()
    }, 60)
    return () => clearTimeout(id)
  }, [])

  const commit = () => {
    st().setFileName(draft.trim() || "untitled scribbles")
    st().setRenamingFile(false)
  }

  return (
    // Grid overlay: an invisible copy of the text sizes the cell, so the input
    // grows with the name and stays centered on the same axis as the label.
    <span className="pointer-events-auto inline-grid items-center">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 min-w-32 max-w-[60vw] px-2.5 py-1 text-center text-row whitespace-pre"
      >
        {draft || " "}
      </span>
      <input
        ref={input}
        aria-label="file name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // Tabbing away commits; the whole window losing focus should not —
        // the rename is still there when the user comes back.
        onBlur={() => {
          if (document.hasFocus()) commit()
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") commit()
          if (e.key === "Escape") st().setRenamingFile(false)
        }}
        className="col-start-1 row-start-1 w-full rounded-chrome-sm border bg-background px-2.5 py-1 text-center text-row shadow-panel outline-none"
      />
    </span>
  )
}
