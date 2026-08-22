"use client"

// ---------------------------------------------------------------------------
// ⌘K over selected text. A one-field bar that floats above the selection —
// a browser prompt() would freeze the canvas, and a dialog is too much
// ceremony for a URL.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react"
import { useSquig } from "@/lib/store"
import type { TextNode } from "@/lib/types"

/** Mounted only while open, so the field starts from the node's current link. */
export function LinkEditor() {
  const open = useSquig((s) => s.linkOpen)
  const selection = useSquig((s) => s.selection)
  const nodes = useSquig((s) => s.nodes)
  const first = selection.map((id) => nodes[id]).find((n) => n?.type === "text") as TextNode | undefined
  if (!open || !first) return null
  return <Editor node={first} />
}

function Editor({ node: first }: { node: TextNode }) {
  const viewport = useSquig((s) => s.viewport)
  const st = useSquig.getState

  const [value, setValue] = useState(first.link ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const close = () => st().setLinkOpen(false)
  const commit = () => {
    st().setLinkOnSelection(value)
    close()
  }

  const left = first.x * viewport.zoom + viewport.x
  const top = first.y * viewport.zoom + viewport.y - 44

  return (
    <div
      role="dialog"
      aria-label="Edit link"
      className="absolute z-40 flex items-center gap-2 rounded-chrome-lg border border-border/80 bg-background p-2 pl-3 shadow-popup"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label htmlFor="squig-link-url" className="text-label text-muted-foreground">Link</label>
      <input
        id="squig-link-url"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://…"
        className="h-ctl w-56 bg-transparent px-1 text-label outline-none placeholder:text-muted-foreground"
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") commit()
          if (e.key === "Escape") close()
        }}
      />
      <button
        type="button"
        onClick={commit}
        className="h-ctl rounded-chrome-sm px-2.5 text-label text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Apply
      </button>
      {first.link && (
        <button
          type="button"
          onClick={() => {
            st().setLinkOnSelection("")
            close()
          }}
          className="h-ctl rounded-chrome-sm px-2.5 text-label text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          Remove
        </button>
      )}
    </div>
  )
}
