"use client"

import { SidebarSimpleIcon } from "@phosphor-icons/react"
import { Panel } from "@/components/ui/panel"
import { AgentBridge } from "@/components/agent/bridge"
import { useEffect, useState } from "react"
import { useSquig } from "@/lib/store"
import { installAgentBridge } from "@/lib/agent-bridge"
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
import { TooltipProvider } from "@/components/ui/tooltip"

export default function Home() {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const hydrated = useSquig((s) => s.hydrated)
  const hydrate = useSquig((s) => s.hydrate)
  const uiHidden = useSquig((s) => s.uiHidden)
  const modalOpen = useSquig((s) => s.commandOpen || s.shortcutsOpen)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // only once there's a document to work on — an agent that found window.squig
  // on an empty canvas would be editing a drawing hydrate is about to replace
  useEffect(() => {
    if (hydrated) installAgentBridge()
  }, [hydrated])

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
    <TooltipProvider closeDelay={100}>
      <main className="relative h-full">
        <div className="contents" aria-hidden={modalOpen || undefined} inert={modalOpen || undefined}>
          <Canvas />
          <Panel style={{ display: uiHidden ? "none" : undefined }} className="absolute top-4 right-4 z-40 flex-row items-center gap-1 p-1">
            {process.env.NEXT_PUBLIC_SQUIG_OFFLINE !== "1" && <AgentBridge hidden={uiHidden} />}
            <button className="canvas-action" aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"} aria-pressed={sidebarVisible} title={sidebarVisible ? "Hide sidebar" : "Show sidebar"} onClick={() => setSidebarVisible(v => !v)}><SidebarSimpleIcon size={18} /></button>
          </Panel>
          {/* ⌘\ clears the room — the canvas and what you've selected, nothing else */}
          {!uiHidden && (
            <>
              <TopCorner />
              <FileName />
              <LeftRail />
              <LibraryPanel />
              {sidebarVisible && <Inspector />}
              <ZoomPill />
              <CommandHint />
              <SmallScreenNote />
            </>
          )}
          {uiHidden && (
            <p className="pointer-events-none absolute right-4 bottom-4 z-30 font-sans text-micro text-muted-foreground">
              {kbd("mod+\\")}
            </p>
          )}
          {/* the flash outlives ⌘\ — a copy still has to say it happened */}
          <Notice />
          <LinkEditor />
          <CanvasContextMenu />
        </div>
        <CommandPalette />
        <ShortcutsSheet />
      </main>
    </TooltipProvider>
  )
}
