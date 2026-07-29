// ---------------------------------------------------------------------------
// Themes — a duotone ink on paper, applied as CSS custom properties so the
// whole canvas restyles without re-running a single rough.js path.
//
// The look is early-web risograph: one saturated ink, warm paper, and texture
// (halftone, checker, dither) doing the "analog" work that wobbly lines used
// to do. Lines stay clean and closed.
// ---------------------------------------------------------------------------

export interface Palette {
  /** shown in the menu */
  label: string
  /** infinite canvas behind everything */
  bg: string
  /** surfaces that should occlude what's under them */
  paper: string
  /** the ink: strokes and text */
  ink: string
  /** secondary text and strokes */
  muted: string
  /** dividers, hairlines, disabled */
  faint: string
  /** the canvas dot grid */
  grid: string
  /** selection UI — deliberately NOT the ink, so it reads against the art */
  select: string
}

export const THEMES = {
  "internet-blue": {
    label: "Internet blue",
    bg: "#F6F3EA",
    paper: "#FFFDF7",
    ink: "#2438FF",
    muted: "#6E7DFF",
    faint: "#BFC6FF",
    grid: "#DFD9C7",
    select: "#FF5A24",
  },
  "riso-red": {
    label: "Riso red",
    bg: "#F2EEE6",
    paper: "#FBF8F2",
    ink: "#E0342B",
    muted: "#EE7B72",
    faint: "#F7B9B3",
    grid: "#DDD5C6",
    select: "#2438FF",
  },
  "terminal-green": {
    label: "Terminal green",
    bg: "#E9EFE6",
    paper: "#F7FAF4",
    ink: "#137A3D",
    muted: "#54A472",
    faint: "#A3CDB2",
    grid: "#CBD8C6",
    select: "#E8622F",
  },
  plum: {
    label: "Plum",
    bg: "#F1ECF2",
    paper: "#FBF7FB",
    ink: "#71268A",
    muted: "#A566B8",
    faint: "#D0AADB",
    grid: "#DCD2DE",
    select: "#D9A441",
  },
  marigold: {
    label: "Marigold",
    bg: "#F6F1E2",
    paper: "#FDFAF0",
    ink: "#B26A0F",
    muted: "#D69B4E",
    faint: "#EDCC96",
    grid: "#E2D8BE",
    select: "#2438FF",
  },
  graphite: {
    label: "Graphite",
    bg: "#FAF9F6",
    paper: "#FFFFFF",
    ink: "#2D2A26",
    muted: "#8A857D",
    faint: "#C9C4BB",
    grid: "#D9D4CA",
    select: "#E0653A",
  },
} satisfies Record<string, Palette>

export type ThemeName = keyof typeof THEMES

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]
export const DEFAULT_THEME: ThemeName = "internet-blue"

/** Hand-lettered vs. clean — the "is this decided yet" dial. */
export type FontMode = "hand" | "clean"
export const DEFAULT_FONT: FontMode = "hand"

export function paletteOf(name: string): Palette {
  return THEMES[name as ThemeName] ?? THEMES[DEFAULT_THEME]
}

export function applyTheme(name: string, font: FontMode) {
  if (typeof document === "undefined") return
  const p = paletteOf(name)
  const root = document.documentElement
  root.style.setProperty("--sq-bg", p.bg)
  root.style.setProperty("--sq-paper", p.paper)
  root.style.setProperty("--sq-ink", p.ink)
  root.style.setProperty("--sq-muted", p.muted)
  root.style.setProperty("--sq-faint", p.faint)
  root.style.setProperty("--sq-grid", p.grid)
  root.style.setProperty("--sq-select", p.select)
  root.style.setProperty("--sq-font", font === "clean" ? "var(--font-sans)" : "var(--font-sketch)")
}
