"use client"

// ---------------------------------------------------------------------------
// Inline text editing — a textarea parked over the node being edited.
//
// Enter (or ⌘Enter on a multi-line text node) and clicking away both commit.
// Escape cancels, which is what Escape means everywhere else in squig.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react"

import { useSquig } from "@/lib/store"
import type { SquigNode, TextNode, ComponentNode } from "@/lib/types"
import { getDef } from "@/lib/library/registry"

export function TextEditOverlay() {
  const editingId = useSquig((s) => s.editingId)
  const node = useSquig((s) => (s.editingId ? s.nodes[s.editingId] : null))
  if (!node || !editingId) return null
  return <Editor node={node} />
}

function Editor({ node }: { node: SquigNode }) {
  const viewport = useSquig((s) => s.viewport)
  const st = useSquig.getState

  const isText = node.type === "text"
  const textControlKey = useMemo(() => {
    if (node.type !== "component") return null
    return getDef(node.kind)?.controls.find((c) => c.type === "text")?.key ?? null
  }, [node])

  const initial = isText
    ? (node as TextNode).text
    : node.type === "component" && textControlKey
      ? String((node as ComponentNode).props[textControlKey] ?? "")
      : ""

  const [value, setValue] = useState(initial)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const commit = () => {
    const s = st()
    if (s.editingId !== node.id) return
    // an empty text node draws nothing and can never be clicked again, so it
    // goes even when the draft is unchanged — that's the just-placed-then-
    // dismissed case
    if (isText && !value.trim()) {
      s.removeNodes([node.id])
      s.setEditing(null)
      return
    }
    if (value === initial) {
      // nothing changed — don't spend an undo step saying so
      s.setEditing(null)
      return
    }
    s.checkpoint()
    if (isText) {
      const trimmed = value.replace(/\s+$/, "")
      if (!trimmed) {
        s.removeNodes([node.id], { checkpoint: false })
      } else {
        const lines = trimmed.split("\n")
        const fs = (node as TextNode).fontSize
        const wGuess = Math.max(...lines.map((l) => l.length)) * fs * 0.5 + 10
        s.updateNode(node.id, {
          text: trimmed,
          w: Math.max(40, wGuess),
          h: lines.length * fs * 1.35,
        } as Partial<SquigNode>)
      }
    } else if (textControlKey) {
      s.updateNode(node.id, {
        props: { ...(node as ComponentNode).props, [textControlKey]: value },
      } as Partial<SquigNode>)
    }
    s.setEditing(null)
  }

  /** Escape throws the draft away. A brand-new empty node goes with it. */
  const cancel = () => {
    const s = st()
    if (isText && !(node as TextNode).text.trim()) s.removeNodes([node.id])
    s.setEditing(null)
  }

  // kept current so the outside-press listener always calls the latest commit
  // without being rebuilt on every keystroke
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    taRef.current?.focus()
    taRef.current?.select()
  }, [])

  useEffect(() => {
    // a press anywhere else commits in the capture phase, *before* the canvas
    // reacts — so the click that dismisses the editor also lands where it was
    // aimed instead of costing a second click
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest?.("textarea") === taRef.current) return
      commitRef.current()
    }
    window.addEventListener("pointerdown", onDown, true)
    return () => window.removeEventListener("pointerdown", onDown, true)
  }, [])

  const v = viewport
  const fontSize = isText ? (node as TextNode).fontSize * v.zoom : 15 * v.zoom

  return (
    <textarea
      ref={taRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") {
          e.preventDefault()
          cancel()
          return
        }
        if (e.key === "Enter" && (e.metaKey || !isText)) {
          e.preventDefault()
          commit()
        }
      }}
      className="absolute resize-none overflow-hidden rounded-md px-2 py-1 outline-none"
      style={{
        left: node.x * v.zoom + v.x - 8,
        top: node.y * v.zoom + v.y - 6,
        minWidth: Math.max(node.w * v.zoom + 16, 140),
        height: Math.max(node.h * v.zoom + 12, fontSize * 1.8),
        fontSize,
        fontFamily: "var(--sq-font)",
        lineHeight: 1.35,
        color: "var(--sq-ink)",
        background: "rgba(255,255,255,0.92)",
        border: "1.5px dashed var(--sq-select)",
      }}
      placeholder={isText ? "say something" : "label"}
    />
  )
}
