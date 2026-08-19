// ---------------------------------------------------------------------------
// Template blocks — whole screens composed from the component defs.
// Each is still one component with variants until you break it apart.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, ellipse, line, text, icon, place, loremLines, truncate } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"
import { buttonDef, inputDef, checkboxDef, switchDef, avatarDef } from "./defs-basic"
import { chartDef, tableDef, dividerDef } from "./defs-display"
import { navbarDef, sidebarDef } from "./defs-nav"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
// the fallback matters for keys added after a document was saved: a node drawn
// from props that predate the key must land on the old hardcoded behaviour
const bool = (p: Props, k: string, fallback = false): boolean => (p[k] === undefined ? fallback : Boolean(p[k]))
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)
// comma-separated list: blanks dropped, and an emptied field falls back to the
// default list so clearing the box restores the block instead of blanking it
const list = (p: Props, k: string, fallback: string): string[] => {
  const out = str(p, k, fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return out.length ? out : fallback.split(",").map((s) => s.trim())
}
/** safe indexed pick from a cycling pool — a short list repeats instead of drawing blanks */
const pick = (pool: string[], i: number): string => pool[((i % pool.length) + pool.length) % pool.length]

function sub(def: ComponentDef, props: Props, x: number, y: number, w: number, h: number): Prim[] {
  return place(def.render({ ...def.defaults, ...props }, w, h), x, y)
}

// The height each screen is drawn for. A template laid out against a fraction
// of this reproduces its shipped layout exactly at the default size, so screens
// already sitting in saved documents don't move.
const LOGIN_H = 460
const SIGNUP_H = 480
const SETTINGS_H = 460
const EMPTY_H = 300

// -- login ------------------------------------------------------------------

export const loginDef: ComponentDef = {
  kind: "login",
  name: "Login screen",
  category: "blocks",
  group: "Screens",
  keywords: ["signin", "auth", "form", "welcome"],
  size: { w: 360, h: LOGIN_H },
  defaults: { title: "Welcome back", logo: true, social: true, signup: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "logo", label: "Logo", type: "toggle" },
    { key: "social", label: "Social buttons", type: "toggle", quick: true },
    { key: "signup", label: "Sign-up link", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 32
    const cw = w - pad * 2
    // Drag the screen shorter and the gaps close first (`g`), then the fields
    // and the button share out whatever height is left (`fit`), and only then
    // do the trailing rows drop. At the size it ships at both are 1, so the
    // whole stack lands on the numbers it always did.
    const k = Math.min(1, h / LOGIN_H)
    const g = (n: number) => n * k
    let y = g(36)
    // the mark is drawn from its centre, so it needs its own radius of headroom
    const showLogo = bool(p, "logo", true) && y >= 18
    const chrome = y + (showLogo ? g(32) : 0) + g(34) + g(12) + g(14) + g(12) + g(18)
    const fit = Math.min(1, Math.max(0, h - chrome) / 162)
    const fieldH = 60 * fit
    const btnH = 42 * fit
    if (showLogo) {
      prims.push(...icon("logo", w / 2, y, 34))
      y += g(32)
    }
    prims.push(text(w / 2, y + 10, truncate(str(p, "title", "Welcome back"), 22, cw), 22, { align: "center", bold: true }))
    y += g(34)
    prims.push(...sub(inputDef, { label: "Email", icon: "mail", placeholder: "you@wherever.com" }, pad, y, cw, fieldH))
    y += fieldH + g(12)
    prims.push(...sub(inputDef, { label: "Password", icon: "lock", placeholder: "••••••••" }, pad, y, cw, fieldH))
    y += fieldH + g(14)
    prims.push(...sub(buttonDef, { label: "Log in", variant: "filled" }, pad, y, cw, btnH))
    y += btnH + g(12)
    if (y + g(18) <= h) {
      prims.push(text(w / 2, y, "forgot password?", 13, { align: "center", color: "muted" }))
      y += g(18)
    }
    if (bool(p, "social") && y + 20 + g(10) + 38 + g(12) <= h) {
      prims.push(...sub(dividerDef, { showLabel: true, label: "or" }, pad, y, cw, 20))
      y += 20 + g(10)
      const half = (cw - 12) / 2
      prims.push(...sub(buttonDef, { label: "Google", variant: "outline" }, pad, y, half, 38))
      prims.push(...sub(buttonDef, { label: "GitHub", variant: "outline" }, pad + half + 12, y, half, 38))
      y += 38 + g(12)
    }
    if (bool(p, "signup")) {
      const sy = Math.max(y + 6, h - 20)
      if (sy <= h - 6) prims.push(text(w / 2, sy, "no account? sign up", 13, { align: "center", color: "muted" }))
    }
    return prims
  },
}

// -- signup -----------------------------------------------------------------

export const signupDef: ComponentDef = {
  kind: "signup",
  name: "Sign-up screen",
  category: "blocks",
  group: "Screens",
  keywords: ["register", "auth", "create account"],
  size: { w: 360, h: SIGNUP_H },
  defaults: { title: "Join the club", terms: true, social: false },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "terms", label: "Terms checkbox", type: "toggle", quick: true },
    { key: "social", label: "Social buttons", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 32
    const cw = w - pad * 2
    // same two dials as the login screen: gaps close, then the three fields and
    // the button give up height together, both landing on 1 at the shipped size
    const k = Math.min(1, h / SIGNUP_H)
    const g = (n: number) => n * k
    const terms = bool(p, "terms")
    let y = g(30)
    const chrome = y + g(30) + g(24) + g(10) + g(10) + g(12) + (terms ? 22 + g(12) : 0) + g(12)
    const fit = Math.min(1, Math.max(0, h - chrome) / 222)
    const fieldH = 60 * fit
    const btnH = 42 * fit
    prims.push(text(w / 2, y + 12, truncate(str(p, "title", "Join the club"), 22, cw), 22, { align: "center", bold: true }))
    y += g(30)
    prims.push(line(w / 2 - cw * 0.3, y + 8, w / 2 + cw * 0.3, y + 8, { stroke: "muted", strokeWidth: 1.2 }))
    y += g(24)
    prims.push(...sub(inputDef, { label: "Name", icon: "none", placeholder: "Maria Scribbles" }, pad, y, cw, fieldH))
    y += fieldH + g(10)
    prims.push(...sub(inputDef, { label: "Email", icon: "mail", placeholder: "you@wherever.com" }, pad, y, cw, fieldH))
    y += fieldH + g(10)
    prims.push(...sub(inputDef, { label: "Password", icon: "lock", placeholder: "make it weird" }, pad, y, cw, fieldH))
    y += fieldH + g(12)
    if (terms) {
      prims.push(...sub(checkboxDef, { label: "I agree to the scribbly terms", checked: false }, pad, y, cw, 22))
      y += 22 + g(12)
    }
    prims.push(...sub(buttonDef, { label: "Create account", variant: "filled" }, pad, y, cw, btnH))
    y += btnH + g(12)
    if (bool(p, "social") && y + 20 + g(10) + 38 <= h) {
      prims.push(...sub(dividerDef, { showLabel: true, label: "or" }, pad, y, cw, 20))
      y += 20 + g(10)
      const half = (cw - 12) / 2
      prims.push(...sub(buttonDef, { label: "Google", variant: "outline" }, pad, y, half, 38))
      prims.push(...sub(buttonDef, { label: "GitHub", variant: "outline" }, pad + half + 12, y, half, 38))
    }
    return prims
  },
}

// -- settings ---------------------------------------------------------------

export const settingsDef: ComponentDef = {
  kind: "settings",
  name: "Settings page",
  category: "blocks",
  group: "Screens",
  keywords: ["preferences", "account", "profile", "form"],
  size: { w: 640, h: SETTINGS_H },
  defaults: { title: "Settings", nav: true, active: 1, danger: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "nav", label: "Side nav", type: "toggle", quick: true },
    { key: "active", label: "Active section", type: "number", min: 1, max: 5, quick: true },
    { key: "danger", label: "Danger zone", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    let left = 0
    if (bool(p, "nav")) {
      left = Math.min(170, w * 0.28)
      prims.push(line(left, 0, left, h, { stroke: "faint" }))
      const items = ["Profile", "Account", "Billing", "Alerts", "Team"]
      const active = Math.max(1, Math.min(items.length, Math.round(num(p, "active", 1)))) - 1
      items.forEach((item, i) => {
        const y = 30 + i * 36
        if (y > h - 20) return
        if (i === active) prims.push(rect(10, y - 18, left - 20, 30, { fill: "shade", fillColor: "faint", stroke: "faint" }))
        prims.push(text(22, y + 2, item, 14, { color: i === active ? "ink" : "muted", bold: i === active }))
      })
    }
    const pad = 28
    const cx = left + pad
    const cw = w - left - pad * 2
    // Gaps close first. After that the photo row is what gives — two legible
    // fields are worth more on a settings page than a portrait — and only then
    // do the fields themselves shrink. The Save button is pinned to the bottom,
    // so its band never belongs to the stack. All of it lands on the shipped
    // numbers at the shipped height.
    const k = Math.min(1, h / SETTINGS_H)
    const g = (n: number) => n * k
    const gaps = g(34) + g(24) + g(12) + g(16) + (26 + g(10)) + (26 + g(14)) + 46
    const spare = h - gaps - g(18)
    const showPhoto = spare >= 44 * 2 + 40
    const avatarH = showPhoto ? 56 * Math.min(1, (spare - 44 * 2) / 56) : 0
    const stack = h - gaps - (showPhoto ? avatarH + g(18) : 0)
    const fieldH = Math.max(0, Math.min(58, stack / 2))
    let y = g(34)
    prims.push(text(cx, y, truncate(str(p, "title", "Settings"), 22, cw), 22, { bold: true }))
    y += g(24)
    if (showPhoto) {
      prims.push(...place(avatarDef.render({ ...avatarDef.defaults, content: "icon" }, avatarH, avatarH), cx, y))
      const photoH = Math.min(32, avatarH)
      const photoW = Math.min(120, cw - avatarH - 16)
      if (photoW >= 60) {
        prims.push(
          ...sub(
            buttonDef,
            { label: "Change photo", variant: "outline", size: "sm" },
            cx + avatarH + 16,
            y + (avatarH - photoH) / 2,
            photoW,
            photoH
          )
        )
      }
      y += avatarH + g(18)
    }
    prims.push(...sub(inputDef, { label: "Display name", placeholder: "Pablo S." }, cx, y, cw, fieldH))
    y += fieldH + g(12)
    prims.push(...sub(inputDef, { label: "Email", icon: "mail", placeholder: "pablo@squig.sh" }, cx, y, cw, fieldH))
    y += fieldH + g(16)
    prims.push(...sub(switchDef, { label: "Email me way too often", on: true }, cx, y, cw, 26))
    y += 26 + g(10)
    prims.push(...sub(switchDef, { label: "Dark mode (for night scribbles)", on: false }, cx, y, cw, 26))
    y += 26 + g(14)
    if (bool(p, "danger") && y < h - 50) {
      prims.push(line(cx, y, cx + cw, y, { stroke: "faint" }))
      y += 24
      prims.push(...icon("warning", cx + 10, y + 6, 18))
      prims.push(
        ...sub(
          buttonDef,
          { label: "Delete everything", variant: "outline", size: "sm" },
          cx + 30,
          y - 8,
          Math.min(150, cw - 30),
          32
        )
      )
    }
    prims.push(...sub(buttonDef, { label: "Save", variant: "filled", size: "sm" }, w - 110, h - 46, 82, 32))
    return prims
  },
}

// -- dashboard --------------------------------------------------------------

export const dashboardDef: ComponentDef = {
  kind: "dashboard",
  name: "Dashboard",
  category: "blocks",
  group: "Screens",
  keywords: ["admin", "analytics", "stats", "app"],
  size: { w: 760, h: 520 },
  defaults: { title: "Good morning, doodler", sidebar: true, stats: 3, chart: "line", table: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "sidebar", label: "Sidebar", type: "toggle", quick: true },
    { key: "stats", label: "Stat cards", type: "number", min: 2, max: 4, quick: true },
    { key: "chart", label: "Chart style", type: "select", options: ["line", "bars", "pie"], quick: true },
    { key: "table", label: "Side table", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const navH = 52
    prims.push(...sub(navbarDef, { links: "", search: true, avatar: true, cta: false }, 0, 0, w, navH))
    let left = 0
    if (bool(p, "sidebar")) {
      left = Math.min(170, w * 0.24)
      prims.push(...sub(sidebarDef, { user: false, items: "Overview, Reports, Users, Settings" }, 0, navH, left, h - navH))
    }
    const pad = 20
    const cx = left + pad
    const cw = w - left - pad * 2
    let y = navH + pad
    prims.push(text(cx, y + 8, truncate(str(p, "title", "Good morning, doodler"), 20, cw), 20, { bold: true }))
    y += 26
    // stat cards
    const n = Math.max(2, Math.min(4, Math.round(num(p, "stats", 3))))
    const gap = 14
    const cardW = (cw - gap * (n - 1)) / n
    for (let i = 0; i < n; i++) {
      const sx = cx + i * (cardW + gap)
      prims.push(rect(sx, y, cardW, 78))
      prims.push(line(sx + 14, y + 22, sx + 14 + cardW * 0.45, y + 22, { stroke: "muted", strokeWidth: 1.2 }))
      prims.push(text(sx + 14, y + 52, ["1,234", "56%", "$789", "42"][i % 4], 22, { bold: true }))
      prims.push(...icon("chart", sx + cardW - 22, y + 20, 14, { stroke: "faint" }))
    }
    y += 92
    // chart + table row
    const chartH = h - y - pad
    if (chartH > 80) {
      const hasTable = bool(p, "table", true)
      const chartW = hasTable ? cw * 0.58 : cw
      prims.push(rect(cx, y, chartW, chartH))
      prims.push(...place(chartDef.render({ ...chartDef.defaults, style: str(p, "chart", "line"), title: true }, chartW - 28, chartH - 28), cx + 14, y + 14))
      if (hasTable) {
        const tw = cw - chartW - 14
        prims.push(...place(tableDef.render({ ...tableDef.defaults, cols: 2, rows: Math.max(2, Math.floor(chartH / 44)), header: true }, tw, chartH), cx + chartW + 14, y))
      }
    }
    return prims
  },
}

// -- pricing ----------------------------------------------------------------

export const pricingDef: ComponentDef = {
  kind: "pricing",
  name: "Pricing table",
  category: "blocks",
  group: "Screens",
  keywords: ["plans", "tiers", "billing", "money"],
  size: { w: 680, h: 400 },
  defaults: {
    plans: 3,
    highlight: 2,
    names: "Doodle, Sketch, Masterpiece, Gallery",
    prices: "$0, $12, $49, $199",
  },
  controls: [
    { key: "plans", label: "Plans", type: "number", min: 2, max: 4, quick: true },
    { key: "highlight", label: "Highlighted", type: "number", min: 0, max: 4, quick: true },
    { key: "names", label: "Plan names (comma-sep)", type: "text" },
    { key: "prices", label: "Prices (comma-sep)", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = Math.max(2, Math.min(4, num(p, "plans", 3)))
    const hi = num(p, "highlight", 2)
    const gap = 18
    const cardW = (w - gap * (n - 1)) / n
    const names = list(p, "names", "Doodle, Sketch, Masterpiece, Gallery")
    const prices = list(p, "prices", "$0, $12, $49, $199")
    for (let i = 0; i < n; i++) {
      const x = i * (cardW + gap)
      const isHi = i + 1 === hi
      const y0 = isHi ? 0 : 14
      const ch = h - y0 - (isHi ? 0 : 14)
      prims.push(rect(x, y0, cardW, ch, isHi ? { strokeWidth: 2.2 } : {}))
      if (isHi) {
        prims.push(rect(x, y0, cardW, 26, { fill: "shade", fillColor: "ink" }))
        prims.push(text(x + cardW / 2, y0 + 18, "most popular", 12, { align: "center" }))
      }
      let y = y0 + (isHi ? 50 : 34)
      prims.push(text(x + cardW / 2, y, truncate(pick(names, i), 17, cardW - 24), 17, { align: "center", bold: true }))
      y += 34
      prims.push(text(x + cardW / 2, y, truncate(pick(prices, i), 26, cardW - 24), 26, { align: "center", bold: true }))
      prims.push(text(x + cardW / 2, y + 16, "/month-ish", 11, { align: "center", color: "muted" }))
      y += 36
      const feats = Math.min(4, Math.floor((h - y - 70) / 26))
      for (let f = 0; f < feats; f++) {
        prims.push(...icon("check", x + 22, y + f * 26, 12))
        prims.push(line(x + 36, y + f * 26 + 2, x + cardW - 20 - (f % 3) * 12, y + f * 26 + 2, { stroke: "muted", strokeWidth: 1.2 }))
      }
      prims.push(...sub(buttonDef, { label: isHi ? "Take my money" : "Choose", variant: isHi ? "filled" : "outline", size: "sm" }, x + 16, h - (isHi ? 48 : 60), cardW - 32, 34))
    }
    return prims
  },
}

// -- feed -------------------------------------------------------------------

export const feedDef: ComponentDef = {
  kind: "feed",
  name: "Feed",
  category: "blocks",
  group: "Screens",
  keywords: ["social", "timeline", "posts", "stream"],
  size: { w: 380, h: 540 },
  defaults: { posts: 2, images: true },
  controls: [
    { key: "posts", label: "Posts", type: "number", min: 1, max: 4, quick: true },
    { key: "images", label: "Images", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const n = Math.max(1, Math.min(4, num(p, "posts", 2)))
    const withImg = bool(p, "images")
    const postH = Math.min((h - (n - 1) * 16) / n, withImg ? 260 : 150)
    for (let i = 0; i < n; i++) {
      const y0 = i * (postH + 16)
      if (y0 + postH > h + 4) break
      prims.push(rect(0, y0, w, postH))
      // author row
      prims.push(ellipse(14, y0 + 12, 36, 36), ...icon("user", 32, y0 + 30, 18))
      prims.push(line(60, y0 + 24, 60 + w * 0.3, y0 + 24, { strokeWidth: 1.6 }))
      prims.push(line(60, y0 + 38, 60 + w * 0.18, y0 + 38, { stroke: "muted", strokeWidth: 1.1 }))
      prims.push(...icon("dots", w - 26, y0 + 24, 14, { stroke: "muted" }))
      let y = y0 + 62
      prims.push(...loremLines(14, y, w - 28, 2, 13))
      y += 30
      if (withImg && postH > 180) {
        const imgH = postH - (y - y0) - 42
        prims.push(rect(14, y, w - 28, imgH, { fill: "shade", fillColor: "faint" }))
        prims.push(...icon("image", w / 2, y + imgH / 2, Math.min(36, imgH * 0.5), { stroke: "muted" }))
        y += imgH + 10
      }
      const ay = y0 + postH - 22
      prims.push(...icon("heart", 26, ay, 15, { stroke: "muted" }))
      prims.push(...icon("mail", 66, ay, 15, { stroke: "muted" }))
      prims.push(...icon("arrow-right", 106, ay, 15, { stroke: "muted" }))
    }
    return prims
  },
}

// -- empty state ------------------------------------------------------------

export const emptyStateDef: ComponentDef = {
  kind: "empty-state",
  name: "Empty state",
  category: "blocks",
  group: "Screens",
  keywords: ["blank", "zero", "nothing", "onboarding"],
  size: { w: 360, h: EMPTY_H },
  defaults: { title: "Nothing here yet", cta: true, icon: "image" },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "icon", label: "Icon", type: "select", options: ["image", "folder", "file", "magnifying-glass", "star", "sparkle", "bell"], quick: true },
    { key: "cta", label: "Button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h, { stroke: "faint", dashed: true })]
    // the bubble already rides on h; everything hanging off it does too now, so
    // a short box tightens the stack instead of pushing the button through the
    // floor. Only shrinks — a taller box keeps the airy spacing it has today.
    const k = Math.min(1, h / EMPTY_H)
    const g = (n: number) => n * k
    const cy = h * 0.34
    const ring = 88 * k
    prims.push(ellipse(w / 2 - ring / 2, cy - ring / 2, ring, ring, { fill: "shade", fillColor: "faint" }))
    prims.push(...icon(str(p, "icon", "image"), w / 2, cy, 40 * k, { stroke: "muted" }))
    prims.push(text(w / 2, cy + g(76), str(p, "title", "Nothing here yet"), 19, { align: "center", bold: true }))
    prims.push(line(w / 2 - w * 0.28, cy + g(96), w / 2 + w * 0.28, cy + g(96), { stroke: "muted", strokeWidth: 1.2 }))
    const by = cy + g(116)
    const bh = Math.max(28, 40 * k)
    const bw = Math.min(150, w - 32)
    if (bool(p, "cta") && by + bh <= h) {
      prims.push(...sub(buttonDef, { label: "Make a thing", variant: "filled" }, w / 2 - bw / 2, by, bw, bh))
    }
    return prims
  },
}

export const TEMPLATE_DEFS: ComponentDef[] = [
  loginDef,
  signupDef,
  settingsDef,
  dashboardDef,
  pricingDef,
  feedDef,
  emptyStateDef,
]
