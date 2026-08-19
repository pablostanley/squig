// ---------------------------------------------------------------------------
// Marketing & content blocks — page sections that slot into a layout.
// Heroes, CTAs, feature rows, footers, blog lists, article bodies.
// Composed from the basic + display defs; nothing here redraws a button.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, ellipse, line, text, icon, place, loremLines, truncate, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"
import { buttonDef, inputDef, textareaDef, badgeDef, avatarDef, switchDef } from "./defs-basic"
import { imageDef, breadcrumbDef } from "./defs-display"

// -- prop readers -----------------------------------------------------------

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)
const list = (p: Props, k: string, fallback: string): string[] => {
  const out = str(p, k, fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return out.length ? out : fallback.split(",").map((s) => s.trim())
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const int = (p: Props, k: string, fallback: number, lo: number, hi: number): number =>
  clamp(Math.round(num(p, k, fallback)), lo, hi)

/** Compose a child def at an offset. */
function sub(def: ComponentDef, props: Props, x: number, y: number, w: number, h: number): Prim[] {
  return place(def.render({ ...def.defaults, ...props }, w, h), x, y)
}

// -- layout helpers ---------------------------------------------------------

/** Greedy word wrap, hard-capped at `maxLines` (last line ellipsized). */
function wrap(s: string, size: number, maxW: number, maxLines = 2): string[] {
  const words = s.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let cur = ""
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (cur && textWidth(next, size) > maxW) {
      if (lines.length === maxLines - 1) {
        cur = [cur, ...words.slice(i)].join(" ")
        break
      }
      lines.push(cur)
      cur = words[i]
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines).map((l) => truncate(l, size, maxW))
}

interface HeadOpts {
  eyebrow?: string
  heading: string
  subline?: string
  align?: "left" | "center"
  size?: number
  headLines?: number
  subLines?: number
}

/** Eyebrow + heading + subhead stack. Returns the prims and the bottom y. */
function headBlock(x: number, y: number, w: number, o: HeadOpts): { prims: Prim[]; bottom: number } {
  const prims: Prim[] = []
  const align = o.align ?? "left"
  const tx = align === "center" ? x + w / 2 : x
  let cy = y
  if (o.eyebrow) {
    prims.push(text(tx, cy + 11, truncate(o.eyebrow, 12, w), 12, { align, color: "muted" }))
    cy += 22
  }
  const hs = o.size ?? 24
  const lines = wrap(o.heading, hs, w, o.headLines ?? 2)
  const lh = hs * 1.24
  lines.forEach((ln, i) => prims.push(text(tx, cy + hs * 0.8 + i * lh, ln, hs, { align, bold: true })))
  cy += lines.length * lh
  if (o.subline) {
    const ss = 14
    const sl = wrap(o.subline, ss, w, o.subLines ?? 2)
    cy += 4
    sl.forEach((ln, i) => prims.push(text(tx, cy + ss * 0.85 + i * ss * 1.5, ln, ss, { align, color: "muted" })))
    cy += sl.length * ss * 1.5
  }
  return { prims, bottom: cy }
}

/** headBlock that sheds parts (subhead lines, eyebrow, heading lines) to fit `maxH`. */
function fitHead(x: number, y: number, w: number, maxH: number, o: HeadOpts): { prims: Prim[]; bottom: number } {
  const tries: HeadOpts[] = [
    o,
    { ...o, subLines: 1 },
    { ...o, eyebrow: undefined, subLines: 1 },
    { ...o, eyebrow: undefined, subline: undefined },
    { ...o, eyebrow: undefined, subline: undefined, headLines: 1 },
  ]
  let last = headBlock(x, y, w, o)
  for (const t of tries) {
    last = headBlock(x, y, w, t)
    if (last.bottom - y <= maxH) return last
  }
  return last
}

/** A pill badge sized to its label. */
function pill(label: string, x: number, y: number, h = 24, variant = "outline"): Prim[] {
  const bw = clamp(textWidth(label, 12) + 26, 44, 260)
  return sub(badgeDef, { label, variant }, x, y, bw, h)
}

function pillCentered(label: string, cx: number, y: number, h = 24, variant = "outline"): Prim[] {
  const bw = clamp(textWidth(label, 12) + 26, 44, 260)
  return sub(badgeDef, { label, variant }, cx - bw / 2, y, bw, h)
}

/** Width a button wants for a given label. */
const btnW = (label: string, size = 15): number => clamp(textWidth(label, size) + 44, 84, 220)

function stars(x: number, cy: number, size = 12, n = 5): Prim[] {
  const out: Prim[] = []
  for (let i = 0; i < n; i++) out.push(...icon("star", x + size / 2 + i * (size + 3), cy, size))
  return out
}

/** A fake customer logo: mark + wordmark bar. */
const LOGO_ICONS = ["globe", "sparkle", "rocket-launch", "fire", "crown", "cloud", "lightning", "seal-check"]

function logoMark(x: number, cy: number, w: number, i: number): Prim[] {
  const s = clamp(w * 0.3, 14, 26)
  const out: Prim[] = [...icon(LOGO_ICONS[i % LOGO_ICONS.length], x + s / 2, cy, s, { stroke: "muted" })]
  const barX = x + s + 8
  const barW = Math.max(0, w - s - 8)
  if (barW > 12) {
    out.push(line(barX, cy - 3, barX + barW * 0.9, cy - 3, { stroke: "muted", strokeWidth: 2.4 }))
    out.push(line(barX, cy + 5, barX + barW * 0.55, cy + 5, { stroke: "faint", strokeWidth: 2 }))
  }
  return out
}

const FEATURE_ICONS = [
  "lightning",
  "shield-check",
  "sparkle",
  "rocket-launch",
  "brain",
  "globe",
  "package",
  "heart",
  "clock",
  "magic-wand",
  "cloud",
  "gear",
]

const FEATURE_TITLES = [
  "Stupidly fast",
  "Locked down",
  "Weirdly fun",
  "Ships on Friday",
  "Remembers stuff",
  "Works offline",
  "Boxes included",
  "People like it",
  "Saves you hours",
  "A bit of magic",
  "Syncs quietly",
  "Tweak everything",
]

const PEOPLE = ["Ana Ruiz", "Kim Park", "Dev Patel", "Lou Bing", "Mia Sol", "Tom Vega", "Ivy Chen", "Ray Ortiz"]
const ROLES = ["Designer", "Head of ops", "Engineer", "Founder", "PM", "Support lead", "Marketer", "Intern"]

// ===========================================================================
// MARKETING
// ===========================================================================

// -- hero -------------------------------------------------------------------

export const heroDef: ComponentDef = {
  kind: "hero",
  name: "Hero",
  category: "blocks",
  group: "Marketing",
  keywords: ["landing", "above the fold", "headline", "masthead", "intro"],
  size: { w: 860, h: 420 },
  defaults: {
    layout: "centered",
    eyebrow: true,
    eyebrowText: "now in open beta",
    secondCta: true,
    headline: "Draw it badly, ship it anyway",
    subline: "A wireframe tool that never pretends to be the final design.",
    cta: "Start scribbling",
    cta2: "See examples",
  },
  controls: [
    { key: "layout", label: "Layout", type: "select", options: ["centered", "split-image", "split-form"], quick: true },
    { key: "eyebrow", label: "Eyebrow", type: "toggle", quick: true },
    { key: "secondCta", label: "Second button", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
    { key: "subline", label: "Subhead", type: "text" },
    { key: "cta", label: "Button label", type: "text" },
    { key: "cta2", label: "Second button label", type: "text" },
    { key: "eyebrowText", label: "Eyebrow text", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const layout = str(p, "layout", "centered")
    const pad = clamp(w * 0.06, 16, 56)
    const vpad = clamp(h * 0.11, 14, 46)
    const heading = str(p, "headline", "Draw it badly, ship it anyway")
    const subline = str(p, "subline", "A wireframe tool that never pretends to be the final design.")
    const second = bool(p, "secondCta")
    const l1 = str(p, "cta", "Start scribbling")
    const l2 = str(p, "cta2", "See examples")
    const eyebrowText = str(p, "eyebrowText", "now in open beta").trim()

    if (layout === "centered") {
      const colW = clamp(w - pad * 2, 160, Math.max(200, w * 0.7))
      const x0 = (w - colW) / 2
      const hs = clamp(w * 0.05, 18, 40)
      const bh = clamp(h * 0.11, 32, 44)

      // build the stack from y=0, then drop it in vertically centred — a hero
      // laid out top-down leaves all its slack at the bottom and looks broken
      const stack: Prim[] = []
      let y = 0
      if (bool(p, "eyebrow") && eyebrowText) {
        stack.push(...pillCentered(eyebrowText, w / 2, y, 24))
        y += 36
      }
      const head = fitHead(x0, y, colW, h - vpad * 2 - y - bh - 26, { heading, subline, align: "center", size: hs })
      stack.push(...head.prims)
      y = head.bottom + 20
      const w1 = btnW(l1)
      const w2 = btnW(l2)
      const total = second ? w1 + 12 + w2 : w1
      let bx = (w - total) / 2
      stack.push(...sub(buttonDef, { label: l1, variant: "filled" }, bx, y, w1, bh))
      if (second) {
        bx += w1 + 12
        stack.push(...sub(buttonDef, { label: l2, variant: "outline" }, bx, y, w2, bh))
      }
      y += bh
      return place(stack, 0, Math.max(vpad, (h - y) / 2))
    }

    // split layouts
    const gap = clamp(w * 0.04, 14, 40)
    const colW = Math.max(80, (w - pad * 2 - gap) / 2)
    const bodyH = Math.max(60, h - vpad * 2)
    const bh = clamp(h * 0.11, 30, 44)

    const stack: Prim[] = []
    let sy = 0
    if (bool(p, "eyebrow") && eyebrowText) {
      stack.push(...pill(truncate(eyebrowText, 12, Math.max(60, colW - 26)), 0, sy, 24))
      sy += 34
    }
    const head = fitHead(0, sy, colW, bodyH - sy - bh - 20, {
      heading,
      subline,
      align: "left",
      size: clamp(colW * 0.095, 17, 34),
    })
    stack.push(...head.prims)
    sy = head.bottom + 18
    if (sy + bh <= bodyH) {
      const w1 = Math.min(btnW(l1), colW)
      stack.push(...sub(buttonDef, { label: l1, variant: "filled" }, 0, sy, w1, bh))
      const w2 = btnW(l2)
      if (second && w1 + 12 + w2 <= colW) {
        stack.push(...sub(buttonDef, { label: l2, variant: "outline" }, w1 + 12, sy, w2, bh))
      }
      sy += bh
    }
    prims.push(...place(stack, pad, vpad + Math.max(0, (bodyH - sy) / 2)))

    const rx = pad + colW + gap
    if (layout === "split-image") {
      prims.push(...sub(imageDef, { style: "plain", caption: false }, rx, vpad, colW, bodyH))
      return prims
    }

    // split-form
    const cardH = Math.min(bodyH, 236)
    const cy = vpad + (bodyH - cardH) / 2
    prims.push(rect(rx, cy, colW, cardH, { fill: "solid", fillColor: "paper" }))
    prims.push(rect(rx, cy, colW, cardH, {}))
    const ip = clamp(colW * 0.08, 12, 22)
    const iw = colW - ip * 2
    let fy = cy + ip
    prims.push(text(rx + ip, fy + 15, truncate("Get on the list", 17, iw), 17, { bold: true }))
    fy += 28
    if (fy + 40 < cy + cardH) {
      prims.push(...sub(inputDef, { showLabel: false, placeholder: "Your name", icon: "none" }, rx + ip, fy, iw, 38))
      fy += 48
    }
    if (fy + 40 < cy + cardH) {
      prims.push(...sub(inputDef, { showLabel: false, placeholder: "you@wherever.com", icon: "mail" }, rx + ip, fy, iw, 38))
      fy += 48
    }
    if (fy + 38 < cy + cardH) {
      prims.push(...sub(buttonDef, { label: "Let me in", variant: "filled" }, rx + ip, fy, iw, 38))
      fy += 44
    }
    if (fy + 12 < cy + cardH) {
      prims.push(text(rx + colW / 2, fy + 10, truncate("No spam. Barely any email.", 11, iw), 11, { align: "center", color: "muted" }))
    }
    return prims
  },
}

// -- hero minimal -----------------------------------------------------------

export const heroMinimalDef: ComponentDef = {
  kind: "hero-minimal",
  name: "Hero (minimal)",
  category: "blocks",
  group: "Marketing",
  keywords: ["landing", "simple", "headline", "intro", "above the fold"],
  size: { w: 720, h: 240 },
  defaults: {
    align: "center",
    action: true,
    headline: "Wireframes that look like wireframes",
    subline: "Sketch the idea. Argue about it later.",
    cta: "Try it free",
  },
  controls: [
    { key: "align", label: "Align", type: "select", options: ["center", "left"], quick: true },
    { key: "action", label: "Button", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
    { key: "subline", label: "Subhead", type: "text" },
    { key: "cta", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const pad = clamp(w * 0.07, 16, 60)
    const colW = Math.max(140, w - pad * 2)
    const hs = clamp(w * 0.052, 18, 36)
    const bh = clamp(h * 0.17, 30, 44)
    const label = str(p, "cta", "Try it free")
    const bw = Math.min(btnW(label), colW)
    const centered = str(p, "align", "center") !== "left"
    const action = bool(p, "action")

    const stack: Prim[] = []
    const head = fitHead(0, 0, colW, h - (action ? bh : 0) - 26, {
      heading: str(p, "headline", "Wireframes that look like wireframes"),
      subline: str(p, "subline", "Sketch the idea. Argue about it later."),
      align: centered ? "center" : "left",
      size: hs,
      subLines: 1,
    })
    stack.push(...head.prims)
    let sy = head.bottom
    if (action) {
      sy += 18
      stack.push(...sub(buttonDef, { label, variant: "filled" }, centered ? colW / 2 - bw / 2 : 0, sy, bw, bh))
      sy += bh
    }
    prims.push(...place(stack, pad, Math.max(6, (h - sy) / 2)))
    return prims
  },
}

// -- cta block --------------------------------------------------------------

export const ctaBlockDef: ComponentDef = {
  kind: "cta-block",
  name: "CTA block",
  category: "blocks",
  group: "Marketing",
  keywords: ["call to action", "signup", "convert", "banner", "closer"],
  size: { w: 760, h: 210 },
  defaults: {
    variant: "centered",
    headline: "Got an idea?",
    subline: "Ten seconds from blank canvas to first draft.",
    buttons: 2,
    cta: "Start free",
    cta2: "Talk to a human",
  },
  controls: [
    { key: "variant", label: "Variant", type: "select", options: ["centered", "split", "boxed"], quick: true },
    { key: "buttons", label: "Buttons", type: "number", min: 1, max: 2, quick: true },
    { key: "headline", label: "Headline", type: "text" },
    { key: "subline", label: "Subhead", type: "text" },
    { key: "cta", label: "Button label", type: "text" },
    { key: "cta2", label: "Second button label", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const variant = str(p, "variant", "centered")
    const nBtn = int(p, "buttons", 2, 1, 2)
    const heading = str(p, "headline", "Got an idea?")
    const subline = str(p, "subline", "Ten seconds from blank canvas to first draft.")
    const l1 = str(p, "cta", "Start free")
    const l2 = str(p, "cta2", "Talk to a human")
    const boxed = variant === "boxed"
    const inset = boxed ? clamp(Math.min(w, h) * 0.03, 6, 14) : 0
    if (boxed) {
      prims.push(rect(inset, inset, w - inset * 2, h - inset * 2, {}))
    }
    const pad = clamp(w * 0.05, 16, 44) + inset
    const bh = clamp(h * 0.2, 30, 44)

    if (variant === "split") {
      const gap = 24
      const w1 = btnW(l1)
      const w2 = btnW(l2)
      const want = nBtn > 1 ? w1 + 12 + w2 : w1
      const btnCol = Math.min(w * 0.42, want)
      // a long label asks for more than the column has — shrink both to fit it
      const room = Math.max(24, nBtn > 1 ? btnCol - 12 : btnCol)
      const k = Math.min(1, room / (nBtn > 1 ? w1 + w2 : w1))
      const textW = Math.max(120, w - pad * 2 - gap - btnCol)
      const head = fitHead(0, 0, textW, h - 20, { heading, subline, size: clamp(w * 0.035, 17, 26) })
      prims.push(...place(head.prims, pad, Math.max(8, (h - head.bottom) / 2)))
      let bx = w - pad - btnCol
      const by = (h - bh) / 2
      if (nBtn > 1) {
        prims.push(...sub(buttonDef, { label: l2, variant: "outline" }, bx, by, w2 * k, bh))
        bx += w2 * k + 12
      }
      prims.push(...sub(buttonDef, { label: l1, variant: "filled" }, bx, by, Math.min(w1 * k, w - bx - pad), bh))
      return prims
    }

    const colW = Math.max(140, w - pad * 2)
    const stack: Prim[] = []
    const head = fitHead(0, 0, colW, h - inset * 2 - bh - 26, {
      heading,
      subline,
      align: "center",
      size: clamp(w * 0.038, 17, 28),
      subLines: 1,
    })
    stack.push(...head.prims)
    let sy = head.bottom + 16
    const w1 = Math.min(btnW(l1), colW)
    const w2 = btnW(l2)
    const total = nBtn > 1 && w1 + 12 + w2 <= colW ? w1 + 12 + w2 : w1
    let bx = colW / 2 - total / 2
    stack.push(...sub(buttonDef, { label: l1, variant: "filled" }, bx, sy, w1, bh))
    if (total > w1) {
      bx += w1 + 12
      stack.push(...sub(buttonDef, { label: l2, variant: "outline" }, bx, sy, w2, bh))
    }
    sy += bh
    prims.push(...place(stack, pad, Math.max(inset + 8, (h - sy) / 2)))
    return prims
  },
}

// -- feature grid -----------------------------------------------------------

export const featureGridDef: ComponentDef = {
  kind: "feature-grid",
  name: "Feature grid",
  category: "blocks",
  group: "Marketing",
  keywords: ["features", "benefits", "columns", "icons", "grid"],
  size: { w: 820, h: 380 },
  defaults: { cols: 3, rows: 2, heading: true, boxed: false, headline: "Everything you sort of need" },
  controls: [
    { key: "cols", label: "Columns", type: "number", min: 2, max: 4, quick: true },
    { key: "rows", label: "Rows", type: "number", min: 1, max: 3, quick: true },
    { key: "boxed", label: "Cards", type: "toggle", quick: true },
    { key: "heading", label: "Show headline", type: "toggle" },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const cols = int(p, "cols", 3, 2, 4)
    const rows = int(p, "rows", 2, 1, 3)
    const boxed = bool(p, "boxed")
    const pad = clamp(w * 0.04, 12, 34)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, pad, w - pad * 2, {
        eyebrow: "the good bits",
        heading: str(p, "headline", "Everything you sort of need"),
        align: "center",
        size: clamp(w * 0.035, 17, 26),
      })
      prims.push(...head.prims)
      top = head.bottom + 22
    }
    const gx = 22
    const gy = 20
    const gw = w - pad * 2
    const gh = h - top - pad
    if (gh < 40) return prims
    const cw = (gw - gx * (cols - 1)) / cols
    const ch = (gh - gy * (rows - 1)) / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const x = pad + c * (cw + gx)
        const y = top + r * (ch + gy)
        let ix = x
        let iy = y
        let inW = cw
        if (boxed) {
          prims.push(rect(x, y, cw, ch, { stroke: "faint" }))
          // a squat card takes a tighter inset so its contents still fit inside
          const ins = clamp(ch * 0.13, 6, 14)
          ix = x + ins
          iy = y + ins
          inW = cw - ins * 2
        }
        const box = clamp(Math.min(ch * 0.28, 34), 20, 34)
        // a squat cell drops the icon rather than pushing the title out the bottom
        const iconFits = iy - y + box + 24 <= ch
        if (iconFits) {
          prims.push(rect(ix, iy, box, box, { stroke: "faint" }))
          prims.push(...icon(FEATURE_ICONS[i % FEATURE_ICONS.length], ix + box / 2, iy + box / 2, box * 0.56))
        }
        let ty = iy + (iconFits ? box + 20 : 12)
        if (ty + 4 > y + ch) continue
        prims.push(text(ix, ty, truncate(FEATURE_TITLES[i % FEATURE_TITLES.length], 15, inW), 15, { bold: true }))
        ty += 12
        const room = y + ch - ty - 4
        const lines = clamp(Math.floor(room / 15), 0, 3)
        if (lines > 0) prims.push(...loremLines(ix, ty + 8, inW, lines, 15))
      }
    }
    return prims
  },
}

// -- feature split ----------------------------------------------------------

export const featureSplitDef: ComponentDef = {
  kind: "feature-split",
  name: "Feature split",
  category: "blocks",
  group: "Marketing",
  keywords: ["feature", "image left", "image right", "bullets", "two column"],
  size: { w: 800, h: 340 },
  defaults: { side: "left", bullets: 3, cta: true, headline: "Sketch first, pixel-push never", ctaLabel: "Show me more" },
  controls: [
    { key: "side", label: "Image side", type: "select", options: ["left", "right"], quick: true },
    { key: "bullets", label: "Bullets", type: "number", min: 2, max: 5, quick: true },
    { key: "cta", label: "Button", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
    { key: "ctaLabel", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const pad = clamp(w * 0.05, 14, 40)
    const vpad = clamp(h * 0.09, 12, 34)
    const gap = clamp(w * 0.05, 16, 44)
    const colW = Math.max(90, (w - pad * 2 - gap) / 2)
    const bodyH = Math.max(60, h - vpad * 2)
    const imgLeft = str(p, "side", "left") === "left"
    const imgX = imgLeft ? pad : pad + colW + gap
    const txX = imgLeft ? pad + colW + gap : pad
    prims.push(...sub(imageDef, { style: "plain", caption: false }, imgX, vpad, colW, bodyH))

    const stack: Prim[] = []
    const head = headBlock(0, 0, colW, {
      eyebrow: "why it works",
      heading: str(p, "headline", "Sketch first, pixel-push never"),
      size: clamp(colW * 0.075, 16, 26),
    })
    stack.push(...head.prims)
    let sy = head.bottom + 14
    const n = int(p, "bullets", 3, 2, 5)
    const bh = clamp(h * 0.11, 28, 40)
    const room = bodyH - sy - (bool(p, "cta") ? bh + 14 : 0)
    const rowH = clamp(room / Math.max(1, n), 18, 30)
    for (let i = 0; i < n; i++) {
      const cy = sy + rowH * i + rowH / 2
      if (cy + 8 > bodyH) break
      stack.push(...icon("check", 8, cy, 13))
      stack.push(line(24, cy, 24 + (colW - 24) * (0.9 - (i % 3) * 0.13), cy, { stroke: "muted", strokeWidth: 1.4 }))
    }
    sy += rowH * n + 12
    if (bool(p, "cta") && sy + bh <= bodyH) {
      const label = str(p, "ctaLabel", "Show me more")
      stack.push(...sub(buttonDef, { label, variant: "outline" }, 0, sy, Math.min(btnW(label), colW), bh))
      sy += bh
    }
    prims.push(...place(stack, txX, vpad + Math.max(0, (bodyH - sy) / 2)))
    return prims
  },
}

// -- feature list -----------------------------------------------------------

export const featureListDef: ComponentDef = {
  kind: "feature-list",
  name: "Feature list",
  category: "blocks",
  group: "Marketing",
  keywords: ["features", "rows", "alternating", "zigzag", "list"],
  size: { w: 740, h: 400 },
  // `heading` is new, and renderComponent merges current defaults under a saved
  // node's props — so a default of `true` would grow a headline on every list
  // already sitting on somebody's canvas. Ships off; one click turns it on.
  defaults: { rows: 3, alternate: true, dividers: true, heading: false, headline: "What it actually does" },
  controls: [
    { key: "rows", label: "Rows", type: "number", min: 2, max: 5, quick: true },
    { key: "alternate", label: "Alternate sides", type: "toggle", quick: true },
    { key: "dividers", label: "Dividers", type: "toggle" },
    { key: "heading", label: "Show headline", type: "toggle" },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "rows", 3, 2, 5)
    const alt = bool(p, "alternate")
    const pad = clamp(w * 0.04, 12, 32)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, pad, w - pad * 2, {
        heading: str(p, "headline", "What it actually does"),
        align: "center",
        size: clamp(w * 0.032, 16, 24),
      })
      prims.push(...head.prims)
      top = head.bottom + 18
    }
    const rowH = (h - top - pad) / n
    if (rowH < 40) return prims
    const iconBox = clamp(Math.min(rowH * 0.6, 60), 32, 60)
    for (let i = 0; i < n; i++) {
      const y = top + i * rowH
      const flip = alt && i % 2 === 1
      const ix = flip ? w - pad - iconBox : pad
      const tx = flip ? pad : pad + iconBox + 22
      const tw = Math.max(80, w - pad * 2 - iconBox - 22)
      prims.push(rect(ix, y + (rowH - iconBox) / 2 - 4, iconBox, iconBox, { stroke: "faint" }))
      prims.push(
        ...icon(FEATURE_ICONS[i % FEATURE_ICONS.length], ix + iconBox / 2, y + (rowH - iconBox) / 2 - 4 + iconBox / 2, iconBox * 0.5)
      )
      let ty = y + 22
      prims.push(text(tx, ty, truncate(FEATURE_TITLES[(i + 2) % FEATURE_TITLES.length], 17, tw), 17, { bold: true }))
      ty += 10
      const lines = clamp(Math.floor((rowH - 46) / 16), 1, 3)
      prims.push(...loremLines(tx, ty + 12, tw, lines, 16))
      if (bool(p, "dividers") && i < n - 1) {
        prims.push(line(pad, y + rowH - 6, w - pad, y + rowH - 6, { stroke: "faint" }))
      }
    }
    return prims
  },
}

// -- testimonials -----------------------------------------------------------

export const testimonialBlockDef: ComponentDef = {
  kind: "testimonial-block",
  name: "Testimonials",
  category: "blocks",
  group: "Marketing",
  keywords: ["quote", "reviews", "social proof", "customers", "praise"],
  size: { w: 800, h: 300 },
  defaults: { variant: "3-up", stars: true, heading: false, headline: "People say nice things" },
  controls: [
    { key: "variant", label: "Variant", type: "select", options: ["single", "2-up", "3-up"], quick: true },
    { key: "stars", label: "Stars", type: "toggle", quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const variant = str(p, "variant", "3-up")
    const withStars = bool(p, "stars")
    const pad = clamp(w * 0.04, 12, 34)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, pad, w - pad * 2, {
        heading: str(p, "headline", "People say nice things"),
        align: "center",
        size: clamp(w * 0.032, 16, 24),
      })
      prims.push(...head.prims)
      top = head.bottom + 18
    }
    const bodyH = h - top - pad
    if (bodyH < 60) return prims

    if (variant === "single") {
      const colW = Math.min(w - pad * 2, w * 0.78)
      let y = top
      prims.push(...icon("quotes", w / 2, y + 16, clamp(bodyH * 0.13, 18, 30), { stroke: "muted" }))
      y += 40
      const qs = clamp(w * 0.028, 14, 22)
      const quote = wrap("It looks like I drew it on a napkin, which is exactly the point.", qs, colW, 2)
      quote.forEach((ln, i) => prims.push(text(w / 2, y + qs * 0.8 + i * qs * 1.35, ln, qs, { align: "center" })))
      y += quote.length * qs * 1.35 + 16
      if (withStars && y + 16 < top + bodyH) {
        prims.push(...stars(w / 2 - (5 * 15) / 2, y + 6, 12))
        y += 22
      }
      const av = clamp(bodyH * 0.14, 26, 40)
      if (y + av <= top + bodyH + 4) {
        const nameW = textWidth(PEOPLE[0], 14)
        const rowW = av + 10 + Math.max(nameW, textWidth(ROLES[0], 12))
        const rx = w / 2 - rowW / 2
        prims.push(...sub(avatarDef, { content: "initials", initials: "AR" }, rx, y, av, av))
        prims.push(text(rx + av + 10, y + av / 2 - 1, PEOPLE[0], 14, { bold: true }))
        prims.push(text(rx + av + 10, y + av / 2 + 14, ROLES[0], 12, { color: "muted" }))
      }
      return prims
    }

    const cols = variant === "2-up" ? 2 : 3
    const gap = clamp(w * 0.025, 12, 24)
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols
    for (let i = 0; i < cols; i++) {
      const x = pad + i * (cw + gap)
      prims.push(rect(x, top, cw, bodyH, {}))
      const ip = clamp(cw * 0.08, 10, 20)
      const inW = cw - ip * 2
      let y = top + ip
      if (withStars) {
        prims.push(...stars(x + ip, y + 8, 11))
        y += 22
      }
      const av = clamp(bodyH * 0.14, 24, 36)
      const footTop = top + bodyH - ip - av
      const lines = clamp(Math.floor((footTop - y - 12) / 16), 1, 4)
      prims.push(...loremLines(x + ip, y + 10, inW, lines, 16))
      if (footTop > y) {
        prims.push(...sub(avatarDef, { content: "icon" }, x + ip, footTop, av, av))
        prims.push(text(x + ip + av + 10, footTop + av / 2 - 1, truncate(PEOPLE[i % PEOPLE.length], 13, inW - av - 12), 13, { bold: true }))
        prims.push(text(x + ip + av + 10, footTop + av / 2 + 13, truncate(ROLES[i % ROLES.length], 11, inW - av - 12), 11, { color: "muted" }))
      }
    }
    return prims
  },
}

// -- logo cloud -------------------------------------------------------------

export const logoCloudDef: ComponentDef = {
  kind: "logo-cloud",
  name: "Logo cloud",
  category: "blocks",
  group: "Marketing",
  keywords: ["logos", "customers", "trusted by", "brands", "social proof"],
  size: { w: 800, h: 170 },
  defaults: { count: 5, heading: true, variant: "row", headline: "Teams that draw badly on purpose" },
  controls: [
    { key: "count", label: "Logos", type: "number", min: 3, max: 8, quick: true },
    { key: "variant", label: "Layout", type: "select", options: ["row", "grid"], quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "count", 5, 3, 8)
    const grid = str(p, "variant", "row") === "grid"
    const pad = clamp(w * 0.04, 12, 34)
    let top = pad
    if (bool(p, "heading")) {
      const head = str(p, "headline", "Teams that draw badly on purpose").trim()
      if (head) {
        prims.push(text(w / 2, top + 13, truncate(head, 14, w - pad * 2), 14, { align: "center", color: "muted" }))
        top += 30
      }
    }
    const bodyH = h - top - pad
    if (bodyH < 24) return prims
    if (!grid) {
      const gap = clamp(w * 0.03, 10, 30)
      const cw = (w - pad * 2 - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) prims.push(...logoMark(pad + i * (cw + gap), top + bodyH / 2, cw, i))
      return prims
    }
    const cols = n <= 4 ? 2 : Math.ceil(n / 2)
    const rows = Math.ceil(n / cols)
    const gap = clamp(w * 0.025, 10, 24)
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols
    const chh = (bodyH - gap * (rows - 1)) / rows
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const x = pad + c * (cw + gap)
      const y = top + r * (chh + gap)
      prims.push(rect(x, y, cw, chh, { stroke: "faint" }))
      prims.push(...logoMark(x + cw * 0.16, y + chh / 2, cw * 0.68, i))
    }
    return prims
  },
}

// -- pricing block ----------------------------------------------------------

export const pricingBlockDef: ComponentDef = {
  kind: "pricing-block",
  name: "Pricing block",
  category: "blocks",
  group: "Marketing",
  keywords: ["plans", "tiers", "billing", "money", "subscribe"],
  size: { w: 840, h: 460 },
  defaults: {
    tiers: 3,
    highlight: 2,
    heading: true,
    billing: true,
    headline: "Pick a plan, any plan",
    tierNames: "Doodle, Sketch, Masterpiece, Gallery",
    prices: "$0, $12, $49, $199",
  },
  controls: [
    { key: "tiers", label: "Tiers", type: "number", min: 2, max: 4, quick: true },
    { key: "highlight", label: "Highlight tier", type: "number", min: 0, max: 4, quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "billing", label: "Billing toggle", type: "toggle" },
    { key: "headline", label: "Headline", type: "text" },
    { key: "tierNames", label: "Tier names (comma-sep)", type: "text" },
    { key: "prices", label: "Prices (comma-sep)", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "tiers", 3, 2, 4)
    // 0 means "none"; anything past the last tier highlights the last one
    const hiRaw = int(p, "highlight", 2, 0, 4)
    const hi = hiRaw === 0 ? 0 : clamp(hiRaw, 1, n)
    const pad = clamp(w * 0.035, 10, 30)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, top, w - pad * 2, {
        eyebrow: "no hidden fees, promise",
        heading: str(p, "headline", "Pick a plan, any plan"),
        align: "center",
        size: clamp(w * 0.032, 16, 26),
      })
      prims.push(...head.prims)
      top = head.bottom + 14
    }
    if (bool(p, "billing")) {
      const label = "Yearly (two months free)"
      const rowW = 44 + 10 + textWidth(label, 14)
      prims.push(...sub(switchDef, { on: true, showLabel: true, label }, w / 2 - rowW / 2, top, rowW, 26))
      top += 38
    }
    const bodyH = h - top - pad
    if (bodyH < 100) return prims

    const gap = clamp(w * 0.02, 10, 22)
    const cw = (w - pad * 2 - gap * (n - 1)) / n
    const names = list(p, "tierNames", "Doodle, Sketch, Masterpiece, Gallery")
    const prices = list(p, "prices", "$0, $12, $49, $199")
    for (let i = 0; i < n; i++) {
      const x = pad + i * (cw + gap)
      const isHi = i + 1 === hi
      const y0 = top + (isHi ? 0 : 12)
      const ch = bodyH - (isHi ? 0 : 24)
      prims.push(rect(x, y0, cw, ch, isHi ? { strokeWidth: 2.2 } : {}))
      let y = y0 + 26
      if (isHi) {
        prims.push(rect(x, y0, cw, 24, { fill: "shade", fillColor: "ink" }))
        prims.push(text(x + cw / 2, y0 + 17, "most popular", 11, { align: "center" }))
        y = y0 + 48
      }
      prims.push(text(x + cw / 2, y, truncate(names[i % names.length] ?? "", 16, cw - 16), 16, { align: "center", bold: true }))
      y += 32
      const ps = clamp(cw * 0.13, 18, 28)
      prims.push(text(x + cw / 2, y, truncate(prices[i % prices.length] ?? "", ps, cw - 16), ps, { align: "center", bold: true }))
      prims.push(text(x + cw / 2, y + 16, "per month-ish", 11, { align: "center", color: "muted" }))
      y += 34
      const btnH = clamp(bodyH * 0.09, 30, 38)
      const featRoom = y0 + ch - y - btnH - 24
      const feats = clamp(Math.floor(featRoom / 24), 0, 5)
      for (let f = 0; f < feats; f++) {
        const fy = y + f * 24
        prims.push(...icon("check", x + 18, fy, 12))
        prims.push(line(x + 32, fy + 1, x + cw - 18 - (f % 3) * 10, fy + 1, { stroke: "muted", strokeWidth: 1.3 }))
      }
      prims.push(
        ...sub(
          buttonDef,
          { label: isHi ? "Take my money" : "Choose", variant: isHi ? "filled" : "outline", size: "sm" },
          x + 14,
          y0 + ch - btnH - 14,
          cw - 28,
          btnH
        )
      )
    }
    return prims
  },
}

// -- faq --------------------------------------------------------------------

const FAQS = [
  "Is it actually free?",
  "Can I export my scribbles?",
  "Does it work offline?",
  "Why does everything look hand-drawn?",
  "Do you sell my data?",
  "Can my whole team join?",
]

export const faqDef: ComponentDef = {
  kind: "faq",
  name: "FAQ",
  category: "blocks",
  group: "Marketing",
  keywords: ["questions", "accordion", "help", "answers", "support"],
  size: { w: 740, h: 400 },
  defaults: { count: 5, columns: 1, heading: true, expanded: 1, headline: "Questions people actually ask" },
  controls: [
    { key: "count", label: "Questions", type: "number", min: 2, max: 6, quick: true },
    { key: "columns", label: "Columns", type: "number", min: 1, max: 2, quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "expanded", label: "Expanded", type: "number", min: 0, max: 6 },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "count", 5, 2, 6)
    const cols = int(p, "columns", 1, 1, 2)
    // which question is open; 0 = all shut
    const exp = clamp(int(p, "expanded", 1, 0, 6), 0, n)
    const pad = clamp(w * 0.04, 12, 32)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, top, w - pad * 2, {
        heading: str(p, "headline", "Questions people actually ask"),
        align: cols === 1 ? "left" : "center",
        size: clamp(w * 0.032, 16, 24),
      })
      prims.push(...head.prims)
      top = head.bottom + 16
    }
    const bodyH = h - top - pad
    if (bodyH < 50) return prims
    const gap = 26
    const colW = (w - pad * 2 - gap * (cols - 1)) / cols
    const perCol = Math.ceil(n / cols)
    const rowH = bodyH / perCol
    for (let i = 0; i < n; i++) {
      const c = Math.floor(i / perCol)
      const r = i % perCol
      const x = pad + c * (colW + gap)
      const y = top + r * rowH
      const open = i + 1 === exp
      prims.push(text(x, y + 16, truncate(FAQS[i % FAQS.length], 15, colW - 28), 15, { bold: open }))
      prims.push(...icon(open ? "caret-up" : "caret-down", x + colW - 10, y + 12, 12, { stroke: "muted" }))
      if (open) {
        const lines = clamp(Math.floor((rowH - 40) / 15), 1, 3)
        prims.push(...loremLines(x, y + 34, colW - 30, lines, 15))
      }
      prims.push(line(x, y + rowH - 10, x + colW, y + rowH - 10, { stroke: "faint" }))
    }
    return prims
  },
}

// -- stats band -------------------------------------------------------------

// no commas in these — they double as the fallback for a comma-separated field
const STAT_VALUES = ["12k", "99.9%", "4.9", "1.2M", "0"]
const STAT_LABELS = ["boxes drawn", "uptime (honestly)", "average rating", "lines wobbled", "meetings needed"]
const STAT_VALUES_S = STAT_VALUES.join(", ")
const STAT_LABELS_S = STAT_LABELS.join(", ")

export const statsBandDef: ComponentDef = {
  kind: "stats-band",
  name: "Stats band",
  category: "blocks",
  group: "Marketing",
  keywords: ["metrics", "numbers", "kpi", "counters", "proof"],
  size: { w: 780, h: 160 },
  defaults: { count: 4, dividers: true, boxed: false, values: STAT_VALUES_S, labels: STAT_LABELS_S },
  controls: [
    { key: "count", label: "Stats", type: "number", min: 2, max: 5, quick: true },
    { key: "dividers", label: "Dividers", type: "toggle", quick: true },
    { key: "boxed", label: "Boxed", type: "toggle", quick: true },
    { key: "values", label: "Values (comma-sep)", type: "text" },
    { key: "labels", label: "Labels (comma-sep)", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "count", 4, 2, 5)
    const pad = clamp(w * 0.04, 10, 32)
    if (bool(p, "boxed")) prims.push(rect(0, 0, w, h, { stroke: "faint" }))
    const colW = (w - pad * 2) / n
    const cy = h / 2
    const vs = clamp(Math.min(colW * 0.24, h * 0.3), 18, 40)
    const vals = list(p, "values", STAT_VALUES_S)
    const labs = list(p, "labels", STAT_LABELS_S)
    for (let i = 0; i < n; i++) {
      const cx = pad + colW * i + colW / 2
      const v = vals[i % vals.length] ?? ""
      const l = labs[i % labs.length] ?? ""
      prims.push(text(cx, cy + vs * 0.2, truncate(v, vs, colW - 12), vs, { align: "center", bold: true }))
      prims.push(text(cx, cy + vs * 0.2 + 22, truncate(l, 12, colW - 16), 12, { align: "center", color: "muted" }))
      if (bool(p, "dividers") && i > 0) {
        prims.push(line(pad + colW * i, cy - h * 0.22, pad + colW * i, cy + h * 0.22, { stroke: "faint" }))
      }
    }
    return prims
  },
}

// -- newsletter -------------------------------------------------------------

export const newsletterDef: ComponentDef = {
  kind: "newsletter",
  name: "Newsletter signup",
  category: "blocks",
  group: "Marketing",
  keywords: ["email", "subscribe", "signup", "list", "inline form"],
  size: { w: 700, h: 210 },
  defaults: {
    align: "center",
    finePrint: true,
    headline: "One email a month. Maybe.",
    subline: "Drawing tips, product notes, zero growth hacks.",
    cta: "Subscribe",
  },
  controls: [
    { key: "align", label: "Align", type: "select", options: ["center", "left"], quick: true },
    { key: "finePrint", label: "Fine print", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
    { key: "subline", label: "Subhead", type: "text" },
    { key: "cta", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const centered = str(p, "align", "center") === "center"
    const pad = clamp(w * 0.06, 14, 50)
    const colW = Math.max(160, w - pad * 2)
    const fh = clamp(h * 0.2, 34, 44)
    const stack: Prim[] = []
    const head = fitHead(0, 0, colW, h - fh - (bool(p, "finePrint") ? 52 : 30), {
      heading: str(p, "headline", "One email a month. Maybe."),
      subline: str(p, "subline", "Drawing tips, product notes, zero growth hacks."),
      align: centered ? "center" : "left",
      size: clamp(w * 0.036, 16, 26),
      subLines: 1,
    })
    stack.push(...head.prims)
    let sy = head.bottom + 16
    const label = str(p, "cta", "Subscribe")
    const bw = Math.min(btnW(label), colW * 0.4)
    const formW = Math.min(colW, 440)
    const fx = centered ? (colW - formW) / 2 : 0
    stack.push(...sub(inputDef, { showLabel: false, placeholder: "you@wherever.com", icon: "mail" }, fx, sy, formW - bw - 10, fh))
    stack.push(...sub(buttonDef, { label, variant: "filled" }, fx + formW - bw, sy, bw, fh))
    sy += fh
    if (bool(p, "finePrint")) {
      const fine = "Unsubscribe whenever. No hard feelings."
      stack.push(
        text(centered ? colW / 2 : 0, sy + 18, truncate(fine, 11, colW), 11, {
          align: centered ? "center" : "left",
          color: "muted",
        })
      )
      sy += 24
    }
    prims.push(...place(stack, pad, Math.max(6, (h - sy) / 2)))
    return prims
  },
}

// -- banner -----------------------------------------------------------------

export const bannerDef: ComponentDef = {
  kind: "banner",
  name: "Banner",
  category: "blocks",
  group: "Marketing",
  keywords: ["strip", "notice", "cookie", "promo", "alert bar"],
  size: { w: 820, h: 60 },
  defaults: { variant: "info", dismiss: true, message: "Heads up: we reboot at noon. Bring snacks." },
  controls: [
    { key: "variant", label: "Variant", type: "select", options: ["info", "promo", "cookie"], quick: true },
    { key: "dismiss", label: "Dismiss", type: "toggle", quick: true },
    { key: "message", label: "Message", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const variant = str(p, "variant", "info")
    const cy = h / 2
    if (variant === "promo") {
      prims.push(rect(0, 0, w, h, { fill: "solid", fillColor: "faint", stroke: "faint" }))
    } else if (variant === "cookie") {
      prims.push(rect(0, 0, w, h, { fill: "solid", fillColor: "paper" }))
    }
    prims.push(rect(0, 0, w, h, {}))
    const pad = clamp(w * 0.025, 10, 24)
    const ic = variant === "promo" ? "megaphone" : variant === "cookie" ? "info" : "bell"
    prims.push(...icon(ic, pad + 10, cy, clamp(h * 0.34, 14, 20)))
    let right = w - pad
    const dismiss = bool(p, "dismiss")
    if (dismiss) {
      prims.push(...icon("x", right - 7, cy, 12, { stroke: "muted" }))
      right -= 26
    }
    const bh = clamp(h * 0.6, 26, 34)
    if (variant === "cookie") {
      const l1 = "Fine"
      const l2 = "Nope"
      const w1 = btnW(l1, 13)
      const w2 = btnW(l2, 13)
      if (right - w1 - w2 - 20 > pad + 40) {
        prims.push(...sub(buttonDef, { label: l1, variant: "filled", size: "sm" }, right - w1, cy - bh / 2, w1, bh))
        prims.push(...sub(buttonDef, { label: l2, variant: "outline", size: "sm" }, right - w1 - w2 - 10, cy - bh / 2, w2, bh))
        right -= w1 + w2 + 20
      }
    } else if (variant === "promo") {
      const l1 = "Grab it"
      const w1 = btnW(l1, 13)
      if (right - w1 > pad + 60) {
        prims.push(...sub(buttonDef, { label: l1, variant: "filled", size: "sm" }, right - w1, cy - bh / 2, w1, bh))
        right -= w1 + 12
      }
    } else {
      const link = "Read more"
      const lw = textWidth(link, 13) + 4
      if (right - lw > pad + 60) {
        prims.push(text(right - lw, cy + 5, link, 13, { bold: true }))
        prims.push(line(right - lw, cy + 9, right - 4, cy + 9, { stroke: "muted" }))
        right -= lw + 14
      }
    }
    const tx = pad + 26
    const tw = Math.max(20, right - tx)
    const msg = str(p, "message", "Heads up: we reboot at noon. Bring snacks.")
    prims.push(text(tx, cy + 5, truncate(msg, 14, tw), 14))
    return prims
  },
}

// -- announcement bar -------------------------------------------------------

export const announcementBarDef: ComponentDef = {
  kind: "announcement-bar",
  name: "Announcement bar",
  category: "blocks",
  group: "Marketing",
  keywords: ["topbar", "strip", "notice", "promo", "ticker"],
  size: { w: 860, h: 38 },
  defaults: { message: "New: templates that draw themselves", filled: true, dismiss: false },
  controls: [
    { key: "message", label: "Message", type: "text" },
    { key: "filled", label: "Filled", type: "toggle", quick: true },
    { key: "dismiss", label: "Dismiss", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    if (bool(p, "filled")) prims.push(rect(0, 0, w, h, { fill: "solid", fillColor: "faint", stroke: "faint" }))
    else prims.push(line(0, h - 1, w, h - 1, { stroke: "faint" }))
    const cy = h / 2
    const fs = clamp(h * 0.4, 11, 14)
    const msg = str(p, "message", "New: templates that draw themselves")
    const arrow = clamp(h * 0.34, 10, 13)
    const maxW = w - 80
    const label = truncate(msg, fs, maxW)
    const tw = textWidth(label, fs)
    const total = tw + 8 + arrow
    const x = (w - total) / 2
    prims.push(text(x, cy + fs * 0.35, label, fs))
    prims.push(...icon("arrow-right", x + tw + 8 + arrow / 2, cy, arrow))
    if (bool(p, "dismiss")) prims.push(...icon("x", w - 16, cy, 11, { stroke: "muted" }))
    return prims
  },
}

// -- footer -----------------------------------------------------------------

const FOOTER_COLS = [
  { title: "Product", items: ["Features", "Pricing", "Changelog", "Roadmap"] },
  { title: "Company", items: ["About", "Blog", "Careers", "Press"] },
  { title: "Help", items: ["Docs", "Support", "Status", "Contact"] },
  { title: "Legal", items: ["Terms", "Privacy", "Cookies", "Licenses"] },
]

const SOCIAL_ICONS = ["globe", "chat-circle", "envelope", "share-network"]

export const footerDef: ComponentDef = {
  kind: "footer",
  name: "Footer",
  category: "blocks",
  group: "Marketing",
  keywords: ["bottom", "sitemap", "links", "copyright", "social"],
  size: { w: 860, h: 280 },
  defaults: { variant: "columns", columns: 3, social: true, brand: "squig" },
  controls: [
    { key: "variant", label: "Variant", type: "select", options: ["simple", "columns"], quick: true },
    { key: "columns", label: "Link columns", type: "number", min: 2, max: 4, quick: true },
    { key: "social", label: "Social row", type: "toggle", quick: true },
    { key: "brand", label: "Brand", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const simple = str(p, "variant", "columns") === "simple"
    const pad = clamp(w * 0.05, 14, 44)
    const social = bool(p, "social")
    const brand = str(p, "brand", "squig")
    prims.push(line(0, 0, w, 0, { stroke: "faint" }))
    const botH = 44
    const baseY = h - botH

    if (simple) {
      const cy = Math.max(30, (h - botH) / 2)
      prims.push(...icon("logo", pad + 12, cy, 24))
      const mark = truncate(brand, 18, w * 0.3)
      prims.push(text(pad + 32, cy + 6, mark, 18, { bold: true }))
      const links = ["Features", "Pricing", "Docs", "Blog", "Contact"]
      let lx = Math.max(pad + 120, pad + 32 + textWidth(mark, 18) + 24)
      for (const l of links) {
        const lw = textWidth(l, 13)
        if (lx + lw > w - pad) break
        prims.push(text(lx, cy + 5, l, 13, { color: "muted" }))
        lx += lw + 20
      }
    } else {
      const top = clamp(h * 0.12, 18, 40)
      const brandW = clamp(w * 0.26, 120, 230)
      prims.push(...icon("logo", pad + 12, top + 12, 24))
      prims.push(text(pad + 32, top + 18, truncate(brand, 18, Math.max(20, brandW - 52)), 18, { bold: true }))
      prims.push(...loremLines(pad, top + 44, brandW - 20, 2, 15))
      const n = int(p, "columns", 3, 2, 4)
      const colsX = pad + brandW
      const avail = w - pad - colsX
      const colW = avail / n
      for (let c = 0; c < n; c++) {
        const x = colsX + c * colW
        prims.push(text(x, top + 12, truncate(FOOTER_COLS[c].title, 13, colW - 12), 13, { bold: true }))
        const rows = clamp(Math.floor((baseY - top - 30) / 22), 1, 4)
        for (let i = 0; i < rows; i++) {
          prims.push(text(x, top + 36 + i * 22, truncate(FOOTER_COLS[c].items[i], 13, colW - 12), 13, { color: "muted" }))
        }
      }
    }

    prims.push(line(pad, baseY, w - pad, baseY, { stroke: "faint" }))
    const cy2 = baseY + botH / 2
    prims.push(text(pad, cy2 + 4, truncate(`© 2026 ${brand} — drawn by hand, mostly`, 12, w * 0.5), 12, { color: "muted" }))
    if (social) {
      let sx = w - pad - 10
      for (let i = SOCIAL_ICONS.length - 1; i >= 0; i--) {
        prims.push(...icon(SOCIAL_ICONS[i], sx, cy2, 15, { stroke: "muted" }))
        sx -= 28
      }
    }
    return prims
  },
}

// -- team grid --------------------------------------------------------------

export const teamGridDef: ComponentDef = {
  kind: "team-grid",
  name: "Team grid",
  category: "blocks",
  group: "Marketing",
  keywords: ["people", "about", "staff", "members", "crew"],
  size: { w: 800, h: 320 },
  defaults: { count: 4, heading: true, cards: false, headline: "Small team, big erasers" },
  controls: [
    { key: "count", label: "People", type: "number", min: 2, max: 8, quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "cards", label: "Cards", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "count", 4, 2, 8)
    const pad = clamp(w * 0.04, 12, 34)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, top, w - pad * 2, {
        eyebrow: "the humans",
        heading: str(p, "headline", "Small team, big erasers"),
        align: "center",
        size: clamp(w * 0.032, 16, 24),
      })
      prims.push(...head.prims)
      top = head.bottom + 20
    }
    const bodyH = h - top - pad
    if (bodyH < 70) return prims
    const cols = Math.min(4, n)
    const rows = Math.ceil(n / cols)
    const gap = clamp(w * 0.025, 10, 24)
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols
    const chh = (bodyH - gap * (rows - 1)) / Math.max(1, rows)
    const cards = bool(p, "cards")
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const x = pad + c * (cw + gap)
      const y = top + r * (chh + gap)
      if (cards) prims.push(rect(x, y, cw, chh, { stroke: "faint" }))
      const av = clamp(Math.min(cw * 0.42, chh * 0.5), 30, 72)
      prims.push(...sub(avatarDef, { content: "icon" }, x + cw / 2 - av / 2, y + chh * 0.14, av, av))
      const ny = y + chh * 0.14 + av + 22
      prims.push(text(x + cw / 2, ny, truncate(PEOPLE[i % PEOPLE.length], 14, cw - 12), 14, { align: "center", bold: true }))
      if (ny + 18 < y + chh) {
        prims.push(text(x + cw / 2, ny + 18, truncate(ROLES[i % ROLES.length], 12, cw - 12), 12, { align: "center", color: "muted" }))
      }
    }
    return prims
  },
}

// -- awards -----------------------------------------------------------------

const AWARD_ICONS = ["trophy", "medal", "crown", "seal-check", "star"]
const AWARD_TITLES = ["Best of 2026", "Editors' pick", "Top rated", "Verified nice", "Reader favourite"]
const AWARD_SOURCES = ["some magazine", "a design blog", "an awards site", "a newsletter", "some podcast"]

export const awardsDef: ComponentDef = {
  kind: "awards",
  name: "Awards row",
  category: "blocks",
  group: "Marketing",
  keywords: ["badges", "recognition", "trophy", "press", "proof"],
  size: { w: 760, h: 190 },
  defaults: { count: 4, heading: true, circles: true, headline: "Somebody gave us these" },
  controls: [
    { key: "count", label: "Awards", type: "number", min: 2, max: 5, quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "circles", label: "Circles", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "count", 4, 2, 5)
    const pad = clamp(w * 0.04, 12, 32)
    let top = pad
    if (bool(p, "heading")) {
      const head = str(p, "headline", "Somebody gave us these").trim()
      if (head) {
        prims.push(text(w / 2, top + 14, truncate(head, 15, w - pad * 2), 15, { align: "center", bold: true }))
        top += 30
      }
    }
    const bodyH = h - top - pad
    if (bodyH < 50) return prims
    const colW = (w - pad * 2) / n
    for (let i = 0; i < n; i++) {
      const cx = pad + colW * i + colW / 2
      const d = clamp(Math.min(bodyH * 0.5, colW * 0.45), 28, 62)
      const cy = top + d / 2 + 4
      if (bool(p, "circles")) prims.push(ellipse(cx - d / 2, top + 4, d, d, { stroke: "faint" }))
      prims.push(...icon(AWARD_ICONS[i % AWARD_ICONS.length], cx, cy, d * 0.5))
      const ty = top + d + 26
      if (ty < top + bodyH + 10) {
        prims.push(text(cx, ty, truncate(AWARD_TITLES[i % AWARD_TITLES.length], 13, colW - 12), 13, { align: "center", bold: true }))
        prims.push(text(cx, ty + 17, truncate(AWARD_SOURCES[i % AWARD_SOURCES.length], 11, colW - 12), 11, { align: "center", color: "muted" }))
      }
    }
    return prims
  },
}

// -- gallery ----------------------------------------------------------------

export const galleryDef: ComponentDef = {
  kind: "gallery",
  name: "Gallery",
  category: "blocks",
  group: "Marketing",
  keywords: ["masonry", "images", "photos", "grid", "portfolio"],
  size: { w: 800, h: 420 },
  defaults: { count: 6, cols: 3, style: "plain" },
  controls: [
    { key: "count", label: "Tiles", type: "number", min: 3, max: 9, quick: true },
    { key: "cols", label: "Columns", type: "number", min: 2, max: 4, quick: true },
    { key: "style", label: "Tile style", type: "select", options: ["plain", "crossed"], quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "count", 6, 3, 9)
    // never leave an empty column
    const cols = Math.min(int(p, "cols", 3, 2, 4), n)
    const gap = 12
    const colW = (w - gap * (cols - 1)) / cols
    if (colW < 20 || h < 40) return prims
    const factors = [0.44, 0.3, 0.36, 0.26, 0.4, 0.32, 0.38, 0.28, 0.34]
    const style = str(p, "style", "plain")
    // how many tiles a column can stack before they stop reading as pictures
    const perCol = Math.max(1, Math.floor((h + gap) / (24 + gap)))
    for (let c = 0; c < cols; c++) {
      const weights: number[] = []
      for (let i = c; i < n && weights.length < perCol; i += cols) weights.push(factors[i % factors.length])
      const sumW = weights.reduce((a, v) => a + v, 0)
      if (sumW <= 0) continue
      // normalise the masonry weights so every column ends flush at h
      const avail = Math.max(0, h - gap * (weights.length - 1))
      let y = 0
      for (const wt of weights) {
        const hgt = (wt / sumW) * avail
        prims.push(...sub(imageDef, { style, caption: false }, c * (colW + gap), y, colW, hgt))
        y += hgt + gap
      }
    }
    return prims
  },
}

// ===========================================================================
// CONTENT
// ===========================================================================

// -- about ------------------------------------------------------------------

export const aboutBlockDef: ComponentDef = {
  kind: "about-block",
  name: "About block",
  category: "blocks",
  group: "Content",
  keywords: ["story", "company", "bio", "two column", "text"],
  size: { w: 800, h: 320 },
  defaults: { portrait: true, side: "right", heading: "We started with one bad rectangle" },
  controls: [
    { key: "portrait", label: "Portrait", type: "toggle", quick: true },
    { key: "side", label: "Portrait side", type: "select", options: ["left", "right"], quick: true },
    { key: "heading", label: "Heading", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const pad = clamp(w * 0.05, 14, 44)
    const vpad = clamp(h * 0.09, 12, 32)
    const portrait = bool(p, "portrait")
    const gap = clamp(w * 0.04, 14, 36)
    const imgW = portrait ? clamp(w * 0.26, 100, 240) : 0
    const textW = w - pad * 2 - (portrait ? imgW + gap : 0)
    const imgLeft = portrait && str(p, "side", "right") === "left"
    const textX = imgLeft ? pad + imgW + gap : pad
    let y = vpad
    const head = headBlock(textX, y, textW, {
      eyebrow: "about us",
      heading: str(p, "heading", "We started with one bad rectangle"),
      size: clamp(w * 0.036, 16, 27),
    })
    prims.push(...head.prims)
    y = head.bottom + 18
    const colGap = 24
    const colW = (textW - colGap) / 2
    const lines = clamp(Math.floor((h - y - vpad) / 17), 1, 8)
    if (lines > 0) {
      prims.push(...loremLines(textX, y + 6, colW, lines, 17))
      prims.push(...loremLines(textX + colW + colGap, y + 6, colW, Math.max(1, lines - 1), 17))
    }
    if (portrait) {
      const imgX = imgLeft ? pad : w - pad - imgW
      prims.push(...sub(imageDef, { style: "plain", caption: false }, imgX, vpad, imgW, h - vpad * 2))
    }
    return prims
  },
}

// -- blog list --------------------------------------------------------------

const POST_TITLES = [
  "Why your wireframe should look unfinished",
  "We deleted the colour picker",
  "Ten shapes, no ruler",
  "How to argue about layout politely",
]

export const blogListDef: ComponentDef = {
  kind: "blog-list",
  name: "Blog list",
  category: "blocks",
  group: "Content",
  keywords: ["posts", "articles", "news", "rows", "index"],
  size: { w: 760, h: 420 },
  defaults: { rows: 3, thumbnails: true, tags: true },
  controls: [
    { key: "rows", label: "Posts", type: "number", min: 1, max: 4, quick: true },
    { key: "thumbnails", label: "Thumbnails", type: "toggle", quick: true },
    { key: "tags", label: "Tags", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "rows", 3, 1, 4)
    const pad = clamp(w * 0.03, 8, 24)
    const rowH = (h - pad * 2) / n
    if (rowH < 54) return prims
    const withThumb = bool(p, "thumbnails")
    const withTags = bool(p, "tags")
    const tags = ["Craft", "Product", "Notes", "Rants"]
    for (let i = 0; i < n; i++) {
      const y = pad + i * rowH
      const inner = rowH - 18
      let x = pad
      if (withThumb) {
        const tw = clamp(inner * 1.5, 80, 170)
        prims.push(...sub(imageDef, { style: "plain", caption: false }, x, y, tw, inner))
        x += tw + 18
      }
      const cw = w - pad - x
      let ty = y + 4
      if (withTags) {
        prims.push(...pill(tags[i % tags.length], x, ty, 20))
        ty += 28
      }
      prims.push(text(x, ty + 14, truncate(POST_TITLES[i % POST_TITLES.length], 17, cw), 17, { bold: true }))
      ty += 22
      const footH = 20
      const lines = clamp(Math.floor((y + inner - ty - footH) / 16), 0, 3)
      if (lines > 0) {
        prims.push(...loremLines(x, ty + 12, cw, lines, 16))
        ty += 12 + lines * 16
      }
      const fy = y + inner - 10
      if (fy > ty - 6) {
        prims.push(...sub(avatarDef, { content: "icon" }, x, fy - 9, 18, 18))
        prims.push(text(x + 26, fy - 1, truncate(`${PEOPLE[i % PEOPLE.length]} · Mar ${3 + i} · 4 min`, 11, cw - 30), 11, { color: "muted" }))
      }
      if (i < n - 1) prims.push(line(pad, y + rowH - 9, w - pad, y + rowH - 9, { stroke: "faint" }))
    }
    return prims
  },
}

// -- blog post header -------------------------------------------------------

export const blogPostHeaderDef: ComponentDef = {
  kind: "blog-post-header",
  name: "Post header",
  category: "blocks",
  group: "Content",
  keywords: ["article", "title", "byline", "author", "cover"],
  size: { w: 720, h: 380 },
  defaults: {
    cover: true,
    tag: true,
    tagText: "Craft",
    title: "Why your wireframe should look unfinished",
    align: "left",
    author: "Ana Ruiz",
  },
  controls: [
    { key: "align", label: "Align", type: "select", options: ["left", "center"], quick: true },
    { key: "cover", label: "Cover image", type: "toggle", quick: true },
    { key: "tag", label: "Tag", type: "toggle", quick: true },
    { key: "title", label: "Title", type: "text" },
    { key: "tagText", label: "Tag text", type: "text" },
    { key: "author", label: "Author", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const centered = str(p, "align", "left") === "center"
    const pad = clamp(w * 0.06, 14, 48)
    const colW = Math.max(140, w - pad * 2)
    let y = clamp(h * 0.07, 10, 34)
    const tagLabel = str(p, "tagText", "Craft").trim()
    if (bool(p, "tag") && tagLabel) {
      if (centered) prims.push(...pillCentered(tagLabel, w / 2, y, 22))
      else prims.push(...pill(tagLabel, pad, y, 22))
      y += 32
    }
    const ts = clamp(w * 0.045, 18, 34)
    const head = headBlock(pad, y, colW, {
      heading: str(p, "title", "Why your wireframe should look unfinished"),
      align: centered ? "center" : "left",
      size: ts,
    })
    prims.push(...head.prims)
    y = head.bottom + 16
    const av = 36
    const meta = "Mar 3, 2026 · 6 min read"
    const author = str(p, "author", PEOPLE[0]).trim() || PEOPLE[0]
    const nameMaxW = Math.max(20, colW - av - 12)
    const rowW = av + 12 + Math.max(Math.min(textWidth(author, 14), nameMaxW), textWidth(meta, 12))
    const rx = centered ? Math.max(pad, w / 2 - rowW / 2) : pad
    const initials =
      author
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "AR"
    if (y + av <= h) {
      prims.push(...sub(avatarDef, { content: "initials", initials }, rx, y, av, av))
      prims.push(text(rx + av + 12, y + 15, truncate(author, 14, nameMaxW), 14, { bold: true }))
      prims.push(text(rx + av + 12, y + 31, meta, 12, { color: "muted" }))
      y += av + 20
    }
    if (bool(p, "cover")) {
      const ih = h - y - clamp(h * 0.05, 8, 24)
      if (ih > 50) prims.push(...sub(imageDef, { style: "plain", caption: false }, pad, y, colW, ih))
    }
    return prims
  },
}

// -- article body -----------------------------------------------------------

export const articleBodyDef: ComponentDef = {
  kind: "article-body",
  name: "Article body",
  category: "blocks",
  group: "Content",
  keywords: ["prose", "reading column", "text", "pull quote", "post"],
  size: { w: 640, h: 480 },
  defaults: {
    quote: true,
    bullets: true,
    heading: true,
    title: "The rectangle problem",
    quoteText: "A wireframe that looks finished gets treated like it is finished.",
  },
  controls: [
    { key: "heading", label: "Show heading", type: "toggle", quick: true },
    { key: "quote", label: "Pull quote", type: "toggle", quick: true },
    { key: "bullets", label: "Bullet list", type: "toggle", quick: true },
    { key: "title", label: "Heading", type: "text" },
    { key: "quoteText", label: "Quote", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const pad = clamp(w * 0.04, 10, 28)
    const colW = Math.max(120, w - pad * 2)
    const gap = 17
    let y = pad
    if (bool(p, "heading")) {
      prims.push(text(pad, y + 20, truncate(str(p, "title", "The rectangle problem"), 22, colW), 22, { bold: true }))
      y += 34
    }
    const wantsQuote = bool(p, "quote")
    const wantsBullets = bool(p, "bullets")
    const quoteH = wantsQuote ? 74 : 0
    const bulletsH = wantsBullets ? 3 * 22 + 12 : 0
    const proseRoom = h - y - pad - quoteH - bulletsH
    const topLines = clamp(Math.floor(proseRoom / gap / 2), 1, 6)
    prims.push(...loremLines(pad, y + 8, colW, topLines, gap))
    y += 8 + topLines * gap + 10
    if (wantsQuote && y + quoteH < h) {
      prims.push(line(pad, y, pad, y + quoteH - 16, { strokeWidth: 2.6 }))
      prims.push(...icon("quotes", pad + 22, y + 12, 15, { stroke: "muted" }))
      const qs = clamp(w * 0.03, 14, 19)
      const qw = colW - 44
      const q = wrap(str(p, "quoteText", "A wireframe that looks finished gets treated like it is finished."), qs, qw, 2)
      q.forEach((ln, i) => prims.push(text(pad + 42, y + 6 + qs + i * qs * 1.35, ln, qs, { bold: true })))
      y += quoteH
    }
    if (wantsBullets && y + 40 < h) {
      const rows = clamp(Math.floor((h - y - pad) / 22), 1, 3)
      for (let i = 0; i < rows; i++) {
        const by = y + 10 + i * 22
        prims.push(ellipse(pad + 2, by - 3, 6, 6, { fill: "solid", fillColor: "ink" }))
        prims.push(line(pad + 18, by, pad + 18 + (colW - 18) * (0.88 - (i % 3) * 0.14), by, { stroke: "muted", strokeWidth: 1.3 }))
      }
      y += 10 + rows * 22
    }
    const rest = clamp(Math.floor((h - y - pad) / gap), 0, 5)
    if (rest > 0) prims.push(...loremLines(pad, y + 10, colW, rest, gap))
    return prims
  },
}

// -- changelog --------------------------------------------------------------

const CHANGE_TITLES = ["Erasers, finally", "Faster wobbles", "Templates everywhere", "The sticky note update"]

export const changelogDef: ComponentDef = {
  kind: "changelog",
  name: "Changelog",
  category: "blocks",
  group: "Content",
  keywords: ["releases", "updates", "versions", "history", "notes"],
  size: { w: 720, h: 400 },
  defaults: { entries: 3, heading: true, headline: "Changelog" },
  controls: [
    { key: "entries", label: "Entries", type: "number", min: 1, max: 4, quick: true },
    { key: "heading", label: "Show headline", type: "toggle", quick: true },
    { key: "headline", label: "Headline", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = int(p, "entries", 3, 1, 4)
    const pad = clamp(w * 0.04, 12, 30)
    let top = pad
    if (bool(p, "heading")) {
      const head = headBlock(pad, top, w - pad * 2, {
        eyebrow: "what changed",
        heading: str(p, "headline", "Changelog"),
        size: clamp(w * 0.032, 16, 24),
      })
      prims.push(...head.prims)
      top = head.bottom + 16
    }
    const bodyH = h - top - pad
    const rowH = bodyH / n
    if (rowH < 56) return prims
    const metaW = clamp(w * 0.18, 74, 130)
    const cw = w - pad * 2 - metaW - 18
    for (let i = 0; i < n; i++) {
      const y = top + i * rowH
      prims.push(...pill(`v2.${n - i}`, pad, y + 2, 22, "filled"))
      prims.push(text(pad, y + 44, `Mar ${18 - i * 5}, 2026`, 11, { color: "muted" }))
      const x = pad + metaW + 18
      prims.push(text(x, y + 18, truncate(CHANGE_TITLES[i % CHANGE_TITLES.length], 16, cw), 16, { bold: true }))
      const rows = clamp(Math.floor((rowH - 44) / 20), 1, 3)
      for (let r = 0; r < rows; r++) {
        const by = y + 40 + r * 20
        prims.push(ellipse(x + 1, by - 3, 5, 5, { fill: "solid", fillColor: "muted", stroke: "muted" }))
        prims.push(line(x + 14, by, x + 14 + (cw - 14) * (0.85 - (r % 3) * 0.15), by, { stroke: "muted", strokeWidth: 1.3 }))
      }
      if (i < n - 1) prims.push(line(pad, y + rowH - 10, w - pad, y + rowH - 10, { stroke: "faint" }))
    }
    return prims
  },
}

// -- contact form -----------------------------------------------------------

const CONTACT_ROWS: [string, string][] = [
  ["envelope", "hi@squig.sh"],
  ["phone", "+1 (555) 010-0101"],
  ["map-pin", "Somewhere with good light"],
]

export const contactFormBlockDef: ComponentDef = {
  kind: "contact-form-block",
  name: "Contact form",
  category: "blocks",
  group: "Content",
  keywords: ["contact", "message", "support", "email us", "form"],
  size: { w: 780, h: 420 },
  defaults: { split: true, heading: "Say hello", details: true, cta: "Send it" },
  controls: [
    { key: "split", label: "Split layout", type: "toggle", quick: true },
    { key: "details", label: "Contact details", type: "toggle", quick: true },
    { key: "heading", label: "Heading", type: "text" },
    { key: "cta", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    // tolerant read: the control used to be a yes/no select, so old docs hold strings
    const split = p.split !== false && p.split !== "no"
    const pad = clamp(w * 0.05, 14, 40)
    const vpad = clamp(h * 0.07, 12, 30)
    const gap = clamp(w * 0.05, 16, 44)
    const heading = str(p, "heading", "Say hello")

    let formX = pad
    let formW = w - pad * 2
    let detailsH = 0
    if (split) {
      const leftW = clamp(w * 0.36, 140, 300)
      formX = pad + leftW + gap
      formW = w - pad - formX
      const head = headBlock(pad, vpad, leftW, {
        eyebrow: "we do read these",
        heading,
        subline: "Bugs, ideas, compliments — all welcome.",
        size: clamp(w * 0.036, 16, 26),
      })
      prims.push(...head.prims)
      let dy = head.bottom + 22
      if (bool(p, "details")) {
        for (const [ic, label] of CONTACT_ROWS) {
          if (dy + 18 > h - vpad) break
          prims.push(...icon(ic, pad + 9, dy + 6, 15, { stroke: "muted" }))
          prims.push(text(pad + 28, dy + 11, truncate(label, 13, leftW - 32), 13))
          dy += 28
        }
      }
    } else {
      const head = headBlock(pad, vpad, formW, {
        heading,
        subline: "Bugs, ideas, compliments — all welcome.",
        align: "center",
        size: clamp(w * 0.036, 16, 26),
        subLines: 1,
      })
      prims.push(...head.prims)
      // same three details, laid out as one centred strip — only when there is
      // room for three pairs side by side AND the textarea survives the shift
      if (bool(p, "details") && formW >= 420 && h - vpad * 2 - 212 >= 60) {
        const cellW = formW / CONTACT_ROWS.length
        CONTACT_ROWS.forEach(([ic, label], i) => {
          const maxLabel = cellW - 40
          const lw = Math.min(textWidth(label, 13), maxLabel)
          const sx = pad + cellW * i + cellW / 2 - (lw + 22) / 2
          prims.push(...icon(ic, sx + 8, vpad + 90, 15, { stroke: "muted" }))
          prims.push(text(sx + 22, vpad + 95, truncate(label, 13, maxLabel), 13))
        })
        detailsH = 28
      }
    }

    let y = split ? vpad : vpad + 82 + detailsH
    const fieldH = 38
    const half = (formW - 14) / 2
    if (formW < 200) {
      if (y + fieldH < h) {
        prims.push(...sub(inputDef, { showLabel: false, placeholder: "Name", icon: "none" }, formX, y, formW, fieldH))
        y += fieldH + 12
      }
      if (y + fieldH < h) {
        prims.push(...sub(inputDef, { showLabel: false, placeholder: "Email", icon: "mail" }, formX, y, formW, fieldH))
        y += fieldH + 12
      }
    } else if (y + fieldH < h) {
      prims.push(...sub(inputDef, { showLabel: false, placeholder: "Your name", icon: "none" }, formX, y, half, fieldH))
      prims.push(...sub(inputDef, { showLabel: false, placeholder: "you@wherever.com", icon: "mail" }, formX + half + 14, y, half, fieldH))
      y += fieldH + 12
    }
    const btnH = 40
    const areaH = h - y - vpad - btnH - 12
    if (areaH > 40) {
      prims.push(...sub(textareaDef, { showLabel: false, placeholder: "What's on your mind?" }, formX, y, formW, areaH))
      y += areaH + 12
    }
    if (y + btnH <= h - vpad + 6) {
      const label = str(p, "cta", "Send it")
      const bw = Math.min(btnW(label), formW)
      prims.push(...sub(buttonDef, { label, variant: "filled" }, formX + formW - bw, y, bw, btnH))
    }
    return prims
  },
}

// -- breadcrumb header ------------------------------------------------------

export const breadcrumbHeaderDef: ComponentDef = {
  kind: "breadcrumb-header",
  name: "Page header",
  category: "blocks",
  group: "Content",
  keywords: ["breadcrumb", "title", "actions", "toolbar", "page head"],
  size: { w: 760, h: 120 },
  defaults: {
    title: "Sketchbook",
    actions: 2,
    trail: "Home, Library, Sketchbook",
    divider: true,
    cta: "New sketch",
    cta2: "Share",
  },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "trail", label: "Breadcrumb (comma-sep)", type: "text" },
    { key: "actions", label: "Actions", type: "number", min: 0, max: 2, quick: true },
    { key: "divider", label: "Divider", type: "toggle", quick: true },
    { key: "cta", label: "Button label", type: "text" },
    { key: "cta2", label: "Second button label", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const pad = clamp(w * 0.03, 8, 26)
    const nAct = int(p, "actions", 2, 0, 2)
    let y = clamp(h * 0.14, 8, 24)
    prims.push(...sub(breadcrumbDef, { items: str(p, "trail", "Home, Library, Sketchbook") }, pad, y - 10, w - pad * 2, 20))
    y += 18
    const bh = clamp(h * 0.3, 30, 38)
    let right = w - pad
    if (nAct > 0) {
      const l1 = str(p, "cta", "New sketch")
      const l2 = str(p, "cta2", "Share")
      // keep at least ~40% of the strip for the title, shrinking both buttons to fit
      const budget = Math.max(80, (w - pad * 2) * 0.6)
      const raw1 = btnW(l1, 14)
      const raw2 = nAct > 1 ? btnW(l2, 14) : 0
      const need = raw1 + (nAct > 1 ? raw2 + 10 : 0)
      const k = need > budget ? budget / need : 1
      const w1 = raw1 * k
      const w2 = raw2 * k
      prims.push(...sub(buttonDef, { label: l1, variant: "filled", size: "sm" }, right - w1, y, w1, bh))
      right -= w1 + 10
      if (nAct > 1) {
        prims.push(...sub(buttonDef, { label: l2, variant: "outline", size: "sm" }, right - w2, y, w2, bh))
        right -= w2 + 10
      }
    }
    const ts = clamp(h * 0.24, 17, 26)
    prims.push(text(pad, y + ts * 0.9, truncate(str(p, "title", "Sketchbook"), ts, Math.max(40, right - pad - 10)), ts, { bold: true }))
    if (bool(p, "divider")) prims.push(line(pad, h - 6, w - pad, h - 6, { stroke: "faint" }))
    return prims
  },
}

// -- section header ---------------------------------------------------------

export const sectionHeaderDef: ComponentDef = {
  kind: "section-header",
  name: "Section header",
  category: "blocks",
  group: "Content",
  keywords: ["eyebrow", "heading", "subhead", "title", "intro"],
  size: { w: 640, h: 130 },
  defaults: {
    align: "center",
    eyebrow: true,
    eyebrowText: "how it works",
    heading: "Small parts, fewer meetings",
    subline: "The bit of copy nobody reads but everybody argues about.",
  },
  controls: [
    { key: "align", label: "Align", type: "select", options: ["center", "left"], quick: true },
    { key: "eyebrow", label: "Eyebrow", type: "toggle", quick: true },
    { key: "heading", label: "Heading", type: "text" },
    { key: "subline", label: "Subhead", type: "text" },
    { key: "eyebrowText", label: "Eyebrow text", type: "text" },
  ],
  render(p, w, h) {
    const align = str(p, "align", "center") === "left" ? "left" : "center"
    const pad = clamp(w * 0.05, 10, 44)
    const colW = Math.max(120, w - pad * 2)
    const head = fitHead(0, 0, colW, h - 10, {
      eyebrow: bool(p, "eyebrow") ? str(p, "eyebrowText", "how it works") : undefined,
      heading: str(p, "heading", "Small parts, fewer meetings"),
      subline: str(p, "subline", "The bit of copy nobody reads but everybody argues about."),
      align,
      size: clamp(w * 0.042, 16, 28),
    })
    return place(head.prims, pad, Math.max(4, (h - head.bottom) / 2))
  },
}

export const MARKETING_DEFS: ComponentDef[] = [
  heroDef,
  heroMinimalDef,
  ctaBlockDef,
  featureGridDef,
  featureSplitDef,
  featureListDef,
  testimonialBlockDef,
  logoCloudDef,
  pricingBlockDef,
  faqDef,
  statsBandDef,
  newsletterDef,
  bannerDef,
  announcementBarDef,
  footerDef,
  teamGridDef,
  awardsDef,
  galleryDef,
  aboutBlockDef,
  blogListDef,
  blogPostHeaderDef,
  articleBodyDef,
  changelogDef,
  contactFormBlockDef,
  breadcrumbHeaderDef,
  sectionHeaderDef,
]
