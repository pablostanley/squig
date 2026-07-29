// ---------------------------------------------------------------------------
// Display & overlay components — card, image, table, tabs, dialog, toast, etc.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, ellipse, line, text, poly, icon, loremLines, truncate, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)
const list = (p: Props, k: string, fallback: string): string[] =>
  str(p, k, fallback).split(",").map((s) => s.trim()).filter(Boolean)

// -- card -------------------------------------------------------------------

export const cardDef: ComponentDef = {
  kind: "card",
  name: "Card",
  category: "components",
  group: "Display",
  keywords: ["panel", "box", "container"],
  size: { w: 260, h: 240 },
  defaults: { title: "Card title", image: true, header: true, footer: true, actions: false },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "image", label: "Image", type: "toggle", quick: true },
    { key: "header", label: "Header", type: "toggle", quick: true },
    { key: "footer", label: "Footer", type: "toggle", quick: true },
    { key: "actions", label: "Actions menu", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    let y = 0
    if (bool(p, "image")) {
      const imgH = Math.min(h * 0.4, 110)
      prims.push(rect(0, 0, w, imgH, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", w / 2, imgH / 2, Math.min(imgH, 44), { stroke: "muted" }))
      y = imgH
    }
    y += 14
    if (bool(p, "header")) {
      prims.push(text(16, y + 12, truncate(str(p, "title", "Card title"), 17, w - 60), 17, { bold: true }))
      if (bool(p, "actions")) prims.push(...icon("dots", w - 24, y + 7, 16, { stroke: "muted" }))
      y += 26
    }
    const footerH = bool(p, "footer") ? 52 : 14
    const bodyLines = Math.max(1, Math.floor((h - y - footerH) / 16))
    prims.push(...loremLines(16, y + 10, w - 32, Math.min(bodyLines, 5), 16))
    if (bool(p, "footer")) {
      const fy = h - 46
      prims.push(line(0, fy, w, fy, { stroke: "faint" }))
      prims.push(rect(w - 96, fy + 9, 80, 28, { fill: "shade", fillColor: "ink" }))
      prims.push(text(w - 56, fy + 27, "Go", 13, { align: "center" }))
      prims.push(text(16, fy + 27, "Nope", 13, { color: "muted" }))
    }
    return prims
  },
}

// -- image ------------------------------------------------------------------

export const imageDef: ComponentDef = {
  kind: "image",
  name: "Image",
  category: "components",
  group: "Media",
  keywords: ["photo", "picture", "media", "placeholder"],
  size: { w: 200, h: 140 },
  defaults: { caption: false, style: "plain" },
  controls: [
    { key: "style", label: "Style", type: "select", options: ["plain", "crossed"], quick: true },
    { key: "caption", label: "Caption", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const capH = bool(p, "caption") ? 22 : 0
    const ih = h - capH
    const prims: Prim[] = [rect(0, 0, w, ih, { fill: "shade", fillColor: "faint" })]
    if (str(p, "style") === "crossed") {
      prims.push(line(0, 0, w, ih, { stroke: "faint" }), line(w, 0, 0, ih, { stroke: "faint" }))
    } else {
      prims.push(...icon("image", w / 2, ih / 2, Math.min(ih * 0.4, 48), { stroke: "muted" }))
    }
    if (capH) prims.push(line(4, h - 6, w * 0.6, h - 6, { stroke: "muted", strokeWidth: 1.2 }))
    return prims
  },
}

// -- divider ----------------------------------------------------------------

export const dividerDef: ComponentDef = {
  kind: "divider",
  name: "Divider",
  category: "components",
  group: "Display",
  keywords: ["separator", "line", "hr"],
  size: { w: 220, h: 20 },
  defaults: { label: "", showLabel: false },
  controls: [
    { key: "showLabel", label: "Label", type: "toggle", quick: true },
    { key: "label", label: "Text", type: "text" },
  ],
  render(p, w, h) {
    const cy = h / 2
    if (bool(p, "showLabel")) {
      const t = str(p, "label") || "or"
      const tw = textWidth(t, 13) + 16
      return [
        line(0, cy, (w - tw) / 2, cy, { stroke: "muted" }),
        text(w / 2, cy + 4, t, 13, { align: "center", color: "muted" }),
        line((w + tw) / 2, cy, w, cy, { stroke: "muted" }),
      ]
    }
    return [line(0, cy, w, cy, { stroke: "muted" })]
  },
}

// -- paragraph --------------------------------------------------------------

export const paragraphDef: ComponentDef = {
  kind: "paragraph",
  name: "Paragraph",
  category: "components",
  group: "Display",
  keywords: ["text", "lorem", "copy", "body"],
  size: { w: 240, h: 100 },
  defaults: { heading: true, lines: 4 },
  controls: [
    { key: "heading", label: "Heading", type: "toggle", quick: true },
    { key: "lines", label: "Lines", type: "number", min: 1, max: 12, quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    let y = 6
    if (bool(p, "heading")) {
      prims.push(rect(0, 0, w * 0.55, 16, { fill: "shade", fillColor: "muted", stroke: "faint", strokeWidth: 1 }))
      y = 34
    }
    const n = Math.max(1, Math.min(12, num(p, "lines", 4)))
    const gap = Math.max(12, (h - y - 6) / n)
    prims.push(...loremLines(0, y + 4, w, n, gap))
    return prims
  },
}

// -- table ------------------------------------------------------------------

export const tableDef: ComponentDef = {
  kind: "table",
  name: "Table",
  category: "components",
  group: "Data",
  keywords: ["grid", "data", "rows", "list"],
  size: { w: 380, h: 220 },
  defaults: { cols: 4, rows: 4, header: true },
  controls: [
    { key: "cols", label: "Columns", type: "number", min: 2, max: 6, quick: true },
    { key: "rows", label: "Rows", type: "number", min: 1, max: 10, quick: true },
    { key: "header", label: "Header", type: "toggle" },
  ],
  render(p, w, h) {
    const cols = Math.max(2, Math.min(6, num(p, "cols", 4)))
    const rows = Math.max(1, Math.min(10, num(p, "rows", 4)))
    const header = bool(p, "header")
    const totalRows = rows + (header ? 1 : 0)
    const rowH = h / totalRows
    const colW = w / cols
    const prims: Prim[] = [rect(0, 0, w, h)]
    if (header) prims.push(rect(1, 1, w - 2, rowH - 2, { fill: "shade", fillColor: "faint", strokeWidth: 0.8, stroke: "faint" }))
    for (let r = 1; r < totalRows; r++) prims.push(line(0, r * rowH, w, r * rowH, { stroke: "faint" }))
    for (let c = 1; c < cols; c++) prims.push(line(c * colW, 0, c * colW, h, { stroke: "faint" }))
    // cell squiggles
    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < cols; c++) {
        const lw = colW * (0.35 + ((r * 7 + c * 3) % 4) * 0.1)
        prims.push(
          line(c * colW + 10, r * rowH + rowH / 2, c * colW + 10 + lw, r * rowH + rowH / 2, {
            stroke: header && r === 0 ? "ink" : "muted",
            strokeWidth: header && r === 0 ? 1.6 : 1.1,
          })
        )
      }
    }
    return prims
  },
}

// -- tabs -------------------------------------------------------------------

export const tabsDef: ComponentDef = {
  kind: "tabs",
  name: "Tabs",
  category: "components",
  group: "Navigation",
  keywords: ["nav", "sections", "switcher"],
  size: { w: 300, h: 40 },
  defaults: { labels: "Overview, Details, Reviews", active: 1 },
  controls: [
    { key: "labels", label: "Tabs (comma-sep)", type: "text" },
    { key: "active", label: "Active tab", type: "number", min: 1, max: 6, quick: true },
  ],
  render(p, w, h) {
    const labels = list(p, "labels", "Overview, Details, Reviews")
    const active = Math.max(1, Math.min(labels.length, num(p, "active", 1))) - 1
    const tabW = w / Math.max(1, labels.length)
    const prims: Prim[] = [line(0, h - 2, w, h - 2, { stroke: "faint" })]
    labels.forEach((label, i) => {
      const cx = i * tabW + tabW / 2
      prims.push(
        text(cx, h / 2 + 5, truncate(label, 14, tabW - 12), 14, {
          align: "center",
          color: i === active ? "ink" : "muted",
          bold: i === active,
        })
      )
      if (i === active) prims.push(line(i * tabW + 8, h - 2, (i + 1) * tabW - 8, h - 2, { strokeWidth: 2.5 }))
    })
    return prims
  },
}

// -- dialog -----------------------------------------------------------------

export const dialogDef: ComponentDef = {
  kind: "dialog",
  name: "Dialog",
  category: "components",
  group: "Feedback",
  keywords: ["modal", "popup", "confirm", "alert"],
  size: { w: 320, h: 200 },
  defaults: { title: "Are you sure?", close: true, danger: false },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "close", label: "Close button", type: "toggle", quick: true },
    { key: "danger", label: "Destructive", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [
      rect(0, 0, w, h, { fill: "solid", fillColor: "paper", shadow: true }),
      rect(0, 0, w, h),
    ]
    prims.push(text(20, 36, truncate(str(p, "title", "Are you sure?"), 18, w - 60), 18, { bold: true }))
    if (bool(p, "close")) prims.push(...icon("x", w - 22, 24, 14, { stroke: "muted" }))
    prims.push(...loremLines(20, 62, w - 40, 2, 16))
    const by = h - 48
    prims.push(rect(w - 110, by, 90, 32, { fill: "shade", fillColor: "ink" }))
    prims.push(text(w - 65, by + 21, bool(p, "danger") ? "Delete it" : "Confirm", 13, { align: "center" }))
    prims.push(rect(w - 210, by, 90, 32))
    prims.push(text(w - 165, by + 21, "Cancel", 13, { align: "center" }))
    if (bool(p, "danger")) prims.push(...icon("warning", 30, by - 20, 18))
    return prims
  },
}

// -- dropdown menu ----------------------------------------------------------

export const dropdownDef: ComponentDef = {
  kind: "dropdown",
  name: "Dropdown menu",
  category: "components",
  group: "Navigation",
  keywords: ["menu", "context", "options", "popover"],
  size: { w: 180, h: 150 },
  defaults: { items: "Profile, Settings, Invite team, Log out", icons: true },
  controls: [
    { key: "items", label: "Items (comma-sep)", type: "text" },
    { key: "icons", label: "Icons", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const items = list(p, "items", "Profile, Settings, Log out")
    const icons = bool(p, "icons")
    const iconNames = ["user", "gear", "mail", "arrow-right", "star", "trash"] as const
    const rowH = h / Math.max(1, items.length)
    const prims: Prim[] = [rect(0, 0, w, h, { fill: "solid", fillColor: "paper", shadow: true }), rect(0, 0, w, h)]
    items.forEach((item, i) => {
      const cy = i * rowH + rowH / 2
      let tx = 14
      if (icons) {
        prims.push(...icon(iconNames[i % iconNames.length], 20, cy, 14, { stroke: "muted" }))
        tx = 36
      }
      prims.push(text(tx, cy + 5, truncate(item, 14, w - tx - 10), 14, { color: i === items.length - 1 ? "muted" : "ink" }))
      if (i === items.length - 1 && items.length > 2) prims.push(line(8, i * rowH, w - 8, i * rowH, { stroke: "faint" }))
    })
    return prims
  },
}

// -- toast ------------------------------------------------------------------

export const toastDef: ComponentDef = {
  kind: "toast",
  name: "Toast",
  category: "components",
  group: "Feedback",
  keywords: ["notification", "snackbar", "message"],
  size: { w: 280, h: 64 },
  defaults: { title: "Saved!", description: true, action: false },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "toggle", quick: true },
    { key: "action", label: "Action", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h, { fill: "solid", fillColor: "paper", shadow: true }), rect(0, 0, w, h)]
    prims.push(...icon("check", 22, h / 2, 16))
    const hasDesc = bool(p, "description")
    const ty = hasDesc ? h / 2 - 6 : h / 2 + 5
    prims.push(text(42, ty, truncate(str(p, "title", "Saved!"), 15, w - 100), 15, { bold: true }))
    if (hasDesc) prims.push(line(42, h / 2 + 10, w - (bool(p, "action") ? 80 : 40), h / 2 + 10, { stroke: "muted", strokeWidth: 1.2 }))
    if (bool(p, "action")) prims.push(text(w - 44, h / 2 + 5, "Undo", 13, { align: "center", bold: true }))
    else prims.push(...icon("x", w - 20, 16, 10, { stroke: "muted" }))
    return prims
  },
}

// -- alert ------------------------------------------------------------------

export const alertDef: ComponentDef = {
  kind: "alert",
  name: "Alert",
  category: "components",
  group: "Feedback",
  keywords: ["banner", "warning", "info", "callout"],
  size: { w: 320, h: 68 },
  defaults: { title: "Heads up!", variant: "info" },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "variant", label: "Variant", type: "select", options: ["info", "warning"], quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [rect(0, 0, w, h)]
    prims.push(...icon(str(p, "variant") === "warning" ? "warning" : "info", 26, h / 2, 20))
    prims.push(text(48, h / 2 - 4, truncate(str(p, "title", "Heads up!"), 15, w - 60), 15, { bold: true }))
    prims.push(line(48, h / 2 + 12, w - 20, h / 2 + 12, { stroke: "muted", strokeWidth: 1.2 }))
    return prims
  },
}

// -- tooltip ----------------------------------------------------------------

export const tooltipDef: ComponentDef = {
  kind: "tooltip",
  name: "Tooltip",
  category: "components",
  group: "Feedback",
  keywords: ["hint", "hover", "popover"],
  size: { w: 120, h: 44 },
  defaults: { label: "Helpful hint" },
  controls: [{ key: "label", label: "Text", type: "text" }],
  render(p, w, h) {
    const bh = h - 10
    return [
      rect(0, 0, w, bh, { fill: "shade", fillColor: "ink" }),
      poly([[w / 2 - 7, bh], [w / 2, h], [w / 2 + 7, bh]], false),
      text(w / 2, bh / 2 + 5, truncate(str(p, "label", "Helpful hint"), 13, w - 12), 13, { align: "center" }),
    ]
  },
}

// -- breadcrumb -------------------------------------------------------------

export const breadcrumbDef: ComponentDef = {
  kind: "breadcrumb",
  name: "Breadcrumb",
  category: "components",
  group: "Navigation",
  keywords: ["path", "nav", "trail"],
  size: { w: 260, h: 24 },
  defaults: { items: "Home, Library, Data" },
  controls: [{ key: "items", label: "Items (comma-sep)", type: "text" }],
  render(p, w, h) {
    const items = list(p, "items", "Home, Library, Data")
    const prims: Prim[] = []
    let x = 0
    const cy = h / 2
    items.forEach((item, i) => {
      const last = i === items.length - 1
      prims.push(text(x, cy + 5, item, 14, { color: last ? "ink" : "muted", bold: last }))
      x += textWidth(item, 14) + 10
      if (!last) {
        prims.push(...icon("chevron-right", x + 4, cy, 10, { stroke: "faint" }))
        x += 18
      }
    })
    return prims
  },
}

// -- pagination -------------------------------------------------------------

export const paginationDef: ComponentDef = {
  kind: "pagination",
  name: "Pagination",
  category: "components",
  group: "Navigation",
  keywords: ["pages", "next", "prev"],
  size: { w: 260, h: 36 },
  defaults: { pages: 5, current: 2 },
  controls: [
    { key: "pages", label: "Pages", type: "number", min: 2, max: 7, quick: true },
    { key: "current", label: "Current", type: "number", min: 1, max: 7, quick: true },
  ],
  render(p, w, h) {
    const pages = Math.max(2, Math.min(7, num(p, "pages", 5)))
    const current = Math.max(1, Math.min(pages, num(p, "current", 2)))
    const cell = Math.min(h, 30)
    const gap = 8
    const total = (pages + 2) * (cell + gap) - gap
    let x = (w - total) / 2
    const cy = h / 2
    const prims: Prim[] = []
    prims.push(...icon("chevron-right", x + cell / 2, cy, 12, { stroke: "muted" }).map((pr) => pr))
    // flip the first chevron to point left by drawing manually
    prims.length = 0
    prims.push(poly([[x + cell * 0.6, cy - 6], [x + cell * 0.35, cy], [x + cell * 0.6, cy + 6]], false, { stroke: "muted" }))
    x += cell + gap
    for (let i = 1; i <= pages; i++) {
      if (i === current) {
        prims.push(rect(x, cy - cell / 2, cell, cell, { fill: "shade", fillColor: "ink" }))
      }
      prims.push(text(x + cell / 2, cy + 5, String(i), 13, { align: "center", color: i === current ? "ink" : "muted" }))
      x += cell + gap
    }
    prims.push(poly([[x + cell * 0.4, cy - 6], [x + cell * 0.65, cy], [x + cell * 0.4, cy + 6]], false, { stroke: "muted" }))
    return prims
  },
}

// -- chart ------------------------------------------------------------------

export const chartDef: ComponentDef = {
  kind: "chart",
  name: "Chart",
  category: "components",
  group: "Data",
  keywords: ["graph", "analytics", "data", "viz", "stats"],
  size: { w: 280, h: 180 },
  defaults: { style: "line", title: true },
  controls: [
    { key: "style", label: "Style", type: "select", options: ["line", "bars", "pie"], quick: true },
    { key: "title", label: "Title", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    let top = 0
    if (bool(p, "title")) {
      prims.push(rect(0, 0, w * 0.4, 12, { fill: "shade", fillColor: "muted", stroke: "faint", strokeWidth: 0.8 }))
      top = 24
    }
    const ch = h - top
    const style = str(p, "style", "line")
    if (style === "pie") {
      const d = Math.min(w, ch) * 0.85
      const cx = w / 2
      const cy = top + ch / 2
      prims.push(ellipse(cx - d / 2, cy - d / 2, d, d))
      prims.push(line(cx, cy, cx, cy - d / 2))
      prims.push(line(cx, cy, cx + d * 0.43, cy + d * 0.25))
      prims.push(line(cx, cy, cx - d * 0.48, cy + d * 0.12))
      prims.push(poly([[cx, cy], [cx + d * 0.2, cy - d * 0.44]], false, { fill: "shade" }))
      return prims
    }
    // axes
    prims.push(line(8, top + 4, 8, top + ch - 14))
    prims.push(line(8, top + ch - 14, w - 4, top + ch - 14))
    if (style === "bars") {
      const n = 5
      const bw = (w - 30) / n - 10
      const heights = [0.5, 0.8, 0.35, 0.65, 0.95]
      for (let i = 0; i < n; i++) {
        const bh = (ch - 30) * heights[i]
        prims.push(rect(18 + i * (bw + 10), top + ch - 14 - bh, bw, bh, { fill: "shade", fillColor: "ink" }))
      }
    } else {
      const pts: [number, number][] = [0.7, 0.45, 0.6, 0.3, 0.5, 0.15].map((v, i, arr) => [
        12 + ((w - 24) / (arr.length - 1)) * i,
        top + 8 + (ch - 30) * v,
      ])
      prims.push(poly(pts, false, { strokeWidth: 2, roughness: 1.8 }))
      pts.forEach(([px, py]) => prims.push(ellipse(px - 3, py - 3, 6, 6, { fill: "solid", fillColor: "ink" })))
    }
    return prims
  },
}

export const DISPLAY_DEFS: ComponentDef[] = [
  cardDef,
  imageDef,
  paragraphDef,
  dividerDef,
  tableDef,
  tabsDef,
  dialogDef,
  dropdownDef,
  toastDef,
  alertDef,
  tooltipDef,
  breadcrumbDef,
  paginationDef,
  chartDef,
]
