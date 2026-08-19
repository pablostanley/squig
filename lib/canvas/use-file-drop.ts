"use client"

// ---------------------------------------------------------------------------
// Dragging a picture in from the desktop.
//
// Pasting was the only way to get a screenshot onto the canvas, which is the
// wrong answer to the gesture everybody reaches for first. This is the other
// one: the same re-encode a paste goes through (imageNodeFrom), landing where
// the file was let go.
//
// The listeners sit on the window rather than on the canvas element, because
// the thing being prevented is the browser's default — and its default for a
// dropped file is to leave the page and show you the file instead. A drop that
// misses the canvas by a few pixels, onto the rail or the inspector, would
// take the drawing off screen with it. So the whole window swallows drops and
// the pointer decides where the picture goes.
//
// The one exception is text dragged into a field: renaming a file by dragging
// a word into the box is that field's business, and preventing it there would
// buy nothing.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type RefObject } from "react"

import { imageNodeFrom } from "@/lib/clipboard"
import { useSquig } from "@/lib/store"
import { screenToWorld, type ImageNode } from "@/lib/types"
import { layoutDrop, planDrop, type DropPlan } from "./drop"

const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes("Files")

const isField = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  return !!el?.closest?.("input, textarea, [contenteditable=true]")
}

/** Everything the drop actually does, once the files have been decoded. */
async function take(plan: DropPlan, files: readonly File[], at: [number, number]): Promise<void> {
  const s = useSquig.getState()

  if (plan.kind === "doc") {
    // the same read importDoc does from the file picker, minus the picker
    const ok = s.loadDoc(await files[plan.index].text())
    if (!ok) s.setNotice("that file didn't look like a squig doc")
    return
  }
  if (plan.kind !== "images") return

  const made: ImageNode[] = []
  for (const i of plan.indices) {
    const node = await imageNodeFrom(files[i], files[i].name)
    if (node) made.push(node)
  }
  // nothing decoded: the canvas is exactly as it was, so say so rather than
  // let the drop read as a gesture that went nowhere
  if (!made.length) {
    s.setNotice(plan.indices.length > 1 ? "couldn't read those pictures" : "couldn't read that picture")
    return
  }

  layoutDrop(made, at).forEach(([x, y], i) => {
    made[i].x = x
    made[i].y = y
  })

  // one call, so however many pictures landed, one ⌘Z takes them all back off
  // again — and they come back selected, ready to be moved as a set
  s.addNodes(made)

  // something in the drop didn't make it, and a picture that isn't there is
  // hard to notice among the ones that are
  if (made.length < plan.indices.length) s.setNotice("some of those pictures wouldn't read")
  else if (plan.skipped) s.setNotice("only the pictures landed")
}

/**
 * Wire the window up to dropped files. Returns whether a drag is currently
 * hovering, which is what draws the border on the canvas.
 */
export function useFileDrop(containerRef: RefObject<HTMLDivElement | null>): boolean {
  const [over, setOver] = useState(false)
  // dragenter and dragleave fire for every element the pointer crosses, so a
  // depth count is the only reliable read of "still inside the window"
  const depth = useRef(0)

  useEffect(() => {
    const st = useSquig.getState

    const worldAt = (e: DragEvent): [number, number] => {
      const r = containerRef.current?.getBoundingClientRect()
      return screenToWorld(st().viewport, e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0))
    }

    const settle = () => {
      depth.current = 0
      setOver(false)
    }

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      depth.current++
      setOver(true)
    }

    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setOver(false)
    }

    const onOver = (e: DragEvent) => {
      if (isField(e.target) && !hasFiles(e.dataTransfer)) return
      // without this the drop event never comes, and the browser navigates
      e.preventDefault()
      if (!hasFiles(e.dataTransfer)) return
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
      // an enter we never saw — the drag began over a portalled menu, say
      if (!depth.current) {
        depth.current = 1
        setOver(true)
      }
    }

    const onDrop = (e: DragEvent) => {
      const files = hasFiles(e.dataTransfer) ? Array.from(e.dataTransfer?.files ?? []) : []
      if (isField(e.target) && !files.length) return
      e.preventDefault()
      settle()
      if (!files.length) return

      const at = worldAt(e)
      const plan = planDrop(files)
      const s = st()
      if (plan.kind === "nothing") {
        s.setNotice(plan.count > 1 ? "those aren't pictures" : "that isn't a picture")
        return
      }

      // Crop mode is a spotlight on one picture, and another picture arriving
      // is the end of it — the drop takes the selection, which is the whole of
      // what that mode is. Decided here rather than after the decode, so the
      // window doesn't sit open over a canvas that has already said yes.
      //
      // A text edit is left exactly as it is, though. Every other way out of
      // the editor is something the hands did on this page, and the editor
      // commits by watching for those; a drag off the desktop is none of them
      // — on macOS the Finder keeps the focus the whole way across — so there
      // is nothing here that reliably writes the words down, and a draft
      // thrown away to tidy up a caret is worse than the caret. The picture
      // lands behind the editor, selected and ringed, and the next click
      // commits the words the way it always has.
      s.setCropping(null)

      void take(plan, files, at)
    }

    const ac = new AbortController()
    const opts = { signal: ac.signal }
    window.addEventListener("dragenter", onEnter, opts)
    window.addEventListener("dragover", onOver, opts)
    window.addEventListener("dragleave", onLeave, opts)
    window.addEventListener("drop", onDrop, opts)
    // a drag abandoned with Escape reports nothing else
    window.addEventListener("dragend", settle, opts)
    return () => ac.abort()
  }, [containerRef])

  return over
}
