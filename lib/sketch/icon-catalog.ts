// ---------------------------------------------------------------------------
// Icon catalog — every Phosphor icon in five weights, loaded lazily.
//
// The main bundle carries only a curated "regular" subset (phosphor-paths.ts)
// plus the full name list. Each weight's full path data is a generated chunk
// that loads on first demand: a lookup that misses kicks off the import and
// returns the best stand-in it has, and subscribers are notified when the real
// paths arrive so the canvas can redraw. Renders stay synchronous throughout.
// ---------------------------------------------------------------------------

import { PHOSPHOR_PATHS } from "./phosphor-paths"
import { ALL_ICON_NAMES } from "./phosphor/names"

export const ICON_WEIGHTS = ["thin", "light", "regular", "bold", "fill"] as const
export type IconWeight = (typeof ICON_WEIGHTS)[number]

export function normalizeIconWeight(v: unknown): IconWeight {
  return (ICON_WEIGHTS as readonly string[]).includes(v as string) ? (v as IconWeight) : "regular"
}

/** Every icon the full catalog knows, curated or not. */
export const ICON_NAME_SET: ReadonlySet<string> = new Set(ALL_ICON_NAMES)

const loaded = new Map<IconWeight, Record<string, string[]>>()
const pending = new Map<IconWeight, Promise<void>>()

let version = 0
const subscribers = new Set<() => void>()

/** Bumps when any weight chunk arrives — the value React re-renders on. */
export function iconCatalogVersion(): number {
  return version
}

export function subscribeIconCatalog(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

const IMPORTS: Record<IconWeight, () => Promise<{ PATHS: Record<string, string[]> }>> = {
  thin: () => import("./phosphor/catalog-thin"),
  light: () => import("./phosphor/catalog-light"),
  regular: () => import("./phosphor/catalog-regular"),
  bold: () => import("./phosphor/catalog-bold"),
  fill: () => import("./phosphor/catalog-fill"),
}

/** Fetch one weight's full path data. Deduped; resolves when it's queryable. */
export function loadIconWeight(weight: IconWeight): Promise<void> {
  if (loaded.has(weight)) return Promise.resolve()
  const inFlight = pending.get(weight)
  if (inFlight) return inFlight
  const p = IMPORTS[weight]()
    .then((m) => {
      loaded.set(weight, m.PATHS)
      version++
      for (const fn of subscribers) fn()
    })
    .catch(() => {
      // a failed chunk (offline, dev restart) shouldn't wedge the weight —
      // clearing lets the next lookup retry
      pending.delete(weight)
    })
  pending.set(weight, p)
  return p
}

/**
 * Path data for an icon at a weight, synchronously.
 *
 * Misses trigger the weight's load in the background. Until it lands, a
 * regular-weight stand-in is returned when one is at hand — an icon popping
 * from regular to bold beats a hole in the drawing — and null only when
 * nothing renderable exists yet (caller draws nothing; a redraw follows the
 * catalog notification).
 */
export function getIconPaths(name: string, weight: IconWeight = "regular"): string[] | null {
  const full = loaded.get(weight)
  if (full) return full[name] ?? null
  if (weight === "regular") {
    // a curated hit is the common case and must not drag the full chunk in —
    // the two-tier design exists so a doc of ordinary icons costs nothing extra
    const curated = PHOSPHOR_PATHS[name]
    if (curated) return curated
    void loadIconWeight("regular")
    return null
  }
  void loadIconWeight(weight)
  return loaded.get("regular")?.[name] ?? PHOSPHOR_PATHS[name] ?? null
}

/** Whether paths for name+weight are already in memory. Kicks off no load. */
export function iconPathsReady(name: string, weight: IconWeight = "regular"): boolean {
  const full = loaded.get(weight)
  if (full) return name in full
  return weight === "regular" && name in PHOSPHOR_PATHS
}
