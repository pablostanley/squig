"use client"

// ---------------------------------------------------------------------------
// ⌘C / ⌘X / ⌘V, on the real clipboard.
//
// These ride the browser's own copy/cut/paste events rather than the keydown
// handler, which is why the canvas no longer claims those three keys: calling
// preventDefault on the keystroke is exactly what stops the clipboard event
// from firing. Going through the events instead means the OS clipboard, other
// tabs, other apps and the Edit menu all work without a second code path.
// ---------------------------------------------------------------------------

import { useEffect, type RefObject } from "react"

import { pasteFrom, pasteFromSystem, writeNodes } from "@/lib/clipboard"
import { useSquig } from "@/lib/store"
import type { SquigNode } from "@/lib/types"
import { canvasOwnsKeyboard } from "./keyboard-owner"

/**
 * Wire the canvas up to the system clipboard.
 *
 * `pointerWorld` is where ⌘V lands — the last place the pointer was over the
 * canvas. It's read at the moment of the paste, since decoding a picture takes
 * long enough for the hand to have moved on.
 */
export function useClipboard(pointerWorld: RefObject<[number, number] | null>) {
  useEffect(() => {
    const st = useSquig.getState

    const selectedNodes = (): SquigNode[] => {
      const s = st()
      return s.order.filter((id) => s.selection.includes(id)).map((id) => s.nodes[id]).filter(Boolean)
    }

    /**
     * The canvas only takes a clipboard event when nothing else wants it: not
     * while typing, and not when there are words highlighted on the page —
     * copying the file name out of its field has to keep working.
     */
    const mine = (e: ClipboardEvent): boolean =>
      canvasOwnsKeyboard(e.target) && !window.getSelection()?.toString()

    const onCopy = (e: ClipboardEvent) => {
      if (!mine(e) || !e.clipboardData) return
      const sel = selectedNodes()
      if (!sel.length) return
      e.preventDefault()
      writeNodes(e.clipboardData, sel)
      // the private clipboard stays in step, so paste-in-place and the context
      // menu still have something to work from when the system one is refused
      st().copySelected()
    }

    const onCut = (e: ClipboardEvent) => {
      if (!mine(e) || !e.clipboardData) return
      const sel = selectedNodes()
      if (!sel.length) return
      e.preventDefault()
      writeNodes(e.clipboardData, sel)
      st().cutSelected()
    }

    const onPaste = (e: ClipboardEvent) => {
      if (!mine(e) || !e.clipboardData) return
      e.preventDefault()
      // the DataTransfer is only alive for this turn of the loop, so anything
      // async has to have taken what it needs off it before we return
      void pasteFrom(e.clipboardData, pointerWorld.current ?? undefined)
    }

    /**
     * ⇧⌘V is the one that has to be caught on the way down.
     *
     * A browser only treats it as a paste inside something editable — out here
     * it produces no paste event at all — so paste-in-place asks squig's own
     * clipboard first, which is where it came from in nearly every case, and
     * only goes to the system one when this tab has nothing to give.
     */
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.code !== "KeyV") return
      if (!canvasOwnsKeyboard(e.target)) return
      e.preventDefault()
      const own = st().clipboard
      if (own.length) {
        st().pasteClipboard([Math.min(...own.map((n) => n.x)), Math.min(...own.map((n) => n.y))])
      } else {
        void pasteFromSystem(undefined, true)
      }
    }

    const ac = new AbortController()
    const opts = { signal: ac.signal }
    window.addEventListener("keydown", onKey, opts)
    document.addEventListener("copy", onCopy, opts)
    document.addEventListener("cut", onCut, opts)
    document.addEventListener("paste", onPaste, opts)
    return () => ac.abort()
  }, [pointerWorld])
}
