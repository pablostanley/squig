// ---------------------------------------------------------------------------
// Basic controls — button, badge, avatar, inputs, toggles, slider, progress.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, pill, ellipse, line, text, icon, truncate, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => Number(p[k] ?? fallback)

// -- button -----------------------------------------------------------------

export const buttonDef: ComponentDef = {
  kind: "button",
  name: "Button",
  category: "components",
  group: "Buttons",
  keywords: ["btn", "cta", "action"],
  size: { w: 132, h: 40 },
  defaults: { label: "Click me", variant: "filled", size: "md", icon: "none", glyph: "plus" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "variant", label: "Variant", type: "select", options: ["filled", "outline", "ghost"], quick: true },
    { key: "size", label: "Size", type: "select", options: ["sm", "md", "lg"], quick: true },
    { key: "icon", label: "Icon side", type: "select", options: ["none", "left", "right"], quick: true },
    {
      key: "glyph",
      label: "Icon",
      type: "icon",
      visibleWhen: { key: "icon", equals: ["left", "right"] },
    },
  ],
  render(p, w, h) {
    const variant = str(p, "variant", "filled")
    const size = str(p, "size", "md")
    const iconPos = str(p, "icon", "none")
    // Old nodes have no glyph key: fall back to what each side used to hardcode.
    const glyph = str(p, "glyph", iconPos === "right" ? "arrow-right" : "plus")
    const fontSize = size === "sm" ? 13 : size === "lg" ? 18 : 15
    const prims: Prim[] = []
    if (variant === "filled") {
      prims.push(rect(0, 0, w, h, { fill: "shade", fillColor: "ink" }))
    } else if (variant === "outline") {
      prims.push(rect(0, 0, w, h))
    } else {
      prims.push(rect(0, 0, w, h, { stroke: "faint", dashed: true, strokeWidth: 1 }))
    }
    const label = truncate(str(p, "label", "Click me"), fontSize, w - 24 - (iconPos !== "none" ? fontSize + 6 : 0))
    const iconSize = fontSize * 0.9
    const tw = textWidth(label, fontSize)
    const total = tw + (iconPos !== "none" ? iconSize + 8 : 0)
    const startX = (w - total) / 2
    const cy = h / 2
    if (iconPos === "left") {
      prims.push(...icon(glyph, startX + iconSize / 2, cy, iconSize))
      prims.push(text(startX + iconSize + 8, cy + fontSize * 0.35, label, fontSize))
    } else if (iconPos === "right") {
      prims.push(text(startX, cy + fontSize * 0.35, label, fontSize))
      prims.push(...icon(glyph, startX + tw + 8 + iconSize / 2, cy, iconSize))
    } else {
      prims.push(text(w / 2, cy + fontSize * 0.35, label, fontSize, { align: "center" }))
    }
    return prims
  },
}

// -- badge ------------------------------------------------------------------

export const badgeDef: ComponentDef = {
  kind: "badge",
  name: "Badge",
  category: "components",
  group: "Display",
  keywords: ["tag", "chip", "pill", "label", "status", "dot"],
  size: { w: 64, h: 24 },
  defaults: { label: "New", variant: "outline", dot: false },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "variant", label: "Variant", type: "select", options: ["filled", "outline"], quick: true },
    { key: "dot", label: "Status dot", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const prims: Prim[] = [
      str(p, "variant") === "filled"
        ? pill(0, 0, w, h, { fill: "shade", fillColor: "ink" })
        : pill(0, 0, w, h),
    ]
    // Too narrow for a dot and a word, so the word wins.
    const dot = bool(p, "dot") && w > 34
    const d = Math.max(4, Math.min(7, h * 0.26))
    const label = truncate(str(p, "label", "New"), 12, w - 12 - (dot ? d + 6 : 0))
    if (dot) {
      const startX = Math.max(6, (w - (d + 6 + textWidth(label, 12))) / 2)
      prims.push(ellipse(startX, h / 2 - d / 2, d, d, { fill: "solid", fillColor: "ink" }))
      prims.push(text(startX + d + 6, h / 2 + 4, label, 12))
    } else {
      prims.push(text(w / 2, h / 2 + 4, label, 12, { align: "center" }))
    }
    return prims
  },
}

// -- avatar -----------------------------------------------------------------

export const avatarDef: ComponentDef = {
  kind: "avatar",
  name: "Avatar",
  category: "components",
  group: "Display",
  keywords: ["user", "profile", "photo", "person"],
  size: { w: 48, h: 48 },
  defaults: { shape: "circle", content: "icon", glyph: "user", initials: "PS", status: false },
  controls: [
    { key: "shape", label: "Shape", type: "select", options: ["circle", "square"], quick: true },
    { key: "content", label: "Content", type: "select", options: ["icon", "initials"], quick: true },
    { key: "glyph", label: "Icon", type: "icon", visibleWhen: { key: "content", equals: "icon" } },
    { key: "initials", label: "Initials", type: "text" },
    { key: "status", label: "Status dot", type: "toggle" },
  ],
  render(p, w, h) {
    const prims: Prim[] = []
    if (str(p, "shape") === "square") prims.push(rect(0, 0, w, h))
    else prims.push(ellipse(0, 0, w, h))
    if (str(p, "content") === "initials") {
      prims.push(text(w / 2, h / 2 + h * 0.14, str(p, "initials", "PS").slice(0, 2), h * 0.38, { align: "center" }))
    } else {
      prims.push(...icon(str(p, "glyph", "user"), w / 2, h / 2, Math.min(w, h) * 0.5))
    }
    if (bool(p, "status")) {
      prims.push(ellipse(w - w * 0.28, h - h * 0.28, w * 0.24, h * 0.24, { fill: "solid", fillColor: "ink" }))
    }
    return prims
  },
}

// -- input ------------------------------------------------------------------

export const inputDef: ComponentDef = {
  kind: "input",
  name: "Input",
  category: "components",
  group: "Forms",
  keywords: ["field", "form", "textfield", "search"],
  size: { w: 220, h: 62 },
  defaults: { label: "Label", showLabel: true, placeholder: "Type here…", icon: "none" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "placeholder", label: "Placeholder", type: "text" },
    { key: "icon", label: "Icon", type: "icon", allowNone: true },
  ],
  render(p, w, h) {
    const showLabel = bool(p, "showLabel")
    const prims: Prim[] = []
    let top = 0
    if (showLabel) {
      prims.push(text(2, 14, str(p, "label", "Label"), 13))
      top = 22
    }
    const fieldH = h - top
    prims.push(rect(0, top, w, fieldH))
    const ic = str(p, "icon", "none")
    let tx = 12
    if (ic !== "none") {
      prims.push(...icon(ic as "search", 12 + 8, top + fieldH / 2, 15, { stroke: "muted" }))
      tx = 34
    }
    prims.push(
      text(tx, top + fieldH / 2 + 5, truncate(str(p, "placeholder", "Type here…"), 14, w - tx - 10), 14, { color: "muted" })
    )
    return prims
  },
}

// -- textarea ---------------------------------------------------------------

export const textareaDef: ComponentDef = {
  kind: "textarea",
  name: "Textarea",
  category: "components",
  group: "Forms",
  keywords: ["multiline", "form", "comment", "message"],
  size: { w: 240, h: 100 },
  defaults: { label: "Message", showLabel: true, placeholder: "Say something nice…" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "placeholder", label: "Placeholder", type: "text" },
  ],
  render(p, w, h) {
    const showLabel = bool(p, "showLabel")
    const prims: Prim[] = []
    let top = 0
    if (showLabel) {
      prims.push(text(2, 14, str(p, "label", "Message"), 13))
      top = 22
    }
    prims.push(rect(0, top, w, h - top))
    prims.push(text(12, top + 24, truncate(str(p, "placeholder", ""), 14, w - 24), 14, { color: "muted" }))
    // resize nub
    prims.push(line(w - 14, h - 5, w - 5, h - 14, { stroke: "faint" }))
    prims.push(line(w - 9, h - 5, w - 5, h - 9, { stroke: "faint" }))
    return prims
  },
}

// -- select -----------------------------------------------------------------

export const selectDef: ComponentDef = {
  kind: "select",
  name: "Select",
  category: "components",
  group: "Forms",
  keywords: ["dropdown", "picker", "combobox", "form"],
  size: { w: 200, h: 62 },
  defaults: { label: "Pick one", showLabel: true, value: "Option A" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "value", label: "Value", type: "text" },
  ],
  render(p, w, h) {
    const showLabel = bool(p, "showLabel")
    const prims: Prim[] = []
    let top = 0
    if (showLabel) {
      prims.push(text(2, 14, str(p, "label", "Pick one"), 13))
      top = 22
    }
    const fieldH = h - top
    prims.push(rect(0, top, w, fieldH))
    prims.push(text(12, top + fieldH / 2 + 5, truncate(str(p, "value", "Option A"), 14, w - 44), 14))
    prims.push(...icon("chevron-down", w - 18, top + fieldH / 2, 13, { stroke: "muted" }))
    return prims
  },
}

// -- checkbox ---------------------------------------------------------------

export const checkboxDef: ComponentDef = {
  kind: "checkbox",
  name: "Checkbox",
  category: "components",
  group: "Selection",
  keywords: ["check", "tick", "form", "todo"],
  size: { w: 160, h: 24 },
  defaults: { label: "Check me", checked: true },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "checked", label: "Checked", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const box = Math.min(20, h)
    const prims: Prim[] = [rect(0, (h - box) / 2, box, box)]
    if (bool(p, "checked")) prims.push(...icon("check", box / 2, h / 2, box * 0.8))
    prims.push(text(box + 10, h / 2 + 5, truncate(str(p, "label", "Check me"), 14, w - box - 12), 14))
    return prims
  },
}

// -- radio ------------------------------------------------------------------

export const radioDef: ComponentDef = {
  kind: "radio",
  name: "Radio",
  category: "components",
  group: "Selection",
  keywords: ["option", "choice", "form"],
  size: { w: 160, h: 24 },
  defaults: { label: "Pick me", checked: true },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "checked", label: "Selected", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const d = Math.min(20, h)
    const prims: Prim[] = [ellipse(0, (h - d) / 2, d, d)]
    if (bool(p, "checked")) {
      prims.push(ellipse(d * 0.25, (h - d) / 2 + d * 0.25, d * 0.5, d * 0.5, { fill: "solid", fillColor: "ink" }))
    }
    prims.push(text(d + 10, h / 2 + 5, truncate(str(p, "label", "Pick me"), 14, w - d - 12), 14))
    return prims
  },
}

// -- switch -----------------------------------------------------------------

export const switchDef: ComponentDef = {
  kind: "switch",
  name: "Switch",
  category: "components",
  group: "Selection",
  keywords: ["toggle", "on", "off", "form"],
  size: { w: 160, h: 28 },
  defaults: { label: "Turn me on", on: true, showLabel: true },
  controls: [
    { key: "on", label: "On", type: "toggle", quick: true },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "label", label: "Label", type: "text" },
  ],
  render(p, w, h) {
    const on = bool(p, "on")
    const tw = 44
    const th = Math.min(24, h)
    const ty = (h - th) / 2
    const prims: Prim[] = [
      rect(0, ty, tw, th, on ? { fill: "shade", fillColor: "ink" } : { stroke: "muted" }),
    ]
    const knob = th - 6
    prims.push(
      ellipse(on ? tw - knob - 3 : 3, ty + 3, knob, knob, { fill: "solid", fillColor: "paper" }),
      ellipse(on ? tw - knob - 3 : 3, ty + 3, knob, knob)
    )
    if (bool(p, "showLabel")) {
      prims.push(text(tw + 10, h / 2 + 5, truncate(str(p, "label", ""), 14, w - tw - 12), 14))
    }
    return prims
  },
}

// -- slider -----------------------------------------------------------------

export const sliderDef: ComponentDef = {
  kind: "slider",
  name: "Slider",
  category: "components",
  group: "Forms",
  keywords: ["range", "volume", "form"],
  size: { w: 200, h: 28 },
  defaults: { label: "Volume", showLabel: false, value: 60, showValue: false },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "showLabel", label: "Show label", type: "toggle", quick: true },
    { key: "value", label: "Value", type: "number", min: 0, max: 100, quick: true },
    { key: "showValue", label: "Show value", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const raw = Math.max(0, Math.min(100, num(p, "value", 60)))
    const v = raw / 100
    // Below 26px tall the label would sit on top of the track, so it steps aside.
    const showLabel = bool(p, "showLabel") && h >= 26
    const top = showLabel ? Math.min(22, h * 0.5) : 0
    const cy = top + (h - top) / 2
    // Without a label the knob is the 16 it has always been; with one it
    // shrinks into whatever band the label left behind.
    const knob = showLabel ? Math.max(8, Math.min(16, h - top)) : 16
    const trackW = Math.max(2, w - (bool(p, "showValue") ? 36 : 0))
    // On a track narrower than the knob, park the knob instead of pushing it
    // off the left edge.
    const kx = Math.max(knob / 2, v * (trackW - knob) + knob / 2)
    const prims: Prim[] = [
      line(0, cy, trackW, cy, { stroke: "muted", strokeWidth: 2 }),
      line(0, cy, kx, cy, { strokeWidth: 2.5 }),
      ellipse(kx - knob / 2, cy - knob / 2, knob, knob, { fill: "solid", fillColor: "paper" }),
      ellipse(kx - knob / 2, cy - knob / 2, knob, knob),
    ]
    if (showLabel) prims.push(text(2, 13, truncate(str(p, "label", "Volume"), 13, w - 40), 13))
    if (bool(p, "showValue")) {
      // The label pushes the track down; keep the number off the bottom edge.
      const vy = showLabel ? Math.min(cy + 5, h - 4) : cy + 5
      // Same number the knob is standing on, and short enough for the 36px
      // the track gave up — "33.333" would run off the right edge.
      prims.push(text(trackW + 8, vy, String(Math.round(raw)), 13, { color: "muted" }))
    }
    return prims
  },
}

// -- progress ---------------------------------------------------------------

export const progressDef: ComponentDef = {
  kind: "progress",
  name: "Progress",
  category: "components",
  group: "Feedback",
  keywords: ["bar", "loading", "meter"],
  size: { w: 200, h: 16 },
  defaults: { value: 40, showValue: false },
  controls: [
    { key: "value", label: "Value", type: "number", min: 0, max: 100, quick: true },
    { key: "showValue", label: "Show value", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const raw = Math.max(0, Math.min(100, num(p, "value", 40)))
    const v = raw / 100
    const showValue = bool(p, "showValue")
    // The number needs 36px; on a bar too short to spare them, the track keeps
    // a sliver rather than going inside out.
    const trackW = Math.max(2, w - (showValue ? 36 : 0))
    const fillW = Math.max(0, (trackW - 4) * v)
    const prims: Prim[] = [rect(0, 0, trackW, h)]
    if (v > 0.02 && fillW > 0) {
      prims.push(rect(2, 2, fillW, h - 4, { fill: "shade", fillColor: "ink", strokeWidth: 1 }))
    }
    if (showValue) {
      // A progress bar is short — shrink the number rather than let it hang out.
      const fs = Math.max(8, Math.min(13, h - 3))
      prims.push(text(trackW + 8, h / 2 + fs * 0.35, `${Math.round(raw)}%`, fs, { color: "muted" }))
    }
    return prims
  },
}

export const BASIC_DEFS: ComponentDef[] = [
  buttonDef,
  inputDef,
  textareaDef,
  selectDef,
  checkboxDef,
  radioDef,
  switchDef,
  sliderDef,
  badgeDef,
  avatarDef,
  progressDef,
]
