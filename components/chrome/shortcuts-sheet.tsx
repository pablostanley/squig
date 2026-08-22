"use client"

// ---------------------------------------------------------------------------
// ? — the whole keyboard on one card. Nothing here is typed by hand: every row
// comes from lib/shortcuts, the same list the menus quote.
// ---------------------------------------------------------------------------

import { useSquig } from "@/lib/store"
import { SHORTCUT_GROUPS, kbd } from "@/lib/shortcuts"

export function ShortcutsSheet() {
  const open = useSquig((s) => s.shortcutsOpen)
  const st = useSquig.getState
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onPointerDown={() => st().setShortcutsOpen(false)}
    >
      <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="animate-in fade-in zoom-in-95 relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-chrome-lg border border-border/80 bg-background shadow-popup duration-150"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 px-5 py-4">
          <h2 id="keyboard-shortcuts-title" className="text-title font-semibold">Keyboard</h2>
          <button
            type="button"
            autoFocus
            aria-label="Close keyboard shortcuts"
            className="ml-auto h-ctl rounded-chrome-sm px-2.5 text-label text-muted-foreground hover:bg-accent"
            onClick={() => st().setShortcutsOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="columns-1 gap-x-8 overflow-y-auto overscroll-contain p-5 sm:columns-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="mb-5 break-inside-avoid">
              <h3 className="mb-2 text-label font-semibold text-foreground">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-label text-foreground">{row.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {row.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-micro text-muted-foreground">or</span>}
                          <kbd className="inline-flex h-5 items-center rounded-chrome-xs border bg-muted px-1.5 font-sans text-micro whitespace-nowrap text-muted-foreground">
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
