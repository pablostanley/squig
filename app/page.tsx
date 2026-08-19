"use client"

import { useEffect } from "react"
import { useSquig } from "@/lib/store"
import { Canvas } from "@/components/canvas/canvas"
import { LeftRail } from "@/components/chrome/left-rail"
import { LibraryPanel } from "@/components/chrome/library-panel"
import { Inspector } from "@/components/chrome/inspector"
import { TopCorner, ZoomPill, CommandHint } from "@/components/chrome/top-corner"
import { FileName } from "@/components/chrome/file-name"
import { CommandPalette } from "@/components/chrome/command-palette"
import { CanvasContextMenu } from "@/components/chrome/context-menu"
import { ShortcutsSheet } from "@/components/chrome/shortcuts-sheet"
import { LinkEditor } from "@/components/chrome/link-editor"
import { Notice } from "@/components/chrome/notice"
import { SmallScreenNote } from "@/components/chrome/small-screen-note"
import { kbd } from "@/lib/shortcuts"

export default function Home() {
  const hydrated = useSquig((s) => s.hydrated)
  const hydrate = useSquig((s) => s.hydrate)
  const uiHidden = useSquig((s) => s.uiHidden)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (!hydrated) {
    return (
      <main className="flex h-full items-center justify-center" style={{ backgroundColor: "var(--sq-bg)" }}>
        <p className="text-xl" style={{ color: "var(--sq-muted)", fontFamily: "var(--sq-font)" }}>
          warming up the pencils…
        </p>
      </main>
    )
  }

  return (
    <main className="relative h-full">
      <Canvas />
      {/* ⌘\ clears the room — the canvas and what you've selected, nothing else */}
      {!uiHidden && (
        <>
          <TopCorner />
          <FileName />
          <LeftRail />
          <LibraryPanel />
          <Inspector />
          <ZoomPill />
          <CommandHint />
          <SmallScreenNote />
        </>
      )}
      {uiHidden && (
        <p className="pointer-events-none absolute right-4 bottom-4 z-30 font-mono text-[10px] text-muted-foreground/60">
          {kbd("mod+\\")}
        </p>
      )}
      {/* the flash outlives ⌘\ — a copy still has to say it happened */}
      <Notice />
      <LinkEditor />
      <CanvasContextMenu />
      <CommandPalette />
      <ShortcutsSheet />
    </main>
  )
}
