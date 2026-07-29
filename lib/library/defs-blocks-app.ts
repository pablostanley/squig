// ---------------------------------------------------------------------------
// Product blocks — the app-y, AI-y, money-y chunks of a real product, plus a
// handful of whole screens composed out of them.
// Everything here is `category: "blocks"`.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, pill, ellipse, line, poly, text, icon, place, loremLines, truncate, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"
import {
  buttonDef,
  inputDef,
  selectDef,
  checkboxDef,
  switchDef,
  badgeDef,
  avatarDef,
  progressDef,
} from "./defs-basic"
import { cardDef, tabsDef, breadcrumbDef } from "./defs-display"
import { navbarDef, sidebarDef } from "./defs-nav"

// -- tiny prop readers -------------------------------------------------------

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function sub(def: ComponentDef, props: Props, x: number, y: number, w: number, h: number): Prim[] {
  return place(def.render({ ...def.defaults, ...props }, w, h), x, y)
}

// -- shared drawing helpers --------------------------------------------------

/** A muted placeholder line — one squiggle of body copy. */
const body = (x: number, y: number, w: number): Prim =>
  line(x, y, x + Math.max(8, w), y, { stroke: "muted", strokeWidth: 1.2, roughness: 1.6 })

const hair = (x: number, y: number, w: number): Prim => line(x, y, x + Math.max(4, w), y, { stroke: "faint" })

/** Greedy word wrap, ellipsized on the last line. */
function wrap(s: string, size: number, maxW: number, maxLines: number): string[] {
  const words = s.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ""
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word
    if (cur && textWidth(next, size) > maxW) {
      lines.push(cur)
      cur = word
      if (lines.length >= maxLines) break
    } else {
      cur = next
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  return lines.slice(0, maxLines).map((l) => truncate(l, size, maxW))
}

/** A little keycap. */
const kbdW = (label: string, size = 11): number => Math.max(20, textWidth(label, size) + 14)
function kbd(x: number, cy: number, label: string, size = 11): Prim[] {
  const kw = kbdW(label, size)
  return [
    rect(x, cy - 9, kw, 18, { stroke: "faint" }),
    text(x + kw / 2, cy + 4, label, size, { align: "center", color: "muted" }),
  ]
}

/** The assistant mark — a squircle-ish square with a sparkle in it. */
function aiMark(x: number, y: number, d: number): Prim[] {
  return [rect(x, y, d, d), ...icon("sparkle", x + d / 2, y + d / 2, d * 0.54)]
}

/** − 1 + quantity stepper. */
function stepper(x: number, y: number, w: number, h: number, value = "1"): Prim[] {
  return [
    rect(x, y, w, h),
    ...icon("minus", x + h * 0.6, y + h / 2, 10, { stroke: "muted" }),
    text(x + w / 2, y + h / 2 + 5, value, 13, { align: "center" }),
    ...icon("plus", x + w - h * 0.6, y + h / 2, 10, { stroke: "muted" }),
  ]
}

/** Label left, value right — the totals pattern. */
function ledgerRow(x: number, y: number, w: number, label: string, value: string, strong = false): Prim[] {
  return [
    text(x, y, truncate(label, strong ? 15 : 13, w - 70), strong ? 15 : 13, {
      color: strong ? "ink" : "muted",
      bold: strong,
    }),
    text(x + w, y, value, strong ? 16 : 13, { align: "right", bold: strong }),
  ]
}

function starRow(x: number, cy: number, size = 12, count = 5): Prim[] {
  const prims: Prim[] = []
  for (let i = 0; i < count; i++) prims.push(...icon("star", x + i * (size + 3) + size / 2, cy, size, { stroke: "muted" }))
  return prims
}

// ===========================================================================
// App
// ===========================================================================

// -- usage meter ------------------------------------------------------------

export const usageMeterDef: ComponentDef = {
  kind: "usage-meter",
  name: "Usage meter",
  category: "blocks",
  group: "App",
  keywords: ["quota", "limit", "seats", "storage", "bar", "consumption"],
  size: { w: 320, h: 104 },
  defaults: { label: "Seats", value: 70, meters: 2 },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "value", label: "Value", type: "number", min: 0, max: 100, quick: true },
    { key: "meters", label: "Meters", type: "number", min: 1, max: 3, quick: true },
  ],
  render(p, w, h) {
    const labels = [str(p, "label", "Seats"), "Storage", "API calls"]
    const caps = ["14 of 20 used", "3.5 of 10 GB used", "8,800 of 10,000"]
    const vals = [clamp(num(p, "value", 70), 0, 100), 35, 88]
    const n = clamp(Math.min(num(p, "meters", 2), Math.floor(h / 38)), 1, 3)
    const slot = h / n
    const prims: Prim[] = []
    for (let i = 0; i < n; i++) {
      const y = i * slot
      const cap = truncate(caps[i], 12, w * 0.5)
      prims.push(text(0, y + 13, truncate(labels[i], 13, w * 0.45), 13, { bold: true }))
      if (w > 180) prims.push(text(w, y + 13, cap, 12, { align: "right", color: "muted" }))
      prims.push(...sub(progressDef, { value: vals[i] }, 0, y + 22, w, Math.min(12, slot - 24)))
    }
    return prims
  },
}

// -- invoice list -----------------------------------------------------------

export const invoiceListDef: ComponentDef = {
  kind: "invoice-list",
  name: "Invoice list",
  category: "blocks",
  group: "App",
  keywords: ["billing", "receipts", "history", "payments", "table"],
  size: { w: 560, h: 250 },
  defaults: { rows: 4, header: true, frame: true },
  controls: [
    { key: "rows", label: "Rows", type: "number", min: 2, max: 8, quick: true },
    { key: "header", label: "Header", type: "toggle", quick: true },
    { key: "frame", label: "Frame", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    if (bool(p, "frame")) prims.push(rect(0, 0, w, h))
    const pad = 14
    const headerH = bool(p, "header") ? 26 : 4
    const avail = h - pad * 2 - headerH
    const n = clamp(Math.min(num(p, "rows", 4), Math.floor(avail / 32)), 1, 8)
    if (n < 1) return prims
    const rowH = Math.min(46, avail / n)

    const iconCx = w - pad - 9
    const showIcon = w > 320
    const showStatus = w > 430
    const statusW = 62
    const statusX = showStatus ? (showIcon ? iconCx - 20 : iconCx + 8) - statusW : w
    const amountRight = (showStatus ? statusX : showIcon ? iconCx - 18 : w - pad) - 12
    const dateX = pad
    const descX = pad + Math.max(56, Math.min(78, w * 0.15))
    const descW = amountRight - 62 - descX

    let y = pad
    if (bool(p, "header")) {
      prims.push(text(dateX, y + 12, "Date", 11, { color: "muted", bold: true }))
      if (descW > 40) prims.push(text(descX, y + 12, "Invoice", 11, { color: "muted", bold: true }))
      prims.push(text(amountRight, y + 12, "Amount", 11, { align: "right", color: "muted", bold: true }))
      if (showStatus) prims.push(text(statusX, y + 12, "Status", 11, { color: "muted", bold: true }))
      prims.push(hair(pad, y + 20, w - pad * 2))
      y += headerH
    }

    const dates = ["Jul 1", "Jun 1", "May 1", "Apr 1", "Mar 1", "Feb 1", "Jan 1", "Dec 1"]
    const descs = [
      "Pro — monthly",
      "Pro — monthly",
      "Two extra seats",
      "Pro — monthly",
      "Pro — monthly",
      "One-off doodles",
      "Pro — monthly",
      "Pro — monthly",
    ]
    const amounts = ["$24.00", "$24.00", "$18.00", "$24.00", "$24.00", "$9.00", "$24.00", "$24.00"]
    const states = ["Paid", "Paid", "Paid", "Refund", "Paid", "Paid", "Paid", "Paid"]

    for (let i = 0; i < n; i++) {
      const cy = y + rowH / 2
      if (i > 0) prims.push(hair(pad, y, w - pad * 2))
      prims.push(text(dateX, cy + 4, dates[i], 12, { color: "muted" }))
      if (descW > 40) prims.push(text(descX, cy + 4, truncate(descs[i], 13, descW), 13))
      prims.push(text(amountRight, cy + 4, amounts[i], 13, { align: "right", bold: true }))
      if (showStatus) prims.push(...sub(badgeDef, { label: states[i], variant: "outline" }, statusX, cy - 11, statusW, 22))
      if (showIcon) prims.push(...icon("download-simple", iconCx, cy, 15, { stroke: "muted" }))
      y += rowH
    }
    return prims
  },
}

// -- account ----------------------------------------------------------------

export const accountBlockDef: ComponentDef = {
  kind: "account-block",
  name: "Account settings",
  category: "blocks",
  group: "App",
  keywords: ["profile", "settings", "form", "avatar", "details"],
  size: { w: 560, h: 440 },
  defaults: { title: "Your account", fields: 3, photo: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "fields", label: "Fields", type: "number", min: 1, max: 4, quick: true },
    { key: "photo", label: "Photo button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = clamp(w * 0.045, 14, 24)
    const cw = w - pad * 2
    let y = pad + 16
    prims.push(text(pad, y, truncate(str(p, "title", "Your account"), 18, cw - 40), 18, { bold: true }))
    prims.push(hair(pad, y + 12, cw))
    y += 30

    const d = Math.min(64, h * 0.16)
    prims.push(...sub(avatarDef, { content: "initials", initials: "PS" }, pad, y, d, d))
    prims.push(text(pad + d + 16, y + d * 0.42, "Pablo Scribbles", 16, { bold: true }))
    prims.push(text(pad + d + 16, y + d * 0.42 + 20, "pablo@squig.sh", 13, { color: "muted" }))
    if (bool(p, "photo") && cw > 330) {
      prims.push(...sub(buttonDef, { label: "Change photo", variant: "outline", size: "sm" }, w - pad - 128, y + d / 2 - 17, 128, 34))
    }
    y += d + 22

    const labels = ["Display name", "Email", "Where you are", "Short bio"]
    const values = ["Pablo Scribbles", "pablo@squig.sh", "Somewhere warm", "Draws boxes for money"]
    const n = clamp(num(p, "fields", 3), 1, 4)
    const fieldH = 58
    const footTop = h - 56
    for (let i = 0; i < n; i++) {
      if (y + fieldH > footTop - 6) break
      prims.push(...sub(inputDef, { label: labels[i], placeholder: values[i], icon: i === 1 ? "mail" : "none" }, pad, y, cw, fieldH))
      y += fieldH + 12
    }

    prims.push(hair(pad, footTop, cw))
    const bw = Math.min(132, cw * 0.32)
    prims.push(...sub(buttonDef, { label: "Save changes", variant: "filled", size: "sm" }, w - pad - bw, footTop + 12, bw, 34))
    if (cw > 300) {
      prims.push(...sub(buttonDef, { label: "Never mind", variant: "ghost", size: "sm" }, w - pad - bw - 108, footTop + 12, 100, 34))
    }
    return prims
  },
}

// -- billing ----------------------------------------------------------------

export const billingBlockDef: ComponentDef = {
  kind: "billing-block",
  name: "Billing",
  category: "blocks",
  group: "App",
  keywords: ["plan", "subscription", "payment", "invoices", "money"],
  size: { w: 560, h: 520 },
  defaults: { plan: "Pro", usage: true, invoices: 3 },
  controls: [
    { key: "plan", label: "Plan name", type: "text" },
    { key: "usage", label: "Usage meters", type: "toggle", quick: true },
    { key: "invoices", label: "Invoices", type: "number", min: 0, max: 6, quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = clamp(w * 0.04, 14, 20)
    const cw = w - pad * 2
    let y = pad + 16
    prims.push(text(pad, y, "Billing", 18, { bold: true }))
    y += 16

    // current plan
    const planH = 88
    prims.push(rect(pad, y, cw, planH))
    const planName = `${truncate(str(p, "plan", "Pro"), 16, cw * 0.4)} plan`
    prims.push(text(pad + 16, y + 30, planName, 16, { bold: true }))
    if (cw > 260) {
      prims.push(...sub(badgeDef, { label: "Active" }, pad + 26 + textWidth(planName, 16), y + 17, 58, 20))
    }
    prims.push(text(pad + 16, y + 54, truncate("$24 a month · renews in 12 days", 13, cw - 170), 13, { color: "muted" }))
    if (cw > 320) {
      prims.push(...sub(buttonDef, { label: "Change plan", variant: "outline", size: "sm" }, pad + cw - 132, y + planH / 2 - 16, 116, 32))
    }
    y += planH + 20

    if (bool(p, "usage") && y + 90 < h - 120) {
      prims.push(...sub(usageMeterDef, { meters: 2 }, pad, y, cw, 88))
      y += 102
    }

    // payment method
    if (y + 60 < h - 60) {
      prims.push(rect(pad, y, cw, 58))
      prims.push(...icon("credit-card", pad + 30, y + 29, 20, { stroke: "muted" }))
      prims.push(text(pad + 54, y + 26, "Visa ···· 4242", 14, { bold: true }))
      prims.push(text(pad + 54, y + 44, "Expires 08/27", 12, { color: "muted" }))
      if (cw > 300) prims.push(text(pad + cw - 16, y + 34, "Update", 13, { align: "right", bold: true }))
      y += 74
    }

    const nInv = clamp(num(p, "invoices", 3), 0, 6)
    const rest = h - y - pad
    if (nInv > 0 && rest > 80) {
      prims.push(text(pad, y + 4, "Invoices", 14, { bold: true }))
      y += 14
      prims.push(...sub(invoiceListDef, { rows: nInv, header: true, frame: false }, pad, y, cw, h - y - pad))
    }
    return prims
  },
}

// -- notifications ----------------------------------------------------------

export const notificationListDef: ComponentDef = {
  kind: "notification-list",
  name: "Notifications",
  category: "blocks",
  group: "App",
  keywords: ["alerts", "bell", "updates", "unread", "inbox"],
  size: { w: 420, h: 360 },
  defaults: { rows: 4, header: true, avatars: true },
  controls: [
    { key: "rows", label: "Rows", type: "number", min: 2, max: 6, quick: true },
    { key: "header", label: "Header", type: "toggle", quick: true },
    { key: "avatars", label: "Avatars", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 14
    let y = pad
    if (bool(p, "header")) {
      prims.push(text(pad, y + 16, "Notifications", 16, { bold: true }))
      if (w > 260) prims.push(text(w - pad, y + 16, "Mark all read", 12, { align: "right", color: "muted" }))
      prims.push(hair(pad, y + 28, w - pad * 2))
      y += 38
    }
    const avail = h - y - pad
    const n = clamp(Math.min(num(p, "rows", 4), Math.floor(avail / 54)), 1, 6)
    const rowH = Math.min(76, avail / Math.max(1, n))
    const titles = [
      "Maya mentioned you",
      "Build finished. Finally.",
      "3 new comments",
      "Your trial ends Friday",
      "Luis shared a board",
      "Someone starred you",
    ]
    const times = ["2m", "18m", "1h", "3h", "Yest.", "Mon"]
    const icons = ["chat-circle", "check", "chat-teardrop-dots", "clock", "folder", "star"]
    const useAvatar = bool(p, "avatars")
    const d = Math.min(32, rowH - 24)
    const ax = pad + 12
    const tx = ax + d + 12
    for (let i = 0; i < n; i++) {
      const cy = y + rowH / 2
      if (i > 0) prims.push(hair(pad, y, w - pad * 2))
      if (i < 2) prims.push(ellipse(pad - 2, cy - 3, 6, 6, { fill: "solid", fillColor: "ink" }))
      if (useAvatar) prims.push(...sub(avatarDef, { content: "icon" }, ax, cy - d / 2, d, d))
      else prims.push(...icon(icons[i], ax + d / 2, cy, d * 0.6, { stroke: "muted" }))
      const tw = w - tx - pad - 34
      prims.push(text(tx, cy - 4, truncate(titles[i], 14, tw), 14, { bold: i < 2 }))
      prims.push(body(tx, cy + 13, tw * 0.86))
      prims.push(text(w - pad, cy - 4, times[i], 11, { align: "right", color: "muted" }))
      y += rowH
    }
    return prims
  },
}

// -- activity feed ----------------------------------------------------------

export const activityFeedDef: ComponentDef = {
  kind: "activity-feed",
  name: "Activity feed",
  category: "blocks",
  group: "App",
  keywords: ["timeline", "history", "log", "recent", "events"],
  size: { w: 400, h: 320 },
  defaults: { rows: 4, header: true, avatars: true },
  controls: [
    { key: "rows", label: "Entries", type: "number", min: 2, max: 6, quick: true },
    { key: "header", label: "Header", type: "toggle", quick: true },
    { key: "avatars", label: "Avatars", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    let y = pad
    if (bool(p, "header")) {
      prims.push(text(pad, y + 14, "Recently", 15, { bold: true }))
      y += 28
    }
    const avail = h - y - pad
    const n = clamp(Math.min(num(p, "rows", 4), Math.floor(avail / 42)), 1, 6)
    const rowH = Math.min(64, avail / Math.max(1, n))
    const d = Math.min(28, rowH - 16)
    const cxDot = pad + d / 2
    const lines = [
      "Maya renamed the doc. Again.",
      "Luis merged final-final-v3",
      "Ana invited four humans",
      "You archived 12 old boards",
      "Kai left a slightly rude note",
      "The robot shipped to prod",
    ]
    const times = ["just now", "12m ago", "an hour ago", "yesterday", "Tuesday", "last week"]
    const first = y + rowH / 2
    const last = y + (n - 0.5) * rowH
    if (n > 1) prims.push(line(cxDot, first, cxDot, last, { stroke: "faint" }))
    for (let i = 0; i < n; i++) {
      const cy = y + rowH / 2
      if (bool(p, "avatars")) prims.push(...sub(avatarDef, { content: "icon" }, pad, cy - d / 2, d, d))
      else {
        prims.push(ellipse(cxDot - 5, cy - 5, 10, 10, { fill: "solid", fillColor: "paper" }))
        prims.push(ellipse(cxDot - 5, cy - 5, 10, 10))
      }
      const tx = pad + d + 14
      const tw = w - tx - pad
      prims.push(text(tx, cy - 2, truncate(lines[i], 13, tw), 13))
      prims.push(text(tx, cy + 15, times[i], 11, { color: "muted" }))
      y += rowH
    }
    return prims
  },
}

// -- comments ---------------------------------------------------------------

export const commentsDef: ComponentDef = {
  kind: "comments",
  name: "Comments",
  category: "blocks",
  group: "App",
  keywords: ["thread", "replies", "discussion", "chat", "feedback"],
  size: { w: 440, h: 400 },
  defaults: { rows: 3, composer: true, threaded: true },
  controls: [
    { key: "rows", label: "Comments", type: "number", min: 1, max: 4, quick: true },
    { key: "composer", label: "Composer", type: "toggle", quick: true },
    { key: "threaded", label: "Threaded", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    const composer = bool(p, "composer")
    const composerH = composer ? 62 : 0
    const avail = h - pad * 2 - composerH
    const n = clamp(Math.min(num(p, "rows", 3), Math.floor(avail / 82)), 1, 4)
    const rowH = Math.min(104, avail / Math.max(1, n))
    const names = ["Maya", "Luis", "Ana", "Kai"]
    const times = ["2h ago", "1h ago", "34m ago", "just now"]
    const threaded = bool(p, "threaded")
    let y = pad
    for (let i = 0; i < n; i++) {
      const indent = threaded && i % 2 === 1 ? Math.min(36, w * 0.09) : 0
      const x = pad + indent
      const d = 32
      prims.push(...sub(avatarDef, { content: "initials", initials: names[i].slice(0, 2) }, x, y, d, d))
      const tx = x + d + 12
      const tw = w - tx - pad
      prims.push(text(tx, y + 14, names[i], 14, { bold: true }))
      prims.push(text(tx + textWidth(names[i], 14) + 16, y + 14, times[i], 11, { color: "muted" }))
      prims.push(...loremLines(tx, y + 32, tw, 2, 15))
      const ay = y + 68
      if (ay < y + rowH - 4) {
        prims.push(text(tx, ay, "Reply", 12, { color: "muted" }))
        prims.push(...icon("heart", tx + 52, ay - 4, 13, { stroke: "muted" }))
        prims.push(text(tx + 64, ay, "4", 12, { color: "muted" }))
      }
      y += rowH
    }
    if (composer) {
      const cy = h - pad - 44
      const d = 30
      prims.push(...sub(avatarDef, { content: "icon" }, pad, cy + 7, d, d))
      const fx = pad + d + 10
      const fw = w - fx - pad
      prims.push(rect(fx, cy, fw, 44))
      prims.push(text(fx + 14, cy + 27, truncate("Say something kind…", 14, fw - 90), 14, { color: "muted" }))
      prims.push(...icon("paper-plane-tilt", fx + fw - 22, cy + 22, 16, { stroke: "muted" }))
    }
    return prims
  },
}

// -- inbox list -------------------------------------------------------------

export const inboxListDef: ComponentDef = {
  kind: "inbox-list",
  name: "Inbox list",
  category: "blocks",
  group: "App",
  keywords: ["mail", "email", "messages", "rows", "threads"],
  size: { w: 620, h: 320 },
  defaults: { rows: 6, star: true, checkbox: true },
  controls: [
    { key: "rows", label: "Rows", type: "number", min: 3, max: 8, quick: true },
    { key: "star", label: "Stars", type: "toggle", quick: true },
    { key: "checkbox", label: "Checkboxes", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const n = clamp(Math.min(num(p, "rows", 6), Math.floor(h / 34)), 1, 8)
    const rowH = h / n
    const senders = ["Maya", "GitHub", "Luis", "Squig", "Mom", "Calendar", "Ana", "No-reply"]
    const subjects = [
      "Re: the thing",
      "PR #482 merged",
      "Lunch, but late",
      "Your weekly doodle",
      "Call your mother",
      "Standup in 5",
      "Design review",
      "Please ignore this",
    ]
    const previews = [
      "I looked at it and honestly it's fine…",
      "main is green again, somehow…",
      "there's a new place near the studio…",
      "4 boards, 2 mockups, 1 regret…",
      "it has been a while, mijo…",
      "with six other people, sorry…",
      "moved to Thursday, again…",
      "this is an automated message…",
    ]
    const times = ["9:41", "8:12", "Yest.", "Tue", "Mon", "Mon", "Sun", "Jul 3"]

    const useCheck = bool(p, "checkbox") && w > 300
    const useStar = bool(p, "star") && w > 260
    let lead = 12
    if (useCheck) lead += 26
    if (useStar) lead += 26
    const senderW = clamp(w * 0.17, 60, 120)
    const subjX = lead + senderW + 12
    const timeX = w - 12
    const textRight = timeX - 52

    for (let i = 0; i < n; i++) {
      const y = i * rowH
      const cy = y + rowH / 2
      const unread = i < 2
      if (i > 0) prims.push(hair(0, y, w))
      let x = 12
      if (useCheck) {
        prims.push(rect(x, cy - 7, 14, 14, { stroke: "muted" }))
        x += 26
      }
      if (useStar) {
        prims.push(...icon("star", x + 7, cy, 14, { stroke: i === 1 ? "ink" : "faint" }))
        x += 26
      }
      prims.push(text(lead, cy + 4, truncate(senders[i], 13, senderW - 8), 13, { bold: unread }))
      const subj = truncate(subjects[i], 13, Math.min(textRight - subjX, 150))
      prims.push(text(subjX, cy + 4, subj, 13, { bold: unread }))
      const px = subjX + textWidth(subj, 13) + 18
      if (textRight - px > 40) {
        prims.push(text(px, cy + 4, truncate(previews[i], 13, textRight - px), 13, { color: "muted" }))
      }
      prims.push(text(timeX, cy + 4, times[i], 11, { align: "right", color: "muted" }))
    }
    return prims
  },
}

// -- kanban board -----------------------------------------------------------

export const kanbanBoardDef: ComponentDef = {
  kind: "kanban-board",
  name: "Kanban board",
  category: "blocks",
  group: "App",
  keywords: ["board", "columns", "cards", "tasks", "trello", "backlog"],
  size: { w: 680, h: 420 },
  defaults: { columns: 3, cards: 3, avatars: true },
  controls: [
    { key: "columns", label: "Columns", type: "number", min: 2, max: 4, quick: true },
    { key: "cards", label: "Cards", type: "number", min: 1, max: 4, quick: true },
    { key: "avatars", label: "Avatars", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const gap = 14
    const cols = clamp(num(p, "columns", 3), 2, 4)
    const colW = (w - gap * (cols - 1)) / cols
    const names = ["To do", "Doing", "Done", "Nope"]
    const counts = ["6", "3", "9", "1"]
    const tags = ["bug", "copy", "design", "chore", "spike", "ugh"]
    const headH = 30
    const bodyY = headH + 4
    const bodyH = h - bodyY
    const want = clamp(num(p, "cards", 3), 1, 4)
    const cardH = clamp((bodyH - 20 - 10 * (want - 1) - 26) / want, 46, 112)
    const nCards = clamp(Math.min(want, Math.floor((bodyH - 26) / (cardH + 10))), 1, 4)

    for (let c = 0; c < cols; c++) {
      const x = c * (colW + gap)
      prims.push(text(x + 2, 18, truncate(names[c], 14, colW - 40), 14, { bold: true }))
      prims.push(...sub(badgeDef, { label: counts[c], variant: "outline" }, x + colW - 30, 4, 28, 20))
      prims.push(rect(x, bodyY, colW, bodyH, { stroke: "faint", dashed: true }))
      let y = bodyY + 10
      const cardW = colW - 20
      for (let i = 0; i < nCards; i++) {
        if (y + cardH > bodyY + bodyH - 8) break
        prims.push(rect(x + 10, y, cardW, cardH))
        prims.push(...loremLines(x + 22, y + 20, cardW - 24, cardH > 92 ? 3 : cardH > 66 ? 2 : 1, 15))
        const fy = y + cardH - 16
        if (cardW > 90) prims.push(...sub(badgeDef, { label: tags[(c * 2 + i) % tags.length], variant: "outline" }, x + 22, fy - 10, 52, 20))
        if (bool(p, "avatars") && cardW > 120) {
          prims.push(...sub(avatarDef, { content: "icon" }, x + 10 + cardW - 32, fy - 10, 20, 20))
        }
        y += cardH + 10
      }
      if (y + 20 < bodyY + bodyH && colW > 110) {
        prims.push(...icon("plus", x + 22, y + 8, 11, { stroke: "faint" }))
        prims.push(text(x + 34, y + 12, truncate("Add a card", 12, colW - 44), 12, { color: "faint" }))
      }
    }
    return prims
  },
}

// -- calendar ---------------------------------------------------------------

export const calendarBlockDef: ComponentDef = {
  kind: "calendar-block",
  name: "Calendar",
  category: "blocks",
  group: "App",
  keywords: ["schedule", "week", "month", "events", "agenda", "dates"],
  size: { w: 640, h: 400 },
  defaults: { view: "week", events: true },
  controls: [
    { key: "view", label: "View", type: "select", options: ["week", "month"], quick: true },
    { key: "events", label: "Events", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const headH = Math.min(44, h * 0.14)
    prims.push(text(16, headH / 2 + 6, "July", 17, { bold: true }))
    if (w > 260) prims.push(text(16 + textWidth("July", 17) + 10, headH / 2 + 6, "2026", 14, { color: "muted" }))
    prims.push(...icon("caret-left", w - 46, headH / 2, 13, { stroke: "muted" }))
    prims.push(...icon("caret-right", w - 20, headH / 2, 13, { stroke: "muted" }))
    if (w > 320) {
      prims.push(...sub(buttonDef, { label: "Today", variant: "outline", size: "sm" }, w - 140, headH / 2 - 15, 76, 30))
    }
    prims.push(hair(0, headH, w))

    const cols = 7
    const colW = w / cols
    const days = ["M", "T", "W", "T", "F", "S", "S"]
    const view = str(p, "view", "week")
    const withEvents = bool(p, "events")

    if (view === "month") {
      const rowsN = 5
      const dowH = 24
      const gridY = headH + dowH
      const rowH = (h - gridY) / rowsN
      for (let c = 0; c < cols; c++) {
        prims.push(text(c * colW + colW / 2, headH + 16, days[c], 11, { align: "center", color: "muted" }))
        if (c > 0) prims.push(line(c * colW, gridY, c * colW, h, { stroke: "faint" }))
      }
      prims.push(hair(0, gridY, w))
      for (let r = 1; r < rowsN; r++) prims.push(hair(0, gridY + r * rowH, w))
      let dnum = 1
      for (let r = 0; r < rowsN; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * colW
          const y = gridY + r * rowH
          const isToday = dnum === 14
          if (isToday) {
            prims.push(ellipse(x + 6, y + 4, 20, 20, { fill: "shade", fillColor: "faint", stroke: "faint" }))
          }
          prims.push(text(x + 16, y + 18, String(dnum), 11, { align: "center", color: isToday ? "ink" : "muted", bold: isToday }))
          if (withEvents && rowH > 40 && [3, 9, 14, 15, 22, 27].includes(dnum)) {
            const eh = Math.min(14, rowH - 26)
            prims.push(rect(x + 6, y + 24, colW - 12, eh, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
          }
          dnum++
        }
      }
      return prims
    }

    // week view
    const dowH = 34
    const gridY = headH + dowH
    const gridH = h - gridY
    const slots = Math.max(3, Math.min(6, Math.floor(gridH / 46)))
    const slotH = gridH / slots
    const nums = ["13", "14", "15", "16", "17", "18", "19"]
    for (let c = 0; c < cols; c++) {
      const x = c * colW
      prims.push(text(x + colW / 2, headH + 14, days[c], 10, { align: "center", color: "muted" }))
      prims.push(text(x + colW / 2, headH + 29, nums[c], 13, { align: "center", bold: c === 1 }))
      if (c > 0) prims.push(line(x, gridY, x, h, { stroke: "faint" }))
    }
    prims.push(hair(0, gridY, w))
    for (let r = 1; r < slots; r++) prims.push(hair(0, gridY + r * slotH, w))
    if (withEvents) {
      const evs: [number, number, number, string][] = [
        [1, 0, 1.4, "Standup"],
        [2, 0.6, 1, "1:1 w/ Maya"],
        [4, 1.2, 1.8, "Deep work"],
        [5, 2.2, 1, "Doodle jam"],
      ]
      for (const [c, s, len, label] of evs) {
        if (c >= cols) continue
        const y = gridY + s * slotH + 4
        const eh = Math.min(len * slotH - 8, gridY + gridH - y - 4)
        if (eh < 14) continue
        prims.push(rect(c * colW + 5, y, colW - 10, eh, { fill: "shade", fillColor: "faint", stroke: "muted", strokeWidth: 1 }))
        if (colW > 62) prims.push(text(c * colW + 11, y + 15, truncate(label, 11, colW - 20), 11))
      }
    }
    return prims
  },
}

// -- file browser -----------------------------------------------------------

export const fileBrowserDef: ComponentDef = {
  kind: "file-browser",
  name: "File browser",
  category: "blocks",
  group: "App",
  keywords: ["files", "folders", "drive", "documents", "grid", "explorer"],
  size: { w: 640, h: 400 },
  defaults: { layout: "grid", items: 8, toolbar: true },
  controls: [
    { key: "layout", label: "Layout", type: "select", options: ["grid", "list"], quick: true },
    { key: "items", label: "Items", type: "number", min: 3, max: 12, quick: true },
    { key: "toolbar", label: "Toolbar", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    const cw = w - pad * 2
    let y = pad
    if (bool(p, "toolbar")) {
      prims.push(...sub(breadcrumbDef, { items: "Home, Projects, Doodles" }, pad, y, Math.min(cw * 0.55, 240), 24))
      let rx = w - pad
      if (cw > 380) {
        prims.push(...sub(buttonDef, { label: "New", variant: "filled", size: "sm", icon: "left" }, rx - 84, y - 3, 84, 30))
        rx -= 96
      }
      if (cw > 300) {
        prims.push(...icon("squares-four", rx - 12, y + 12, 15, { stroke: "ink" }))
        prims.push(...icon("list-bullets", rx - 38, y + 12, 15, { stroke: "faint" }))
      }
      y += 34
      prims.push(hair(pad, y, cw))
      y += 14
    }

    const names = [
      "Sketches",
      "Old ideas",
      "Screenshots",
      "final-final.fig",
      "logo-v9.png",
      "notes.md",
      "budget.xls",
      "brand.pdf",
      "cats.jpg",
      "todo.txt",
      "archive.zip",
      "misc.psd",
    ]
    const n = clamp(num(p, "items", 8), 1, 12)
    const areaH = h - y - pad

    if (str(p, "layout", "grid") === "grid") {
      const gap = 14
      const cols = clamp(Math.floor((cw + gap) / (110 + gap)), 2, 6)
      const tileW = (cw - gap * (cols - 1)) / cols
      const tileH = Math.min(104, tileW * 0.9)
      const rowsFit = Math.max(1, Math.floor((areaH + gap) / (tileH + gap)))
      const shown = Math.min(n, cols * rowsFit)
      for (let i = 0; i < shown; i++) {
        const c = i % cols
        const r = Math.floor(i / cols)
        const x = pad + c * (tileW + gap)
        const ty = y + r * (tileH + gap)
        prims.push(rect(x, ty, tileW, tileH))
        prims.push(...icon(i < 3 ? "folder" : "file", x + tileW / 2, ty + tileH * 0.38, Math.min(30, tileH * 0.34), { stroke: "muted" }))
        prims.push(text(x + tileW / 2, ty + tileH - 14, truncate(names[i], 11, tileW - 12), 11, { align: "center" }))
      }
    } else {
      const rowH = Math.min(40, areaH / Math.max(1, Math.min(n, Math.floor(areaH / 30))))
      const shown = Math.min(n, Math.max(1, Math.floor(areaH / rowH)))
      const sizes = ["—", "—", "—", "4.2 MB", "812 KB", "3 KB", "88 KB", "1.1 MB", "2.4 MB", "1 KB", "18 MB", "9 MB"]
      const when = ["today", "today", "yesterday", "Tuesday", "Jul 3", "Jun 28", "Jun 21", "Jun 2", "May 30", "May 4", "Apr 9", "Mar 1"]
      for (let i = 0; i < shown; i++) {
        const ry = y + i * rowH
        const cy = ry + rowH / 2
        if (i > 0) prims.push(hair(pad, ry, cw))
        prims.push(...icon(i < 3 ? "folder" : "file", pad + 12, cy, 16, { stroke: "muted" }))
        prims.push(text(pad + 30, cy + 4, truncate(names[i], 13, cw * 0.5), 13))
        if (cw > 320) prims.push(text(w - pad - 90, cy + 4, sizes[i], 11, { align: "right", color: "muted" }))
        if (cw > 240) prims.push(text(w - pad, cy + 4, when[i], 11, { align: "right", color: "muted" }))
      }
    }
    return prims
  },
}

// -- search results ---------------------------------------------------------

export const searchResultsDef: ComponentDef = {
  kind: "search-results",
  name: "Search results",
  category: "blocks",
  group: "App",
  keywords: ["search", "results", "query", "list", "find"],
  size: { w: 660, h: 440 },
  defaults: { results: 4, bar: true, sidebar: false },
  controls: [
    { key: "results", label: "Results", type: "number", min: 2, max: 6, quick: true },
    { key: "bar", label: "Search bar", type: "toggle", quick: true },
    { key: "sidebar", label: "Filters", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 18
    let y = pad
    if (bool(p, "bar")) {
      const bw = Math.min(96, w * 0.18)
      const fw = w - pad * 2 - (w > 380 ? bw + 10 : 0)
      prims.push(...sub(inputDef, { showLabel: false, icon: "search", placeholder: "boxes that look hand drawn" }, pad, y, fw, 40))
      if (w > 380) prims.push(...sub(buttonDef, { label: "Search", variant: "filled", size: "sm" }, pad + fw + 10, y, bw, 40))
      y += 50
      prims.push(text(pad, y, "About 4,382 results (0.24 seconds)", 11, { color: "muted" }))
      y += 14
    }

    let left = pad
    let cw = w - pad * 2
    if (bool(p, "sidebar") && w > 460) {
      const sw = Math.min(150, w * 0.24)
      prims.push(text(pad, y + 16, "Filters", 13, { bold: true }))
      const opts = ["Boards", "Docs", "People", "Archived"]
      for (let i = 0; i < opts.length; i++) {
        const fy = y + 32 + i * 28
        if (fy + 20 > h - pad) break
        prims.push(...sub(checkboxDef, { label: opts[i], checked: i === 0 }, pad, fy, sw - 12, 22))
      }
      prims.push(line(pad + sw, y, pad + sw, h - pad, { stroke: "faint" }))
      left = pad + sw + 20
      cw = w - left - pad
    }

    const n = clamp(num(p, "results", 4), 1, 6)
    const urls = [
      "squig.sh › library › boxes",
      "docs.squig.sh › drawing",
      "blog.squig.sh › why-wobbly",
      "squig.sh › templates › app",
      "forum.squig.sh › t › 4821",
      "squig.sh › changelog",
    ]
    const titles = [
      "Boxes, but wobbly — the squig library",
      "How to draw a box that looks unsure",
      "Why wireframes should look unfinished",
      "App templates you can ruin yourself",
      "Anyone else drawing rectangles all day?",
      "Changelog: more rectangles",
    ]
    const resH = Math.min(88, (h - y - pad) / n)
    for (let i = 0; i < n; i++) {
      const ry = y + 18 + i * resH
      if (ry + 40 > h - pad) break
      prims.push(text(left, ry, truncate(urls[i], 11, cw), 11, { color: "muted" }))
      prims.push(text(left, ry + 20, truncate(titles[i], 16, cw), 16, { bold: true }))
      prims.push(...loremLines(left, ry + 38, cw * 0.94, resH > 74 ? 2 : 1, 14))
    }
    return prims
  },
}

// -- onboarding checklist ---------------------------------------------------

export const onboardingChecklistDef: ComponentDef = {
  kind: "onboarding-checklist",
  name: "Onboarding checklist",
  category: "blocks",
  group: "App",
  keywords: ["setup", "getting started", "steps", "progress", "todo"],
  size: { w: 380, h: 310 },
  defaults: { steps: 4, active: 3, progress: true },
  controls: [
    { key: "steps", label: "Steps", type: "number", min: 3, max: 5, quick: true },
    { key: "active", label: "Current step", type: "number", min: 1, max: 5, quick: true },
    { key: "progress", label: "Progress bar", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 18
    const cw = w - pad * 2
    const n = clamp(num(p, "steps", 4), 3, 5)
    const active = clamp(num(p, "active", 3), 1, n) - 1
    let y = pad + 16
    prims.push(text(pad, y, truncate("Almost a real account", 16, cw - 70), 16, { bold: true }))
    prims.push(text(w - pad, y, `${active} of ${n}`, 12, { align: "right", color: "muted" }))
    y += 14
    if (bool(p, "progress")) {
      prims.push(...sub(progressDef, { value: Math.round((active / n) * 100) }, pad, y, cw, 10))
      y += 24
    }
    const labels = ["Make an account", "Draw one box", "Invite a human", "Ship something", "Tell your boss"]
    const subs = ["Done, obviously.", "Any box. It counts.", "Misery loves company.", "Even something small.", "Take the credit."]
    const avail = h - y - pad
    const rowH = Math.min(52, avail / n)
    for (let i = 0; i < n; i++) {
      const ry = y + i * rowH
      const cy = ry + rowH / 2
      const done = i < active
      const isNow = i === active
      const d = 22
      prims.push(ellipse(pad, cy - d / 2, d, d, isNow ? { strokeWidth: 2 } : { stroke: done ? "ink" : "faint" }))
      if (done) prims.push(...icon("check", pad + d / 2, cy, 12))
      const tx = pad + d + 12
      const tw = cw - d - 12 - (isNow ? 76 : 0)
      prims.push(text(tx, cy - (rowH > 42 ? 2 : -4), truncate(labels[i], 14, tw), 14, { bold: isNow, color: done ? "muted" : "ink" }))
      if (rowH > 42) prims.push(text(tx, cy + 15, truncate(subs[i], 11, tw), 11, { color: "muted" }))
      if (isNow && cw > 240) {
        prims.push(...sub(buttonDef, { label: "Do it", variant: "filled", size: "sm" }, w - pad - 68, cy - 15, 68, 30))
      }
    }
    return prims
  },
}

// -- inline empty state -----------------------------------------------------

export const emptyBlockDef: ComponentDef = {
  kind: "empty-block",
  name: "Empty block",
  category: "blocks",
  group: "App",
  keywords: ["empty", "blank", "nothing", "zero state", "placeholder"],
  size: { w: 360, h: 220 },
  defaults: { title: "Nothing here yet", icon: "folder", cta: true },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "icon", label: "Icon", type: "select", options: ["folder", "file", "magnifying-glass", "star", "sparkle", "bell"], quick: true },
    { key: "cta", label: "Button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h, { stroke: "faint", dashed: true })]
    const cta = bool(p, "cta")
    const d = clamp(Math.min(h * 0.3, w * 0.22), 36, 64)
    const blockH = d + 20 + 20 + 18 + (cta ? 48 : 0)
    let y = Math.max(12, (h - blockH) / 2)
    prims.push(ellipse(w / 2 - d / 2, y, d, d, { stroke: "faint", dashed: true }))
    prims.push(...icon(str(p, "icon", "folder"), w / 2, y + d / 2, d * 0.42, { stroke: "muted" }))
    y += d + 26
    prims.push(text(w / 2, y, truncate(str(p, "title", "Nothing here yet"), 16, w - 32), 16, { align: "center", bold: true }))
    y += 20
    if (y < h - 6) {
      prims.push(text(w / 2, y, truncate("Make one and it shows up right here.", 12, w - 32), 12, { align: "center", color: "muted" }))
    }
    y += 18
    if (cta && y + 40 < h) {
      prims.push(...sub(buttonDef, { label: "Make one", variant: "filled", size: "sm" }, w / 2 - 62, y, 124, 34))
    }
    return prims
  },
}

// -- settings rows ----------------------------------------------------------

export const settingsBlockDef: ComponentDef = {
  kind: "settings-block",
  name: "Settings rows",
  category: "blocks",
  group: "App",
  keywords: ["preferences", "toggles", "options", "switches", "config"],
  size: { w: 520, h: 330 },
  defaults: { rows: 4, header: true },
  controls: [
    { key: "rows", label: "Rows", type: "number", min: 2, max: 5, quick: true },
    { key: "header", label: "Header", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 18
    const cw = w - pad * 2
    let y = pad
    if (bool(p, "header")) {
      prims.push(text(pad, y + 16, "Preferences", 16, { bold: true }))
      prims.push(hair(pad, y + 28, cw))
      y += 38
    }
    const titles = ["Email me", "Dark mode", "Time zone", "Weekly digest", "Two-factor"]
    const descs = [
      "Only when something actually happens.",
      "For the late-night doodling.",
      "So meetings land in the right hour.",
      "One tidy email. Every Monday.",
      "Because your password is 'password'.",
    ]
    const kinds = ["switch", "switch", "select", "switch", "switch"]
    const avail = h - y - pad
    const n = clamp(Math.min(num(p, "rows", 4), Math.floor(avail / 44)), 1, 5)
    const rowH = Math.min(72, avail / Math.max(1, n))
    for (let i = 0; i < n; i++) {
      const ry = y + i * rowH
      const cy = ry + rowH / 2
      if (i > 0) prims.push(hair(pad, ry, cw))
      const ctrlW = kinds[i] === "select" ? Math.min(118, cw * 0.3) : 44
      const tw = cw - ctrlW - 24
      prims.push(text(pad, cy - 4, truncate(titles[i], 14, tw), 14, { bold: true }))
      if (rowH > 44) prims.push(text(pad, cy + 14, truncate(descs[i], 12, tw), 12, { color: "muted" }))
      if (kinds[i] === "select") {
        prims.push(...sub(selectDef, { showLabel: false, value: "GMT−6" }, w - pad - ctrlW, cy - 16, ctrlW, 32))
      } else {
        prims.push(...sub(switchDef, { showLabel: false, on: i !== 1 && i !== 4 }, w - pad - 44, cy - 13, 44, 26))
      }
    }
    return prims
  },
}

// -- profile header ---------------------------------------------------------

export const profileHeaderDef: ComponentDef = {
  kind: "profile-header",
  name: "Profile header",
  category: "blocks",
  group: "App",
  keywords: ["profile", "cover", "banner", "bio", "stats", "follow"],
  size: { w: 560, h: 250 },
  defaults: { cover: true, stats: true, cta: true },
  controls: [
    { key: "cover", label: "Cover", type: "toggle", quick: true },
    { key: "stats", label: "Stats", type: "toggle", quick: true },
    { key: "cta", label: "Button", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = clamp(w * 0.05, 16, 28)
    const coverH = bool(p, "cover") ? clamp(h * 0.36, 40, 92) : 0
    if (coverH) {
      prims.push(rect(0, 0, w, coverH, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", w / 2, coverH / 2, Math.min(26, coverH * 0.4), { stroke: "faint" }))
    }
    const d = clamp(h * 0.31, 48, 78)
    const ax = pad
    const ay = coverH ? coverH - d * 0.48 : pad
    prims.push(ellipse(ax - 5, ay - 5, d + 10, d + 10, { fill: "solid", fillColor: "paper", stroke: "faint" }))
    prims.push(...sub(avatarDef, { content: "initials", initials: "PS", status: true }, ax, ay, d, d))

    let y = ay + d + 26
    prims.push(text(pad, y, truncate("Pablo Scribbles", 20, w - pad * 2 - 110), 20, { bold: true }))
    prims.push(text(pad + textWidth("Pablo Scribbles", 20) + 18, y - 2, "@squiggle", 13, { color: "muted" }))
    y += 20
    if (y < h - 6) {
      prims.push(text(pad, y, truncate("Draws boxes. Occasionally circles. Rarely on time.", 13, w - pad * 2 - 20), 13, { color: "muted" }))
    }
    y += 24

    if (bool(p, "cta")) {
      const by = coverH ? coverH + 14 : pad
      prims.push(...sub(buttonDef, { label: "Follow", variant: "filled", size: "sm" }, w - pad - 96, by, 96, 34))
      if (w > 420) prims.push(...icon("dots-three", w - pad - 116, by + 17, 16, { stroke: "muted" }))
    }

    if (bool(p, "stats") && y + 24 < h) {
      const vals = ["128", "4.2k", "180"]
      const labs = ["boards", "followers", "following"]
      const step = Math.min(110, (w - pad * 2) / 3)
      for (let i = 0; i < 3; i++) {
        const sx = pad + i * step
        prims.push(text(sx, y, vals[i], 15, { bold: true }))
        prims.push(text(sx + textWidth(vals[i], 15) + 11, y, labs[i], 11, { color: "muted" }))
      }
    }
    return prims
  },
}

// -- command palette --------------------------------------------------------

export const commandPaletteBlockDef: ComponentDef = {
  kind: "command-palette-block",
  name: "Command palette",
  category: "blocks",
  group: "App",
  keywords: ["cmdk", "palette", "quick actions", "spotlight", "shortcut"],
  size: { w: 460, h: 340 },
  defaults: { rows: 5, hints: true, groups: true },
  controls: [
    { key: "rows", label: "Rows", type: "number", min: 3, max: 7, quick: true },
    { key: "hints", label: "Key hints", type: "toggle", quick: true },
    { key: "groups", label: "Group labels", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h, { fill: "solid", fillColor: "paper" }), rect(0, 0, w, h)]
    const pad = 14
    const searchH = Math.min(52, h * 0.18)
    prims.push(...icon("magnifying-glass", 26, searchH / 2, 16, { stroke: "muted" }))
    prims.push(text(48, searchH / 2 + 6, truncate("Type a thing…", 15, w - 110), 15, { color: "muted" }))
    if (w > 260) prims.push(...kbd(w - 48, searchH / 2, "esc"))
    prims.push(hair(0, searchH, w))

    const labels = ["New board", "Search everything", "Invite a human", "Toggle dark mode", "Export as PNG", "Go to settings", "Log out"]
    const names = ["plus", "magnifying-glass", "users", "moon", "download-simple", "gear", "sign-out"]
    const hints = ["Ctrl N", "/", "Ctrl I", "Ctrl D", "Ctrl E", "Ctrl ,", ""]
    const showGroups = bool(p, "groups")
    const n = clamp(num(p, "rows", 5), 1, 7)
    const groupAt = showGroups ? Math.min(3, n) : -1
    const groupCount = showGroups ? (n > 3 ? 2 : 1) : 0
    const avail = h - searchH - pad
    const rowH = Math.min(38, (avail - groupCount * 22) / Math.max(1, n))
    let y = searchH + 6
    for (let i = 0; i < n; i++) {
      if (showGroups && (i === 0 || i === groupAt)) {
        prims.push(text(pad + 4, y + 14, i === 0 ? "ACTIONS" : "RECENT", 9, { color: "muted", bold: true }))
        y += 22
      }
      if (y + rowH > h - 4) break
      if (i === 0) prims.push(rect(6, y, w - 12, rowH - 2, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
      const cy = y + (rowH - 2) / 2
      prims.push(...icon(names[i], 26, cy, 15, { stroke: i === 0 ? "ink" : "muted" }))
      const hw = bool(p, "hints") && hints[i] ? kbdW(hints[i]) + 16 : 0
      prims.push(text(48, cy + 5, truncate(labels[i], 14, w - 60 - hw), 14, { bold: i === 0 }))
      if (hw && w > 240) prims.push(...kbd(w - pad - kbdW(hints[i]), cy, hints[i]))
      y += rowH
    }
    return prims
  },
}

// ===========================================================================
// AI
// ===========================================================================

// -- ai input ---------------------------------------------------------------

export const aiInputDef: ComponentDef = {
  kind: "ai-input",
  name: "AI prompt box",
  category: "blocks",
  group: "AI",
  keywords: ["prompt", "composer", "chat input", "textarea", "ask"],
  size: { w: 480, h: 170 },
  defaults: { placeholder: "Ask for something impossible…", model: "Squig 4.5", attach: true, send: true },
  controls: [
    { key: "placeholder", label: "Placeholder", type: "text" },
    { key: "model", label: "Model", type: "text" },
    { key: "attach", label: "Attach chip", type: "toggle", quick: true },
    { key: "send", label: "Send button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const barH = Math.min(50, h * 0.34)
    const ty = h - barH
    prims.push(text(16, 34, truncate(str(p, "placeholder", "Ask for something impossible…"), 15, w - 32), 15, { color: "muted" }))
    if (h > 110) prims.push(...loremLines(16, 58, (w - 32) * 0.7, 1, 14))
    prims.push(hair(0, ty, w))

    const cy = ty + barH / 2
    let x = 12
    const chipH = clamp(barH - 14, 18, 30)
    if (bool(p, "attach")) {
      prims.push(ellipse(x, cy - chipH / 2, chipH, chipH, { stroke: "muted" }))
      prims.push(...icon("paperclip", x + chipH / 2, cy, 14, { stroke: "muted" }))
      x += chipH + 10
    }
    const model = truncate(str(p, "model", "Squig 4.5"), 12, w * 0.34)
    const chipW = textWidth(model, 12) + 52
    if (x + chipW < w - 60) {
      prims.push(pill(x, cy - chipH / 2, chipW, chipH, { stroke: "muted" }))
      prims.push(...icon("sparkle", x + 17, cy, 13, { stroke: "muted" }))
      prims.push(text(x + 30, cy + 4, model, 12))
      prims.push(...icon("caret-down", x + chipW - 14, cy, 10, { stroke: "muted" }))
    }
    if (bool(p, "send")) {
      const d = Math.min(36, barH - 12)
      prims.push(ellipse(w - 12 - d, cy - d / 2, d, d, { fill: "shade", fillColor: "ink" }))
      prims.push(...icon("paper-plane-tilt", w - 12 - d / 2, cy, d * 0.5))
    }
    return prims
  },
}

// -- ai chat ----------------------------------------------------------------

export const aiChatDef: ComponentDef = {
  kind: "ai-chat",
  name: "AI chat",
  category: "blocks",
  group: "AI",
  keywords: ["assistant", "conversation", "bubbles", "chatbot", "thread"],
  size: { w: 460, h: 440 },
  defaults: { turns: 2, typing: true, composer: true },
  controls: [
    { key: "turns", label: "Turns", type: "number", min: 1, max: 3, quick: true },
    { key: "typing", label: "Typing dots", type: "toggle", quick: true },
    { key: "composer", label: "Composer", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    const cw = w - pad * 2
    const composer = bool(p, "composer")
    const composerH = composer ? 60 : 0
    const bottom = h - pad - composerH
    const markD = 28
    let y = pad
    const turns = clamp(num(p, "turns", 3), 1, 3)

    for (let i = 0; i < turns; i++) {
      // user, right aligned
      const uw = cw * 0.6
      const uh = 50
      if (y + uh > bottom) break
      prims.push(rect(w - pad - uw, y, uw, uh, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
      prims.push(rect(w - pad - uw, y, uw, uh))
      prims.push(...loremLines(w - pad - uw + 14, y + 20, uw - 28, 2, 15))
      y += uh + 14

      // assistant, left aligned with the mark
      const aw = cw - markD - 12
      const ah = i === turns - 1 ? 88 : 68
      if (y + ah > bottom) break
      prims.push(...aiMark(pad, y, markD))
      prims.push(rect(pad + markD + 12, y, aw, ah))
      prims.push(...loremLines(pad + markD + 26, y + 22, aw - 28, ah > 78 ? 4 : 3, 16))
      y += ah + 14
    }

    if (bool(p, "typing") && y + 34 < bottom) {
      prims.push(...aiMark(pad, y, markD))
      const bw = 56
      prims.push(rect(pad + markD + 12, y + 2, bw, 26))
      for (let d = 0; d < 3; d++) {
        prims.push(ellipse(pad + markD + 12 + 14 + d * 12, y + 12, 6, 6, { fill: "solid", fillColor: "muted", stroke: "muted" }))
      }
    }

    if (composer) {
      const cy0 = h - pad - 48
      prims.push(rect(pad, cy0, cw, 48))
      prims.push(...icon("paperclip", pad + 22, cy0 + 24, 15, { stroke: "muted" }))
      prims.push(text(pad + 40, cy0 + 29, truncate("Ask anything, even the dumb one", 14, cw - 96), 14, { color: "muted" }))
      prims.push(ellipse(pad + cw - 42, cy0 + 8, 32, 32, { fill: "shade", fillColor: "ink" }))
      prims.push(...icon("paper-plane-tilt", pad + cw - 26, cy0 + 24, 15))
    }
    return prims
  },
}

// -- ai prompt suggestions --------------------------------------------------

export const aiPromptSuggestionsDef: ComponentDef = {
  kind: "ai-prompt-suggestions",
  name: "Prompt suggestions",
  category: "blocks",
  group: "AI",
  keywords: ["prompts", "starters", "suggestions", "chips", "ideas"],
  size: { w: 520, h: 120 },
  defaults: { count: 3, style: "card" },
  controls: [
    { key: "count", label: "Suggestions", type: "number", min: 2, max: 4, quick: true },
    { key: "style", label: "Style", type: "select", options: ["card", "pill"], quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const copy = ["Explain this like I'm five", "Make it 30% funnier", "Write the boring parts", "Find the bug I made"]
    const names = ["graduation-cap", "smiley", "pencil-simple", "bug"]
    const n = clamp(num(p, "count", 3), 2, 4)

    if (str(p, "style", "card") === "pill") {
      const gap = 10
      const ph = Math.min(36, h)
      let x = 0
      let y = 0
      for (let i = 0; i < n; i++) {
        const label = truncate(copy[i], 13, w - 60)
        const pw = Math.min(w, textWidth(label, 13) + 46)
        if (x + pw > w && x > 0) {
          x = 0
          y += ph + gap
        }
        if (y + ph > h) break
        prims.push(pill(x, y, pw, ph, { stroke: "muted" }))
        prims.push(...icon(names[i], x + 20, y + ph / 2, 14, { stroke: "muted" }))
        prims.push(text(x + 34, y + ph / 2 + 4, label, 13))
        x += pw + gap
      }
      return prims
    }

    const gap = 12
    const cw = (w - gap * (n - 1)) / n
    const ch = Math.min(h, 104)
    for (let i = 0; i < n; i++) {
      const x = i * (cw + gap)
      prims.push(rect(x, 0, cw, ch))
      const iy = Math.min(24, ch * 0.26)
      prims.push(...icon(names[i], x + 22, iy, Math.min(16, ch * 0.2), { stroke: "muted" }))
      const ty = Math.min(54, iy + 22)
      const lines = wrap(copy[i], 13, cw - 28, ch - ty > 22 ? 2 : 1)
      lines.forEach((l, li) => prims.push(text(x + 14, ty + li * 17, l, 13)))
      if (cw > 110 && ch > 76) prims.push(...icon("arrow-right", x + cw - 20, ch - 16, 12, { stroke: "faint" }))
    }
    return prims
  },
}

// -- ai response ------------------------------------------------------------

export const aiResponseDef: ComponentDef = {
  kind: "ai-response",
  name: "AI response",
  category: "blocks",
  group: "AI",
  keywords: ["assistant", "message", "answer", "code", "reply"],
  size: { w: 460, h: 320 },
  defaults: { lines: 3, code: true, actions: true },
  controls: [
    { key: "lines", label: "Body lines", type: "number", min: 2, max: 5, quick: true },
    { key: "code", label: "Code block", type: "toggle", quick: true },
    { key: "actions", label: "Actions", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const markD = 28
    prims.push(...aiMark(0, 0, markD))
    prims.push(text(markD + 12, 19, "Squig", 14, { bold: true }))
    prims.push(text(markD + 12 + textWidth("Squig", 14) + 10, 19, "just now", 11, { color: "muted" }))

    const actions = bool(p, "actions")
    let y = markD + 18
    const nLines = clamp(num(p, "lines", 3), 1, 5)
    const gap = 17
    prims.push(...loremLines(0, y, w, nLines, gap))
    y += nLines * gap + 8

    if (bool(p, "code")) {
      const ch = (actions ? h - 26 : h - 6) - y
      if (ch > 44) {
        prims.push(rect(0, y, w, ch, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
        prims.push(...icon("code", 20, y + 16, 13, { stroke: "muted" }))
        prims.push(...icon("copy", w - 20, y + 16, 13, { stroke: "muted" }))
        const codeLines = [0.5, 0.72, 0.34, 0.6, 0.44, 0.66, 0.3, 0.55]
        const fit = Math.min(codeLines.length, Math.floor((ch - 34) / 15))
        for (let i = 0; i < fit; i++) {
          const inset = i % 4 === 1 || i % 4 === 2 ? 30 : 14
          prims.push(line(inset, y + 36 + i * 15, inset + (w - inset - 20) * codeLines[i], y + 36 + i * 15, { stroke: "muted", strokeWidth: 1.3 }))
        }
        y += ch + 10
      }
    }

    if (actions) {
      const cy = h - 8
      prims.push(...icon("copy", 10, cy, 15, { stroke: "muted" }))
      prims.push(...icon("thumbs-up", 38, cy, 15, { stroke: "muted" }))
      prims.push(...icon("thumbs-down", 66, cy + 1, 15, { stroke: "muted" }))
      if (w > 260) prims.push(...icon("arrows-clockwise", 94, cy, 15, { stroke: "muted" }))
    }
    return prims
  },
}

// -- ai agent card ----------------------------------------------------------

export const aiAgentCardDef: ComponentDef = {
  kind: "ai-agent-card",
  name: "Agent card",
  category: "blocks",
  group: "AI",
  keywords: ["agent", "bot", "robot", "automation", "worker"],
  size: { w: 300, h: 170 },
  defaults: { name: "Bug Squisher", status: "running", cta: true },
  controls: [
    { key: "name", label: "Name", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["running", "idle", "asleep"], quick: true },
    { key: "cta", label: "Run button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    const d = clamp(h * 0.24, 32, 44)
    prims.push(rect(pad, pad, d, d))
    prims.push(...icon("robot", pad + d / 2, pad + d / 2, d * 0.54))
    const tx = pad + d + 14
    const tw = w - tx - pad
    prims.push(text(tx, pad + 18, truncate(str(p, "name", "Bug Squisher"), 16, tw), 16, { bold: true }))
    const status = str(p, "status", "running")
    prims.push(ellipse(tx, pad + 28, 8, 8, status === "running" ? { fill: "solid", fillColor: "ink" } : { stroke: "muted" }))
    prims.push(text(tx + 14, pad + 36, status, 12, { color: "muted" }))

    const by = h - 52
    const bodyN = Math.min(2, Math.floor((by - pad - d - 26) / 16))
    if (bodyN > 0) prims.push(...loremLines(pad, pad + d + 24, w - pad * 2, bodyN, 16))
    prims.push(hair(pad, by, w - pad * 2))
    prims.push(text(pad, by + 24, "12 runs · 2 regrets", 11, { color: "muted" }))
    if (bool(p, "cta") && w > 220) {
      prims.push(...sub(buttonDef, { label: "Run it", variant: "filled", size: "sm" }, w - pad - 78, by + 8, 78, 32))
    }
    return prims
  },
}

// -- ai thinking ------------------------------------------------------------

export const aiThinkingDef: ComponentDef = {
  kind: "ai-thinking",
  name: "AI thinking",
  category: "blocks",
  group: "AI",
  keywords: ["reasoning", "steps", "spinner", "loading", "chain"],
  size: { w: 400, h: 180 },
  defaults: { state: "steps", steps: 3 },
  controls: [
    { key: "state", label: "State", type: "select", options: ["steps", "collapsed"], quick: true },
    { key: "steps", label: "Steps", type: "number", min: 2, max: 5, quick: true },
  ],
  render(p, w, h) {
    const collapsed = str(p, "state", "steps") === "collapsed"
    const headH = collapsed ? Math.min(h, 46) : Math.min(44, h * 0.3)
    const prims: Prim[] = [rect(0, 0, w, collapsed ? headH : h)]
    const cy = headH / 2
    // a spinner: three-quarter arc drawn as a polyline
    const r = 8
    const arc: [number, number][] = []
    for (let a = -90; a <= 180; a += 30) {
      const rad = (a * Math.PI) / 180
      arc.push([22 + Math.cos(rad) * r, cy + Math.sin(rad) * r])
    }
    prims.push(poly(arc, false, { stroke: "muted", strokeWidth: 1.6 }))
    prims.push(text(42, cy + 5, "Thinking about it…", 14))
    prims.push(text(w - 44, cy + 5, "4.2s", 11, { align: "right", color: "muted" }))
    prims.push(...icon(collapsed ? "caret-right" : "caret-down", w - 20, cy, 12, { stroke: "muted" }))
    if (collapsed) return prims

    prims.push(hair(0, headH, w))
    const copy = [
      "Read the prompt. Twice.",
      "Searched 14 files",
      "Found the culprit",
      "Wrote a fix",
      "Second-guessed itself",
    ]
    const avail = h - headH - 12
    const n = clamp(Math.min(num(p, "steps", 3), Math.floor(avail / 26)), 1, 5)
    const rowH = Math.min(40, avail / Math.max(1, n))
    for (let i = 0; i < n; i++) {
      const ry = headH + 8 + i * rowH
      const rcy = ry + rowH / 2
      const current = i === n - 1
      if (current) prims.push(ellipse(16, rcy - 6, 12, 12, { stroke: "muted" }))
      else prims.push(...icon("check", 22, rcy, 12, { stroke: "muted" }))
      if (i < n - 1) prims.push(line(22, rcy + 8, 22, rcy + rowH - 8, { stroke: "faint" }))
      prims.push(text(40, rcy + 5, truncate(copy[i], 13, w - 56), 13, { color: current ? "ink" : "muted" }))
    }
    return prims
  },
}

// ===========================================================================
// Commerce
// ===========================================================================

// -- order summary ----------------------------------------------------------

export const orderSummaryDef: ComponentDef = {
  kind: "order-summary",
  name: "Order summary",
  category: "blocks",
  group: "Commerce",
  keywords: ["totals", "subtotal", "tax", "receipt", "checkout"],
  size: { w: 320, h: 270 },
  defaults: { items: 3, title: true, frame: true },
  controls: [
    { key: "items", label: "Line items", type: "number", min: 1, max: 4, quick: true },
    { key: "title", label: "Title", type: "toggle", quick: true },
    { key: "frame", label: "Frame", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    if (bool(p, "frame")) prims.push(rect(0, 0, w, h))
    const pad = 16
    const cw = w - pad * 2
    let y = pad
    if (bool(p, "title")) {
      prims.push(text(pad, y + 14, "Order summary", 16, { bold: true }))
      prims.push(hair(pad, y + 26, cw))
      y += 38
    }
    const items: [string, string][] = [
      ["1 × Doodle Pad", "$24.00"],
      ["2 × Fine-tip pens", "$18.00"],
      ["1 × Sticker chaos", "$6.00"],
      ["1 × Eraser, deluxe", "$4.00"],
    ]
    const totals: [string, string][] = [
      ["Subtotal", "$48.00"],
      ["Shipping", "$6.00"],
      ["Tax, sadly", "$4.32"],
    ]
    const n = clamp(num(p, "items", 3), 1, 4)
    const bottomBlock = 3 * 20 + 34
    for (let i = 0; i < n; i++) {
      if (y + 22 > h - pad - bottomBlock) break
      prims.push(...ledgerRow(pad, y + 12, cw, items[i][0], items[i][1]))
      y += 24
    }
    y = Math.max(y, h - pad - bottomBlock)
    prims.push(hair(pad, y, cw))
    y += 18
    for (const [label, value] of totals) {
      if (y + 14 > h - pad - 26) break
      prims.push(...ledgerRow(pad, y, cw, label, value))
      y += 20
    }
    prims.push(hair(pad, y - 4, cw))
    prims.push(...ledgerRow(pad, Math.min(y + 18, h - pad - 2), cw, "Total", "$58.32", true))
    return prims
  },
}

// -- cart -------------------------------------------------------------------

export const cartDef: ComponentDef = {
  kind: "cart",
  name: "Cart",
  category: "blocks",
  group: "Commerce",
  keywords: ["basket", "bag", "line items", "quantity", "shopping"],
  size: { w: 560, h: 430 },
  defaults: { items: 3, totals: true, cta: true },
  controls: [
    { key: "items", label: "Items", type: "number", min: 1, max: 4, quick: true },
    { key: "totals", label: "Totals", type: "toggle", quick: true },
    { key: "cta", label: "Checkout button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    const cw = w - pad * 2
    let y = pad
    prims.push(text(pad, y + 16, "Your cart", 18, { bold: true }))
    prims.push(text(w - pad, y + 16, "3 things", 12, { align: "right", color: "muted" }))
    prims.push(hair(pad, y + 28, cw))
    y += 38

    const cta = bool(p, "cta")
    const totals = bool(p, "totals")
    const footH = (totals ? 74 : 0) + (cta ? 52 : 0)
    const names = ["Doodle Pad", "Fine-tip pens", "Sticker chaos pack", "Eraser, deluxe"]
    const variants = ["A5 · dotted", "Pack of 4 · black", "38 stickers", "Pink, obviously"]
    const prices = ["$24.00", "$18.00", "$6.00", "$4.00"]
    const avail = h - y - pad - footH
    const n = clamp(Math.min(num(p, "items", 3), Math.floor(avail / 66)), 0, 4)
    const rowH = n > 0 ? Math.min(84, avail / n) : 0
    const showStepper = w > 420

    for (let i = 0; i < n; i++) {
      const ry = y + i * rowH
      const cy = ry + rowH / 2
      if (i > 0) prims.push(hair(pad, ry, cw))
      const td = clamp(rowH - 18, 22, 56)
      prims.push(rect(pad, cy - td / 2, td, td, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", pad + td / 2, cy, td * 0.44, { stroke: "faint" }))
      const tx = pad + td + 14
      const rightEdge = w - pad - 22
      const priceX = rightEdge - 8
      const stepX = priceX - 86 - 84
      const tw = (showStepper ? stepX : priceX - 70) - tx - 12
      prims.push(text(tx, cy - 4, truncate(names[i], 14, tw), 14, { bold: true }))
      prims.push(text(tx, cy + 14, truncate(variants[i], 12, tw), 12, { color: "muted" }))
      if (showStepper) prims.push(...stepper(stepX, cy - 14, 84, 28, String(i === 1 ? 2 : 1)))
      prims.push(text(priceX, cy + 4, prices[i], 14, { align: "right", bold: true }))
      prims.push(...icon("x", rightEdge + 12, cy, 12, { stroke: "faint" }))
    }

    const fy = h - pad - footH + 10
    if (totals) {
      prims.push(hair(pad, fy - 12, cw))
      prims.push(...ledgerRow(pad, fy + 6, cw, "Subtotal", "$48.00"))
      prims.push(...ledgerRow(pad, fy + 26, cw, "Shipping", "$6.00"))
      prims.push(...ledgerRow(pad, fy + 50, cw, "Total", "$54.00", true))
    }
    if (cta) {
      prims.push(...sub(buttonDef, { label: "Check out", variant: "filled" }, pad, h - pad - 42, cw, 42))
    }
    return prims
  },
}

// -- checkout ---------------------------------------------------------------

export const checkoutDef: ComponentDef = {
  kind: "checkout",
  name: "Checkout",
  category: "blocks",
  group: "Commerce",
  keywords: ["payment", "pay", "card", "billing", "order"],
  size: { w: 720, h: 520 },
  defaults: { summary: true, express: true },
  controls: [
    { key: "summary", label: "Order summary", type: "toggle", quick: true },
    { key: "express", label: "Express pay", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = clamp(w * 0.035, 16, 26)
    const withSummary = bool(p, "summary") && w > 480
    const sumW = withSummary ? clamp(w * 0.36, 220, 280) : 0
    const cw = w - pad * 2 - (sumW ? sumW + 24 : 0)
    let y = pad + 18
    prims.push(text(pad, y, "Checkout", 20, { bold: true }))
    y += 18

    if (bool(p, "express") && cw > 240) {
      const half = (cw - 12) / 2
      prims.push(...sub(buttonDef, { label: "Pay fast", variant: "outline", size: "sm" }, pad, y, half, 38))
      prims.push(...sub(buttonDef, { label: "Pay later", variant: "outline", size: "sm" }, pad + half + 12, y, half, 38))
      y += 50
      prims.push(hair(pad, y, cw * 0.36))
      prims.push(text(pad + cw / 2, y + 4, "or use a card", 12, { align: "center", color: "muted" }))
      prims.push(hair(pad + cw * 0.64, y, cw * 0.36))
      y += 20
    }

    const fieldH = 56
    const payH = 44
    const bottom = h - pad - payH - 24
    if (y + fieldH < bottom) {
      prims.push(...sub(inputDef, { label: "Email", icon: "mail", placeholder: "you@wherever.com" }, pad, y, cw, fieldH))
      y += fieldH + 12
    }
    if (y + fieldH < bottom) {
      prims.push(...sub(inputDef, { label: "Card number", placeholder: "4242 4242 4242 4242" }, pad, y, cw, fieldH))
      prims.push(...icon("credit-card", pad + cw - 22, y + 22 + (fieldH - 22) / 2, 16, { stroke: "faint" }))
      y += fieldH + 12
    }
    if (y + fieldH < bottom) {
      const half = (cw - 12) / 2
      prims.push(...sub(inputDef, { label: "Expires", placeholder: "08 / 27" }, pad, y, half, fieldH))
      prims.push(...sub(inputDef, { label: "CVC", placeholder: "···" }, pad + half + 12, y, half, fieldH))
      y += fieldH + 12
    }
    if (y + fieldH < bottom) {
      prims.push(...sub(inputDef, { label: "Name on card", placeholder: "Pablo Scribbles" }, pad, y, cw, fieldH))
      y += fieldH + 12
    }
    prims.push(...sub(buttonDef, { label: "Pay $58.32", variant: "filled" }, pad, h - pad - payH - 20, cw, payH))
    prims.push(text(pad + cw / 2, h - pad - 4, "Cancel any time. We won't be weird about it.", 11, { align: "center", color: "muted" }))

    if (withSummary) {
      const sx = w - pad - sumW
      prims.push(...sub(orderSummaryDef, { items: 3, title: true, frame: true }, sx, pad, sumW, h - pad * 2))
    }
    return prims
  },
}

// -- product detail ---------------------------------------------------------

export const productDetailDef: ComponentDef = {
  kind: "product-detail",
  name: "Product detail",
  category: "blocks",
  group: "Commerce",
  keywords: ["product", "pdp", "gallery", "buy", "add to cart"],
  size: { w: 720, h: 460 },
  defaults: { thumbs: true, options: true, rating: true },
  controls: [
    { key: "thumbs", label: "Thumbnails", type: "toggle", quick: true },
    { key: "options", label: "Options", type: "toggle", quick: true },
    { key: "rating", label: "Rating", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = clamp(w * 0.032, 14, 22)
    const thumbs = bool(p, "thumbs") && h > 300
    const imgW = clamp(w * 0.44, Math.min(150, w * 0.4), w * 0.5)
    const thumbH = thumbs ? 72 : 0
    const imgH = h - pad * 2 - thumbH
    prims.push(rect(pad, pad, imgW, imgH, { fill: "shade", fillColor: "faint" }))
    prims.push(...icon("image", pad + imgW / 2, pad + imgH / 2, Math.min(56, imgH * 0.3), { stroke: "faint" }))
    if (thumbs) {
      const td = 60
      const cols = Math.max(1, Math.floor((imgW + 10) / (td + 10)))
      for (let i = 0; i < Math.min(4, cols); i++) {
        const tx = pad + i * (td + 10)
        prims.push(rect(tx, pad + imgH + 12, td, td, i === 0 ? { fill: "shade", fillColor: "ink", strokeWidth: 2 } : { fill: "shade", fillColor: "faint" }))
        prims.push(...icon("image", tx + td / 2, pad + imgH + 12 + td / 2, 20, { stroke: "faint" }))
      }
    }

    const x = pad + imgW + 26
    const rw = w - x - pad
    let y = pad + 16
    prims.push(text(x, y, "STATIONERY", 10, { color: "muted", bold: true }))
    y += 24
    for (const l of wrap("The Doodle Pad", 24, rw, 2)) {
      prims.push(text(x, y, l, 24, { bold: true }))
      y += 28
    }
    if (bool(p, "rating") && rw > 140) {
      prims.push(...starRow(x, y - 4, 12))
      prims.push(text(x + 5 * 15 + 8, y, "128 opinions", 11, { color: "muted" }))
      y += 22
    }
    prims.push(text(x, y + 12, "$24.00", 22, { bold: true }))
    const oldX = x + textWidth("$24.00", 22) + 22
    prims.push(text(oldX, y + 12, "$32.00", 14, { color: "muted" }))
    prims.push(line(oldX - 2, y + 7, oldX + textWidth("$32.00", 14) + 2, y + 7, { stroke: "muted", strokeWidth: 1.2 }))
    y += 32
    prims.push(...loremLines(x, y, rw * 0.94, 2, 16))
    y += 40

    if (bool(p, "options") && y + 44 < h - 60) {
      prims.push(text(x, y, "Size", 11, { color: "muted", bold: true }))
      const opts = ["A6", "A5", "A4"]
      opts.forEach((o, i) => {
        const ow = 52
        const ox = x + i * (ow + 10)
        if (ox + ow > x + rw) return
        prims.push(pill(ox, y + 10, ow, 30, i === 1 ? { fill: "shade", fillColor: "ink" } : { stroke: "muted" }))
        prims.push(text(ox + ow / 2, y + 30, o, 13, { align: "center" }))
      })
      y += 54
    }

    const by = Math.min(y + 4, h - pad - 44)
    const heartW = rw > 240 ? 46 : 0
    prims.push(...sub(buttonDef, { label: "Add to cart", variant: "filled", icon: "none" }, x, by, rw - (heartW ? heartW + 10 : 0), 44))
    if (heartW) {
      prims.push(rect(x + rw - heartW, by, heartW, 44))
      prims.push(...icon("heart", x + rw - heartW / 2, by + 22, 17, { stroke: "muted" }))
    }
    if (by + 70 < h - pad) {
      prims.push(...icon("truck", x + 9, by + 66, 15, { stroke: "muted" }))
      prims.push(text(x + 24, by + 71, truncate("Free shipping over $30. Arrives eventually.", 12, rw - 30), 12, { color: "muted" }))
    }
    return prims
  },
}

// -- product grid -----------------------------------------------------------

export const productGridDef: ComponentDef = {
  kind: "product-grid",
  name: "Product grid",
  category: "blocks",
  group: "Commerce",
  keywords: ["catalog", "shop", "listing", "cards", "store"],
  size: { w: 660, h: 440 },
  defaults: { cols: 3, rows: 2, price: true },
  controls: [
    { key: "cols", label: "Columns", type: "number", min: 2, max: 4, quick: true },
    { key: "rows", label: "Rows", type: "number", min: 1, max: 3, quick: true },
    { key: "price", label: "Prices", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const gap = 16
    const cols = clamp(num(p, "cols", 3), 2, 4)
    const rows = clamp(num(p, "rows", 2), 1, 3)
    const cw = (w - gap * (cols - 1)) / cols
    const ch = (h - gap * (rows - 1)) / rows
    const names = [
      "Doodle Pad",
      "Fine-tip pens",
      "Sticker chaos",
      "Eraser deluxe",
      "Grid notebook",
      "Ink, one liter",
      "Ruler (bendy)",
      "Clip, giant",
      "Washi tape",
      "Pencil, blunt",
      "Marker set",
      "Paper, a ream",
    ]
    const prices = ["$24", "$18", "$6", "$4", "$14", "$32", "$9", "$3", "$11", "$2", "$26", "$7"]
    const showPrice = bool(p, "price")
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const x = c * (cw + gap)
        const y = r * (ch + gap)
        prims.push(rect(x, y, cw, ch))
        const imgH = ch * (ch > 140 ? 0.62 : 0.55)
        prims.push(rect(x, y, cw, imgH, { fill: "shade", fillColor: "faint" }))
        prims.push(...icon("image", x + cw / 2, y + imgH / 2, Math.min(36, imgH * 0.34), { stroke: "faint" }))
        if (imgH + 28 < ch) prims.push(text(x + 12, y + imgH + 22, truncate(names[i % names.length], 13, cw - 24), 13))
        if (showPrice && imgH + 50 < ch) prims.push(text(x + 12, y + imgH + 42, prices[i % prices.length], 15, { bold: true }))
        if (ch - imgH > 60) prims.push(...starRow(x + cw - 74, y + imgH + 38, 10, 5))
      }
    }
    return prims
  },
}

// -- payment methods --------------------------------------------------------

export const paymentMethodsDef: ComponentDef = {
  kind: "payment-methods",
  name: "Payment methods",
  category: "blocks",
  group: "Commerce",
  keywords: ["cards", "wallet", "saved cards", "billing", "default"],
  size: { w: 480, h: 280 },
  defaults: { cards: 2, addRow: true, header: true },
  controls: [
    { key: "cards", label: "Cards", type: "number", min: 1, max: 4, quick: true },
    { key: "addRow", label: "Add row", type: "toggle", quick: true },
    { key: "header", label: "Header", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = 16
    const cw = w - pad * 2
    let y = pad
    if (bool(p, "header")) {
      prims.push(text(pad, y + 14, "Payment methods", 16, { bold: true }))
      y += 28
    }
    const brands = ["Visa ···· 4242", "Mastercard ···· 8210", "Amex ···· 0031", "Visa ···· 7749"]
    const expiries = ["Expires 08/27", "Expires 01/28", "Expires 11/26", "Expires 04/29"]
    const addRow = bool(p, "addRow")
    const addH = addRow ? 56 : 0
    const avail = h - y - pad - addH
    const n = clamp(Math.min(num(p, "cards", 2), Math.floor(avail / 58)), 1, 4)
    const rowH = Math.min(70, avail / Math.max(1, n))
    for (let i = 0; i < n; i++) {
      const ry = y + i * rowH
      const bh = Math.min(58, rowH - 8)
      const cy = ry + bh / 2
      prims.push(rect(pad, ry, cw, bh, i === 0 ? { strokeWidth: 1.6 } : { stroke: "muted" }))
      prims.push(...icon("credit-card", pad + 28, cy, 19, { stroke: "muted" }))
      const tx = pad + 52
      const tw = cw - 52 - (w > 380 ? 110 : 30)
      prims.push(text(tx, cy - 3, truncate(brands[i], 14, tw), 14, { bold: true }))
      prims.push(text(tx, cy + 15, expiries[i], 11, { color: "muted" }))
      if (i === 0 && w > 380) prims.push(...sub(badgeDef, { label: "Default", variant: "outline" }, pad + cw - 96, cy - 11, 66, 22))
      prims.push(...icon("dots-three", pad + cw - 18, cy, 15, { stroke: "muted" }))
    }
    if (addRow) {
      const ay = h - pad - 46
      prims.push(rect(pad, ay, cw, 46, { stroke: "faint", dashed: true }))
      prims.push(...icon("plus", pad + 28, ay + 23, 14, { stroke: "muted" }))
      prims.push(text(pad + 48, ay + 28, "Add another card", 13, { color: "muted" }))
    }
    return prims
  },
}

// ===========================================================================
// Screens — whole pages, composed
// ===========================================================================

// -- app shell --------------------------------------------------------------

export const appShellDef: ComponentDef = {
  kind: "app-shell",
  name: "App shell",
  category: "blocks",
  group: "Screens",
  keywords: ["layout", "sidebar", "topbar", "frame", "skeleton", "admin"],
  size: { w: 1000, h: 660 },
  defaults: { sidebar: true, topbar: true, placeholder: true },
  controls: [
    { key: "sidebar", label: "Sidebar", type: "toggle", quick: true },
    { key: "topbar", label: "Topbar", type: "toggle", quick: true },
    { key: "placeholder", label: "Placeholder", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const sw = bool(p, "sidebar") ? clamp(w * 0.22, 160, 230) : 0
    const th = bool(p, "topbar") ? 58 : 0
    if (sw) {
      prims.push(...sub(sidebarDef, { items: "Home, Projects, Tasks, Inbox, Reports, Settings", active: 2, user: true, icons: true }, 0, 0, sw, h))
    }
    if (th) {
      prims.push(rect(sw, 0, w - sw, th))
      prims.push(...sub(breadcrumbDef, { items: "Workspace, Projects" }, sw + 20, th / 2 - 12, Math.min(240, (w - sw) * 0.4), 24))
      let rx = w - 18
      prims.push(...sub(avatarDef, { content: "initials", initials: "PS" }, rx - 32, th / 2 - 16, 32, 32))
      rx -= 46
      prims.push(...icon("bell", rx - 10, th / 2, 17, { stroke: "muted" }))
      rx -= 32
      if (w - sw > 420) {
        const searchW = Math.min(200, (w - sw) * 0.3)
        prims.push(...sub(inputDef, { showLabel: false, icon: "search", placeholder: "Find anything" }, rx - searchW, th / 2 - 16, searchW, 32))
      }
    }

    const pad = 26
    const cx = sw + pad
    const cw = w - sw - pad * 2
    let y = th + pad
    prims.push(text(cx, y + 16, "Projects", 22, { bold: true }))
    prims.push(...sub(buttonDef, { label: "New project", variant: "filled", size: "sm", icon: "left" }, cx + cw - 148, y - 2, 148, 36))
    y += 46
    prims.push(text(cx, y, "Three of them are the same project.", 12, { color: "muted" }))
    y += 20
    if (bool(p, "placeholder") && h - y - pad > 90) {
      prims.push(...sub(emptyBlockDef, { title: "No projects yet", icon: "folder", cta: true }, cx, y, cw, h - y - pad))
    }
    return prims
  },
}

// -- landing page -----------------------------------------------------------

export const landingPageDef: ComponentDef = {
  kind: "landing-page",
  name: "Landing page",
  category: "blocks",
  group: "Screens",
  keywords: ["marketing", "hero", "features", "website", "home", "site"],
  size: { w: 1000, h: 830 },
  defaults: { hero: "split", features: 3, footer: true },
  controls: [
    { key: "hero", label: "Hero", type: "select", options: ["split", "center"], quick: true },
    { key: "features", label: "Features", type: "number", min: 2, max: 4, quick: true },
    { key: "footer", label: "Footer", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const pad = clamp(w * 0.06, 24, 72)
    const cw = w - pad * 2
    const navH = Math.min(64, h * 0.09)
    prims.push(...sub(navbarDef, { links: "Product, Pricing, Docs, Blog", search: false, avatar: false, cta: true }, 0, 0, w, navH))

    const footerH = bool(p, "footer") ? Math.min(150, h * 0.19) : 0
    const ctaH = Math.min(130, h * 0.16)
    const featH = Math.min(190, h * 0.23)
    const heroH = h - navH - featH - ctaH - footerH

    // hero
    let y = navH + Math.min(48, heroH * 0.16)
    if (str(p, "hero", "split") === "split" && cw > 520) {
      const colW = cw * 0.48
      for (const l of wrap("Wireframes that look like you meant it", 34, colW, 3)) {
        prims.push(text(pad, y, l, 34, { bold: true }))
        y += 40
      }
      y += 6
      prims.push(...loremLines(pad, y, colW * 0.92, 2, 17))
      y += 44
      prims.push(...sub(buttonDef, { label: "Start doodling", variant: "filled" }, pad, y, 168, 44))
      prims.push(...sub(buttonDef, { label: "See examples", variant: "outline" }, pad + 180, y, 152, 44))
      const ix = pad + colW + 32
      const iw = w - pad - ix
      const ih = Math.min(heroH - 60, 280)
      prims.push(rect(ix, navH + Math.min(48, heroH * 0.16) - 8, iw, ih, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", ix + iw / 2, navH + Math.min(48, heroH * 0.16) - 8 + ih / 2, 54, { stroke: "faint" }))
    } else {
      for (const l of wrap("Wireframes that look like you meant it", 32, cw * 0.72, 2)) {
        prims.push(text(w / 2, y, l, 32, { align: "center", bold: true }))
        y += 38
      }
      y += 8
      prims.push(...loremLines(w / 2 - cw * 0.28, y, cw * 0.56, 2, 17))
      y += 46
      prims.push(...sub(buttonDef, { label: "Start doodling", variant: "filled" }, w / 2 - 176, y, 168, 44))
      prims.push(...sub(buttonDef, { label: "See examples", variant: "outline" }, w / 2 + 8, y, 168, 44))
      y += 62
      const ih = Math.max(40, navH + heroH - y - 10)
      prims.push(rect(pad + cw * 0.1, y, cw * 0.8, ih, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", w / 2, y + ih / 2, Math.min(50, ih * 0.4), { stroke: "faint" }))
    }

    // features
    let fy = navH + heroH
    prims.push(hair(pad, fy, cw))
    fy += Math.min(34, featH * 0.2)
    const n = clamp(num(p, "features", 3), 2, 4)
    const gap = 26
    const colW = (cw - gap * (n - 1)) / n
    const names = ["lightning", "sparkle", "users", "shield-check"]
    const titles = ["Absurdly fast", "Smart enough", "Made for two", "Nothing leaks"]
    for (let i = 0; i < n; i++) {
      const x = pad + i * (colW + gap)
      prims.push(ellipse(x, fy, 36, 36, { stroke: "faint" }))
      prims.push(...icon(names[i], x + 18, fy + 18, 17, { stroke: "muted" }))
      prims.push(text(x, fy + 60, truncate(titles[i], 16, colW), 16, { bold: true }))
      prims.push(...loremLines(x, fy + 78, colW * 0.94, 2, 16))
    }

    // cta band
    const cy0 = navH + heroH + featH
    prims.push(rect(0, cy0, w, ctaH, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
    prims.push(text(w / 2, cy0 + ctaH * 0.36, truncate("Go on, draw a box", 24, cw), 24, { align: "center", bold: true }))
    prims.push(...sub(buttonDef, { label: "It's free, mostly", variant: "filled" }, w / 2 - 92, cy0 + ctaH * 0.48, 184, Math.min(42, ctaH * 0.36)))

    // footer
    if (footerH) {
      const foy = h - footerH
      prims.push(hair(0, foy, w))
      prims.push(...icon("logo", pad + 12, foy + 34, 22))
      prims.push(text(pad + 32, foy + 40, "squig", 16, { bold: true }))
      prims.push(text(pad, foy + footerH - 20, "© a person who draws boxes", 11, { color: "muted" }))
      const cols = 4
      const fw = Math.min(120, (cw - 160) / cols)
      for (let c = 0; c < cols; c++) {
        const x = w - pad - (cols - c) * fw
        if (x < pad + 140) continue
        prims.push(text(x, foy + 32, ["Product", "Company", "Legal", "Social"][c], 12, { bold: true }))
        for (let l = 0; l < 3; l++) {
          const ly = foy + 52 + l * 16
          if (ly > h - 24) break
          prims.push(body(x, ly, fw * 0.6))
        }
      }
    }
    return prims
  },
}

// -- chat screen ------------------------------------------------------------

export const chatScreenDef: ComponentDef = {
  kind: "chat-screen",
  name: "Chat screen",
  category: "blocks",
  group: "Screens",
  keywords: ["messages", "dm", "conversation", "messenger", "slack"],
  size: { w: 1000, h: 660 },
  defaults: { convos: 6, sidebar: true, composer: true },
  controls: [
    { key: "convos", label: "Conversations", type: "number", min: 3, max: 8, quick: true },
    { key: "sidebar", label: "List pane", type: "toggle", quick: true },
    { key: "composer", label: "Composer", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const lw = bool(p, "sidebar") ? clamp(w * 0.29, 200, 310) : 0
    if (lw) {
      prims.push(line(lw, 0, lw, h, { stroke: "faint" }))
      prims.push(text(18, 34, "Messages", 18, { bold: true }))
      prims.push(...icon("pencil-simple", lw - 24, 28, 16, { stroke: "muted" }))
      prims.push(...sub(inputDef, { showLabel: false, icon: "search", placeholder: "Search people" }, 16, 50, lw - 32, 34))
      const names = ["Maya", "Luis", "Ana", "Kai", "Design crew", "Mom", "Robot", "Nobody"]
      const previews = [
        "ok but hear me out…",
        "merged, finally",
        "did you see the thing?",
        "wrong channel, sorry",
        "6 unread, good luck",
        "call me back, mijo",
        "deployed at 3am",
        "typing…",
      ]
      const times = ["9:41", "8:12", "Yest.", "Tue", "Mon", "Mon", "Sun", "Jul 3"]
      const n = clamp(Math.min(num(p, "convos", 6), Math.floor((h - 100) / 62)), 1, 8)
      const rowH = Math.min(72, (h - 100) / Math.max(1, n))
      for (let i = 0; i < n; i++) {
        const y = 96 + i * rowH
        const cy = y + rowH / 2
        if (i === 0) prims.push(rect(6, y + 3, lw - 12, rowH - 6, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
        const d = Math.min(38, rowH - 22)
        prims.push(...sub(avatarDef, { content: "initials", initials: names[i].slice(0, 2), status: i < 2 }, 16, cy - d / 2, d, d))
        const tx = 16 + d + 12
        const tw = lw - tx - 44
        prims.push(text(tx, cy - 4, truncate(names[i], 14, tw), 14, { bold: i === 0 }))
        prims.push(text(tx, cy + 14, truncate(previews[i], 12, tw), 12, { color: "muted" }))
        prims.push(text(lw - 14, cy - 4, times[i], 10, { align: "right", color: "muted" }))
      }
    }

    // active conversation
    const cx = lw
    const cw = w - lw
    const headH = 62
    prims.push(hair(cx, headH, cw))
    prims.push(...sub(avatarDef, { content: "initials", initials: "MA", status: true }, cx + 18, headH / 2 - 18, 36, 36))
    prims.push(text(cx + 66, headH / 2 - 1, "Maya", 16, { bold: true }))
    prims.push(text(cx + 66, headH / 2 + 16, "typing, allegedly", 11, { color: "muted" }))
    prims.push(...icon("phone", cx + cw - 88, headH / 2, 16, { stroke: "muted" }))
    prims.push(...icon("video-camera", cx + cw - 56, headH / 2, 16, { stroke: "muted" }))
    prims.push(...icon("dots-three", cx + cw - 24, headH / 2, 16, { stroke: "muted" }))

    const composerH = bool(p, "composer") ? 72 : 0
    const pad = 22
    let y = headH + 22
    const bottom = h - composerH - 12
    prims.push(text(cx + cw / 2, y, "Today", 10, { align: "center", color: "muted" }))
    y += 18
    for (let i = 0; i < 6; i++) {
      const bw = cw * (0.44 + (i % 2) * 0.08)
      const bh = i % 3 === 1 ? 76 : 56
      if (y + bh > bottom) break
      const mine = i % 2 === 1
      const bx = mine ? cx + cw - pad - bw : cx + pad + 44
      if (!mine) {
        prims.push(...sub(avatarDef, { content: "initials", initials: "MA" }, cx + pad, y + bh - 32, 32, 32))
      }
      if (mine) prims.push(rect(bx, y, bw, bh, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
      prims.push(rect(bx, y, bw, bh))
      prims.push(...loremLines(bx + 16, y + 22, bw - 32, bh > 66 ? 3 : 2, 17))
      prims.push(text(mine ? bx + bw : bx, y + bh + 14, mine ? "9:42" : "9:41", 10, { align: mine ? "right" : "left", color: "muted" }))
      y += bh + 30
    }

    if (composerH) {
      const fy = h - composerH + 14
      prims.push(rect(cx + pad, fy, cw - pad * 2, 46))
      prims.push(...icon("paperclip", cx + pad + 22, fy + 23, 15, { stroke: "muted" }))
      prims.push(text(cx + pad + 42, fy + 28, truncate("Write something regrettable", 14, cw - pad * 2 - 110), 14, { color: "muted" }))
      prims.push(ellipse(cx + cw - pad - 40, fy + 7, 32, 32, { fill: "shade", fillColor: "ink" }))
      prims.push(...icon("paper-plane-tilt", cx + cw - pad - 24, fy + 23, 15))
    }
    return prims
  },
}

// -- inbox screen -----------------------------------------------------------

export const inboxScreenDef: ComponentDef = {
  kind: "inbox-screen",
  name: "Inbox screen",
  category: "blocks",
  group: "Screens",
  keywords: ["mail", "email", "reading pane", "three column", "client"],
  size: { w: 1040, h: 680 },
  defaults: { rows: 6, pane: true, folders: true },
  controls: [
    { key: "rows", label: "Messages", type: "number", min: 3, max: 8, quick: true },
    { key: "pane", label: "Reading pane", type: "toggle", quick: true },
    { key: "folders", label: "Folder rail", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const fw = bool(p, "folders") ? clamp(w * 0.18, 140, 200) : 0
    const pane = bool(p, "pane") && w - fw > 480
    const listW = pane ? clamp((w - fw) * 0.42, 240, 360) : w - fw

    if (fw) {
      prims.push(line(fw, 0, fw, h, { stroke: "faint" }))
      prims.push(...sub(buttonDef, { label: "Compose", variant: "filled", size: "sm", icon: "left" }, 16, 18, fw - 32, 38))
      const folders = ["Inbox", "Starred", "Sent", "Drafts", "Archive", "Trash"]
      const counts = ["12", "3", "", "1", "", ""]
      const names = ["envelope", "star", "paper-plane-tilt", "file", "package", "trash"]
      for (let i = 0; i < folders.length; i++) {
        const y = 76 + i * 40
        if (y + 32 > h - 20) break
        if (i === 0) prims.push(rect(8, y, fw - 16, 32, { fill: "shade", fillColor: "faint", stroke: "faint", strokeWidth: 0.8 }))
        prims.push(...icon(names[i], 26, y + 16, 15, { stroke: i === 0 ? "ink" : "muted" }))
        prims.push(text(44, y + 21, folders[i], 13, { bold: i === 0, color: i === 0 ? "ink" : "muted" }))
        if (counts[i]) prims.push(text(fw - 16, y + 21, counts[i], 11, { align: "right", color: "muted" }))
      }
    }

    // message list
    const lx = fw
    const listHeadH = 52
    prims.push(hair(lx, listHeadH, listW))
    prims.push(text(lx + 16, 32, "Inbox", 16, { bold: true }))
    prims.push(...icon("funnel", lx + listW - 58, 26, 15, { stroke: "muted" }))
    prims.push(...icon("arrows-clockwise", lx + listW - 26, 26, 15, { stroke: "muted" }))
    prims.push(...sub(inboxListDef, { rows: num(p, "rows", 6), star: listW > 280, checkbox: listW > 320 }, lx, listHeadH, listW, h - listHeadH))
    if (pane) prims.push(line(lx + listW, 0, lx + listW, h, { stroke: "faint" }))

    if (!pane) return prims

    // reading pane
    const rx = lx + listW
    const rw = w - rx
    const pad = 26
    let y = 44
    prims.push(...icon("arrow-u-up-left", rx + rw - 96, 30, 16, { stroke: "muted" }))
    prims.push(...icon("trash", rx + rw - 62, 30, 16, { stroke: "muted" }))
    prims.push(...icon("dots-three", rx + rw - 28, 30, 16, { stroke: "muted" }))
    for (const l of wrap("Re: the thing we said we'd do", 20, rw - pad * 2 - 120, 2)) {
      prims.push(text(rx + pad, y, l, 20, { bold: true }))
      y += 26
    }
    y += 10
    prims.push(...sub(avatarDef, { content: "initials", initials: "MA" }, rx + pad, y - 12, 38, 38))
    prims.push(text(rx + pad + 50, y + 4, "Maya", 14, { bold: true }))
    prims.push(text(rx + pad + 50 + textWidth("Maya", 14) + 10, y + 4, "to me", 11, { color: "muted" }))
    prims.push(text(rx + pad + 50, y + 22, "maya@somewhere.co", 11, { color: "muted" }))
    prims.push(text(rx + rw - pad, y + 4, "9:41 AM", 11, { align: "right", color: "muted" }))
    y += 44
    prims.push(hair(rx + pad, y, rw - pad * 2))
    y += 24
    const bodyLinesN = Math.max(2, Math.floor((h - y - 90) / 20))
    prims.push(...loremLines(rx + pad, y, rw - pad * 2, Math.min(bodyLinesN, 10), 20))
    const by = h - 66
    prims.push(hair(rx + pad, by - 14, rw - pad * 2))
    prims.push(...sub(buttonDef, { label: "Reply", variant: "filled", size: "sm" }, rx + pad, by, 96, 36))
    prims.push(...sub(buttonDef, { label: "Forward", variant: "outline", size: "sm" }, rx + pad + 108, by, 106, 36))
    return prims
  },
}

// -- profile screen ---------------------------------------------------------

export const profileScreenDef: ComponentDef = {
  kind: "profile-screen",
  name: "Profile screen",
  category: "blocks",
  group: "Screens",
  keywords: ["profile", "user page", "portfolio", "tabs", "grid"],
  size: { w: 960, h: 720 },
  defaults: { cards: 6, tabs: true, navbar: true },
  controls: [
    { key: "cards", label: "Cards", type: "number", min: 2, max: 9, quick: true },
    { key: "tabs", label: "Tabs", type: "toggle", quick: true },
    { key: "navbar", label: "Navbar", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    const navH = bool(p, "navbar") ? 58 : 0
    if (navH) {
      prims.push(...sub(navbarDef, { links: "Explore, Boards, People", search: true, avatar: true, cta: false }, 0, 0, w, navH))
    }
    const pad = clamp(w * 0.04, 20, 40)
    const headerH = clamp(h * 0.32, 180, 250)
    prims.push(...sub(profileHeaderDef, { cover: true, stats: true, cta: true }, pad, navH + 18, w - pad * 2, headerH))
    let y = navH + 18 + headerH + 18
    if (bool(p, "tabs") && y + 48 < h) {
      prims.push(...sub(tabsDef, { labels: "Boards, Liked, About", active: 1 }, pad, y, Math.min(360, w - pad * 2), 40))
      prims.push(hair(pad, y + 38, w - pad * 2))
      y += 56
    }

    const n = clamp(num(p, "cards", 6), 1, 9)
    const gap = 20
    const availH = h - y - pad
    if (availH < 90) return prims
    const cols = clamp(Math.floor((w - pad * 2 + gap) / (240 + gap)), 1, 4)
    const cardW = (w - pad * 2 - gap * (cols - 1)) / cols
    const rowsFit = Math.max(1, Math.floor((availH + gap) / (170 + gap)))
    const cardH = Math.min(210, (availH - gap * (rowsFit - 1)) / rowsFit)
    const shown = Math.min(n, cols * rowsFit)
    for (let i = 0; i < shown; i++) {
      const c = i % cols
      const r = Math.floor(i / cols)
      prims.push(
        ...sub(
          cardDef,
          { title: ["Wobbly grids", "Napkin math", "Box studies", "Circles, badly", "Type on paper", "Nine more boxes", "Untitled 4", "Scribbles", "Ideas, mostly"][i], image: cardH > 160, header: true, footer: false },
          pad + c * (cardW + gap),
          y + r * (cardH + gap),
          cardW,
          cardH
        )
      )
    }
    return prims
  },
}

// ===========================================================================

export const APP_DEFS: ComponentDef[] = [
  // App
  accountBlockDef,
  billingBlockDef,
  invoiceListDef,
  usageMeterDef,
  notificationListDef,
  activityFeedDef,
  commentsDef,
  inboxListDef,
  kanbanBoardDef,
  calendarBlockDef,
  fileBrowserDef,
  searchResultsDef,
  onboardingChecklistDef,
  emptyBlockDef,
  settingsBlockDef,
  profileHeaderDef,
  commandPaletteBlockDef,
  // AI
  aiChatDef,
  aiInputDef,
  aiPromptSuggestionsDef,
  aiResponseDef,
  aiAgentCardDef,
  aiThinkingDef,
  // Commerce
  checkoutDef,
  cartDef,
  orderSummaryDef,
  productDetailDef,
  productGridDef,
  paymentMethodsDef,
  // Screens
  appShellDef,
  landingPageDef,
  chatScreenDef,
  inboxScreenDef,
  profileScreenDef,
]
