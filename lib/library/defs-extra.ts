// ---------------------------------------------------------------------------
// Odds and ends that don't belong to a family — the icon dropper, sticky note,
// frame, and the annotation bits you scribble *around* a wireframe.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, ellipse, line, text, poly, icon, truncate, textWidth, loremLines } from "@/lib/sketch/kit"
import { resolveIconName } from "@/lib/sketch/icons"
import type { ComponentDef, Props } from "./registry"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)

// -- icon -------------------------------------------------------------------

/**
 * A short shelf of the glyphs people actually reach for. The full catalogue is
 * 174 names, which is a dropdown nobody wants to scroll — "custom" hands the
 * job back to the Custom name field, and is the default so that older icons
 * (which only ever stored a name) keep drawing the glyph they were saved with.
 */
const ICON_PICKS = [
  "star",
  "heart",
  "user",
  "users",
  "house",
  "gear",
  "bell",
  "envelope",
  "magnifying-glass",
  "check",
  "x",
  "plus",
  "calendar-blank",
  "clock",
  "lock",
  "trash",
  "image",
  "file",
  "folder",
  "chat-circle",
  "shopping-cart",
  "sparkle",
  "lightning",
  "globe",
  "custom",
]

export const iconDef: ComponentDef = {
  kind: "icon",
  name: "Icon",
  category: "components",
  group: "Media",
  keywords: ["glyph", "symbol", "phosphor", "pictogram"],
  size: { w: 40, h: 40 },
  defaults: { pick: "custom", name: "star", shape: "none" },
  controls: [
    { key: "pick", label: "Icon", type: "select", options: ICON_PICKS, quick: true },
    { key: "name", label: "Custom name", type: "text" },
    { key: "shape", label: "Container", type: "select", options: ["none", "circle", "square"], quick: true },
  ],
  render(p, w, h) {
    const shape = str(p, "shape", "none")
    const prims: Prim[] = []
    const d = Math.min(w, h)
    if (shape === "circle") prims.push(ellipse((w - d) / 2, (h - d) / 2, d, d))
    else if (shape === "square") prims.push(rect((w - d) / 2, (h - d) / 2, d, d, { r: 6 }))
    // "custom" — which is also what a legacy node or a broken-apart icon
    // resolves to — reads the name field instead
    const pick = str(p, "pick", "custom")
    const name = pick && pick !== "custom" ? pick : str(p, "name", "star")
    const inner = shape === "none" ? d : d * 0.55
    if (resolveIconName(name) || name === "logo") {
      prims.push(...icon(name, w / 2, h / 2, inner))
    } else {
      // unknown name — say so rather than rendering an invisible component
      prims.push(rect(0, 0, w, h, { stroke: "faint", dashed: true }))
      prims.push(text(w / 2, h / 2 + 4, "?", Math.min(20, d * 0.5), { align: "center", color: "muted" }))
    }
    return prims
  },
}

// -- sticky note ------------------------------------------------------------

export const stickyDef: ComponentDef = {
  kind: "sticky",
  name: "Sticky note",
  category: "components",
  group: "Display",
  keywords: ["postit", "post-it", "note", "comment", "annotation"],
  size: { w: 160, h: 140 },
  defaults: { label: "why is this here?", fold: true, size: "md" },
  controls: [
    { key: "label", label: "Note", type: "text" },
    { key: "size", label: "Text size", type: "select", options: ["sm", "md", "lg"], quick: true },
    { key: "fold", label: "Folded corner", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const fold = bool(p, "fold")
    const f = Math.min(22, w * 0.18, h * 0.18)
    const prims: Prim[] = []
    if (fold) {
      prims.push(
        poly(
          [
            [0, 0],
            [w, 0],
            [w, h - f],
            [w - f, h],
            [0, h],
          ],
          true,
          { fill: "shade", fillColor: "muted" }
        )
      )
      prims.push(poly([[w - f, h], [w - f, h - f], [w, h - f]], false, { stroke: "muted" }))
    } else {
      prims.push(rect(0, 0, w, h, { fill: "shade", fillColor: "muted", r: 2 }))
    }
    // wrap the note text by hand — sticky notes are always a bit cramped
    const sizeName = str(p, "size", "md")
    const size = sizeName === "sm" ? 12 : sizeName === "lg" ? 20 : 14
    const maxChars = Math.max(4, Math.floor((w - 24) / (size * 0.46)))
    const words = str(p, "label", "").split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let cur = ""
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word
      if (next.length > maxChars && cur) {
        lines.push(cur)
        cur = word
      } else cur = next
    }
    if (cur) lines.push(cur)
    const maxLines = Math.max(1, Math.floor((h - 24) / (size * 1.35)))
    lines.slice(0, maxLines).forEach((l, i) => {
      prims.push(text(12, 12 + size + i * size * 1.35, l, size))
    })
    return prims
  },
}

// -- frame ------------------------------------------------------------------

export const frameDef: ComponentDef = {
  kind: "frame",
  name: "Frame",
  category: "components",
  group: "Display",
  keywords: ["artboard", "screen", "device", "canvas", "container"],
  size: { w: 390, h: 560 },
  defaults: { label: "Screen", preset: "phone", statusBar: true },
  controls: [
    { key: "label", label: "Name", type: "text" },
    { key: "preset", label: "Preset", type: "select", options: ["phone", "tablet", "desktop", "free"], quick: true },
    { key: "statusBar", label: "Top bar", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const preset = str(p, "preset", "phone")
    const prims: Prim[] = []
    prims.push(text(0, -8, truncate(str(p, "label", "Screen"), 13, w), 13, { color: "muted" }))
    const r = preset === "phone" ? 22 : preset === "tablet" ? 14 : 6
    prims.push(rect(0, 0, w, h, { r }))
    // every preset gets a bar — "free" used to swallow the toggle whole
    if (bool(p, "statusBar")) {
      if (preset === "desktop") {
        prims.push(line(0, 28, w, 28, { stroke: "faint" }))
        prims.push(ellipse(12, 10, 8, 8, { stroke: "muted" }))
        prims.push(ellipse(26, 10, 8, 8, { stroke: "muted" }))
        prims.push(ellipse(40, 10, 8, 8, { stroke: "muted" }))
        prims.push(rect(60, 7, Math.max(40, w * 0.5), 15, { stroke: "faint", r: 7 }))
      } else {
        prims.push(text(18, 22, "9:41", 12, { bold: true }))
        prims.push(line(w - 52, 16, w - 40, 16, { stroke: "muted", strokeWidth: 2 }))
        prims.push(rect(w - 34, 11, 18, 10, { stroke: "muted", r: 2 }))
        if (preset === "phone") prims.push(rect(w / 2 - 30, 4, 60, 18, { fill: "solid", fillColor: "ink", r: 9 }))
      }
    }
    return prims
  },
}

// -- annotation -------------------------------------------------------------

export const calloutDef: ComponentDef = {
  kind: "callout",
  name: "Callout",
  category: "components",
  group: "Display",
  keywords: ["annotation", "note", "pointer", "label", "marker"],
  size: { w: 170, h: 56 },
  defaults: { label: "this bit is fake", numbered: true, index: 1 },
  controls: [
    { key: "label", label: "Text", type: "text" },
    { key: "numbered", label: "Number badge", type: "toggle", quick: true },
    { key: "index", label: "Number", type: "number", min: 1, max: 99, quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    const numbered = bool(p, "numbered")
    const d = 24
    let tx = 0
    if (numbered) {
      prims.push(ellipse(0, h / 2 - d / 2, d, d, { fill: "solid", fillColor: "paper" }))
      prims.push(ellipse(0, h / 2 - d / 2, d, d))
      prims.push(text(d / 2, h / 2 + 5, String(num(p, "index", 1)), 13, { align: "center", bold: true }))
      tx = d + 10
    }
    const size = 14
    prims.push(text(tx, h / 2 + 5, truncate(str(p, "label", ""), size, w - tx), size))
    prims.push(line(tx, h / 2 + 12, tx + Math.min(w - tx, textWidth(str(p, "label", ""), size)), h / 2 + 12, { stroke: "faint" }))
    return prims
  },
}

// -- spec label -------------------------------------------------------------

export const specDef: ComponentDef = {
  kind: "spec",
  name: "Spec note",
  category: "components",
  group: "Display",
  keywords: ["annotation", "requirement", "behaviour", "todo", "question"],
  size: { w: 220, h: 96 },
  defaults: { title: "Behaviour", lines: 3, kind: "note" },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "kind", label: "Kind", type: "select", options: ["note", "todo", "question"], quick: true },
    { key: "lines", label: "Lines", type: "number", min: 1, max: 8, quick: true },
  ],
  render(p, w, h) {
    const kindProp = str(p, "kind", "note")
    const glyph = kindProp === "todo" ? "list-checks" : kindProp === "question" ? "question" : "note"
    const prims: Prim[] = [rect(0, 0, w, h, { stroke: "faint", dashed: true, r: 6 })]
    prims.push(...icon(glyph, 20, 20, 15, { stroke: "muted" }))
    prims.push(text(36, 25, truncate(str(p, "title", "Note"), 14, w - 46), 14, { bold: true }))
    // The title block is fixed; the copy under it is elastic. Under ~52 tall
    // there is nowhere for a line to sit that isn't already the title, so the
    // note becomes a labelled box. Above that, the gap is the leftover room —
    // it works out to the usual 18 at the shipped height — and once the lines
    // can't hold a legible distance apart the spare ones are dropped rather
    // than stacked on each other or run off the floor.
    const n = Math.max(1, Math.min(8, num(p, "lines", 3)))
    const top = 44
    const room = h - 8 - top
    if (room >= 0) {
      const minGap = 6
      const count = Math.max(1, Math.min(n, Math.floor(room / minGap) + 1))
      const gap = count > 1 ? Math.min((h - 42) / n, room / (count - 1)) : (h - 42) / n
      prims.push(...loremLines(14, top, w - 28, count, gap))
    }
    return prims
  },
}

export const EXTRA_DEFS: ComponentDef[] = [iconDef, stickyDef, frameDef, calloutDef, specDef]
