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
        className="animate-in fade-in zoom-in-95 relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl duration-150"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-baseline gap-3 border-b px-5 py-3.5">
          <h2 className="text-[15px] font-medium">Keyboard</h2>
          <p className="text-xs text-muted-foreground">mostly Figma&apos;s, so your hands already know it</p>
          <button
            type="button"
            className="ml-auto rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => st().setShortcutsOpen(false)}
          >
            close
          </button>
        </div>

        <div className="columns-1 gap-x-8 overflow-y-auto overscroll-contain p-5 sm:columns-2 lg:columns-3">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="mb-5 break-inside-avoid">
              <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="truncate text-[13px]">{row.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {row.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] text-muted-foreground">or</span>}
                          <kbd className="inline-flex h-[18px] items-center rounded border bg-muted px-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
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
