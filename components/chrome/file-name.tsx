"use client"

// ---------------------------------------------------------------------------
// The file name floats at the top center of the canvas. It ducks out of the
// way while the pointer is moving so it never sits between the user and what
// they're drawing, and drifts back once the hand comes to rest.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react"
import { useSquig } from "@/lib/store"

/** how long the pointer has to sit still before the name comes back */
const REST_MS = 550

export function FileName() {
  const fileName = useSquig((s) => s.fileName)
  const renaming = useSquig((s) => s.renamingFile)
  const st = useSquig.getState
  const [resting, setResting] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // mirrors `resting` so a drag's worth of moves doesn't churn React state
  const restingRef = useRef(true)

  // Hide on any pointer movement, reveal after the pointer has been still.
  useEffect(() => {
    const hide = () => {
      restingRef.current = false
      setResting(false)
    }
    const show = () => {
      restingRef.current = true
      setResting(true)
    }
    const onMove = () => {
      if (restingRef.current) hide()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(show, REST_MS)
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const shown = resting || renaming

  return (
    <div
      className="pointer-events-none absolute top-4 left-1/2 z-30 flex -translate-x-1/2 justify-center transition-opacity"
      // out of the way quickly, back in gently
      style={{ opacity: shown ? 1 : 0, transitionDuration: shown ? "260ms" : "110ms" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {renaming ? (
        <NameInput initial={fileName} />
      ) : (
        <button
          type="button"
          className={`max-w-[60vw] truncate rounded-lg px-2.5 py-1 text-center text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground ${shown ? "pointer-events-auto" : ""}`}
          onClick={() => st().setRenamingFile(true)}
          title="rename"
        >
          {fileName}
        </button>
      )}
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
        className="invisible col-start-1 row-start-1 min-w-32 max-w-[60vw] px-2.5 py-1 text-center text-sm whitespace-pre"
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
        className="col-start-1 row-start-1 w-full rounded-lg border bg-background px-2.5 py-1 text-center text-sm shadow-sm outline-none"
      />
    </span>
  )
}
