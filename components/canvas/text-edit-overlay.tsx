"use client"

// ---------------------------------------------------------------------------
// Inline text editing — the editor stands exactly where the words already are.
//
// Nothing moves when you start typing. The drawn run is hidden, and a bare
// textarea takes its place on the same baseline, at the same size, weight and
// alignment, growing around the same edge the renderer anchors to. No box, no
// panel, no field: a caret in the drawing, and the words you're changing.
//
// A double-click opens this, and so does Return on a selected layer.
// Enter (or ⌘Enter on a multi-line text node), Escape and clicking away all
// commit — leaving the editor never throws typed words away.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react"

import { useSquig } from "@/lib/store"
import type { ComponentNode, SquigNode, TextNode } from "@/lib/types"
import type { EditTarget } from "@/lib/canvas/edit-target"
import { fontMetrics, measureLinesWidth, wrapText } from "@/lib/canvas/text-metrics"
import { fitTextBox } from "@/lib/canvas/text-reflow"
import { TEXT_LINE_HEIGHT, anchorFactor } from "@/lib/sketch/text-layout"

/**
 * How far past the words the editor still answers to the pointer, in screen
 * px. Padding rather than margin, so a click landing there goes to the
 * textarea — which puts the caret at the nearest spot in the text instead of
 * committing and dropping you out of the edit. Clicking just past the end of
 * a line to type from there is the single most common caret gesture, and it
 * has to keep you in.
 */
const CARET_PAD = 8

export function TextEditOverlay({ node, target }: { node: SquigNode; target: EditTarget }) {
  const v = useSquig((s) => s.viewport)
  const st = useSquig.getState

  const isText = node.type === "text"
  const [value, setValue] = useState(target.value)
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
    if (value === target.value) {
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
        s.updateNode(node.id, fitTextBox(node as TextNode, trimmed) as Partial<SquigNode>)
      }
    } else if (target.propKey) {
      s.updateNode(node.id, {
        props: { ...(node as ComponentNode).props, [target.propKey]: value },
      } as Partial<SquigNode>)
    }
    s.setEditing(null)
  }

  // kept current so the outside-press listener always calls the latest commit
  // without being rebuilt on every keystroke
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })

  // the press that opens the editor is still unwinding while we mount, and its
  // default action puts focus back on the canvas. Blurs before the editor has
  // settled are that, not the user leaving — committing on one would delete a
  // text node the instant it was placed.
  const settled = useRef(false)

  useEffect(() => {
    taRef.current?.focus()
    taRef.current?.select()
    const raf = requestAnimationFrame(() => {
      settled.current = true
    })
    return () => cancelAnimationFrame(raf)
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

  const placeholder = isText ? "say something" : "label"

  /**
   * Put the textarea's first baseline on the renderer's.
   *
   * A line box centres the face's em box inside itself and sets the baseline at
   * half-leading + ascent — so measuring the ascent off the live font is what
   * lands the caret on the line the words were already printing on. The padding
   * is slack for ascenders, descenders and a caret at either end; the top-left
   * walks back by exactly that much, so none of it shifts anything.
   */
  // a fixed-width text layer edits inside its own box: the textarea holds the
  // box's width so the browser wraps the draft at the same measure the
  // renderer will, and only the height follows the typing
  const fixed = isText && !!(node as TextNode).fixedW

  const box = useMemo(() => {
    const size = target.fontSize * v.zoom
    const style = { size, bold: target.bold, italic: target.italic }
    const lineHeight = size * TEXT_LINE_HEIGHT
    const { ascent, descent } = fontMetrics(style)

    // an empty run still needs somewhere to show its placeholder
    const lineCount = fixed
      ? wrapText(value, node.w * v.zoom, style).length
      : value.split("\n").length
    const run = fixed
      ? node.w * v.zoom
      : measureLinesWidth(value ? value.split("\n") : [placeholder], style)
    const padY = size * 0.35
    const anchorX = (node.x + target.x) * v.zoom + v.x
    const baselineY = (node.y + target.baseline) * v.zoom + v.y

    return {
      left: fixed ? node.x * v.zoom + v.x - CARET_PAD : anchorX - CARET_PAD - anchorFactor(target.align) * run,
      top: baselineY - ((lineHeight - (ascent + descent)) / 2 + ascent) - padY,
      width: run + CARET_PAD * 2,
      height: lineCount * lineHeight + padY * 2,
      padding: `${padY}px ${CARET_PAD}px`,
      fontSize: size,
      lineHeight: `${lineHeight}px`,
    }
  }, [node.x, node.y, node.w, target, value, v, placeholder, fixed])

  return (
    <textarea
      ref={taRef}
      value={value}
      wrap={fixed ? "soft" : "off"}
      spellCheck={false}
      onChange={(e) => setValue(target.multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
      onBlur={() => {
        if (!settled.current) {
          requestAnimationFrame(() => taRef.current?.focus())
          return
        }
        commit()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") {
          // stop editing, keep the words — Escape here means "I'm done",
          // not "undo what I typed"
          e.preventDefault()
          commit()
          return
        }
        if (e.key === "Enter" && (e.metaKey || !target.multiline)) {
          e.preventDefault()
          commit()
        }
      }}
      className="absolute resize-none overflow-hidden border-0 outline-none"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        padding: box.padding,
        boxSizing: "border-box",
        fontSize: box.fontSize,
        lineHeight: box.lineHeight,
        fontFamily: "var(--sq-font)",
        fontWeight: target.bold ? 700 : 400,
        fontStyle: target.italic ? "italic" : undefined,
        textDecoration: target.underline ? "underline" : undefined,
        textAlign: target.align,
        whiteSpace: fixed ? "pre-wrap" : "pre",
        // long words break where the canvas breaks them — mid-word, only when
        // the word alone is wider than the box; see wrapText
        overflowWrap: fixed ? "break-word" : undefined,
        color: target.color,
        caretColor: "var(--sq-ink)",
        // the one tell that this run is live: a wash the width of the words,
        // rather than a field the words have been moved into
        background: "color-mix(in srgb, var(--sq-select) 12%, transparent)",
        borderRadius: 2,
      }}
      placeholder={placeholder}
    />
  )
}
