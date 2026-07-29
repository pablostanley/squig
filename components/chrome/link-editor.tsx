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
      className="absolute z-40 flex items-center gap-1.5 rounded-xl border bg-background p-1 pl-2.5 shadow-lg"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] text-muted-foreground">link</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="where does this go?"
        className="h-7 w-56 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") commit()
          if (e.key === "Escape") close()
        }}
      />
      <button
        type="button"
        onClick={commit}
        className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        apply
      </button>
      {first.link && (
        <button
          type="button"
          onClick={() => {
            st().setLinkOnSelection("")
            close()
          }}
          className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          remove
        </button>
      )}
    </div>
  )
}
