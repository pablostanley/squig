"use client"

import { useEffect } from "react"
import { useSquig } from "@/lib/store"
import { Canvas } from "@/components/canvas/canvas"
import { SketchDefs } from "@/components/canvas/sketch-defs"
import { LeftRail } from "@/components/chrome/left-rail"
import { LibraryPanel } from "@/components/chrome/library-panel"
import { Inspector } from "@/components/chrome/inspector"
import { TopCorner, ZoomPill, CommandHint } from "@/components/chrome/top-corner"
import { FileName } from "@/components/chrome/file-name"
import { CommandPalette } from "@/components/chrome/command-palette"
import { CanvasContextMenu } from "@/components/chrome/context-menu"

export default function Home() {
  const hydrated = useSquig((s) => s.hydrated)
  const hydrate = useSquig((s) => s.hydrate)

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
      <SketchDefs />
      <Canvas />
      <TopCorner />
      <FileName />
      <LeftRail />
      <LibraryPanel />
      <Inspector />
      <ZoomPill />
      <CommandHint />
      <CanvasContextMenu />
      <CommandPalette />
    </main>
  )
}
