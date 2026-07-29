// ---------------------------------------------------------------------------
// Themes — a duotone ink on paper, applied as CSS custom properties so the
// whole canvas restyles without re-running a single rough.js path.
//
// The look is early-web risograph: one saturated ink, warm paper, and flat
// shaded fills doing the "analog" work that wobbly lines used to do. Lines
// stay clean and closed.
//
// Area fills come from exactly three tones — paper, shade, shadeStrong — so a
// wireframe reads as a small tonal ladder rather than a pile of tints. Both
// shades are the ink mixed into the paper (8% and 20%), which keeps every
// theme's fills in that theme's own hue.
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
  /** fill tone 1 — the light wash: inert surfaces, tracks, image placeholders */
  shade: string
  /** fill tone 2 — one clear step darker: emphasis, selection, chart bars */
  shadeStrong: string
  /** the canvas dot grid */
  grid: string
  /** selection UI — deliberately NOT the ink, so it reads against the art */
  select: string
}

export const THEMES = {
  "internet-blue": {
    label: "Internet blue",
    bg: "#EDEAE0",
    paper: "#FAF8F2",
    ink: "#2338D4",
    muted: "#7A88E4",
    faint: "#BFC8F1",
    shade: "#E9E9F0",
    shadeStrong: "#CFD2EC",
    grid: "#D5CFC0",
    select: "#E8622F",
  },
  "riso-red": {
    label: "Riso red",
    bg: "#F2EEE6",
    paper: "#FBF8F2",
    ink: "#E0342B",
    muted: "#EE7B72",
    faint: "#F7B9B3",
    shade: "#F9E8E2",
    shadeStrong: "#F6D1CA",
    grid: "#DDD5C6",
    select: "#2338D4",
  },
  "terminal-green": {
    label: "Terminal green",
    bg: "#E9EFE6",
    paper: "#F7FAF4",
    ink: "#137A3D",
    muted: "#54A472",
    faint: "#A3CDB2",
    shade: "#E5F0E5",
    shadeStrong: "#C9E0CF",
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
    shade: "#F0E6F2",
    shadeStrong: "#DFCDE4",
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
    shade: "#F7EEDE",
    shadeStrong: "#EEDDC3",
    grid: "#E2D8BE",
    select: "#2338D4",
  },
  graphite: {
    label: "Graphite",
    bg: "#FAF9F6",
    paper: "#FFFFFF",
    ink: "#2D2A26",
    muted: "#8A857D",
    faint: "#C9C4BB",
    shade: "#EEEEEE",
    shadeStrong: "#D5D4D4",
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
  root.style.setProperty("--sq-shade", p.shade)
  root.style.setProperty("--sq-shade-strong", p.shadeStrong)
  root.style.setProperty("--sq-grid", p.grid)
  root.style.setProperty("--sq-select", p.select)
  root.style.setProperty("--sq-font", font === "clean" ? "var(--font-sans)" : "var(--font-sketch)")
}
