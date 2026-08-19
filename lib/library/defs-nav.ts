// ---------------------------------------------------------------------------
// Navigation — navbar and sidebar.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, ellipse, line, text, icon, textWidth, truncate } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
// For toggles added after the fact: an older saved node has no key at all, so
// `undefined` has to mean "the way it always looked", not "off".
const boolOn = (p: Props, k: string): boolean => p[k] === undefined || Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)
const list = (p: Props, k: string, fallback: string): string[] =>
  str(p, k, fallback).split(",").map((s) => s.trim()).filter(Boolean)

// -- navbar -----------------------------------------------------------------

export const navbarDef: ComponentDef = {
  kind: "navbar",
  name: "Navbar",
  category: "components",
  group: "Navigation",
  keywords: ["header", "topbar", "menu", "nav"],
  size: { w: 560, h: 56 },
  defaults: {
    brand: "",
    logo: true,
    links: "Home, Docs, Pricing",
    search: false,
    avatar: true,
    cta: true,
    ctaLabel: "Sign up",
  },
  controls: [
    { key: "brand", label: "Product name", type: "text" },
    { key: "logo", label: "Logo", type: "toggle" },
    { key: "links", label: "Links (comma-sep)", type: "text" },
    { key: "search", label: "Search", type: "toggle", quick: true },
    { key: "avatar", label: "Avatar", type: "toggle", quick: true },
    { key: "cta", label: "Button", type: "toggle", quick: true },
    { key: "ctaLabel", label: "Button text", type: "text" },
  ],
  render(p, w, h) {
    const cy = h / 2
    const prims: Prim[] = [rect(0, 0, w, h)]
    // Right side first: the brand and the links need to know where to stop.
    let rx = w - 16
    if (bool(p, "avatar")) {
      prims.push(ellipse(rx - 32, cy - 16, 32, 32), ...icon("user", rx - 16, cy, 16))
      rx -= 44
    }
    if (bool(p, "cta")) {
      const label = str(p, "ctaLabel", "Sign up")
      // Grows with the label, but never past 40% of the bar and never off the
      // left edge — `rx - 4` is what's actually left after the avatar.
      const want = Math.max(84, textWidth(label, 13) + 28)
      const bw = Math.max(40, Math.min(want, Math.max(60, w * 0.4), rx - 4))
      prims.push(rect(rx - bw, cy - 15, bw, 30, { fill: "shade", fillColor: "ink" }))
      prims.push(text(rx - bw / 2, cy + 5, truncate(label, 13, bw - 16), 13, { align: "center" }))
      rx -= bw + 12
    }
    let x = 16
    if (boolOn(p, "logo")) {
      prims.push(...icon("logo", 28, cy, 22))
      x = 56
    }
    const brand = str(p, "brand").trim()
    const room = rx - x - 12
    if (brand && room > 44) {
      const bt = truncate(brand, 15, Math.min(room, 220))
      prims.push(text(x, cy + 5, bt, 15, { bold: true }))
      x += textWidth(bt, 15) + 28
    }
    // Links drop off the tail once they'd run into the search box or the
    // button — keeping the ones that fit in order, rather than letting a short
    // link jump the queue past a long one that didn't.
    for (const link of list(p, "links", "Home, Docs, Pricing")) {
      if (x + textWidth(link, 14) > rx - 12) break
      prims.push(text(x, cy + 5, link, 14))
      x += textWidth(link, 14) + 22
    }
    if (bool(p, "search")) {
      const sw = Math.min(150, rx - x - 12)
      if (sw > 60) {
        prims.push(rect(rx - sw, cy - 14, sw, 28, { stroke: "muted" }))
        prims.push(...icon("search", rx - sw + 14, cy, 12, { stroke: "muted" }))
        prims.push(line(rx - sw + 26, cy + 1, rx - sw + 26 + sw * 0.4, cy + 1, { stroke: "faint" }))
      }
    }
    return prims
  },
}

// -- sidebar ----------------------------------------------------------------

// Fallback cycle, kept so unmatched rows still get distinct glyphs.
const iconNames = ["home", "grid", "check", "mail", "gear", "star", "user", "file"] as const

// Rows guess their own glyph from the label, so renaming an item doesn't leave
// an envelope sitting next to "Settings". Matching is whole-word; for a label
// with two matches ("Team Settings") the first entry listed here wins, so the
// more specific nouns sit near the top.
const GLYPH_WORDS: ReadonlyArray<readonly [string, string]> = [
  ["dashboard", "house"],
  ["overview", "house"],
  ["home", "house"],
  ["preferences", "gear"],
  ["settings", "gear"],
  ["admin", "gear"],
  ["notifications", "bell"],
  ["alerts", "bell"],
  ["messages", "envelope"],
  ["inbox", "envelope"],
  ["mail", "envelope"],
  ["analytics", "chart-bar"],
  ["insights", "chart-bar"],
  ["reports", "chart-bar"],
  ["report", "chart-bar"],
  ["stats", "chart-bar"],
  ["invoices", "credit-card"],
  ["payments", "credit-card"],
  ["billing", "credit-card"],
  ["documents", "file-text"],
  ["files", "file-text"],
  ["docs", "file-text"],
  ["file", "file-text"],
  ["customers", "users"],
  ["members", "users"],
  ["people", "users"],
  ["users", "users"],
  ["team", "users"],
  ["projects", "squares-four"],
  ["project", "squares-four"],
  ["boards", "squares-four"],
  ["apps", "squares-four"],
  ["calendar", "calendar-blank"],
  ["schedule", "calendar-blank"],
  ["search", "magnifying-glass"],
  ["tasks", "check"],
  ["task", "check"],
  ["todo", "check"],
  ["done", "check"],
]

function glyphFor(label: string, i: number): string {
  const words = label.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  for (const [key, glyph] of GLYPH_WORDS) {
    if (words.includes(key)) return glyph
  }
  return iconNames[i % iconNames.length]
}

export const sidebarDef: ComponentDef = {
  kind: "sidebar",
  name: "Sidebar",
  category: "components",
  group: "Navigation",
  keywords: ["nav", "menu", "drawer", "left"],
  size: { w: 200, h: 360 },
  defaults: {
    brand: "",
    header: true,
    items: "Home, Projects, Tasks, Inbox, Settings",
    icons: true,
    active: 1,
    user: true,
  },
  controls: [
    { key: "brand", label: "Product name", type: "text" },
    { key: "header", label: "Logo row", type: "toggle" },
    { key: "items", label: "Items (comma-sep)", type: "text" },
    { key: "icons", label: "Icons", type: "toggle", quick: true },
    { key: "active", label: "Active item", type: "number", min: 1, max: 8, quick: true },
    { key: "user", label: "User footer", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const items = list(p, "items", "Home, Projects, Tasks, Inbox, Settings")
    const icons = bool(p, "icons")
    const active = Math.max(1, Math.min(items.length, num(p, "active", 1))) - 1
    const prims: Prim[] = [rect(0, 0, w, h)]
    // logo row
    const header = boolOn(p, "header")
    if (header) {
      prims.push(...icon("logo", 24, 26, 20))
      const brand = str(p, "brand").trim()
      if (brand) {
        prims.push(text(44, 31, truncate(brand, 14, Math.max(24, w - 56)), 14, { bold: true }))
      } else {
        prims.push(rect(44, 18, w * 0.4, 14, { fill: "shade", fillColor: "muted", stroke: "faint", strokeWidth: 0.8 }))
      }
      prims.push(line(0, 50, w, 50, { stroke: "faint" }))
    }
    const rowH = 40
    const top = header ? 60 : 10
    items.forEach((item, i) => {
      const y = top + i * rowH
      if (y + rowH > h - (bool(p, "user") ? 60 : 10)) return
      if (i === active) {
        prims.push(rect(8, y, w - 16, rowH - 8, { fill: "shade", fillColor: "faint", stroke: "faint" }))
      }
      let tx = 18
      if (icons) {
        prims.push(...icon(glyphFor(item, i), 26, y + rowH / 2 - 4, 15, { stroke: i === active ? "ink" : "muted" }))
        tx = 44
      }
      prims.push(text(tx, y + rowH / 2 + 1, item, 14, { color: i === active ? "ink" : "muted", bold: i === active }))
    })
    if (bool(p, "user")) {
      const fy = h - 52
      prims.push(line(0, fy, w, fy, { stroke: "faint" }))
      prims.push(ellipse(12, fy + 10, 30, 30), ...icon("user", 27, fy + 25, 15))
      prims.push(line(52, fy + 18, w - 30, fy + 18, { strokeWidth: 1.4 }))
      prims.push(line(52, fy + 32, w - 60, fy + 32, { stroke: "muted", strokeWidth: 1.1 }))
    }
    return prims
  },
}

export const NAV_DEFS: ComponentDef[] = [navbarDef, sidebarDef]
