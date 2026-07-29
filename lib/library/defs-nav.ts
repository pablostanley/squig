// ---------------------------------------------------------------------------
// Navigation — navbar and sidebar.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, ellipse, line, text, icon, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
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
  defaults: { links: "Home, Docs, Pricing", search: false, avatar: true, cta: true },
  controls: [
    { key: "links", label: "Links (comma-sep)", type: "text" },
    { key: "search", label: "Search", type: "toggle", quick: true },
    { key: "avatar", label: "Avatar", type: "toggle", quick: true },
    { key: "cta", label: "Button", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const cy = h / 2
    const prims: Prim[] = [rect(0, 0, w, h)]
    prims.push(...icon("logo", 28, cy, 22))
    let x = 56
    for (const link of list(p, "links", "Home, Docs, Pricing")) {
      prims.push(text(x, cy + 5, link, 14))
      x += textWidth(link, 14) + 22
    }
    let rx = w - 16
    if (bool(p, "avatar")) {
      prims.push(ellipse(rx - 32, cy - 16, 32, 32), ...icon("user", rx - 16, cy, 16))
      rx -= 44
    }
    if (bool(p, "cta")) {
      prims.push(rect(rx - 84, cy - 15, 84, 30, { fill: "shade", fillColor: "ink" }))
      prims.push(text(rx - 42, cy + 5, "Sign up", 13, { align: "center" }))
      rx -= 96
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

export const sidebarDef: ComponentDef = {
  kind: "sidebar",
  name: "Sidebar",
  category: "components",
  group: "Navigation",
  keywords: ["nav", "menu", "drawer", "left"],
  size: { w: 200, h: 360 },
  defaults: { items: "Home, Projects, Tasks, Inbox, Settings", icons: true, active: 1, user: true },
  controls: [
    { key: "items", label: "Items (comma-sep)", type: "text" },
    { key: "icons", label: "Icons", type: "toggle", quick: true },
    { key: "active", label: "Active item", type: "number", min: 1, max: 8, quick: true },
    { key: "user", label: "User footer", type: "toggle" },
  ],
  render(p, w, h) {
    const items = list(p, "items", "Home, Projects, Tasks, Settings")
    const icons = bool(p, "icons")
    const active = Math.max(1, Math.min(items.length, num(p, "active", 1))) - 1
    const iconNames = ["home", "grid", "check", "mail", "gear", "star", "user", "file"] as const
    const prims: Prim[] = [rect(0, 0, w, h)]
    // logo row
    prims.push(...icon("logo", 24, 26, 20))
    prims.push(rect(44, 18, w * 0.4, 14, { fill: "shade", fillColor: "muted", stroke: "faint", strokeWidth: 0.8 }))
    prims.push(line(0, 50, w, 50, { stroke: "faint" }))
    const rowH = 40
    items.forEach((item, i) => {
      const y = 60 + i * rowH
      if (y + rowH > h - (bool(p, "user") ? 60 : 10)) return
      if (i === active) {
        prims.push(rect(8, y, w - 16, rowH - 8, { fill: "shade", fillColor: "faint", stroke: "faint" }))
      }
      let tx = 18
      if (icons) {
        prims.push(...icon(iconNames[i % iconNames.length], 26, y + rowH / 2 - 4, 15, { stroke: i === active ? "ink" : "muted" }))
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
