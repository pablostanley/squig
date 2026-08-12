// ---------------------------------------------------------------------------
// Icons — Phosphor glyphs emitted as crisp `path` prims.
// Drawn sharp rather than roughened: at 12–20px the wobble reads as mush, and
// keeping icons out of rough.js keeps dense templates fast.
//
// Every Phosphor icon is available in five weights via the lazy catalog
// (icon-catalog.ts); a curated regular subset ships inline so library defs
// never flash.
// ---------------------------------------------------------------------------

import type { Prim, PrimOpts } from "./kit"
import { PHOSPHOR_PATHS, PHOSPHOR_VB } from "./phosphor-paths"
import { getIconPaths, ICON_NAME_SET, type IconWeight } from "./icon-catalog"

export type IconName = string

export const ICON_NAMES: string[] = Object.keys(PHOSPHOR_PATHS).sort()

/**
 * Names used by earlier defs (and by anyone typing the obvious thing) mapped
 * onto real Phosphor names. Exported for search, where "settings" should rank
 * gear first rather than leaving it to the tag lottery.
 */
export const ICON_ALIASES: Record<string, string> = {
  search: "magnifying-glass",
  "chevron-down": "caret-down",
  "chevron-right": "caret-right",
  "chevron-left": "caret-left",
  "chevron-up": "caret-up",
  dots: "dots-three",
  menu: "list",
  home: "house",
  mail: "envelope",
  upload: "upload-simple",
  download: "download-simple",
  calendar: "calendar-blank",
  grid: "squares-four",
  chart: "chart-line",
  settings: "gear",
  edit: "pencil-simple",
  close: "x",
  cart: "shopping-cart",
  card: "credit-card",
  chat: "chat-circle",
  send: "paper-plane-tilt",
  ai: "sparkle",
  bolt: "lightning",
  filter: "funnel",
  more: "dots-three",
  drag: "dots-six-vertical",
  logout: "sign-out",
  login: "sign-in",
  attachment: "paperclip",
  mobile: "device-mobile",
  refresh: "arrows-clockwise",
  help: "question",
  alert: "warning",
  time: "clock",
  location: "map-pin",
  document: "file-text",
  photo: "image",
  video: "video-camera",
  mic: "microphone",
  like: "thumbs-up",
  comment: "chat-circle",
  share: "share-network",
  save: "bookmark-simple",
  money: "currency-dollar",
  verified: "seal-check",
  idea: "lightbulb",
}

/** A real Phosphor name for whatever was typed, or null if nothing matches. */
export function resolveIconName(name: string): string | null {
  if (ICON_NAME_SET.has(name)) return name
  const alias = ICON_ALIASES[name]
  if (alias && ICON_NAME_SET.has(alias)) return alias
  return null
}

/**
 * An icon centred on (cx, cy), scaled to `size`.
 * Returns Prim[] so callers spread it: `prims.push(...icon("user", x, y, 16))`.
 * Unknown names render nothing; known names whose weight chunk is still
 * loading render nothing *yet* — the catalog notifies and the canvas redraws.
 */
export function icon(
  name: string,
  cx: number,
  cy: number,
  size: number,
  o?: PrimOpts,
  weight: IconWeight = "regular"
): Prim[] {
  // the brand mark isn't a Phosphor glyph — it's a squig
  if (name === "logo") {
    const r = size / 2
    return [
      { t: "ellipse", x: cx - r, y: cy - r, w: size, h: size, o: { strokeWidth: 1.4, ...o } },
      { t: "ellipse", x: cx - r * 0.45, y: cy - r * 0.45, w: size * 0.45, h: size * 0.45, o: { strokeWidth: 1.4, ...o } },
    ]
  }
  const resolved = resolveIconName(name)
  if (!resolved) return []
  const d = getIconPaths(resolved, weight)
  if (!d) return []
  return [
    {
      t: "path",
      d,
      x: cx - size / 2,
      y: cy - size / 2,
      size,
      vb: PHOSPHOR_VB,
      mode: "fill",
      name: resolved,
      weight: weight === "regular" ? undefined : weight,
      o,
    },
  ]
}
