"use client"

// ---------------------------------------------------------------------------
// ? — the whole keyboard on one card. Nothing here is typed by hand: every row
// comes from lib/shortcuts, the same list the menus quote.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react"
import { useSquig } from "@/lib/store"
import { SHORTCUT_GROUPS, kbd } from "@/lib/shortcuts"
import { trapFocus } from "@/components/ui/focus-trap"

export function ShortcutsSheet() {
  const open = useSquig((s) => s.shortcutsOpen)
  if (!open) return null
  return <Sheet />
}

function Sheet() {
  const st = useSquig.getState
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => {
      const fallback = document.querySelector<HTMLElement>('[aria-label^="Drawing canvas"]')
      const target = returnFocus && returnFocus !== document.body && returnFocus.isConnected ? returnFocus : fallback
      target?.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      onPointerDown={() => st().setShortcutsOpen(false)}
    >
      <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-chrome-lg border border-border/80 bg-background shadow-popup"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            e.stopPropagation()
            st().setShortcutsOpen(false)
            return
          }
          trapFocus(e)
        }}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 px-5 py-4 sm:px-8 sm:py-5">
          <h2 id="keyboard-shortcuts-title" className="text-title font-semibold">Keyboard</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close keyboard shortcuts"
            className="ml-auto h-ctl rounded-chrome-sm px-2.5 text-label text-muted-foreground hover:bg-accent"
            onClick={() => st().setShortcutsOpen(false)}
          >
            Close
          </button>
        </div>

        <div
          role="region"
          tabIndex={0}
          aria-label="Keyboard shortcuts"
          className="columns-1 gap-x-12 overflow-y-auto overscroll-contain p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sq-ink)]/40 sm:p-8 md:columns-2"
        >
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="mb-8 break-inside-avoid last:mb-0">
              <h3 className="mb-4 border-b border-border/60 pb-3 text-label font-semibold text-foreground">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-3">
                {group.rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <dt className="min-w-0 text-label text-foreground">{row.label}</dt>
                    <dd className="flex flex-wrap items-center justify-end gap-1.5">
                      {row.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-micro text-muted-foreground">or</span>}
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-chrome-xs border bg-muted px-2 font-sans text-micro whitespace-nowrap text-foreground">
                            {kbd(k)}
                          </kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
