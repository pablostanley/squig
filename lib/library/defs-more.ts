// ---------------------------------------------------------------------------
// More components — the rest of the shadcn/ui vocabulary plus the workhorses:
// richer buttons, every form field, selection groups, cards of all types,
// navigation, data and media.
// ---------------------------------------------------------------------------

import type { Prim, PrimOpts } from "@/lib/sketch/kit"
import { rect, pill, ellipse, line, poly, text, icon, loremLines, truncate, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => {
  const n = Number(p[k] ?? fallback)
  return Number.isFinite(n) ? n : fallback
}
const list = (p: Props, k: string, fallback: string): string[] => {
  const out = str(p, k, fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return out.length ? out : fallback.split(",").map((s) => s.trim())
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
/** textWidth with a little slack — the sketch font runs a touch wide of the estimate */
const advance = (s: string, size: number): number => textWidth(s, size) * 1.08
/** baseline for text vertically centred in a band of height `bh` starting at `top` */
const mid = (top: number, bh: number, size: number): number => top + bh / 2 + size * 0.35
/** safe indexed pick from a cycling pool */
const pick = (pool: string[], i: number): string => pool[((i % pool.length) + pool.length) % pool.length]

/** seconds as m:ss, the way a player writes them */
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** the glyph a trend select points at */
const trendIcon = (trend: string): string =>
  trend === "up" ? "arrow-up" : trend === "down" ? "arrow-down" : "minus"

/**
 * Sign a delta to agree with the trend beside it.
 *
 * A card reading "↓ +12.5%" is the kind of thing nobody notices in a review and
 * everybody notices in a screenshot. So an unsigned delta picks up the trend's
 * sign — but a sign the user typed themselves is left exactly as typed, because
 * arguing with someone's own input is worse than the contradiction.
 */
const signDelta = (delta: string, trend: string): string => {
  const d = delta.trim()
  if (!d || /^[+-]/.test(d)) return delta
  return trend === "up" ? `+${d}` : trend === "down" ? `-${d}` : d
}

/**
 * A sparkline that agrees with the trend. One wobble, read three ways: as drawn
 * it falls to the right, mirrored it climbs, flattened it just twitches along
 * the middle. Reusing the one shape keeps all three looking hand-drawn by the
 * same hand.
 */
const SPARK = [0.7, 0.5, 0.62, 0.34, 0.46, 0.2, 0.1]
const sparkVals = (trend: string): number[] =>
  trend === "up" ? SPARK : trend === "down" ? SPARK.map((v) => 1 - v) : SPARK.map((v) => 0.5 + (v - 0.5) * 0.22)

const FAINT_FILL: PrimOpts = { fill: "solid", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }
const PAPER_FILL: PrimOpts = { fill: "solid", fillColor: "paper" }
const INK_FILL: PrimOpts = { fill: "shade", fillColor: "ink" }

// ===========================================================================
// Buttons
// ===========================================================================

// -- icon button ------------------------------------------------------------

export const iconButtonDef: ComponentDef = {
  kind: "icon-button",
  name: "Icon button",
  category: "components",
  group: "Buttons",
  keywords: ["btn", "square", "action", "glyph"],
  size: { w: 40, h: 40 },
  defaults: { icon: "plus", variant: "outline", shape: "square" },
  controls: [
    {
      key: "icon",
      label: "Icon",
      type: "icon",
    },
    { key: "variant", label: "Variant", type: "select", options: ["filled", "outline", "ghost"], quick: true },
    { key: "shape", label: "Shape", type: "select", options: ["square", "round"], quick: true },
  ],
  render(p, w, h) {
    const d = Math.min(w, h)
    const x = (w - d) / 2
    const y = (h - d) / 2
    const variant = str(p, "variant", "outline")
    const o: PrimOpts =
      variant === "filled" ? INK_FILL : variant === "ghost" ? { stroke: "faint", dashed: true, strokeWidth: 1 } : {}
    const prims: Prim[] = [str(p, "shape", "square") === "round" ? ellipse(x, y, d, d, o) : rect(x, y, d, d, o)]
    prims.push(...icon(str(p, "icon", "plus"), w / 2, h / 2, d * 0.44))
    return prims
  },
}

// -- button group / segmented control ---------------------------------------

export const buttonGroupDef: ComponentDef = {
  kind: "button-group",
  name: "Button group",
  category: "components",
  group: "Buttons",
  keywords: ["segmented", "control", "toggle", "switcher"],
  size: { w: 240, h: 36 },
  defaults: { labels: "Day, Week, Month", active: 2 },
  controls: [
    { key: "labels", label: "Labels (comma-sep)", type: "text" },
    { key: "active", label: "Active", type: "number", min: 1, max: 6, quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "Day, Week, Month")
    // Segments follow the labels now; nodes saved with the old Segments control keep their count.
    const n = clamp(Math.round(num(p, "count", labels.length)), 2, 6)
    const active = clamp(Math.round(num(p, "active", 1)), 1, n) - 1
    const segW = w / n
    const prims: Prim[] = [rect(active * segW + 1.5, 1.5, segW - 3, h - 3, FAINT_FILL), rect(0, 0, w, h)]
    for (let i = 1; i < n; i++) prims.push(line(i * segW, 0, i * segW, h, { stroke: "faint" }))
    const fs = clamp(h * 0.38, 10, 15)
    for (let i = 0; i < n; i++) {
      const label = labels[i] ?? `Item ${i + 1}`
      prims.push(
        text(i * segW + segW / 2, mid(0, h, fs), truncate(label, fs, segW - 10), fs, {
          align: "center",
          bold: i === active,
          color: i === active ? "ink" : "muted",
        })
      )
    }
    return prims
  },
}

// -- split button -----------------------------------------------------------

export const splitButtonDef: ComponentDef = {
  kind: "split-button",
  name: "Split button",
  category: "components",
  group: "Buttons",
  keywords: ["dropdown", "caret", "action", "menu"],
  size: { w: 160, h: 40 },
  defaults: { label: "Publish", variant: "filled" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "variant", label: "Variant", type: "select", options: ["filled", "outline"], quick: true },
  ],
  render(p, w, h) {
    const filled = str(p, "variant", "filled") === "filled"
    const caretW = clamp(w * 0.26, 24, 42)
    const mainW = Math.max(20, w - caretW)
    const prims: Prim[] = [rect(0, 0, w, h, filled ? INK_FILL : {})]
    prims.push(line(mainW, 2, mainW, h - 2, { stroke: "ink", strokeWidth: 1.2 }))
    const fs = clamp(h * 0.36, 11, 16)
    prims.push(
      text(mainW / 2, mid(0, h, fs), truncate(str(p, "label", "Publish"), fs, mainW - 14), fs, {
        align: "center",
        bold: true,
      })
    )
    prims.push(...icon("caret-down", mainW + caretW / 2, h / 2, clamp(h * 0.3, 9, 14)))
    return prims
  },
}

// -- floating action button -------------------------------------------------

export const fabDef: ComponentDef = {
  kind: "fab",
  name: "Floating action button",
  category: "components",
  group: "Buttons",
  keywords: ["fab", "compose", "new", "round", "floating"],
  size: { w: 56, h: 56 },
  defaults: { icon: "plus", extended: false, label: "New note" },
  controls: [
    { key: "icon", label: "Icon", type: "icon" },
    { key: "extended", label: "Extended", type: "toggle", quick: true },
    { key: "label", label: "Label", type: "text" },
  ],
  render(p, w, h) {
    const ic = str(p, "icon", "plus")
    const prims: Prim[] = []
    if (!bool(p, "extended")) {
      const d = Math.min(w, h) - 3
      const x = (w - d) / 2
      const y = (h - d) / 2
      prims.push(ellipse(x + 2, y + 3, d, d, { stroke: "faint" }))
      prims.push(ellipse(x, y, d, d, PAPER_FILL), ellipse(x, y, d, d, INK_FILL))
      prims.push(...icon(ic, x + d / 2, y + d / 2, d * 0.4))
      return prims
    }
    const bw = w - 2
    const bh = h - 3
    prims.push(pill(2, 3, bw, bh, { stroke: "faint" }))
    prims.push(pill(0, 0, bw, bh, PAPER_FILL), pill(0, 0, bw, bh, INK_FILL))
    const isz = clamp(bh * 0.42, 12, 22)
    const fs = clamp(bh * 0.34, 11, 16)
    const maxLabelW = bw - isz - 8 - 24
    if (maxLabelW < 16) {
      prims.push(...icon(ic, bw / 2, bh / 2, isz))
      return prims
    }
    const label = truncate(str(p, "label", "New note"), fs, maxLabelW)
    const total = isz + 8 + advance(label, fs)
    const sx = Math.max(12, (bw - total) / 2)
    prims.push(...icon(ic, sx + isz / 2, bh / 2, isz))
    prims.push(text(sx + isz + 8, mid(0, bh, fs), label, fs, { bold: true }))
    return prims
  },
}

// -- chip -------------------------------------------------------------------

export const chipDef: ComponentDef = {
  kind: "chip",
  name: "Chip",
  category: "components",
  group: "Buttons",
  keywords: ["pill", "tag", "token", "filter", "dismiss"],
  size: { w: 108, h: 30 },
  defaults: { label: "Design", avatar: false, dismiss: true },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "avatar", label: "Avatar", type: "toggle", quick: true },
    { key: "dismiss", label: "Dismiss", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const avatar = bool(p, "avatar")
    const dismiss = bool(p, "dismiss")
    const prims: Prim[] = [pill(0, 0, w, h)]
    const fs = clamp(h * 0.42, 10, 14)
    let tx = clamp(h * 0.42, 10, 14)
    if (avatar) {
      const d = Math.max(10, h - 8)
      prims.push(ellipse(4, 4, d, d, { stroke: "muted" }))
      prims.push(...icon("user", 4 + d / 2, h / 2, d * 0.55, { stroke: "muted" }))
      tx = 4 + d + 8
    }
    const xSize = clamp(h * 0.34, 8, 12)
    const rightPad = dismiss ? xSize + 18 : 12
    prims.push(text(tx, mid(0, h, fs), truncate(str(p, "label", "Design"), fs, Math.max(8, w - tx - rightPad)), fs))
    if (dismiss) prims.push(...icon("x", w - 12, h / 2, xSize, { stroke: "muted" }))
    return prims
  },
}

// -- chip group -------------------------------------------------------------

export const chipGroupDef: ComponentDef = {
  kind: "chip-group",
  name: "Chip group",
  category: "components",
  group: "Buttons",
  keywords: ["tags", "pills", "filters", "tokens", "wrap"],
  size: { w: 280, h: 78 },
  defaults: { labels: "Design, Research, Prototype, Handoff, Motion, Docs, Testing, Launch", count: 6, dismiss: true },
  controls: [
    { key: "labels", label: "Labels (comma-sep)", type: "text" },
    { key: "count", label: "Chips", type: "number", min: 1, max: 12, quick: true },
    { key: "dismiss", label: "Dismiss", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "Design, Research, Prototype, Handoff, Motion, Docs")
    const n = clamp(Math.round(num(p, "count", 6)), 1, 12)
    const dismiss = bool(p, "dismiss")
    const chipH = clamp(h * 0.34, 22, 30)
    const gap = 8
    const fs = clamp(chipH * 0.44, 10, 13)
    const prims: Prim[] = []
    let x = 0
    let y = 0
    for (let i = 0; i < n; i++) {
      const raw = pick(labels, i)
      const extra = 24 + (dismiss ? 16 : 0)
      const cw = Math.min(w, advance(raw, fs) + extra)
      const label = truncate(raw, fs, Math.max(6, cw - extra))
      if (x > 0 && x + cw > w) {
        x = 0
        y += chipH + gap
      }
      if (y + chipH > h + 1) break
      prims.push(pill(x, y, cw, chipH))
      prims.push(text(x + 12, mid(y, chipH, fs), label, fs))
      if (dismiss) prims.push(...icon("x", x + cw - 11, y + chipH / 2, 9, { stroke: "muted" }))
      x += cw + gap
    }
    return prims
  },
}

// ===========================================================================
// Forms
// ===========================================================================

// -- form field -------------------------------------------------------------

export const formFieldDef: ComponentDef = {
  kind: "form-field",
  name: "Form field",
  category: "components",
  group: "Forms",
  keywords: ["label", "helper", "error", "validation", "input"],
  size: { w: 260, h: 86 },
  defaults: {
    label: "Email",
    placeholder: "you@company.com",
    message: "That doesn't look like an email",
    helper: true,
    error: false,
    required: true,
  },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "placeholder", label: "Placeholder", type: "text" },
    { key: "message", label: "Error text", type: "text" },
    { key: "helper", label: "Helper text", type: "toggle", quick: true },
    { key: "error", label: "Error", type: "toggle", quick: true },
    { key: "required", label: "Required", type: "toggle" },
  ],
  render(p, w, h) {
    const err = bool(p, "error")
    const helper = bool(p, "helper") || err
    const labelH = Math.min(22, h * 0.3)
    const helperH = helper ? Math.min(20, h * 0.26) : 0
    const fieldH = Math.max(16, h - labelH - helperH)
    const ls = clamp(labelH * 0.6, 9, 13)
    const label = str(p, "label", "Email")
    const ly = Math.max(ls, labelH - 6)
    const prims: Prim[] = [text(0, ly, truncate(label, ls, w - 14), ls, { bold: true })]
    if (bool(p, "required")) {
      prims.push(text(Math.min(w - 8, advance(label, ls) + 5), ly, "*", ls, { color: "muted" }))
    }
    prims.push(rect(0, labelH, w, fieldH, err ? { strokeWidth: 2 } : {}))
    const isz = clamp(fieldH * 0.42, 11, 15)
    const iconPad = err ? isz + 14 : 0
    const fs = clamp(fieldH * 0.38, 10, 14)
    prims.push(
      text(12, mid(labelH, fieldH, fs), truncate(str(p, "placeholder", "you@company.com"), fs, Math.max(10, w - 24 - iconPad)), fs, {
        color: "muted",
      })
    )
    if (err) prims.push(...icon("warning-circle", w - isz / 2 - 10, labelH + fieldH / 2, isz))
    if (helper) {
      const hs = clamp(helperH * 0.6, 9, 12)
      const hy = labelH + fieldH + helperH * 0.72
      if (err)
        prims.push(text(1, hy, truncate(str(p, "message", "That doesn't look like an email"), hs, w - 4), hs))
      else prims.push(line(1, hy - hs * 0.35, Math.min(w, w * 0.72), hy - hs * 0.35, { stroke: "muted", strokeWidth: 1.2 }))
    }
    return prims
  },
}

// -- search input -----------------------------------------------------------

export const searchInputDef: ComponentDef = {
  kind: "search-input",
  name: "Search input",
  category: "components",
  group: "Forms",
  keywords: ["find", "filter", "query", "omnibox", "magnifier"],
  size: { w: 260, h: 38 },
  defaults: { placeholder: "Search everything…", shape: "rounded", clear: false, kbd: true },
  controls: [
    { key: "placeholder", label: "Placeholder", type: "text" },
    { key: "shape", label: "Shape", type: "select", options: ["rounded", "pill"], quick: true },
    { key: "clear", label: "Clear button", type: "toggle", quick: true },
    { key: "kbd", label: "Kbd hint", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const rounded = str(p, "shape", "rounded") === "pill"
    const prims: Prim[] = [rounded ? pill(0, 0, w, h) : rect(0, 0, w, h)]
    const padX = rounded ? clamp(h * 0.34, 10, 18) : 12
    const isz = clamp(h * 0.42, 11, 17)
    prims.push(...icon("magnifying-glass", padX + isz / 2, h / 2, isz, { stroke: "muted" }))
    let right = w - padX
    if (bool(p, "kbd")) {
      const kw = clamp(h * 0.95, 26, 36)
      const kh = clamp(h * 0.56, 15, 22)
      prims.push(rect(right - kw, (h - kh) / 2, kw, kh, { stroke: "faint" }))
      prims.push(text(right - kw / 2, h / 2 + 4, "⌘K", clamp(kh * 0.52, 8, 11), { align: "center", color: "muted" }))
      right -= kw + 8
    }
    if (bool(p, "clear")) {
      prims.push(...icon("x-circle", right - 8, h / 2, clamp(h * 0.38, 11, 15), { stroke: "muted" }))
      right -= 24
    }
    const tx = padX + isz + 10
    const fs = clamp(h * 0.38, 11, 14)
    prims.push(
      text(tx, mid(0, h, fs), truncate(str(p, "placeholder", "Search everything…"), fs, Math.max(10, right - tx - 4)), fs, {
        color: "muted",
      })
    )
    return prims
  },
}

// -- otp input --------------------------------------------------------------

export const otpInputDef: ComponentDef = {
  kind: "otp-input",
  name: "OTP input",
  category: "components",
  group: "Forms",
  keywords: ["code", "pin", "verify", "2fa", "one time"],
  size: { w: 260, h: 52 },
  defaults: { count: 6, filled: 3 },
  controls: [
    { key: "count", label: "Boxes", type: "number", min: 3, max: 8, quick: true },
    { key: "filled", label: "Filled", type: "number", min: 0, max: 8, quick: true },
  ],
  render(p, w, h) {
    const n = clamp(Math.round(num(p, "count", 6)), 3, 8)
    const filled = clamp(Math.round(num(p, "filled", 3)), 0, n)
    const gap = clamp(w * 0.025, 4, 10)
    const bw = (w - gap * (n - 1)) / n
    const bh = Math.min(h, bw * 1.3)
    const y = (h - bh) / 2
    const fs = clamp(bw * 0.5, 11, 22)
    const digits = "482913"
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const x = i * (bw + gap)
      const cursor = i === filled
      prims.push(rect(x, y, bw, bh, cursor ? { strokeWidth: 2 } : { stroke: i < filled ? "ink" : "muted" }))
      if (i < filled) {
        prims.push(text(x + bw / 2, y + bh / 2 + fs * 0.35, digits.charAt(i % digits.length), fs, { align: "center" }))
      } else if (cursor) {
        prims.push(line(x + bw / 2, y + bh * 0.3, x + bw / 2, y + bh * 0.7, { strokeWidth: 1.6 }))
      }
    }
    return prims
  },
}

// -- file upload ------------------------------------------------------------

export const fileUploadDef: ComponentDef = {
  kind: "file-upload",
  name: "File upload",
  category: "components",
  group: "Forms",
  keywords: ["dropzone", "drag", "drop", "attach", "files"],
  size: { w: 280, h: 150 },
  defaults: { hint: "PNG, JPG or PDF up to 10 MB", files: 0 },
  controls: [
    { key: "files", label: "Files", type: "number", min: 0, max: 4, quick: true },
    { key: "hint", label: "Hint", type: "text" },
  ],
  render(p, w, h) {
    // Nodes dropped before Files went live carry `variant: "dropzone"` and an inert
    // files: 2 — honour the saved bare dropzone until someone moves the control.
    const legacyZone = str(p, "variant", "") === "dropzone" && num(p, "files", 0) === 2
    const files = legacyZone ? 0 : clamp(Math.round(num(p, "files", 0)), 0, 4)
    const zoneH = files ? Math.max(30, h - Math.min(files * 32 + 8, h * 0.56)) : h
    const listH = h - zoneH
    const rowH = files ? Math.max(12, (listH - 8) / files) : 0
    const prims: Prim[] = [rect(0, 0, w, zoneH, { stroke: "muted", dashed: true })]
    const isz = clamp(zoneH * 0.26, 12, 34)
    const fs = clamp(zoneH * 0.11, 10, 14)
    const roomy = zoneH > 52
    prims.push(...icon("cloud-arrow-up", w / 2, roomy ? zoneH * 0.34 : zoneH / 2, isz, { stroke: "muted" }))
    if (roomy) {
      prims.push(text(w / 2, zoneH * 0.68, truncate("Drop files here", fs, w - 24), fs, { align: "center", bold: true }))
      if (zoneH > 84) {
        prims.push(
          text(w / 2, zoneH * 0.68 + 17, truncate(str(p, "hint", ""), 11, w - 24), 11, { align: "center", color: "muted" })
        )
      }
    }
    for (let i = 0; i < files; i++) {
      const ry = zoneH + 8 + i * rowH
      const rh = Math.max(8, rowH - 6)
      const cy = ry + rh / 2
      prims.push(rect(0, ry, w, rh, { stroke: "faint" }))
      const fi = clamp(rh * 0.6, 8, 13)
      prims.push(...icon("file-text", 12 + fi / 2, cy, fi, { stroke: "muted" }))
      const lx = 24 + fi
      const lw = Math.max(8, Math.min(w - 40 - lx, w * 0.42))
      prims.push(line(lx, cy - Math.min(4, rh * 0.16), lx + lw, cy - Math.min(4, rh * 0.16), { stroke: "muted", strokeWidth: 1.2 }))
      if (rh > 22) prims.push(line(lx, cy + 6, lx + lw * 0.5, cy + 6, { stroke: "faint", strokeWidth: 1 }))
      prims.push(...icon("x", w - 14, cy, 10, { stroke: "muted" }))
    }
    return prims
  },
}

// -- date picker ------------------------------------------------------------

export const datePickerDef: ComponentDef = {
  kind: "date-picker",
  name: "Date picker",
  category: "components",
  group: "Forms",
  keywords: ["calendar", "day", "when", "schedule", "input"],
  size: { w: 220, h: 62 },
  defaults: { label: "Starts on", showLabel: true, value: "Mar 4, 2026", endValue: "Mar 18", range: false },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "value", label: "Value", type: "text" },
    { key: "endValue", label: "End date", type: "text" },
    { key: "range", label: "Range", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    let top = 0
    if (bool(p, "showLabel")) {
      top = Math.min(22, h * 0.34)
      const ls = clamp(top * 0.6, 9, 13)
      prims.push(text(1, Math.max(ls, top - 6), truncate(str(p, "label", "Starts on"), ls, w), ls, { bold: true }))
    }
    const fieldH = Math.max(16, h - top)
    prims.push(rect(0, top, w, fieldH))
    const isz = clamp(fieldH * 0.42, 11, 17)
    prims.push(...icon("calendar-blank", 14 + isz / 2, top + fieldH / 2, isz, { stroke: "muted" }))
    const start = str(p, "value", "Mar 4, 2026")
    const value = bool(p, "range") ? `${start} – ${str(p, "endValue", "Mar 18")}` : start
    const fs = clamp(fieldH * 0.38, 10, 14)
    const tx = 22 + isz
    prims.push(text(tx, mid(top, fieldH, fs), truncate(value, fs, Math.max(10, w - tx - 24)), fs))
    prims.push(...icon("caret-down", w - 14, top + fieldH / 2, 11, { stroke: "muted" }))
    return prims
  },
}

// -- combobox ---------------------------------------------------------------

export const comboboxDef: ComponentDef = {
  kind: "combobox",
  name: "Combobox",
  category: "components",
  group: "Forms",
  keywords: ["autocomplete", "typeahead", "select", "search", "dropdown"],
  size: { w: 240, h: 170 },
  defaults: { value: "Pick a framework…", items: "Next.js, Remix, Astro, SvelteKit, Nuxt", open: true },
  controls: [
    { key: "value", label: "Value", type: "text" },
    { key: "items", label: "Items (comma-sep)", type: "text" },
    { key: "open", label: "Open", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const open = bool(p, "open")
    const items = list(p, "items", "Next.js, Remix, Astro, SvelteKit")
    const fieldH = open ? clamp(h * 0.26, 32, 44) : h
    const prims: Prim[] = [rect(0, 0, w, fieldH)]
    prims.push(
      text(12, mid(0, fieldH, 14), truncate(str(p, "value", "Pick a framework…"), 14, Math.max(10, w - 40)), 14, {
        color: "muted",
      })
    )
    prims.push(...icon(open ? "caret-up" : "caret-down", w - 16, fieldH / 2, 12, { stroke: "muted" }))
    if (!open) return prims
    const top = fieldH + 6
    const ph = h - top
    if (ph < 30) return prims
    prims.push(rect(0, top, w, ph, PAPER_FILL), rect(0, top, w, ph))
    const n = clamp(Math.floor((ph - 8) / 28), 1, items.length)
    const rowH = (ph - 8) / n
    for (let i = 0; i < n; i++) {
      const ry = top + 4 + i * rowH
      if (i === 0) prims.push(rect(4, ry + 1.5, w - 8, rowH - 3, FAINT_FILL))
      prims.push(text(14, mid(ry, rowH, 13), truncate(pick(items, i), 13, Math.max(8, w - 46)), 13))
      if (i === 0) prims.push(...icon("check", w - 18, ry + rowH / 2, 12))
    }
    return prims
  },
}

// -- input group ------------------------------------------------------------

export const inputGroupDef: ComponentDef = {
  kind: "input-group",
  name: "Input group",
  category: "components",
  group: "Forms",
  keywords: ["addon", "prefix", "suffix", "url", "domain"],
  size: { w: 280, h: 40 },
  defaults: { prefix: "https://", suffix: ".com", showPrefix: true, showSuffix: true, value: "your-site" },
  controls: [
    { key: "prefix", label: "Prefix", type: "text" },
    { key: "suffix", label: "Suffix", type: "text" },
    { key: "showPrefix", label: "Prefix on", type: "toggle", quick: true },
    { key: "showSuffix", label: "Suffix on", type: "toggle", quick: true },
    { key: "value", label: "Value", type: "text" },
  ],
  render(p, w, h) {
    const fs = clamp(h * 0.36, 11, 15)
    const prefix = bool(p, "showPrefix") ? str(p, "prefix", "https://") : ""
    const suffix = bool(p, "showSuffix") ? str(p, "suffix", ".com") : ""
    const pw = prefix ? Math.min(w * 0.36, textWidth(prefix, fs) + 20) : 0
    const sw = suffix ? Math.min(w * 0.3, textWidth(suffix, fs) + 20) : 0
    const prims: Prim[] = [rect(0, 0, w, h)]
    if (pw) {
      prims.push(rect(1.5, 1.5, pw - 1.5, h - 3, FAINT_FILL))
      prims.push(line(pw, 0, pw, h, { stroke: "faint" }))
      prims.push(text(pw / 2, mid(0, h, fs), truncate(prefix, fs, pw - 8), fs, { align: "center", color: "muted" }))
    }
    if (sw) {
      prims.push(rect(w - sw, 1.5, sw - 1.5, h - 3, FAINT_FILL))
      prims.push(line(w - sw, 0, w - sw, h, { stroke: "faint" }))
      prims.push(text(w - sw / 2, mid(0, h, fs), truncate(suffix, fs, sw - 8), fs, { align: "center", color: "muted" }))
    }
    const tx = pw + 12
    prims.push(text(tx, mid(0, h, fs), truncate(str(p, "value", "your-site"), fs, Math.max(8, w - tx - sw - 12)), fs))
    return prims
  },
}

// -- stepper input ----------------------------------------------------------

export const stepperInputDef: ComponentDef = {
  kind: "stepper-input",
  name: "Stepper input",
  category: "components",
  group: "Forms",
  keywords: ["number", "quantity", "plus", "minus", "counter"],
  size: { w: 140, h: 38 },
  defaults: { value: 3, unit: "" },
  controls: [
    { key: "value", label: "Value", type: "number", min: 0, max: 999, quick: true },
    { key: "unit", label: "Unit", type: "text" },
  ],
  render(p, w, h) {
    const bw = Math.min(clamp(h, 26, 46), w / 3)
    const prims: Prim[] = [rect(0, 0, w, h)]
    prims.push(line(bw, 0, bw, h, { stroke: "faint" }), line(w - bw, 0, w - bw, h, { stroke: "faint" }))
    const isz = clamp(h * 0.34, 9, 16)
    prims.push(...icon("minus", bw / 2, h / 2, isz, { stroke: "muted" }))
    prims.push(...icon("plus", w - bw / 2, h / 2, isz))
    const fs = clamp(h * 0.4, 12, 18)
    const unit = str(p, "unit", "")
    const label = String(Math.round(num(p, "value", 3))) + (unit ? ` ${unit}` : "")
    prims.push(text(w / 2, mid(0, h, fs), truncate(label, fs, Math.max(8, w - bw * 2 - 8)), fs, { align: "center" }))
    return prims
  },
}

// -- colour swatch row (monochrome) -----------------------------------------

export const colorSwatchRowDef: ComponentDef = {
  kind: "color-swatch-row",
  name: "Swatch row",
  category: "components",
  group: "Forms",
  keywords: ["colour", "color", "palette", "shades", "picker", "tones"],
  size: { w: 240, h: 34 },
  defaults: { count: 6, shape: "square", selected: 2 },
  controls: [
    { key: "count", label: "Swatches", type: "number", min: 2, max: 10, quick: true },
    { key: "shape", label: "Shape", type: "select", options: ["square", "round"], quick: true },
    { key: "selected", label: "Selected", type: "number", min: 0, max: 10, quick: true },
  ],
  render(p, w, h) {
    const n = clamp(Math.round(num(p, "count", 6)), 2, 10)
    const gap = clamp(w * 0.02, 4, 10)
    const cellW = (w - gap * (n - 1)) / n
    const d = Math.min(cellW, h)
    const y = (h - d) / 2
    const round = str(p, "shape", "square") === "round"
    const sel = clamp(Math.round(num(p, "selected", 2)), 0, n) - 1
    const ramp: PrimOpts[] = [
      { fill: "solid", fillColor: "ink" },
      { fill: "shade", fillColor: "ink" },
      { fill: "solid", fillColor: "muted" },
      { fill: "shade", fillColor: "muted" },
      { fill: "solid", fillColor: "faint" },
      { fill: "solid", fillColor: "paper" },
    ]
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const x = i * (cellW + gap) + (cellW - d) / 2
      const step = ramp[Math.round((i / (n - 1)) * (ramp.length - 1))] ?? ramp[0]
      const o: PrimOpts = { ...step, strokeWidth: i === sel ? 2.4 : 1 }
      prims.push(round ? ellipse(x, y, d, d, o) : rect(x, y, d, d, o))
      if (i !== sel) continue
      // A heavier border is all the mark the pale swatches need, but on the
      // dark end of the ramp it disappears into the fill. So the selected one
      // also gets a paper disc punched into it — inside the swatch, so nothing
      // spills past the row — with a tick on top once there's room to draw one.
      const md = Math.min(d * 0.56, 20)
      prims.push(ellipse(x + (d - md) / 2, y + (d - md) / 2, md, md, { fill: "solid", fillColor: "paper" }))
      if (md > 9) prims.push(...icon("check", x + d / 2, y + d / 2, md * 0.68))
    }
    return prims
  },
}

// ===========================================================================
// Selection
// ===========================================================================

// -- radio group ------------------------------------------------------------

export const radioGroupDef: ComponentDef = {
  kind: "radio-group",
  name: "Radio group",
  category: "components",
  group: "Selection",
  keywords: ["options", "choice", "pick one", "form"],
  size: { w: 220, h: 110 },
  defaults: { label: "Plan", showLabel: true, options: "Free, Pro, Team", selected: 2, direction: "vertical" },
  controls: [
    { key: "options", label: "Options (comma-sep)", type: "text" },
    { key: "selected", label: "Selected", type: "number", min: 1, max: 8, quick: true },
    { key: "direction", label: "Direction", type: "select", options: ["vertical", "horizontal"], quick: true },
    { key: "showLabel", label: "Group label", type: "toggle", quick: true },
    { key: "label", label: "Label", type: "text" },
  ],
  render(p, w, h) {
    const options = list(p, "options", "Free, Pro, Team")
    const n = options.length
    const selected = clamp(Math.round(num(p, "selected", 1)), 1, n) - 1
    const horizontal = str(p, "direction", "vertical") === "horizontal"
    const prims: Prim[] = []
    let top = 0
    if (bool(p, "showLabel")) {
      prims.push(text(0, 13, truncate(str(p, "label", "Plan"), 13, w), 13, { bold: true }))
      top = 24
    }
    const areaH = Math.max(18, h - top)
    if (horizontal) {
      const colW = w / n
      const d = clamp(Math.min(areaH - 4, 18), 10, 18)
      const cy = top + areaH / 2
      for (let i = 0; i < n; i++) {
        const x = i * colW
        prims.push(ellipse(x, cy - d / 2, d, d, i === selected ? { strokeWidth: 1.7 } : { stroke: "muted" }))
        if (i === selected) prims.push(ellipse(x + d * 0.27, cy - d * 0.23, d * 0.46, d * 0.46, { fill: "solid", fillColor: "ink" }))
        prims.push(
          text(x + d + 8, cy + 5, truncate(pick(options, i), 13, Math.max(8, colW - d - 14)), 13, {
            color: i === selected ? "ink" : "muted",
          })
        )
      }
      return prims
    }
    const rowH = areaH / n
    for (let i = 0; i < n; i++) {
      const cy = top + i * rowH + rowH / 2
      const d = clamp(Math.min(rowH - 6, 20), 10, 20)
      prims.push(ellipse(0, cy - d / 2, d, d, i === selected ? { strokeWidth: 1.7 } : { stroke: "muted" }))
      if (i === selected) prims.push(ellipse(d * 0.27, cy - d * 0.23, d * 0.46, d * 0.46, { fill: "solid", fillColor: "ink" }))
      prims.push(
        text(d + 10, cy + 5, truncate(pick(options, i), 14, Math.max(8, w - d - 14)), 14, {
          color: i === selected ? "ink" : "muted",
        })
      )
    }
    return prims
  },
}

// -- checkbox group ---------------------------------------------------------

export const checkboxGroupDef: ComponentDef = {
  kind: "checkbox-group",
  name: "Checkbox group",
  category: "components",
  group: "Selection",
  keywords: ["multi", "options", "tick", "form", "list"],
  size: { w: 220, h: 110 },
  defaults: { label: "Notify me about", showLabel: true, options: "Mentions, Replies, Weekly digest", checked: 2, direction: "vertical" },
  controls: [
    { key: "options", label: "Options (comma-sep)", type: "text" },
    { key: "checked", label: "Ticked", type: "number", min: 0, max: 8, quick: true },
    { key: "direction", label: "Direction", type: "select", options: ["vertical", "horizontal"], quick: true },
    { key: "showLabel", label: "Group label", type: "toggle", quick: true },
    { key: "label", label: "Label", type: "text" },
  ],
  render(p, w, h) {
    const options = list(p, "options", "Mentions, Replies, Weekly digest")
    const n = options.length
    const checked = clamp(Math.round(num(p, "checked", 2)), 0, n)
    const horizontal = str(p, "direction", "vertical") === "horizontal"
    const prims: Prim[] = []
    let top = 0
    if (bool(p, "showLabel")) {
      prims.push(text(0, 13, truncate(str(p, "label", "Notify me about"), 13, w), 13, { bold: true }))
      top = 24
    }
    const areaH = Math.max(18, h - top)
    const drawBox = (x: number, cy: number, d: number, on: boolean): void => {
      prims.push(rect(x, cy - d / 2, d, d, on ? {} : { stroke: "muted" }))
      if (on) prims.push(...icon("check", x + d / 2, cy, d * 0.78))
    }
    if (horizontal) {
      const colW = w / n
      const d = clamp(Math.min(areaH - 4, 18), 10, 18)
      const cy = top + areaH / 2
      for (let i = 0; i < n; i++) {
        drawBox(i * colW, cy, d, i < checked)
        prims.push(
          text(i * colW + d + 8, cy + 5, truncate(pick(options, i), 13, Math.max(8, colW - d - 14)), 13, {
            color: i < checked ? "ink" : "muted",
          })
        )
      }
      return prims
    }
    const rowH = areaH / n
    for (let i = 0; i < n; i++) {
      const cy = top + i * rowH + rowH / 2
      const d = clamp(Math.min(rowH - 6, 20), 10, 20)
      drawBox(0, cy, d, i < checked)
      prims.push(
        text(d + 10, cy + 5, truncate(pick(options, i), 14, Math.max(8, w - d - 14)), 14, {
          color: i < checked ? "ink" : "muted",
        })
      )
    }
    return prims
  },
}

// -- toggle group -----------------------------------------------------------

export const toggleGroupDef: ComponentDef = {
  kind: "toggle-group",
  name: "Toggle group",
  category: "components",
  group: "Selection",
  keywords: ["toolbar", "formatting", "icons", "segmented", "pressed"],
  size: { w: 200, h: 38 },
  defaults: { count: 4, active: 1, style: "icons" },
  controls: [
    { key: "count", label: "Toggles", type: "number", min: 2, max: 6, quick: true },
    { key: "active", label: "Active", type: "number", min: 1, max: 6, quick: true },
    { key: "style", label: "Style", type: "select", options: ["icons", "labels"], quick: true },
  ],
  render(p, w, h) {
    const n = clamp(Math.round(num(p, "count", 4)), 2, 6)
    const active = clamp(Math.round(num(p, "active", 1)), 1, n) - 1
    const icons = ["text-b", "text-align-left", "list-bullets", "code", "link", "quotes"]
    const labels = ["Bold", "Left", "List", "Code", "Link", "Quote"]
    const gap = 6
    const bw = (w - gap * (n - 1)) / n
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const x = i * (bw + gap)
      prims.push(rect(x, 0, bw, h, i === active ? FAINT_FILL : { stroke: "muted" }))
      if (i === active) prims.push(rect(x, 0, bw, h))
      if (str(p, "style", "icons") === "icons") {
        prims.push(...icon(pick(icons, i), x + bw / 2, h / 2, clamp(Math.min(bw, h) * 0.42, 10, 20), {
          stroke: i === active ? "ink" : "muted",
        }))
      } else {
        const fs = clamp(h * 0.35, 10, 14)
        prims.push(
          text(x + bw / 2, mid(0, h, fs), truncate(pick(labels, i), fs, bw - 8), fs, {
            align: "center",
            bold: i === active,
            color: i === active ? "ink" : "muted",
          })
        )
      }
    }
    return prims
  },
}

// -- rating -----------------------------------------------------------------

export const ratingDef: ComponentDef = {
  kind: "rating",
  name: "Rating",
  category: "components",
  group: "Selection",
  keywords: ["stars", "review", "score", "feedback"],
  size: { w: 140, h: 26 },
  defaults: { count: 5, filled: 4, showValue: false },
  controls: [
    { key: "count", label: "Stars", type: "number", min: 3, max: 10, quick: true },
    { key: "filled", label: "Filled", type: "number", min: 0, max: 10, quick: true },
    { key: "showValue", label: "Show value", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const n = clamp(Math.round(num(p, "count", 5)), 3, 10)
    const filled = clamp(Math.round(num(p, "filled", 4)), 0, n)
    const showValue = bool(p, "showValue")
    const valueW = showValue ? clamp(w * 0.2, 30, 46) : 0
    const gap = clamp(w * 0.02, 3, 8)
    const cellW = Math.max(6, (w - valueW - gap * (n - 1)) / n)
    const d = Math.min(cellW, h)
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const cx = i * (cellW + gap) + cellW / 2
      prims.push(...icon("star", cx, h / 2, d * 0.95, { stroke: i < filled ? "ink" : "faint" }))
    }
    if (showValue) {
      const fs = clamp(h * 0.5, 10, 14)
      prims.push(text(w, mid(0, h, fs), `${filled}.0`, fs, { align: "right", color: "muted" }))
    }
    return prims
  },
}

// -- range slider -----------------------------------------------------------

export const sliderRangeDef: ComponentDef = {
  kind: "slider-range",
  name: "Range slider",
  category: "components",
  group: "Selection",
  keywords: ["slider", "min", "max", "between", "price", "filter"],
  size: { w: 220, h: 40 },
  defaults: { from: 25, to: 75, showValues: true },
  controls: [
    { key: "from", label: "From", type: "number", min: 0, max: 100, quick: true },
    { key: "to", label: "To", type: "number", min: 0, max: 100, quick: true },
    { key: "showValues", label: "Show values", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const a = clamp(num(p, "from", 25), 0, 100)
    const b = clamp(num(p, "to", 75), 0, 100)
    const lo = Math.min(a, b) / 100
    const hi = Math.max(a, b) / 100
    const showValues = bool(p, "showValues")
    const top = showValues ? Math.min(18, h * 0.4) : 0
    const knob = clamp((h - top) * 0.7, 12, 18)
    const cy = top + (h - top) / 2
    const x0 = knob / 2
    const x1 = w - knob / 2
    const kA = x0 + lo * (x1 - x0)
    const kB = x0 + hi * (x1 - x0)
    const prims: Prim[] = [
      line(x0, cy, x1, cy, { stroke: "muted", strokeWidth: 2 }),
      line(kA, cy, kB, cy, { strokeWidth: 2.6 }),
    ]
    for (const kx of [kA, kB]) {
      prims.push(ellipse(kx - knob / 2, cy - knob / 2, knob, knob, PAPER_FILL))
      prims.push(ellipse(kx - knob / 2, cy - knob / 2, knob, knob))
    }
    if (showValues) {
      prims.push(text(clamp(kA, 12, w - 12), 12, String(Math.round(Math.min(a, b))), 11, { align: "center", color: "muted" }))
      prims.push(text(clamp(kB, 12, w - 12), 12, String(Math.round(Math.max(a, b))), 11, { align: "center", color: "muted" }))
    }
    return prims
  },
}

// ===========================================================================
// Display
// ===========================================================================

// -- accordion --------------------------------------------------------------

export const accordionDef: ComponentDef = {
  kind: "accordion",
  name: "Accordion",
  category: "components",
  group: "Display",
  keywords: ["faq", "collapse", "expand", "disclosure", "details"],
  size: { w: 300, h: 220 },
  defaults: { labels: "What is squig?, How much is it?, Can I export?, Refund policy", expanded: 1 },
  controls: [
    { key: "labels", label: "Rows (comma-sep)", type: "text" },
    { key: "expanded", label: "Expanded", type: "number", min: 0, max: 6, quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "What is squig?, How much is it?, Can I export?, Refund policy")
    // Rows follow the labels now; nodes saved with the old Rows control keep their count.
    const n = clamp(Math.round(num(p, "count", labels.length)), 2, 6)
    const expanded = clamp(Math.round(num(p, "expanded", 1)), 0, n)
    const wantBody = expanded >= 1
    let headerH = wantBody ? Math.min(46, h / (n + 1)) : h / n
    let bodyH = h - n * headerH
    if (!wantBody || bodyH < 30) {
      headerH = h / n
      bodyH = 0
    }
    const fs = clamp(headerH * 0.34, 11, 15)
    const prims: Prim[] = [line(0, 0, w, 0, { stroke: "faint" })]
    let y = 0
    for (let i = 0; i < n; i++) {
      const isExp = expanded === i + 1 && bodyH > 0
      prims.push(text(2, mid(y, headerH, fs), truncate(pick(labels, i), fs, Math.max(10, w - 34)), fs, { bold: isExp }))
      prims.push(...icon(isExp ? "caret-up" : "caret-down", w - 12, y + headerH / 2, 11, { stroke: "muted" }))
      y += headerH
      if (isExp) {
        const lines = clamp(Math.floor((bodyH - 12) / 16), 1, 4)
        prims.push(...loremLines(2, y + 8, Math.max(20, w - 30), lines, 16))
        y += bodyH
      }
      prims.push(line(0, Math.min(y, h), w, Math.min(y, h), { stroke: "faint" }))
    }
    return prims
  },
}

// -- carousel ---------------------------------------------------------------

export const carouselDef: ComponentDef = {
  kind: "carousel",
  name: "Carousel",
  category: "components",
  group: "Display",
  keywords: ["slider", "gallery", "slides", "arrows", "dots"],
  size: { w: 320, h: 230 },
  defaults: { dots: 5, active: 1, thumbs: false, arrows: true },
  controls: [
    { key: "dots", label: "Slides", type: "number", min: 2, max: 8, quick: true },
    { key: "active", label: "Active", type: "number", min: 1, max: 8, quick: true },
    { key: "thumbs", label: "Thumbnails", type: "toggle", quick: true },
    { key: "arrows", label: "Arrows", type: "toggle" },
  ],
  render(p, w, h) {
    const dots = clamp(Math.round(num(p, "dots", 5)), 2, 8)
    const active = clamp(Math.round(num(p, "active", 1)), 1, dots) - 1
    const thumbs = bool(p, "thumbs")
    const dotsH = 20
    const thumbH = thumbs ? clamp(h * 0.2, 40, 62) : 0
    const frameH = Math.max(40, h - dotsH - thumbH - (thumbs ? 6 : 0))
    const prims: Prim[] = [rect(0, 0, w, frameH, { fill: "shade", fillColor: "faint" })]
    prims.push(...icon("image", w / 2, frameH / 2, clamp(Math.min(w, frameH) * 0.24, 20, 52), { stroke: "muted" }))
    if (bool(p, "arrows") && w > 120) {
      const ad = clamp(Math.min(frameH * 0.28, 34), 20, 34)
      const ay = frameH / 2 - ad / 2
      for (const side of [0, 1]) {
        const ax = side === 0 ? 10 : w - 10 - ad
        prims.push(ellipse(ax, ay, ad, ad, PAPER_FILL), ellipse(ax, ay, ad, ad))
        prims.push(...icon(side === 0 ? "caret-left" : "caret-right", ax + ad / 2, frameH / 2, ad * 0.44))
      }
    }
    const dcy = frameH + dotsH / 2
    const dd = 7
    const dgap = 8
    const totalD = dots * dd + (dots - 1) * dgap
    let dx = (w - totalD) / 2
    for (let i = 0; i < dots; i++) {
      prims.push(
        ellipse(dx, dcy - dd / 2, dd, dd, i === active ? { fill: "solid", fillColor: "ink" } : { stroke: "muted" })
      )
      dx += dd + dgap
    }
    if (thumbs) {
      const ty = frameH + dotsH + 6
      const tn = clamp(dots, 3, 5)
      const tgap = 8
      const tw = (w - tgap * (tn - 1)) / tn
      for (let i = 0; i < tn; i++) {
        const tx = i * (tw + tgap)
        prims.push(rect(tx, ty, tw, thumbH - 6, i === active ? { strokeWidth: 2, fill: "shade", fillColor: "faint" } : { fill: "shade", fillColor: "faint" }))
        if (Math.min(tw, thumbH - 6) > 30) {
          prims.push(...icon("image", tx + tw / 2, ty + (thumbH - 6) / 2, 16, { stroke: "faint" }))
        }
      }
    }
    return prims
  },
}

// -- kbd --------------------------------------------------------------------

export const kbdDef: ComponentDef = {
  kind: "kbd",
  name: "Keyboard keys",
  category: "components",
  group: "Display",
  keywords: ["shortcut", "hotkey", "keycap", "command", "kbd"],
  size: { w: 90, h: 30 },
  defaults: { keys: "⌘, K", plus: false },
  controls: [
    { key: "keys", label: "Keys (comma-sep)", type: "text" },
    { key: "plus", label: "Show +", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const keys = list(p, "keys", "⌘, K")
    const plus = bool(p, "plus")
    const kh = Math.min(h, 32)
    const y = (h - kh) / 2
    const fs = clamp(kh * 0.46, 9, 15)
    const sep = plus ? 16 : 6
    const widths = keys.map((k) => Math.max(kh * 0.9, advance(k, fs) + 14))
    let total = sep * (keys.length - 1)
    for (const kw of widths) total += kw
    const scale = total > w ? w / total : 1
    let x = Math.max(0, (w - total * scale) / 2)
    const prims: Prim[] = []
    keys.forEach((k, i) => {
      const kw = widths[i] * scale
      prims.push(rect(x, y, kw, kh))
      prims.push(line(x + 3, y + kh - 3, x + kw - 3, y + kh - 3, { stroke: "faint" }))
      prims.push(text(x + kw / 2, y + kh / 2 + fs * 0.35, truncate(k, fs, kw - 6), fs, { align: "center" }))
      x += kw
      if (i < keys.length - 1) {
        if (plus) prims.push(text(x + sep * scale / 2, y + kh / 2 + fs * 0.35, "+", fs, { align: "center", color: "muted" }))
        x += sep * scale
      }
    })
    return prims
  },
}

// -- timeline ---------------------------------------------------------------

export const timelineDef: ComponentDef = {
  kind: "timeline",
  name: "Timeline",
  category: "components",
  group: "Display",
  keywords: ["activity", "history", "steps", "feed", "events"],
  size: { w: 260, h: 190 },
  defaults: { labels: "Order placed, Packed, In transit, Delivered", count: 4, done: 2, times: true },
  controls: [
    { key: "labels", label: "Events (comma-sep)", type: "text" },
    { key: "count", label: "Events", type: "number", min: 2, max: 8, quick: true },
    { key: "done", label: "Completed", type: "number", min: 0, max: 8, quick: true },
    { key: "times", label: "Timestamps", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "Order placed, Packed, In transit, Delivered")
    const n = clamp(Math.round(num(p, "count", 4)), 2, 8)
    const done = clamp(Math.round(num(p, "done", 2)), 0, n)
    const times = bool(p, "times")
    const rowH = h / n
    const railX = 9
    const prims: Prim[] = [line(railX, rowH / 2, railX, h - rowH / 2, { stroke: "faint" })]
    const timeW = times ? clamp(w * 0.2, 34, 56) : 0
    const stamps = ["2m", "1h", "3h", "1d", "2d", "4d", "1w", "2w"]
    for (let i = 0; i < n; i++) {
      const cy = i * rowH + rowH / 2
      const isDone = i < done
      prims.push(ellipse(railX - 6, cy - 6, 12, 12, isDone ? { fill: "solid", fillColor: "ink" } : PAPER_FILL))
      if (!isDone) prims.push(ellipse(railX - 6, cy - 6, 12, 12, { stroke: "muted" }))
      const tx = railX + 16
      const tw = Math.max(20, w - tx - timeW - 6)
      const showSub = rowH > 34
      prims.push(text(tx, showSub ? cy - 1 : mid(cy - rowH / 2, rowH, 14), truncate(pick(labels, i), 14, tw), 14, { bold: isDone }))
      if (showSub) prims.push(line(tx, cy + 13, tx + tw * 0.6, cy + 13, { stroke: "muted", strokeWidth: 1.1 }))
      if (times) prims.push(text(w, showSub ? cy - 1 : mid(cy - rowH / 2, rowH, 11), pick(stamps, i), 11, { align: "right", color: "muted" }))
    }
    return prims
  },
}

// -- tree view --------------------------------------------------------------

const TREE_ROWS: { d: number; folder: boolean; open: boolean; name: string }[] = [
  { d: 0, folder: true, open: true, name: "app" },
  { d: 1, folder: true, open: true, name: "components" },
  { d: 2, folder: false, open: false, name: "button.tsx" },
  { d: 2, folder: false, open: false, name: "card.tsx" },
  { d: 1, folder: false, open: false, name: "page.tsx" },
  { d: 0, folder: true, open: false, name: "lib" },
  { d: 0, folder: true, open: true, name: "hooks" },
  { d: 1, folder: false, open: false, name: "use-toast.ts" },
  { d: 0, folder: false, open: false, name: "README.md" },
  { d: 0, folder: false, open: false, name: "package.json" },
]

const TREE_NAMES = TREE_ROWS.map((r) => r.name).join(", ")

export const treeViewDef: ComponentDef = {
  kind: "tree-view",
  name: "Tree view",
  category: "components",
  group: "Display",
  keywords: ["file", "folder", "explorer", "nested", "sidebar", "directory"],
  size: { w: 220, h: 190 },
  defaults: { names: TREE_NAMES, count: 8, selected: 3 },
  controls: [
    { key: "names", label: "Rows (comma-sep)", type: "text" },
    { key: "count", label: "Rows", type: "number", min: 3, max: 10, quick: true },
    { key: "selected", label: "Selected", type: "number", min: 0, max: 10, quick: true },
  ],
  render(p, w, h) {
    const names = list(p, "names", TREE_NAMES)
    const n = clamp(Math.round(num(p, "count", 8)), 3, 10)
    const selected = clamp(Math.round(num(p, "selected", 3)), 0, n) - 1
    const rowH = clamp(h / n, 16, 30)
    const indent = clamp(w * 0.07, 10, 16)
    const fs = clamp(rowH * 0.5, 10, 13)
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const r = TREE_ROWS[i % TREE_ROWS.length]
      const name = names[i] ?? r.name
      const folder = !name.includes(".")
      const y = i * rowH
      if (y + rowH > h + 1) break
      if (i === selected) prims.push(rect(0, y + 1, w, rowH - 2, FAINT_FILL))
      let ix = 2 + r.d * indent
      if (folder) prims.push(...icon(r.open ? "caret-down" : "caret-right", ix + 5, y + rowH / 2, 9, { stroke: "muted" }))
      ix += 13
      prims.push(...icon(folder ? "folder" : "file-text", ix + 7, y + rowH / 2, clamp(rowH * 0.55, 10, 14), {
        stroke: folder ? "ink" : "muted",
      }))
      const tx = ix + 17
      prims.push(text(tx, mid(y, rowH, fs), truncate(name, fs, Math.max(8, w - tx - 6)), fs, { bold: folder }))
    }
    return prims
  },
}

// -- list item --------------------------------------------------------------

export const listItemDef: ComponentDef = {
  kind: "list-item",
  name: "List item",
  category: "components",
  group: "Display",
  keywords: ["row", "cell", "setting", "contact", "workhorse"],
  size: { w: 300, h: 64 },
  defaults: {
    title: "Ada Lovelace",
    subtitle: "Updated 2 hours ago",
    showSubtitle: true,
    leading: "avatar",
    icon: "folder",
    trailing: "chevron",
    trailingText: "",
    divider: true,
  },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "subtitle", label: "Subtitle", type: "text" },
    { key: "showSubtitle", label: "Subtitle", type: "toggle", quick: true },
    { key: "leading", label: "Leading", type: "select", options: ["avatar", "icon", "none"], quick: true },
    { key: "trailing", label: "Trailing", type: "select", options: ["chevron", "switch", "badge", "button", "meta", "none"], quick: true },
    { key: "trailingText", label: "Trailing text", type: "text" },
    { key: "icon", label: "Icon", type: "icon", visibleWhen: { key: "leading", equals: "icon" } },
    { key: "divider", label: "Divider", type: "toggle" },
  ],
  render(p, w, h) {
    const leading = str(p, "leading", "avatar")
    const trailing = str(p, "trailing", "chevron")
    const tl = str(p, "trailingText", "")
    const showSub = bool(p, "showSubtitle") && h > 44
    const padX = 12
    const prims: Prim[] = []
    let x = padX
    if (leading !== "none") {
      const d = clamp(Math.min(h - 14, 44), 18, 44)
      const ly = (h - d) / 2
      if (leading === "avatar") {
        prims.push(ellipse(x, ly, d, d))
        prims.push(...icon("user", x + d / 2, h / 2, d * 0.5, { stroke: "muted" }))
      } else {
        prims.push(rect(x, ly, d, d, { stroke: "muted" }))
        prims.push(...icon(str(p, "icon", "folder"), x + d / 2, h / 2, d * 0.5))
      }
      x += d + 12
    }
    let right = w - padX
    if (trailing === "chevron") {
      prims.push(...icon("caret-right", right - 6, h / 2, 13, { stroke: "muted" }))
      right -= 22
    } else if (trailing === "switch") {
      const tw = 40
      const th = 22
      const ty = (h - th) / 2
      prims.push(rect(right - tw, ty, tw, th, INK_FILL))
      prims.push(ellipse(right - 3 - (th - 6), ty + 3, th - 6, th - 6, PAPER_FILL))
      prims.push(ellipse(right - 3 - (th - 6), ty + 3, th - 6, th - 6))
      right -= tw + 10
    } else if (trailing === "badge") {
      const label = tl || "New"
      const bw = clamp(advance(label, 11) + 18, 44, Math.max(44, right - x - 40))
      const bh = 20
      prims.push(pill(right - bw, (h - bh) / 2, bw, bh))
      prims.push(text(right - bw / 2, h / 2 + 4, truncate(label, 11, bw - 10), 11, { align: "center" }))
      right -= bw + 10
    } else if (trailing === "button") {
      const label = tl || "Open"
      const bw = clamp(advance(label, 12) + 22, 64, Math.max(64, right - x - 40))
      const bh = Math.min(30, h - 12)
      prims.push(rect(right - bw, (h - bh) / 2, bw, bh))
      prims.push(text(right - bw / 2, h / 2 + 4, truncate(label, 12, bw - 10), 12, { align: "center" }))
      right -= bw + 10
    } else if (trailing === "meta") {
      const label = tl || "2h"
      prims.push(text(right, h / 2 + 4, truncate(label, 11, Math.max(20, right - x - 30)), 11, { align: "right", color: "muted" }))
      right -= Math.max(30, advance(label, 11) + 10)
    }
    const tw = Math.max(24, right - x - 6)
    const ts = clamp(h * 0.24, 12, 16)
    if (showSub) {
      prims.push(text(x, h / 2 - 3, truncate(str(p, "title", "Ada Lovelace"), ts, tw), ts, { bold: true }))
      prims.push(text(x, h / 2 + 15, truncate(str(p, "subtitle", ""), 12, tw), 12, { color: "muted" }))
    } else {
      prims.push(text(x, mid(0, h, ts), truncate(str(p, "title", "Ada Lovelace"), ts, tw), ts, { bold: true }))
    }
    if (bool(p, "divider")) prims.push(line(0, h - 0.5, w, h - 0.5, { stroke: "faint" }))
    return prims
  },
}

// -- code block -------------------------------------------------------------

export const codeBlockDef: ComponentDef = {
  kind: "code-block",
  name: "Code block",
  category: "components",
  group: "Display",
  keywords: ["snippet", "terminal", "mono", "syntax", "copy"],
  size: { w: 320, h: 180 },
  defaults: { lines: 7, header: true, numbers: true, filename: "app/page.tsx" },
  controls: [
    { key: "lines", label: "Lines", type: "number", min: 2, max: 12, quick: true },
    { key: "header", label: "Header bar", type: "toggle", quick: true },
    { key: "numbers", label: "Line numbers", type: "toggle", quick: true },
    { key: "filename", label: "Filename", type: "text" },
  ],
  render(p, w, h) {
    const n = clamp(Math.round(num(p, "lines", 7)), 2, 12)
    const header = bool(p, "header")
    const numbers = bool(p, "numbers")
    const headH = header ? Math.min(30, h * 0.28) : 0
    const prims: Prim[] = []
    if (header) {
      prims.push(rect(1.5, 1.5, w - 3, headH, FAINT_FILL))
      prims.push(...icon("code", 16, headH / 2 + 1, 13, { stroke: "muted" }))
      prims.push(text(30, mid(0, headH + 2, 12), truncate(str(p, "filename", ""), 12, Math.max(10, w - 76)), 12, { color: "muted" }))
      prims.push(...icon("copy", w - 18, headH / 2 + 1, 14, { stroke: "muted" }))
    }
    prims.push(rect(0, 0, w, h))
    if (header) prims.push(line(0, headH, w, headH, { stroke: "faint" }))
    const gutter = numbers ? 28 : 0
    if (numbers) prims.push(line(gutter, headH, gutter, h, { stroke: "faint" }))
    const bodyTop = headH + 8
    const rowH = clamp((h - bodyTop - 8) / n, 11, 22)
    const indents = [0, 1, 2, 2, 1, 2, 3, 2, 1, 0, 1, 0]
    const segs: number[][] = [[0.34, 0.3], [0.26], [0.44, 0.18], [0.3, 0.24], [0.2], [0.38], [0.26, 0.3], [0.42]]
    const codeW = Math.max(20, w - gutter - 26)
    for (let i = 0; i < n; i++) {
      const y = bodyTop + i * rowH + rowH / 2
      if (y > h - 6) break
      if (numbers) prims.push(text(gutter - 8, y + 3.5, String(i + 1), 10, { align: "right", color: "faint" }))
      let sx = gutter + 12 + (indents[i % indents.length] ?? 0) * clamp(codeW * 0.06, 8, 14)
      const parts = segs[i % segs.length]
      parts.forEach((f, j) => {
        const lw = Math.max(6, codeW * f)
        if (sx + lw > w - 12) return
        prims.push(line(sx, y, sx + lw, y, { stroke: j === 0 ? "ink" : "muted", strokeWidth: j === 0 ? 1.6 : 1.2 }))
        sx += lw + 8
      })
    }
    return prims
  },
}

// -- calendar ---------------------------------------------------------------

export const calendarDef: ComponentDef = {
  kind: "calendar",
  name: "Calendar",
  category: "components",
  group: "Display",
  keywords: ["month", "date", "days", "grid", "schedule"],
  size: { w: 260, h: 240 },
  defaults: { month: "March 2026", selected: 14, offset: 3, events: true },
  controls: [
    { key: "month", label: "Month", type: "text" },
    { key: "selected", label: "Selected day", type: "number", min: 1, max: 31, quick: true },
    { key: "events", label: "Event dots", type: "toggle", quick: true },
    { key: "offset", label: "Start offset", type: "number", min: 0, max: 6 },
  ],
  render(p, w, h) {
    const headH = clamp(h * 0.14, 22, 34)
    const wkH = clamp(h * 0.09, 14, 22)
    const gridTop = headH + wkH
    const rows = 5
    const cellW = w / 7
    const cellH = Math.max(10, (h - gridTop) / rows)
    const hs = clamp(headH * 0.44, 11, 15)
    const prims: Prim[] = [
      text(w / 2, mid(0, headH, hs), truncate(str(p, "month", "March 2026"), hs, w - 60), hs, { align: "center", bold: true }),
    ]
    prims.push(...icon("caret-left", 12, headH / 2, 11, { stroke: "muted" }))
    prims.push(...icon("caret-right", w - 12, headH / 2, 11, { stroke: "muted" }))
    const wd = ["S", "M", "T", "W", "T", "F", "S"]
    const ws = clamp(wkH * 0.55, 8, 11)
    for (let c = 0; c < 7; c++) {
      prims.push(text(c * cellW + cellW / 2, mid(headH, wkH, ws), wd[c], ws, { align: "center", color: "muted" }))
    }
    prims.push(line(0, gridTop, w, gridTop, { stroke: "faint" }))
    const offset = clamp(Math.round(num(p, "offset", 3)), 0, 6)
    const sel = clamp(Math.round(num(p, "selected", 14)), 1, 31)
    const events = bool(p, "events")
    const eventDays = [3, 9, 14, 21, 26]
    const fs = clamp(Math.min(cellW, cellH) * 0.42, 8, 14)
    for (let idx = 0; idx < rows * 7; idx++) {
      const day = idx - offset + 1
      if (day < 1 || day > 31) continue
      const cx = (idx % 7) * cellW + cellW / 2
      const cy = gridTop + Math.floor(idx / 7) * cellH + cellH / 2 - (events ? cellH * 0.08 : 0)
      if (day === sel) {
        const d = Math.min(cellW, cellH) * 0.78
        prims.push(ellipse(cx - d / 2, cy - d / 2, d, d, { fill: "solid", fillColor: "faint", strokeWidth: 1.8 }))
      }
      prims.push(text(cx, cy + fs * 0.35, String(day), fs, { align: "center", bold: day === sel }))
      if (events && eventDays.indexOf(day) !== -1 && cellH > 22) {
        prims.push(ellipse(cx - 2, cy + cellH * 0.3, 4, 4, { fill: "solid", fillColor: "muted", stroke: "muted" }))
      }
    }
    return prims
  },
}

// ===========================================================================
// Feedback
// ===========================================================================

// -- skeleton ---------------------------------------------------------------

export const skeletonDef: ComponentDef = {
  kind: "skeleton",
  name: "Skeleton",
  category: "components",
  group: "Feedback",
  keywords: ["loading", "shimmer", "placeholder", "ghost", "bones"],
  size: { w: 260, h: 120 },
  defaults: { variant: "lines", count: 3 },
  controls: [
    { key: "variant", label: "Variant", type: "select", options: ["lines", "card", "list"], quick: true },
    { key: "count", label: "Items", type: "number", min: 1, max: 8, quick: true },
  ],
  render(p, w, h) {
    const variant = str(p, "variant", "lines")
    const n = clamp(Math.round(num(p, "count", 3)), 1, 8)
    const bar = (x: number, y: number, bw: number, bh: number): Prim => rect(x, y, Math.max(4, bw), Math.max(4, bh), FAINT_FILL)
    const prims: Prim[] = []
    if (variant === "card") {
      const imgH = clamp(h * 0.56, 30, Math.max(30, h - 14 - n * 9))
      prims.push(bar(0, 0, w, imgH))
      const rest = Math.max(9, h - imgH - 14)
      // never more bars than the leftover strip can space out, or they'd stack on each other
      const rows = clamp(Math.floor(rest / 5), 1, n)
      const step = rest / rows
      const bh = clamp(step - Math.min(8, step * 0.35), 4, 14)
      const widths = [0.92, 0.76, 0.5, 0.84, 0.66, 0.9, 0.58, 0.8]
      for (let i = 0; i < rows; i++) {
        const y = imgH + 14 + i * step
        if (y + bh > h + 1) break
        prims.push(bar(0, y, w * widths[i % widths.length], bh))
      }
      return prims
    }
    if (variant === "list") {
      const rowH = h / n
      for (let i = 0; i < n; i++) {
        const y = i * rowH
        const d = clamp(Math.min(rowH - 10, 38), 12, 38)
        prims.push(ellipse(0, y + (rowH - d) / 2, d, d, FAINT_FILL))
        const bx = d + 12
        const bh = clamp(rowH * 0.18, 6, 11)
        prims.push(bar(bx, y + rowH / 2 - bh - 4, (w - bx) * 0.72, bh))
        prims.push(bar(bx, y + rowH / 2 + 4, (w - bx) * 0.45, bh))
      }
      return prims
    }
    const gap = clamp(h * 0.08, 6, 14)
    const bh = clamp((h - gap * (n - 1)) / n, 6, 20)
    const widths = [0.95, 0.82, 0.9, 0.7, 0.88, 0.76, 0.92, 0.6]
    for (let i = 0; i < n; i++) {
      const y = i * (bh + gap)
      if (y + bh > h + 1) break
      const frac = i === n - 1 ? 0.55 : widths[i % widths.length]
      prims.push(bar(0, y, w * frac, bh))
    }
    return prims
  },
}

// -- spinner ----------------------------------------------------------------

export const spinnerDef: ComponentDef = {
  kind: "spinner",
  name: "Spinner",
  category: "components",
  group: "Feedback",
  keywords: ["loading", "busy", "wait", "progress", "throbber"],
  size: { w: 64, h: 64 },
  defaults: { style: "ring", showLabel: false, label: "Loading…" },
  controls: [
    { key: "style", label: "Style", type: "select", options: ["ring", "dots"], quick: true },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "label", label: "Label", type: "text" },
  ],
  render(p, w, h) {
    const showLabel = bool(p, "showLabel")
    const labelH = showLabel ? 20 : 0
    const stageH = Math.max(16, h - labelH)
    const d = Math.max(10, Math.min(w, stageH) * 0.76)
    const cx = w / 2
    const cy = stageH / 2
    const prims: Prim[] = []
    if (str(p, "style", "ring") === "ring") {
      prims.push(ellipse(cx - d / 2, cy - d / 2, d, d, { stroke: "faint", strokeWidth: 2 }))
      const pts: [number, number][] = []
      for (let a = -95; a <= 95; a += 14) {
        const rad = (a * Math.PI) / 180
        pts.push([cx + Math.cos(rad) * (d / 2), cy + Math.sin(rad) * (d / 2)])
      }
      prims.push(poly(pts, false, { strokeWidth: 2.6, roughness: 0.6 }))
    } else {
      const k = 8
      const dd = Math.max(3, d * 0.17)
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 - Math.PI / 2
        const shade = i < 3 ? "ink" : i < 5 ? "muted" : "faint"
        prims.push(
          ellipse(cx + Math.cos(a) * (d / 2) - dd / 2, cy + Math.sin(a) * (d / 2) - dd / 2, dd, dd, {
            fill: "solid",
            fillColor: shade,
            stroke: shade,
          })
        )
      }
    }
    if (showLabel) {
      prims.push(text(w / 2, h - 5, truncate(str(p, "label", "Loading…"), 12, w), 12, { align: "center", color: "muted" }))
    }
    return prims
  },
}

// ===========================================================================
// Cards
// ===========================================================================

// -- stat card --------------------------------------------------------------

export const cardStatDef: ComponentDef = {
  kind: "card-stat",
  name: "Stat card",
  category: "components",
  group: "Display",
  keywords: ["kpi", "metric", "number", "dashboard", "card"],
  size: { w: 230, h: 124 },
  defaults: {
    label: "Monthly revenue",
    value: "$12,480",
    // unsigned on purpose — the Trend control signs it, so the arrow and the
    // number can't disagree. Type your own "+" or "-" and that wins.
    delta: "12.5%",
    period: "vs last month",
    trend: "up",
    showIcon: true,
    icon: "currency-dollar",
    spark: true,
  },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "value", label: "Value", type: "text" },
    { key: "delta", label: "Delta", type: "text" },
    { key: "period", label: "Period", type: "text" },
    { key: "trend", label: "Trend", type: "select", options: ["up", "down", "flat"], quick: true },
    { key: "showIcon", label: "Icon", type: "toggle", quick: true },
    {
      key: "icon",
      label: "Icon",
      type: "icon",
      visibleWhen: { key: "showIcon", equals: true },
    },
    { key: "spark", label: "Sparkline", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const pad = clamp(w * 0.07, 12, 18)
    const prims: Prim[] = [rect(0, 0, w, h)]
    const showIcon = bool(p, "showIcon") && w > 150
    prims.push(text(pad, pad + 12, truncate(str(p, "label", ""), 12, Math.max(10, w - pad * 2 - (showIcon ? 34 : 0))), 12, { color: "muted" }))
    if (showIcon) {
      const d = 26
      prims.push(rect(w - pad - d, pad, d, d, { stroke: "faint" }))
      prims.push(...icon(str(p, "icon", "currency-dollar"), w - pad - d / 2, pad + d / 2, 14, { stroke: "muted" }))
    }
    const vs = clamp(h * 0.26, 18, 34)
    const vy = pad + 18 + vs
    prims.push(text(pad, vy, truncate(str(p, "value", "$12,480"), vs, w - pad * 2), vs, { bold: true }))
    const spark = bool(p, "spark") && w > 170
    const dy = Math.min(h - pad - 2, vy + 22)
    if (dy > vy + 12) {
      const trend = str(p, "trend", "up")
      const delta = signDelta(str(p, "delta", "12.5%"), trend)
      prims.push(...icon(trendIcon(trend), pad + 6, dy - 4, 12))
      prims.push(text(pad + 18, dy, truncate(delta, 12, w * 0.4), 12, { bold: true }))
      const px = pad + 18 + advance(delta, 12) + 10
      const periodW = w - pad - px - (spark ? w * 0.3 : 0)
      if (periodW > 26)
        prims.push(text(px, dy, truncate(str(p, "period", "vs last month"), 12, periodW), 12, { color: "muted" }))
      if (spark) {
        const sw = w * 0.26
        const sx = w - pad - sw
        const sh = 20
        const vals = sparkVals(trend)
        const pts: [number, number][] = vals.map((v, i) => [sx + (sw / (vals.length - 1)) * i, dy - 12 + sh * v])
        prims.push(poly(pts, false, { strokeWidth: 1.6, stroke: "muted", roughness: 1.4 }))
      }
    }
    return prims
  },
}

// -- profile card -----------------------------------------------------------

export const cardProfileDef: ComponentDef = {
  kind: "card-profile",
  name: "Profile card",
  category: "components",
  group: "Display",
  keywords: ["person", "user", "team", "bio", "card", "avatar"],
  size: { w: 220, h: 220 },
  defaults: { name: "Ada Lovelace", role: "Staff engineer", layout: "centered", action: true, cta: "Follow" },
  controls: [
    { key: "name", label: "Name", type: "text" },
    { key: "role", label: "Role", type: "text" },
    { key: "layout", label: "Layout", type: "select", options: ["centered", "row"], quick: true },
    { key: "action", label: "Button", type: "toggle", quick: true },
    { key: "cta", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const pad = clamp(w * 0.07, 12, 18)
    const prims: Prim[] = [rect(0, 0, w, h)]
    const name = str(p, "name", "Ada Lovelace")
    const role = str(p, "role", "Staff engineer")
    const action = bool(p, "action")
    if (str(p, "layout", "centered") === "row") {
      const d = clamp(Math.min(h - pad * 2, w * 0.24), 28, 60)
      prims.push(ellipse(pad, (h - d) / 2, d, d))
      prims.push(...icon("user", pad + d / 2, h / 2, d * 0.5, { stroke: "muted" }))
      const tx = pad + d + 14
      const bw = action ? clamp(w * 0.28, 58, 84) : 0
      const tw = Math.max(20, w - tx - bw - pad - (action ? 10 : 0))
      const ns = clamp(w * 0.07, 13, 17)
      prims.push(text(tx, h / 2 - 2, truncate(name, ns, tw), ns, { bold: true }))
      prims.push(text(tx, h / 2 + 16, truncate(role, 12, tw), 12, { color: "muted" }))
      if (action) {
        const bh = Math.min(32, h - pad * 2)
        prims.push(rect(w - pad - bw, (h - bh) / 2, bw, bh, INK_FILL))
        prims.push(text(w - pad - bw / 2, h / 2 + 4, truncate(str(p, "cta", "Follow"), 12, bw - 10), 12, { align: "center" }))
      }
      return prims
    }
    let y = pad + 4
    const d = clamp(Math.min(w * 0.32, h * 0.34), 32, 72)
    prims.push(ellipse((w - d) / 2, y, d, d))
    prims.push(...icon("user", w / 2, y + d / 2, d * 0.5, { stroke: "muted" }))
    y += d + 24
    const ns = clamp(w * 0.08, 13, 18)
    prims.push(text(w / 2, y, truncate(name, ns, w - pad * 2), ns, { align: "center", bold: true }))
    y += 18
    prims.push(text(w / 2, y, truncate(role, 12, w - pad * 2), 12, { align: "center", color: "muted" }))
    if (action) {
      const bh = 34
      const bw = Math.min(w - pad * 2, 140)
      const by = h - pad - bh
      if (by > y + 4) {
        prims.push(rect((w - bw) / 2, by, bw, bh, INK_FILL))
        prims.push(text(w / 2, by + bh / 2 + 5, truncate(str(p, "cta", "Follow"), 13, bw - 12), 13, { align: "center" }))
      }
    }
    return prims
  },
}

// -- media card -------------------------------------------------------------

export const cardMediaDef: ComponentDef = {
  kind: "card-media",
  name: "Media card",
  category: "components",
  group: "Display",
  keywords: ["image", "thumbnail", "cover", "card", "preview"],
  size: { w: 250, h: 240 },
  defaults: { title: "A weekend in the fog", badge: true, badgeLabel: "Travel", meta: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "badge", label: "Badge", type: "toggle", quick: true },
    { key: "badgeLabel", label: "Badge text", type: "text" },
    { key: "meta", label: "Meta row", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const pad = 14
    const prims: Prim[] = [rect(0, 0, w, h)]
    const imgH = clamp(h * 0.5, 40, Math.max(40, h - 74))
    prims.push(rect(0, 0, w, imgH, { fill: "shade", fillColor: "faint" }))
    prims.push(...icon("image", w / 2, imgH / 2, clamp(Math.min(w, imgH) * 0.24, 18, 46), { stroke: "muted" }))
    if (bool(p, "badge") && imgH > 40) {
      const label = str(p, "badgeLabel", "Travel")
      const bh = 20
      const bw = clamp(advance(label, 10) + 16, 34, Math.min(Math.max(34, w - pad * 2), 120))
      prims.push(pill(pad, pad, bw, bh, PAPER_FILL), pill(pad, pad, bw, bh))
      prims.push(text(pad + bw / 2, pad + bh / 2 + 4, truncate(label, 10, bw - 10), 10, { align: "center" }))
    }
    const meta = bool(p, "meta")
    const metaY = h - pad - 2
    const ts = clamp(w * 0.07, 13, 17)
    let y = imgH + pad + ts
    prims.push(text(pad, y, truncate(str(p, "title", ""), ts, w - pad * 2), ts, { bold: true }))
    y += 6
    const bodyBottom = meta ? metaY - 16 : h - pad
    const lines = clamp(Math.floor((bodyBottom - y) / 14), 0, 3)
    if (lines > 0) prims.push(...loremLines(pad, y + 10, w - pad * 2, lines, 14))
    if (meta) {
      prims.push(...icon("clock", pad + 6, metaY - 4, 12, { stroke: "muted" }))
      prims.push(text(pad + 18, metaY, "4 min read", 11, { color: "muted" }))
      const dx = pad + 18 + advance("4 min read", 11) + 8
      if (dx + 40 < w - pad) {
        prims.push(ellipse(dx, metaY - 5, 3, 3, { fill: "solid", fillColor: "muted", stroke: "muted" }))
        prims.push(text(dx + 10, metaY, truncate("Mar 4", 11, w - pad - dx - 12), 11, { color: "muted" }))
      }
    }
    return prims
  },
}

// -- pricing card -----------------------------------------------------------

export const cardPricingDef: ComponentDef = {
  kind: "card-pricing",
  name: "Pricing card",
  category: "components",
  group: "Display",
  keywords: ["plan", "tier", "price", "subscribe", "card", "billing"],
  size: { w: 220, h: 300 },
  defaults: { tier: "Pro", price: "$24", period: "/mo", features: 4, popular: true, cta: "Start free" },
  controls: [
    { key: "tier", label: "Tier", type: "text" },
    { key: "price", label: "Price", type: "text" },
    { key: "period", label: "Period", type: "text" },
    { key: "features", label: "Features", type: "number", min: 1, max: 6, quick: true },
    { key: "popular", label: "Popular", type: "toggle", quick: true },
    { key: "cta", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const popular = bool(p, "popular")
    const pad = clamp(w * 0.08, 14, 20)
    const prims: Prim[] = [rect(0, 0, w, h, popular ? { strokeWidth: 2 } : {})]
    let y = pad + 12
    prims.push(text(pad, y, truncate(str(p, "tier", "Pro"), 13, w * 0.5), 13, { bold: true }))
    if (popular && w > 150) {
      const bw = 58
      const bh = 20
      prims.push(pill(w - pad - bw, y - 14, bw, bh, FAINT_FILL))
      prims.push(text(w - pad - bw / 2, y + 1, "Popular", 10, { align: "center", color: "muted" }))
    }
    const ps = clamp(w * 0.16, 20, 40)
    y += ps + 6
    const price = truncate(str(p, "price", "$24"), ps, Math.max(10, w - pad * 2 - 26))
    prims.push(text(pad, y, price, ps, { bold: true }))
    const px = pad + advance(price, ps) + 8
    prims.push(text(px, y, truncate(str(p, "period", "/mo"), 12, Math.max(8, w - pad - px)), 12, { color: "muted" }))
    y += 16
    prims.push(line(pad, y, w - pad, y, { stroke: "faint" }))
    const ctaH = clamp(h * 0.12, 30, 40)
    const featTop = y + 14
    const featBottom = h - pad - ctaH - 12
    const nf = clamp(Math.round(num(p, "features", 4)), 1, 6)
    const avail = Math.max(0, featBottom - featTop)
    const fh = Math.min(26, avail / nf)
    for (let i = 0; i < nf; i++) {
      const fy = featTop + i * fh + fh / 2
      if (fy > featBottom) break
      prims.push(...icon("check", pad + 6, fy, 12))
      prims.push(line(pad + 20, fy, w - pad, fy, { stroke: "muted", strokeWidth: 1.2 }))
    }
    const by = h - pad - ctaH
    prims.push(rect(pad, by, w - pad * 2, ctaH, popular ? INK_FILL : {}))
    prims.push(
      text(w / 2, by + ctaH / 2 + 5, truncate(str(p, "cta", "Start free"), 14, w - pad * 2 - 12), 14, {
        align: "center",
        bold: true,
      })
    )
    return prims
  },
}

// -- testimonial card -------------------------------------------------------

export const cardTestimonialDef: ComponentDef = {
  kind: "card-testimonial",
  name: "Testimonial card",
  category: "components",
  group: "Display",
  keywords: ["quote", "review", "praise", "social proof", "card"],
  size: { w: 280, h: 190 },
  defaults: { name: "Ada Lovelace", role: "Staff engineer, Acme", stars: true },
  controls: [
    { key: "name", label: "Name", type: "text" },
    { key: "role", label: "Role", type: "text" },
    { key: "stars", label: "Stars", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const pad = clamp(w * 0.06, 14, 20)
    const prims: Prim[] = [rect(0, 0, w, h)]
    prims.push(...icon("quotes", pad + 11, pad + 10, 22, { stroke: "faint" }))
    if (bool(p, "stars") && w > 200) {
      const sd = 12
      for (let i = 0; i < 5; i++) {
        prims.push(...icon("star", w - pad - 6 - i * (sd + 3), pad + 10, sd))
      }
    }
    const footH = 46
    const bodyTop = pad + 26
    const lines = clamp(Math.floor((h - bodyTop - footH - pad) / 16), 1, 5)
    prims.push(...loremLines(pad, bodyTop + 10, w - pad * 2, lines, 16))
    const d = Math.min(34, h * 0.2)
    const fy = h - pad - d
    prims.push(ellipse(pad, fy, d, d))
    prims.push(...icon("user", pad + d / 2, fy + d / 2, d * 0.5, { stroke: "muted" }))
    const tx = pad + d + 12
    const tw = Math.max(20, w - tx - pad)
    prims.push(text(tx, fy + d / 2 - 1, truncate(str(p, "name", ""), 13, tw), 13, { bold: true }))
    prims.push(text(tx, fy + d / 2 + 14, truncate(str(p, "role", ""), 11, tw), 11, { color: "muted" }))
    return prims
  },
}

// -- product card -----------------------------------------------------------

export const cardProductDef: ComponentDef = {
  kind: "card-product",
  name: "Product card",
  category: "components",
  group: "Display",
  keywords: ["shop", "commerce", "buy", "price", "cart", "card"],
  size: { w: 220, h: 270 },
  defaults: { title: "Squig Tote", price: "$28", badge: true, badgeLabel: "Sale", rating: true, cta: "icon", ctaLabel: "Add to cart" },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "price", label: "Price", type: "text" },
    { key: "badge", label: "Badge", type: "toggle", quick: true },
    { key: "badgeLabel", label: "Badge text", type: "text" },
    { key: "rating", label: "Rating", type: "toggle", quick: true },
    { key: "cta", label: "Action", type: "select", options: ["icon", "button"], quick: true },
    { key: "ctaLabel", label: "Button label", type: "text" },
  ],
  render(p, w, h) {
    const pad = 14
    const prims: Prim[] = [rect(0, 0, w, h)]
    const imgH = clamp(h * 0.48, 40, Math.max(40, h - 92))
    prims.push(rect(0, 0, w, imgH, { fill: "shade", fillColor: "faint" }))
    prims.push(...icon("image", w / 2, imgH / 2, clamp(Math.min(w, imgH) * 0.24, 18, 46), { stroke: "muted" }))
    if (bool(p, "badge") && imgH > 40) {
      const bl = str(p, "badgeLabel", "Sale")
      const maxBw = Math.max(24, w - pad * 2)
      const bw = clamp(advance(bl, 10) + 20, Math.min(46, maxBw), maxBw)
      const bh = 20
      prims.push(pill(pad, pad, bw, bh, PAPER_FILL), pill(pad, pad, bw, bh))
      prims.push(text(pad + bw / 2, pad + bh / 2 + 4, truncate(bl, 10, bw - 10), 10, { align: "center" }))
    }
    let y = imgH + pad + 12
    prims.push(text(pad, y, truncate(str(p, "title", ""), 15, w - pad * 2), 15, { bold: true }))
    y += 8
    if (bool(p, "rating")) {
      const sd = 11
      for (let i = 0; i < 5; i++) prims.push(...icon("star", pad + 5 + i * (sd + 2), y + 6, sd, { stroke: i < 4 ? "ink" : "faint" }))
      prims.push(text(pad + 5 + 5 * (sd + 2) + 6, y + 10, "(24)", 10, { color: "muted" }))
      y += 16
    }
    const btnD = clamp(h * 0.14, 28, 38)
    const by = h - pad - btnD
    const ps = clamp(w * 0.08, 14, 18)
    const iconCta = str(p, "cta", "icon") === "icon"
    const priceW = iconCta ? w - pad * 2 - btnD - 10 : w * 0.4
    prims.push(text(pad, by + btnD / 2 + ps * 0.35, truncate(str(p, "price", "$28"), ps, Math.max(10, priceW)), ps, { bold: true }))
    if (iconCta) {
      prims.push(rect(w - pad - btnD, by, btnD, btnD, INK_FILL))
      prims.push(...icon("shopping-cart", w - pad - btnD / 2, by + btnD / 2, btnD * 0.44))
    } else {
      const bw = Math.min(w - pad * 2 - priceW - 8, 116)
      prims.push(rect(w - pad - bw, by, bw, btnD, INK_FILL))
      prims.push(
        text(w - pad - bw / 2, by + btnD / 2 + 4, truncate(str(p, "ctaLabel", "Add to cart"), 12, bw - 10), 12, {
          align: "center",
        })
      )
    }
    return prims
  },
}

// -- blog card --------------------------------------------------------------

export const cardBlogDef: ComponentDef = {
  kind: "card-blog",
  name: "Blog card",
  category: "components",
  group: "Display",
  keywords: ["article", "post", "author", "tag", "card", "read"],
  size: { w: 260, h: 280 },
  defaults: { title: "Why wireframes should look unfinished", tag: "Design", author: "Pablo S.", image: true, footer: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "tag", label: "Tag", type: "text" },
    { key: "author", label: "Author", type: "text" },
    { key: "image", label: "Image", type: "toggle", quick: true },
    { key: "footer", label: "Byline", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const pad = clamp(w * 0.06, 14, 18)
    const prims: Prim[] = [rect(0, 0, w, h)]
    const showImage = bool(p, "image")
    const showFooter = bool(p, "footer")
    let y = pad + 8
    if (showImage) {
      const imgH = clamp(h * 0.38, 40, Math.max(40, h - 130))
      prims.push(rect(0, 0, w, imgH, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", w / 2, imgH / 2, clamp(Math.min(w, imgH) * 0.26, 18, 44), { stroke: "muted" }))
      y = imgH + pad + 8
    }
    const tagText = str(p, "tag", "Design").trim()
    if (tagText) {
      const tw = Math.min(w - pad * 2, advance(tagText, 10) + 18)
      prims.push(pill(pad, y - 13, tw, 20, { stroke: "muted" }))
      prims.push(text(pad + tw / 2, y + 1, truncate(tagText, 10, Math.max(6, tw - 14)), 10, { align: "center", color: "muted" }))
      y += 24
    }
    const ts = clamp(w * 0.07, 13, 18)
    prims.push(text(pad, y, truncate(str(p, "title", ""), ts, w - pad * 2), ts, { bold: true }))
    y += 8
    const d = 26
    const footY = h - pad - d
    const bodyBottom = showFooter ? footY : h - pad
    const lines = clamp(Math.floor((bodyBottom - y - 12) / 14), 0, 5)
    if (lines > 0) prims.push(...loremLines(pad, y + 12, w - pad * 2, lines, 14))
    if (showFooter) {
      prims.push(ellipse(pad, footY, d, d))
      prims.push(...icon("user", pad + d / 2, footY + d / 2, d * 0.5, { stroke: "muted" }))
      const ax = pad + d + 10
      const aw = Math.max(20, w - ax - pad)
      prims.push(text(ax, footY + 11, truncate(str(p, "author", ""), 12, aw), 12, { bold: true }))
      prims.push(text(ax, footY + 25, truncate("Mar 4 · 6 min read", 10, aw), 10, { color: "muted" }))
    }
    return prims
  },
}

// -- notification card ------------------------------------------------------

export const cardNotificationDef: ComponentDef = {
  kind: "card-notification",
  name: "Notification card",
  category: "components",
  group: "Display",
  keywords: ["alert", "inbox", "activity", "message", "card", "unread"],
  size: { w: 320, h: 140 },
  defaults: { title: "Ada invited you to Squig", icon: "user-plus", actions: true, unread: true, timestamp: "2m" },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "actions", label: "Actions", type: "toggle", quick: true },
    { key: "unread", label: "Unread", type: "toggle", quick: true },
    { key: "timestamp", label: "Timestamp", type: "text" },
  ],
  render(p, w, h) {
    const pad = 14
    const prims: Prim[] = [rect(0, 0, w, h)]
    if (bool(p, "unread")) prims.push(rect(0, 2, 4, h - 4, { fill: "solid", fillColor: "ink", stroke: "ink" }))
    const d = clamp(Math.min(h * 0.26, 34), 22, 34)
    prims.push(ellipse(pad, pad, d, d, { stroke: "muted" }))
    prims.push(...icon(str(p, "icon", "bell"), pad + d / 2, pad + d / 2, d * 0.5))
    const tx = pad + d + 12
    const stamp = truncate(str(p, "timestamp", "2m"), 11, Math.max(10, w * 0.3))
    const stampW = advance(stamp, 11) + 10
    prims.push(text(tx, pad + 14, truncate(str(p, "title", ""), 14, Math.max(20, w - tx - pad - stampW)), 14, { bold: true }))
    prims.push(text(w - pad, pad + 13, stamp, 11, { align: "right", color: "muted" }))
    const actions = bool(p, "actions")
    const actH = actions ? 38 : 0
    const bodyTop = pad + 24
    const lines = clamp(Math.floor((h - bodyTop - actH - pad) / 14), 1, 3)
    prims.push(...loremLines(tx, bodyTop + 12, Math.max(30, w - tx - pad), lines, 14))
    if (actions) {
      const bh = 28
      const by = h - pad - bh
      const bw = clamp((w - tx - pad - 10) / 2, 52, 84)
      prims.push(rect(tx, by, bw, bh, INK_FILL))
      prims.push(text(tx + bw / 2, by + bh / 2 + 4, "Accept", 12, { align: "center" }))
      prims.push(rect(tx + bw + 10, by, bw, bh))
      prims.push(text(tx + bw + 10 + bw / 2, by + bh / 2 + 4, "Dismiss", 12, { align: "center", color: "muted" }))
    }
    return prims
  },
}

// ===========================================================================
// Navigation
// ===========================================================================

// -- menubar ----------------------------------------------------------------

export const menubarDef: ComponentDef = {
  kind: "menubar",
  name: "Menubar",
  category: "components",
  group: "Navigation",
  keywords: ["file", "edit", "view", "app menu", "desktop"],
  size: { w: 400, h: 34 },
  defaults: { items: "File, Edit, View, Window, Help", active: 2, logo: true, trailing: true },
  controls: [
    { key: "items", label: "Items (comma-sep)", type: "text" },
    { key: "active", label: "Open menu", type: "number", min: 0, max: 8, quick: true },
    { key: "logo", label: "Logo", type: "toggle", quick: true },
    { key: "trailing", label: "Trailing icons", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const items = list(p, "items", "File, Edit, View, Window, Help")
    const active = clamp(Math.round(num(p, "active", 0)), 0, items.length) - 1
    const trailing = bool(p, "trailing")
    const prims: Prim[] = [rect(0, 0, w, h, { stroke: "faint" })]
    const fs = clamp(h * 0.4, 10, 14)
    let x = 12
    if (bool(p, "logo")) {
      prims.push(...icon("logo", x + 8, h / 2, clamp(h * 0.5, 12, 18)))
      x += 26
    }
    const rightLimit = trailing ? w - 84 : w - 10
    items.forEach((it, i) => {
      const tw = advance(it, fs)
      if (x + tw + 8 > rightLimit) return
      if (i === active) prims.push(rect(x - 8, 3, tw + 16, h - 6, FAINT_FILL))
      prims.push(text(x, mid(0, h, fs), it, fs, { color: i === active ? "ink" : "muted", bold: i === active }))
      x += tw + 22
    })
    if (trailing) {
      const isz = clamp(h * 0.44, 12, 16)
      const names = ["magnifying-glass", "bell", "user-circle"]
      names.forEach((nm, i) => {
        prims.push(...icon(nm, w - 16 - i * 26, h / 2, isz, { stroke: "muted" }))
      })
    }
    return prims
  },
}

// -- context menu -----------------------------------------------------------

/** The shortcuts everyone already knows, keyed by the verb the row starts with. */
const SHORTCUT_WORDS = new Map<string, string>([
  ["cut", "⌘X"],
  ["copy", "⌘C"],
  ["paste", "⌘V"],
  ["duplicate", "⌘D"],
  ["delete", "⌫"],
  ["remove", "⌫"],
  ["share", ""],
])

/** ⌘ + first letter for anything else that starts with a letter, nothing otherwise. */
const shortcutFor = (label: string): string => {
  const first = label.trim().split(/\s+/)[0] ?? ""
  const known = SHORTCUT_WORDS.get(first.toLowerCase())
  if (known !== undefined) return known
  return /^[a-z]/i.test(first) ? `⌘${first.charAt(0).toUpperCase()}` : ""
}

export const contextMenuDef: ComponentDef = {
  kind: "context-menu",
  name: "Context menu",
  category: "components",
  group: "Navigation",
  keywords: ["right click", "popover", "shortcuts", "submenu", "menu"],
  size: { w: 210, h: 210 },
  defaults: { items: "Cut, Copy, Paste, Duplicate, Share, Delete", shortcuts: true, hover: 2 },
  controls: [
    { key: "items", label: "Items (comma-sep)", type: "text" },
    { key: "shortcuts", label: "Shortcuts", type: "toggle", quick: true },
    { key: "hover", label: "Highlighted", type: "number", min: 0, max: 8, quick: true },
  ],
  render(p, w, h) {
    const items = list(p, "items", "Cut, Copy, Paste, Duplicate, Share, Delete")
    const n = items.length
    const shortcuts = bool(p, "shortcuts")
    const hover = clamp(Math.round(num(p, "hover", 2)), 0, n) - 1
    const pad = 6
    const submenu = n >= 3 ? n - 2 : -1
    let seps = [1, n - 2].filter((s, i, arr) => s > 0 && s < n - 1 && arr.indexOf(s) === i)
    let rowH = (h - pad * 2 - seps.length * 9) / n
    if (rowH < 20) {
      seps = []
      rowH = (h - pad * 2) / n
    }
    const prims: Prim[] = [rect(0, 0, w, h, PAPER_FILL), rect(0, 0, w, h)]
    const fs = clamp(rowH * 0.52, 10, 13)
    let y = pad
    for (let i = 0; i < n; i++) {
      if (i === hover) prims.push(rect(4, y + 1, w - 8, rowH - 2, FAINT_FILL))
      const last = i === n - 1
      const rightPad = shortcuts || i === submenu ? 54 : 24
      prims.push(
        text(12, mid(y, rowH, fs), truncate(pick(items, i), fs, Math.max(10, w - rightPad)), fs, {
          color: last ? "muted" : "ink",
        })
      )
      if (i === submenu) {
        prims.push(...icon("caret-right", w - 14, y + rowH / 2, 10, { stroke: "muted" }))
      } else if (shortcuts) {
        const sc = shortcutFor(pick(items, i))
        if (sc) prims.push(text(w - 12, mid(y, rowH, 11), sc, 11, { align: "right", color: "muted" }))
      }
      y += rowH
      if (seps.indexOf(i) !== -1) {
        prims.push(line(8, y + 4, w - 8, y + 4, { stroke: "faint" }))
        y += 9
      }
    }
    return prims
  },
}

// -- command menu -----------------------------------------------------------

export const commandMenuDef: ComponentDef = {
  kind: "command-menu",
  name: "Command menu",
  category: "components",
  group: "Navigation",
  keywords: ["palette", "cmdk", "spotlight", "search", "quick actions"],
  size: { w: 360, h: 280 },
  defaults: {
    placeholder: "Type a command or search…",
    items: "New project, Open folder, Invite teammate, Settings, New doc, Deploy site, Ask the agent, Recent files",
    count: 5,
    footer: true,
  },
  controls: [
    { key: "placeholder", label: "Placeholder", type: "text" },
    { key: "items", label: "Results (comma-sep)", type: "text" },
    { key: "count", label: "Results", type: "number", min: 2, max: 8, quick: true },
    { key: "footer", label: "Footer", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h, PAPER_FILL), rect(0, 0, w, h)]
    const searchH = clamp(h * 0.17, 34, 46)
    prims.push(...icon("magnifying-glass", 20, searchH / 2, 15, { stroke: "muted" }))
    prims.push(
      text(40, mid(0, searchH, 14), truncate(str(p, "placeholder", ""), 14, Math.max(10, w - 100)), 14, { color: "muted" })
    )
    if (w > 200) {
      prims.push(rect(w - 46, searchH / 2 - 10, 34, 20, { stroke: "faint" }))
      prims.push(text(w - 29, searchH / 2 + 4, "esc", 10, { align: "center", color: "muted" }))
    }
    prims.push(line(0, searchH, w, searchH, { stroke: "faint" }))
    const footerH = bool(p, "footer") ? 30 : 0
    const bodyTop = searchH + 6
    const bodyBottom = h - footerH - 6
    const n = clamp(Math.round(num(p, "count", 5)), 2, 8)
    const headerH = 18
    const rowH = clamp((bodyBottom - bodyTop - headerH * 2) / n, 20, 34)
    const ICONS = ["plus", "folder", "user-plus", "gear", "file-text", "rocket-launch", "magic-wand", "clock"]
    const items = list(p, "items", "New project, Open folder, Invite teammate, Settings, New doc, Deploy site, Ask the agent, Recent files")
    const KB = ["⌘N", "⌘O", "⌘I", "⌘,", "⌘D", "", "", ""]
    const secondAt = Math.ceil(n / 2)
    let y = bodyTop
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === secondAt) {
        prims.push(text(14, y + 12, i === 0 ? "Actions" : "Recent", 10, { color: "muted" }))
        y += headerH
      }
      if (y + rowH > bodyBottom) break
      if (i === 0) prims.push(rect(6, y + 1, w - 12, rowH - 2, FAINT_FILL))
      prims.push(...icon(pick(ICONS, i), 22, y + rowH / 2, 14, { stroke: "muted" }))
      prims.push(text(40, mid(y, rowH, 13), truncate(pick(items, i), 13, Math.max(10, w - 100)), 13))
      const kb = KB[i % KB.length]
      if (kb) prims.push(text(w - 14, mid(y, rowH, 11), kb, 11, { align: "right", color: "muted" }))
      y += rowH
    }
    if (footerH) {
      const fy = h - footerH
      prims.push(line(0, fy, w, fy, { stroke: "faint" }))
      prims.push(text(14, mid(fy, footerH, 10), "↑↓ to navigate", 10, { color: "muted" }))
      prims.push(text(w - 14, mid(fy, footerH, 10), "↵ to select", 10, { align: "right", color: "muted" }))
    }
    return prims
  },
}

// -- pill tabs --------------------------------------------------------------

export const navTabsPillDef: ComponentDef = {
  kind: "nav-tabs-pill",
  name: "Pill tabs",
  category: "components",
  group: "Navigation",
  keywords: ["tabs", "segmented", "filter", "switcher", "pills"],
  size: { w: 280, h: 38 },
  defaults: { labels: "All, Active, Archived", active: 1, container: true },
  controls: [
    { key: "labels", label: "Tabs (comma-sep)", type: "text" },
    { key: "active", label: "Active", type: "number", min: 1, max: 6, quick: true },
    { key: "container", label: "Track", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "All, Active, Archived")
    const n = labels.length
    const active = clamp(Math.round(num(p, "active", 1)), 1, n) - 1
    const container = bool(p, "container")
    const prims: Prim[] = []
    if (container) prims.push(rect(0, 0, w, h, FAINT_FILL))
    const pad = container ? 4 : 0
    const tabW = (w - pad * 2) / n
    const fs = clamp(h * 0.36, 10, 15)
    for (let i = 0; i < n; i++) {
      const x = pad + i * tabW
      if (i === active) {
        const ph = h - pad * 2 - 4
        prims.push(pill(x + 2, pad + 2, tabW - 4, ph, PAPER_FILL))
        prims.push(pill(x + 2, pad + 2, tabW - 4, ph))
      }
      prims.push(
        text(x + tabW / 2, mid(0, h, fs), truncate(pick(labels, i), fs, tabW - 14), fs, {
          align: "center",
          bold: i === active,
          color: i === active ? "ink" : "muted",
        })
      )
    }
    return prims
  },
}

// -- bottom nav -------------------------------------------------------------

export const bottomNavDef: ComponentDef = {
  kind: "bottom-nav",
  name: "Bottom nav",
  category: "components",
  group: "Navigation",
  keywords: ["tab bar", "mobile", "app", "ios", "android", "footer"],
  size: { w: 320, h: 64 },
  defaults: { labels: "Home, Search, Post, Inbox, You", count: 5, active: 1, showLabels: true, indicator: true },
  controls: [
    { key: "labels", label: "Labels (comma-sep)", type: "text" },
    { key: "count", label: "Items", type: "number", min: 3, max: 5, quick: true },
    { key: "active", label: "Active", type: "number", min: 1, max: 5, quick: true },
    { key: "showLabels", label: "Labels", type: "toggle", quick: true },
    { key: "indicator", label: "Home bar", type: "toggle" },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "Home, Search, Post, Inbox, You")
    const n = clamp(Math.round(num(p, "count", 5)), 3, 5)
    const active = clamp(Math.round(num(p, "active", 1)), 1, n) - 1
    const showLabels = bool(p, "showLabels") && h > 46
    const indicator = bool(p, "indicator")
    const barH = indicator ? h - 8 : h
    const prims: Prim[] = [line(0, 0, w, 0, { stroke: "faint" })]
    const icons = ["house", "magnifying-glass", "plus", "chat-circle", "user"]
    const colW = w / n
    const iconY = showLabels ? barH * 0.4 : barH / 2
    const isz = clamp(barH * 0.34, 14, 24)
    for (let i = 0; i < n; i++) {
      const cx = i * colW + colW / 2
      if (i === active) {
        const pw = Math.min(colW - 10, isz * 2.1)
        prims.push(pill(cx - pw / 2, iconY - isz * 0.78, pw, isz * 1.56, FAINT_FILL))
      }
      prims.push(...icon(pick(icons, i), cx, iconY, isz, { stroke: i === active ? "ink" : "muted" }))
      if (showLabels) {
        prims.push(
          text(cx, barH * 0.86, truncate(pick(labels, i), 10, colW - 6), 10, {
            align: "center",
            color: i === active ? "ink" : "muted",
            bold: i === active,
          })
        )
      }
    }
    if (indicator) prims.push(line(w / 2 - 44, h - 4, w / 2 + 44, h - 4, { strokeWidth: 3 }))
    return prims
  },
}

// -- stepper ----------------------------------------------------------------

export const stepperDef: ComponentDef = {
  kind: "stepper",
  name: "Stepper",
  category: "components",
  group: "Navigation",
  keywords: ["wizard", "steps", "progress", "checkout", "onboarding"],
  size: { w: 400, h: 76 },
  defaults: { labels: "Cart, Shipping, Payment, Done", count: 4, active: 3, showLabels: true },
  controls: [
    { key: "labels", label: "Labels (comma-sep)", type: "text" },
    { key: "count", label: "Steps", type: "number", min: 2, max: 6, quick: true },
    { key: "active", label: "Current", type: "number", min: 1, max: 6, quick: true },
    { key: "showLabels", label: "Labels", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "Cart, Shipping, Payment, Done")
    const n = clamp(Math.round(num(p, "count", 4)), 2, 6)
    const active = clamp(Math.round(num(p, "active", 2)), 1, n)
    const showLabels = bool(p, "showLabels") && h > 52
    const d = clamp(Math.min(showLabels ? h * 0.48 : h * 0.8, 34), 18, 34)
    const cy = showLabels ? d / 2 + 4 : h / 2
    const colW = w / n
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const cx = i * colW + colW / 2
      if (i > 0) {
        const px = (i - 1) * colW + colW / 2 + d / 2 + 6
        const nx = cx - d / 2 - 6
        if (nx > px) {
          prims.push(line(px, cy, nx, cy, { stroke: i < active ? "ink" : "faint", strokeWidth: i < active ? 1.6 : 1.2 }))
        }
      }
      const done = i + 1 < active
      const cur = i + 1 === active
      prims.push(
        ellipse(cx - d / 2, cy - d / 2, d, d, done ? { fill: "solid", fillColor: "faint" } : cur ? { strokeWidth: 2 } : { stroke: "faint" })
      )
      if (done) prims.push(...icon("check", cx, cy, d * 0.5))
      else prims.push(text(cx, cy + d * 0.17, String(i + 1), d * 0.48, { align: "center", color: cur ? "ink" : "muted" }))
      if (showLabels) {
        prims.push(
          text(cx, cy + d / 2 + 20, truncate(labels[i] ?? `Step ${i + 1}`, 12, colW - 8), 12, {
            align: "center",
            bold: cur,
            color: cur ? "ink" : "muted",
          })
        )
      }
    }
    return prims
  },
}

// ===========================================================================
// Data
// ===========================================================================

// -- stat -------------------------------------------------------------------

export const statDef: ComponentDef = {
  kind: "stat",
  name: "Stat",
  category: "components",
  group: "Data",
  keywords: ["metric", "kpi", "number", "delta", "figure"],
  size: { w: 180, h: 86 },
  // delta unsigned — Trend signs it, so the arrow and the number always agree
  defaults: { label: "Active users", value: "8,240", delta: "4.2%", trend: "up", period: "vs last week" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "value", label: "Value", type: "text" },
    { key: "delta", label: "Delta", type: "text" },
    { key: "trend", label: "Trend", type: "select", options: ["up", "down", "flat"], quick: true },
    { key: "period", label: "Period", type: "text" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [text(0, 12, truncate(str(p, "label", ""), 12, w), 12, { color: "muted" })]
    const vs = clamp(h * 0.36, 18, 40)
    const vy = 14 + vs
    prims.push(text(0, vy, truncate(str(p, "value", ""), vs, w), vs, { bold: true }))
    const dy = vy + 20
    if (dy <= h) {
      const trend = str(p, "trend", "up")
      const delta = signDelta(str(p, "delta", ""), trend)
      prims.push(...icon(trendIcon(trend), 6, dy - 4, 12))
      const dw = advance(delta, 12)
      prims.push(text(18, dy, truncate(delta, 12, w * 0.45), 12, { bold: true }))
      const px = 18 + dw + 10
      if (w - px > 34) prims.push(text(px, dy, truncate(str(p, "period", ""), 12, w - px), 12, { color: "muted" }))
    }
    return prims
  },
}

// -- data table -------------------------------------------------------------

export const dataTableDef: ComponentDef = {
  kind: "data-table",
  name: "Data table",
  category: "components",
  group: "Data",
  keywords: ["grid", "rows", "sort", "filter", "select", "pagination", "crud"],
  size: { w: 540, h: 320 },
  defaults: { cols: "Name, Status, Amount", rows: 5, toolbar: true, footer: true, selected: 2 },
  controls: [
    { key: "cols", label: "Columns (comma-sep)", type: "text" },
    { key: "rows", label: "Rows", type: "number", min: 1, max: 10, quick: true },
    { key: "toolbar", label: "Toolbar", type: "toggle", quick: true },
    { key: "footer", label: "Footer", type: "toggle", quick: true },
    { key: "selected", label: "Selected rows", type: "number", min: 0, max: 10 },
  ],
  render(p, w, h) {
    const rows = clamp(Math.round(num(p, "rows", 5)), 1, 10)
    const selected = clamp(Math.round(num(p, "selected", 2)), 0, rows)
    const toolbar = bool(p, "toolbar") && h > 140
    const footer = bool(p, "footer") && h > 140
    const toolbarH = toolbar ? 46 : 0
    const headerH = clamp((h - toolbarH) * 0.14, 26, 34)
    const footerH = footer ? 40 : 0
    const prims: Prim[] = []
    if (toolbar) {
      const fh = 30
      const fw = Math.min(w * 0.42, 210)
      prims.push(rect(0, (toolbarH - fh) / 2, fw, fh))
      prims.push(...icon("magnifying-glass", 15, toolbarH / 2, 13, { stroke: "muted" }))
      prims.push(text(30, mid(0, toolbarH, 12), truncate("Search rows…", 12, fw - 42), 12, { color: "muted" }))
      const bh = 30
      const bw = 78
      prims.push(rect(w - bw, (toolbarH - bh) / 2, bw, bh, { stroke: "muted", dashed: true }))
      prims.push(...icon("funnel", w - bw + 16, toolbarH / 2, 12, { stroke: "muted" }))
      prims.push(text(w - bw + 28, mid(0, toolbarH, 12), "Filter", 12))
      const b2 = 92
      if (w - bw - 8 - b2 > fw + 16) {
        prims.push(rect(w - bw - 8 - b2, (toolbarH - bh) / 2, b2, bh, { stroke: "muted", dashed: true }))
        prims.push(...icon("columns", w - bw - 8 - b2 + 16, toolbarH / 2, 12, { stroke: "muted" }))
        prims.push(text(w - bw - 8 - b2 + 28, mid(0, toolbarH, 12), "Columns", 12))
      }
    }
    const tTop = toolbarH
    const tableH = h - toolbarH - footerH
    prims.push(rect(0, tTop, w, tableH))
    const cbW = Math.min(34, w * 0.1)
    const actW = Math.min(34, w * 0.1)
    const contentW = Math.max(40, w - cbW - actW)
    const colX = [cbW, cbW + contentW * 0.46, cbW + contentW * 0.74]
    prims.push(rect(1.5, tTop + 1.5, w - 3, headerH - 3, FAINT_FILL))
    prims.push(line(0, tTop + headerH, w, tTop + headerH, { stroke: "faint" }))
    prims.push(rect(cbW / 2 - 7, tTop + headerH / 2 - 7, 14, 14, { stroke: "muted" }))
    prims.push(...icon("minus", cbW / 2, tTop + headerH / 2, 10))
    const cols = list(p, "cols", "Name, Status, Amount")
    const hName = truncate(cols[0] ?? "Name", 12, Math.max(16, contentW * 0.46 - 30))
    const hStatus = truncate(cols[1] ?? "Status", 12, Math.max(16, contentW * 0.28 - 8))
    const hAmount = truncate(cols[2] ?? "Amount", 12, Math.max(16, cbW + contentW - 6 - colX[2]))
    prims.push(text(colX[0], mid(tTop, headerH, 12), hName, 12, { bold: true }))
    prims.push(...icon("caret-up-down", colX[0] + advance(hName, 12) + 13, tTop + headerH / 2, 10, { stroke: "muted" }))
    prims.push(text(colX[1], mid(tTop, headerH, 12), hStatus, 12, { bold: true }))
    prims.push(text(cbW + contentW - 6, mid(tTop, headerH, 12), hAmount, 12, { align: "right", bold: true }))
    const bodyTop = tTop + headerH
    const bodyH = Math.max(16, h - footerH - bodyTop)
    const rowH = bodyH / rows
    const amounts = ["$1,200", "$480", "$92", "$3,400", "$210", "$76", "$1,050", "$620", "$310", "$88"]
    const statuses = ["Paid", "Due", "Draft"]
    for (let r = 0; r < rows; r++) {
      const ry = bodyTop + r * rowH
      const rcy = ry + rowH / 2
      if (r < rows - 1) prims.push(line(0, ry + rowH, w, ry + rowH, { stroke: "faint" }))
      const on = r < selected
      const box = Math.min(14, rowH - 6)
      prims.push(rect(cbW / 2 - box / 2, rcy - box / 2, box, box, { stroke: on ? "ink" : "muted" }))
      if (on && box > 9) prims.push(...icon("check", cbW / 2, rcy, box * 0.8))
      const ad = Math.min(rowH - 12, 22)
      let nx = colX[0]
      if (ad > 13) {
        prims.push(ellipse(colX[0], rcy - ad / 2, ad, ad, { stroke: "muted" }))
        nx = colX[0] + ad + 8
      }
      const nameW = Math.min(contentW * 0.46 - (nx - colX[0]) - 14, 70 + (r % 3) * 16)
      if (nameW > 12) prims.push(line(nx, rcy, nx + nameW, rcy, { stroke: "muted", strokeWidth: 1.3 }))
      const sbh = Math.min(rowH - 12, 20)
      const sbw = Math.min(contentW * 0.24, 62)
      if (sbh > 12 && sbw > 34) {
        prims.push(pill(colX[1], rcy - sbh / 2, sbw, sbh, { stroke: "muted" }))
        prims.push(text(colX[1] + sbw / 2, rcy + 4, pick(statuses, r), 10, { align: "center", color: "muted" }))
      }
      prims.push(text(cbW + contentW - 6, rcy + 4, pick(amounts, r), 12, { align: "right" }))
      prims.push(...icon("dots-three-vertical", w - actW / 2, rcy, 13, { stroke: "muted" }))
    }
    if (footer) {
      const fy = h - footerH
      prims.push(text(1, mid(fy, footerH, 11), `${selected} of ${rows} row(s) selected`, 11, { color: "muted" }))
      const cell = 26
      const gap = 6
      const px = w - (cell * 2 + gap + 46)
      prims.push(text(px - 8, mid(fy, footerH, 11), "Page 1 of 4", 11, { align: "right", color: "muted" }))
      prims.push(rect(px + 46, fy + (footerH - cell) / 2, cell, cell, { stroke: "muted" }))
      prims.push(...icon("caret-left", px + 46 + cell / 2, fy + footerH / 2, 10, { stroke: "muted" }))
      prims.push(rect(px + 46 + cell + gap, fy + (footerH - cell) / 2, cell, cell, { stroke: "muted" }))
      prims.push(...icon("caret-right", px + 46 + cell + gap + cell / 2, fy + footerH / 2, 10))
    }
    return prims
  },
}

// -- key/value list ---------------------------------------------------------

const KV_KEYS = "Plan, Seats, Renews, Owner, Region, Status, Created, Support"
const KV_VALS = "Pro, 12, Mar 4 2026, Pablo S., us-east-1, Active, Jan 2024, Priority"

export const kvListDef: ComponentDef = {
  kind: "kv-list",
  name: "Key/value list",
  category: "components",
  group: "Data",
  keywords: ["details", "definition", "properties", "summary", "meta"],
  size: { w: 260, h: 170 },
  defaults: { keys: KV_KEYS, values: KV_VALS, count: 5, dividers: true, layout: "row" },
  controls: [
    { key: "keys", label: "Keys (comma-sep)", type: "text" },
    { key: "values", label: "Values (comma-sep)", type: "text" },
    { key: "count", label: "Rows", type: "number", min: 2, max: 8, quick: true },
    { key: "layout", label: "Layout", type: "select", options: ["row", "stacked"], quick: true },
    { key: "dividers", label: "Dividers", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const n = clamp(Math.round(num(p, "count", 5)), 2, 8)
    const dividers = bool(p, "dividers")
    const stacked = str(p, "layout", "row") === "stacked"
    const KEYS = list(p, "keys", KV_KEYS)
    const VALS = list(p, "values", KV_VALS)
    const rowH = h / n
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const y = i * rowH
      if (stacked) {
        prims.push(text(0, y + rowH * 0.4, pick(KEYS, i), 11, { color: "muted" }))
        prims.push(text(0, y + rowH * 0.82, truncate(pick(VALS, i), 14, w), 14, { bold: true }))
      } else {
        const fs = clamp(rowH * 0.42, 10, 14)
        prims.push(text(0, mid(y, rowH, fs), truncate(pick(KEYS, i), fs, w * 0.45), fs, { color: "muted" }))
        prims.push(text(w, mid(y, rowH, fs), truncate(pick(VALS, i), fs, w * 0.55), fs, { align: "right" }))
      }
      if (dividers && i < n - 1) prims.push(line(0, y + rowH, w, y + rowH, { stroke: "faint" }))
    }
    return prims
  },
}

// ===========================================================================
// Media
// ===========================================================================

// -- video player -----------------------------------------------------------

/** the clip this player has always been playing: 4:03 */
const TOTAL_S = 243

export const videoPlayerDef: ComponentDef = {
  kind: "video-player",
  name: "Video player",
  category: "components",
  group: "Media",
  keywords: ["play", "movie", "scrubber", "youtube", "embed"],
  size: { w: 320, h: 200 },
  defaults: { controls: true, progress: 35, title: false, titleText: "How we draw squiggles" },
  controls: [
    { key: "controls", label: "Controls", type: "toggle", quick: true },
    { key: "progress", label: "Progress", type: "number", min: 0, max: 100, quick: true },
    { key: "title", label: "Title overlay", type: "toggle", quick: true },
    { key: "titleText", label: "Title", type: "text" },
  ],
  render(p, w, h) {
    const controls = bool(p, "controls") && h > 90
    const cH = controls ? 36 : 0
    const stageH = h - cH
    const prims: Prim[] = [rect(0, 0, w, h), rect(0, 0, w, stageH, { fill: "shade", fillColor: "faint" })]
    const d = clamp(Math.min(w, stageH) * 0.26, 28, 62)
    prims.push(ellipse(w / 2 - d / 2, stageH / 2 - d / 2, d, d, PAPER_FILL))
    prims.push(ellipse(w / 2 - d / 2, stageH / 2 - d / 2, d, d))
    prims.push(...icon("play", w / 2 + d * 0.04, stageH / 2, d * 0.4))
    if (bool(p, "title")) {
      prims.push(text(14, 24, truncate(str(p, "titleText", "How we draw squiggles"), 13, w - 28), 13, { bold: true }))
    }
    if (controls) {
      prims.push(line(0, stageH, w, stageH, { stroke: "faint" }))
      const sx = 12
      const sw = Math.max(20, w - 24)
      const sy = stageH + 11
      const pct = clamp(num(p, "progress", 35), 0, 100)
      const prog = pct / 100
      prims.push(line(sx, sy, sx + sw, sy, { stroke: "faint", strokeWidth: 2 }))
      prims.push(line(sx, sy, sx + sw * prog, sy, { strokeWidth: 2.4 }))
      prims.push(ellipse(sx + sw * prog - 5, sy - 5, 10, 10, { fill: "solid", fillColor: "ink" }))
      const ry = stageH + cH - 10
      prims.push(...icon("play", 16, ry, 12))
      // Progress arrives as a whole percent, which on a 4:03 clip covers a band
      // about two and a half seconds wide rather than one instant. Read the
      // start of the band, so 35% keeps saying 1:24 and a full bar says 4:03.
      const el = pct >= 100 ? TOTAL_S : Math.max(0, Math.ceil(((pct - 0.5) / 100) * TOTAL_S))
      prims.push(text(30, ry + 4, `${mmss(el)} / ${mmss(TOTAL_S)}`, 10, { color: "muted" }))
      prims.push(...icon("arrows-out", w - 16, ry, 12, { stroke: "muted" }))
    }
    return prims
  },
}

// -- audio player -----------------------------------------------------------

export const audioPlayerDef: ComponentDef = {
  kind: "audio-player",
  name: "Audio player",
  category: "components",
  group: "Media",
  keywords: ["waveform", "podcast", "music", "sound", "voice note"],
  size: { w: 320, h: 72 },
  defaults: { bars: 28, progress: 42, playing: true },
  controls: [
    { key: "bars", label: "Waveform bars", type: "number", min: 8, max: 48, quick: true },
    { key: "progress", label: "Progress", type: "number", min: 0, max: 100, quick: true },
    { key: "playing", label: "Playing", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const d = clamp(h * 0.58, 22, 46)
    const px = clamp(w * 0.045, 10, 16)
    prims.push(ellipse(px, h / 2 - d / 2, d, d, INK_FILL))
    const playing = bool(p, "playing")
    prims.push(...icon(playing ? "pause" : "play", px + d / 2 + (playing ? 0 : 1), h / 2, d * 0.4))
    const timeW = 38
    const tx = px + d + 14
    const waveW = Math.max(20, w - tx - timeW - 12)
    const n = clamp(Math.round(num(p, "bars", 28)), 8, 48)
    const step = waveW / n
    const bw = clamp(step * 0.6, 1, 3)
    const prog = clamp(num(p, "progress", 42), 0, 100) / 100
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0
      const amp = 0.24 + 0.76 * Math.abs(Math.sin(i * 1.1)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.37)))
      const bh = clamp(amp * h * 0.56, 4, h * 0.6)
      const x = tx + i * step + (step - bw) / 2
      prims.push(
        line(x, h / 2 - bh / 2, x, h / 2 + bh / 2, {
          stroke: t <= prog ? "ink" : "faint",
          strokeWidth: Math.min(bw, 3),
        })
      )
    }
    prims.push(text(w - 12, h / 2 + 4, "2:14", 11, { align: "right", color: "muted" }))
    return prims
  },
}

// -- image grid -------------------------------------------------------------

export const imageGridDef: ComponentDef = {
  kind: "image-grid",
  name: "Image grid",
  category: "components",
  group: "Media",
  keywords: ["gallery", "photos", "thumbnails", "masonry", "mosaic"],
  size: { w: 300, h: 220 },
  defaults: { cols: 3, rows: 3, gap: 8, feature: false },
  controls: [
    { key: "cols", label: "Columns", type: "number", min: 1, max: 6, quick: true },
    { key: "rows", label: "Rows", type: "number", min: 1, max: 5, quick: true },
    { key: "gap", label: "Gap", type: "number", min: 0, max: 20 },
    { key: "feature", label: "Feature cell", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const cols = clamp(Math.round(num(p, "cols", 3)), 1, 6)
    const rows = clamp(Math.round(num(p, "rows", 3)), 1, 5)
    const gap = clamp(Math.round(num(p, "gap", 8)), 0, 20)
    const cw = (w - gap * (cols - 1)) / cols
    const ch = (h - gap * (rows - 1)) / rows
    const feature = bool(p, "feature") && cols >= 3 && rows >= 2
    const skip = feature ? [1, cols, cols + 1] : []
    const prims: Prim[] = []
    for (let idx = 0; idx < rows * cols; idx++) {
      if (skip.indexOf(idx) !== -1) continue
      const c = idx % cols
      const r = Math.floor(idx / cols)
      const big = feature && idx === 0
      const bw = big ? cw * 2 + gap : cw
      const bh = big ? ch * 2 + gap : ch
      const x = c * (cw + gap)
      const y = r * (ch + gap)
      prims.push(rect(x, y, bw, bh, { fill: "shade", fillColor: "faint" }))
      const m = Math.min(bw, bh)
      if (m > 30) prims.push(...icon("image", x + bw / 2, y + bh / 2, clamp(m * 0.3, 14, 44), { stroke: "muted" }))
    }
    return prims
  },
}

// -- map --------------------------------------------------------------------

export const mapDef: ComponentDef = {
  kind: "map",
  name: "Map",
  category: "components",
  group: "Media",
  keywords: ["location", "pin", "streets", "geo", "address"],
  size: { w: 300, h: 220 },
  defaults: { pins: 1, label: true, labelText: "You are here", controls: true },
  controls: [
    { key: "pins", label: "Pins", type: "number", min: 1, max: 3, quick: true },
    { key: "label", label: "Label", type: "toggle", quick: true },
    { key: "labelText", label: "Label text", type: "text" },
    { key: "controls", label: "Zoom controls", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    // city blocks
    const blocks: [number, number, number, number][] = [
      [0.06, 0.08, 0.2, 0.14],
      [0.44, 0.06, 0.18, 0.11],
      [0.78, 0.34, 0.16, 0.16],
      [0.1, 0.72, 0.2, 0.14],
      [0.5, 0.76, 0.22, 0.12],
    ]
    for (const [bx, by, bw, bh] of blocks) {
      prims.push(rect(w * bx, h * by, w * bw, h * bh, { stroke: "faint", strokeWidth: 1 }))
    }
    // roads
    prims.push(poly([[0, h * 0.62], [w * 0.28, h * 0.55], [w * 0.56, h * 0.68], [w, h * 0.58]], false, { stroke: "muted", strokeWidth: 2.2 }))
    prims.push(poly([[w * 0.34, 0], [w * 0.4, h * 0.4], [w * 0.31, h * 0.72], [w * 0.37, h]], false, { stroke: "muted", strokeWidth: 2 }))
    prims.push(poly([[0, h * 0.28], [w * 0.5, h * 0.22], [w, h * 0.31]], false, { stroke: "faint", strokeWidth: 1.4 }))
    prims.push(poly([[w * 0.72, 0], [w * 0.67, h * 0.5], [w * 0.76, h]], false, { stroke: "faint", strokeWidth: 1.4 }))
    prims.push(poly([[0, h * 0.88], [w * 0.3, h * 0.82], [w * 0.62, h * 0.92], [w, h * 0.84]], false, { stroke: "faint", strokeWidth: 2.4, roughness: 2.2 }))
    // pins
    const pins = clamp(Math.round(num(p, "pins", 1)), 1, 3)
    const spots: [number, number, number][] = [
      [0.5, 0.5, 1],
      [0.24, 0.34, 0.7],
      [0.74, 0.68, 0.7],
    ]
    const base = clamp(Math.min(w, h) * 0.16, 18, 34)
    for (let i = 0; i < pins; i++) {
      const [fx, fy, sc] = spots[i]
      const px = w * fx
      const py = h * fy
      const sz = base * sc
      prims.push(ellipse(px - sz * 0.3, py + sz * 0.22, sz * 0.6, sz * 0.2, { stroke: "faint" }))
      prims.push(...icon("map-pin", px, py - sz * 0.15, sz))
    }
    const zoom = bool(p, "controls") && h > 110
    if (bool(p, "label") && w > 160) {
      const labelText = str(p, "labelText", "You are here")
      const lh = 26
      // a long label grows both ways from centre — stop it short of the zoom stack
      const lw = clamp(advance(labelText, 12) + 26, 60, Math.max(60, w - (zoom ? 92 : 16)))
      const lx = clamp(w * 0.5 - lw / 2, 8, Math.max(8, w - lw - 8))
      const ly = clamp(h * 0.5 - base * 0.85 - lh, 6, h - lh - 6)
      prims.push(rect(lx, ly, lw, lh, PAPER_FILL), rect(lx, ly, lw, lh))
      prims.push(text(lx + lw / 2, ly + lh / 2 + 4, truncate(labelText, 12, lw - 12), 12, { align: "center" }))
    }
    if (zoom) {
      const cw = 26
      const chh = 52
      const cx = w - 12 - cw
      const cy = 12
      prims.push(rect(cx, cy, cw, chh, PAPER_FILL), rect(cx, cy, cw, chh))
      prims.push(line(cx, cy + chh / 2, cx + cw, cy + chh / 2, { stroke: "faint" }))
      prims.push(...icon("plus", cx + cw / 2, cy + chh / 4, 11))
      prims.push(...icon("minus", cx + cw / 2, cy + (chh * 3) / 4, 11, { stroke: "muted" }))
    }
    return prims
  },
}

// ===========================================================================

export const MORE_DEFS: ComponentDef[] = [
  // Buttons
  iconButtonDef,
  buttonGroupDef,
  splitButtonDef,
  fabDef,
  chipDef,
  chipGroupDef,
  // Forms
  formFieldDef,
  searchInputDef,
  otpInputDef,
  fileUploadDef,
  datePickerDef,
  comboboxDef,
  inputGroupDef,
  stepperInputDef,
  colorSwatchRowDef,
  // Selection
  radioGroupDef,
  checkboxGroupDef,
  toggleGroupDef,
  ratingDef,
  sliderRangeDef,
  // Display
  accordionDef,
  carouselDef,
  kbdDef,
  timelineDef,
  treeViewDef,
  listItemDef,
  codeBlockDef,
  calendarDef,
  // Feedback
  skeletonDef,
  spinnerDef,
  // Cards
  cardStatDef,
  cardProfileDef,
  cardMediaDef,
  cardPricingDef,
  cardTestimonialDef,
  cardProductDef,
  cardBlogDef,
  cardNotificationDef,
  // Navigation
  menubarDef,
  contextMenuDef,
  commandMenuDef,
  navTabsPillDef,
  bottomNavDef,
  stepperDef,
  // Data
  statDef,
  dataTableDef,
  kvListDef,
  // Media
  videoPlayerDef,
  audioPlayerDef,
  imageGridDef,
  mapDef,
]
