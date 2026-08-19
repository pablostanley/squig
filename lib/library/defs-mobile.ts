// ---------------------------------------------------------------------------
// Phone screens — the whole-screen templates at phone width, so a mobile
// wireframe starts as one drop instead of ten resizes.
//
// Nothing here is drawn twice: every row, tab bar, card and button is the same
// def the desktop screens use, handed a narrower box. They all reflow, so these
// inherit whatever those learn later.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { rect, pill, ellipse, line, text, icon, place, loremLines, truncate, textWidth } from "@/lib/sketch/kit"
import type { ComponentDef, Props } from "./registry"
import { buttonDef } from "./defs-basic"
import { searchInputDef, navTabsPillDef, bottomNavDef, listItemDef, cardMediaDef } from "./defs-more"

// -- tiny prop readers -------------------------------------------------------

const str = (p: Props, k: string, fallback = ""): string => String(p[k] ?? fallback)
const bool = (p: Props, k: string): boolean => Boolean(p[k])
/** For toggles added after the fact — on an older node `undefined` means "the
 *  way it always looked", not "off". */
const boolOn = (p: Props, k: string): boolean => p[k] === undefined || Boolean(p[k])
const num = (p: Props, k: string, fallback = 0): number => {
  const n = Number(p[k] ?? fallback)
  return Number.isFinite(n) ? n : fallback
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
/** safe indexed pick from a cycling pool */
const pick = <T,>(pool: readonly T[], i: number): T => pool[((i % pool.length) + pool.length) % pool.length]

/**
 * A comma-separated list, backfilled from the words the screen ships with —
 * rename two rows of five and the other three keep the names they had. The
 * stock array is also what `defaults` joins, so a screen nobody has typed into
 * reads back exactly the list it started with.
 */
const listOr = (p: Props, k: string, stock: readonly string[]): string[] => {
  const given = str(p, k, "").split(",").map((s) => s.trim())
  const n = Math.max(stock.length, given.length)
  return Array.from({ length: n }, (_, i) => given[i] || stock[i % stock.length])
}

function sub(def: ComponentDef, props: Props, x: number, y: number, w: number, h: number): Prim[] {
  return place(def.render({ ...def.defaults, ...props }, w, h), x, y)
}

// -- shared drawing ----------------------------------------------------------

const hair = (x: number, y: number, w: number): Prim => line(x, y, x + Math.max(4, w), y, { stroke: "faint" })

/** baseline for text vertically centred in a band of height `bh` starting at `top` */
const mid = (top: number, bh: number, size: number): number => top + bh / 2 + size * 0.35

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

// -- the phone --------------------------------------------------------------

// The box these ship in. 390 is the `frame` def's phone preset; the extra
// height is the part of a phone you actually scroll.
const PHONE_W = 390
const PHONE_H = 760

const NAV_LABELS = ["Home", "Search", "Post", "Inbox", "You"]

/** Side padding — the gutter every phone screen indents its content by. */
const padOf = (w: number): number => clamp(w * 0.055, 10, 22)

/** The clock strip. Same furniture as the `frame` def's phone preset. */
function statusBar(w: number, bh: number): Prim[] {
  const cy = bh / 2
  const fs = clamp(bh * 0.4, 9, 12)
  const pad = padOf(w)
  const prims: Prim[] = [text(pad, cy + fs * 0.35, "9:41", fs, { bold: true })]
  const bw = clamp(bh * 0.62, 12, 19)
  const bh2 = clamp(bh * 0.3, 7, 10)
  const bx = w - pad - bw
  if (bx > w * 0.55) {
    prims.push(rect(bx, cy - bh2 / 2, bw, bh2, { stroke: "muted", r: 2 }))
    const sx = bx - 10
    if (sx - 12 > w * 0.45) prims.push(line(sx - 12, cy, sx, cy, { stroke: "muted", strokeWidth: 2 }))
  }
  return prims
}

/**
 * The outline, the clock and the tab bar — the three things every phone screen
 * has and none of them are the idea you're sketching. Returns the band of the
 * screen that's left for content.
 */
function chrome(
  p: Props,
  w: number,
  h: number,
  active: number,
  wantsNav = true
): { prims: Prim[]; top: number; bottom: number } {
  const sh = boolOn(p, "status") ? clamp(h * 0.045, 16, 30) : 0
  const nh = wantsNav && boolOn(p, "nav") ? clamp(h * 0.085, 42, 70) : 0
  const prims: Prim[] = [rect(0, 0, w, h, { r: clamp(Math.min(w, h) * 0.06, 4, 20) })]
  if (sh > 0) prims.push(...statusBar(w, sh))
  if (nh > 0) {
    const labels = listOr(p, "navLabels", NAV_LABELS)
    prims.push(
      ...sub(
        bottomNavDef,
        {
          labels: labels.join(", "),
          count: clamp(labels.length, 3, 5),
          active: clamp(active, 1, 5),
          showLabels: nh > 48,
          indicator: true,
        },
        0,
        h - nh,
        w,
        nh
      )
    )
  }
  return { prims, top: sh, bottom: h - nh }
}

/** A big screen title with something small on the right — the phone header row. */
function titleRow(w: number, y: number, bh: number, title: string, glyphs: string[]): Prim[] {
  const pad = padOf(w)
  const ts = clamp(Math.min(w * 0.058, bh * 0.5), 14, 24)
  const isz = clamp(bh * 0.36, 14, 20)
  const prims: Prim[] = []
  let right = w - pad
  for (const g of glyphs) {
    if (right - isz < w * 0.45) break
    prims.push(...icon(g, right - isz / 2, y + bh / 2, isz, { stroke: "muted" }))
    right -= isz + 16
  }
  prims.push(text(pad, mid(y, bh, ts), truncate(title, ts, Math.max(20, right - pad - 8)), ts, { bold: true }))
  return prims
}

// ===========================================================================
// Feed
// ===========================================================================

const FEED_POSTS = ["Coffee that fixed nothing", "A very long walk", "Boxes, but rounder", "Nine more ideas"]
const FEED_TABS = ["For you", "Following", "Nearby"]
const FEED_TAGS = ["Today", "Saved", "New", "Old"]

export const mobileFeedDef: ComponentDef = {
  kind: "mobile-feed",
  name: "Mobile feed",
  category: "blocks",
  group: "Screens",
  keywords: ["mobile", "phone", "ios", "android", "app", "home", "feed", "timeline", "cards"],
  size: { w: PHONE_W, h: PHONE_H },
  defaults: {
    title: "Morning, Pablo",
    tabs: FEED_TABS.join(", "),
    posts: FEED_POSTS.join(", "),
    navLabels: NAV_LABELS.join(", "),
    search: true,
    nav: true,
    status: true,
  },
  controls: [
    { key: "title", label: "Greeting", type: "text" },
    { key: "tabs", label: "Tabs (comma-sep)", type: "text" },
    { key: "posts", label: "Post titles (comma-sep)", type: "text" },
    { key: "navLabels", label: "Tab bar (comma-sep)", type: "text" },
    { key: "search", label: "Search", type: "toggle", quick: true },
    { key: "nav", label: "Tab bar", type: "toggle", quick: true },
    { key: "status", label: "Clock", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const { prims, top, bottom } = chrome(p, w, h, 1)
    const pad = padOf(w)
    const cw = w - pad * 2
    let y = top

    // greeting + the little face you tap to get to your own stuff
    const headH = clamp(h * 0.072, 38, 58)
    const d = clamp(headH * 0.62, 22, 38)
    if (y + headH < bottom) {
      prims.push(...titleRow(w, y, headH, str(p, "title", "Morning, Pablo"), []))
      prims.push(ellipse(w - pad - d, y + (headH - d) / 2, d, d))
      prims.push(...icon("user", w - pad - d / 2, y + headH / 2, d * 0.52, { stroke: "muted" }))
      y += headH
    }

    if (bool(p, "search")) {
      const sh = clamp(h * 0.05, 28, 42)
      if (y + sh < bottom - 40) {
        prims.push(
          ...sub(searchInputDef, { placeholder: "Search for something", shape: "pill", kbd: false, clear: false }, pad, y, cw, sh)
        )
        y += sh + clamp(h * 0.018, 8, 14)
      }
    }

    const tabs = listOr(p, "tabs", FEED_TABS)
    const tabH = clamp(h * 0.05, 26, 38)
    if (y + tabH < bottom - 40) {
      prims.push(...sub(navTabsPillDef, { labels: tabs.join(", "), active: 1, container: true }, pad, y, cw, tabH))
      y += tabH + clamp(h * 0.02, 10, 16)
    }

    // The feed itself. The count comes from the room, not from how many titles
    // are in the box: a card that reads is worth more than a card per word, and
    // the titles cycle over however many the height ends up allowing.
    const gap = clamp(h * 0.018, 8, 16)
    const avail = bottom - y - clamp(h * 0.012, 6, 12)
    const MIN_CARD = 120
    const TARGET = 250
    const fits = Math.floor((avail + gap) / (MIN_CARD + gap))
    if (fits >= 1) {
      const posts = listOr(p, "posts", FEED_POSTS)
      const n = clamp(Math.min(Math.round((avail + gap) / (TARGET + gap)), fits), 1, 4)
      const cardH = (avail - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) {
        prims.push(
          ...sub(
            cardMediaDef,
            { title: pick(posts, i), badge: cardH > 150, badgeLabel: pick(FEED_TAGS, i), meta: cardH > 130 },
            pad,
            y + i * (cardH + gap),
            cw,
            cardH
          )
        )
      }
    }
    return prims
  },
}

// ===========================================================================
// List
// ===========================================================================

const LIST_NAMES = ["Maya", "Luis", "Design crew", "Ana", "Kai", "Mom", "Standup bot", "Rosa", "The landlord", "No-reply"]
const LIST_TABS = ["All", "Unread", "Groups"]
const LIST_PREVIEWS = [
  "ok but hear me out…",
  "merged, finally",
  "six unread, good luck",
  "did you see the thing?",
  "wrong channel, sorry",
  "call me back, mijo",
  "standup in five",
  "sent you the file twice",
  "about the ceiling",
  "this is automated",
]
const LIST_TIMES = ["9:41", "8:12", "Yest.", "Tue", "Mon", "Mon", "Sun", "Sun", "Jul 8", "Jul 3"]

export const mobileListDef: ComponentDef = {
  kind: "mobile-list",
  name: "Mobile list",
  category: "blocks",
  group: "Screens",
  keywords: ["mobile", "phone", "ios", "android", "app", "inbox", "messages", "rows", "threads"],
  size: { w: PHONE_W, h: PHONE_H },
  defaults: {
    title: "Messages",
    tabs: LIST_TABS.join(", "),
    names: LIST_NAMES.join(", "),
    navLabels: NAV_LABELS.join(", "),
    search: true,
    nav: true,
    status: true,
  },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "tabs", label: "Tabs (comma-sep)", type: "text" },
    { key: "names", label: "Rows (comma-sep)", type: "text" },
    { key: "navLabels", label: "Tab bar (comma-sep)", type: "text" },
    { key: "search", label: "Search", type: "toggle", quick: true },
    { key: "nav", label: "Tab bar", type: "toggle", quick: true },
    { key: "status", label: "Clock", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const { prims, top, bottom } = chrome(p, w, h, 4)
    const pad = padOf(w)
    const cw = w - pad * 2
    let y = top

    const headH = clamp(h * 0.072, 38, 58)
    if (y + headH < bottom) {
      prims.push(...titleRow(w, y, headH, str(p, "title", "Messages"), ["pencil-simple", "funnel"]))
      y += headH
    }

    if (bool(p, "search")) {
      const sh = clamp(h * 0.05, 28, 42)
      if (y + sh < bottom - 40) {
        prims.push(...sub(searchInputDef, { placeholder: "Search people", shape: "pill", kbd: false, clear: false }, pad, y, cw, sh))
        y += sh + clamp(h * 0.018, 8, 14)
      }
    }

    const tabs = listOr(p, "tabs", LIST_TABS)
    const tabH = clamp(h * 0.05, 26, 38)
    if (y + tabH < bottom - 40) {
      prims.push(...sub(navTabsPillDef, { labels: tabs.join(", "), active: 1, container: true }, pad, y, cw, tabH))
      y += tabH + clamp(h * 0.016, 6, 12)
    }

    // rows run edge to edge, the way a phone list does
    const names = listOr(p, "names", LIST_NAMES)
    const avail = bottom - y
    const rowH = clamp(h * 0.09, 48, 76)
    const n = clamp(Math.min(names.length, Math.floor(avail / rowH)), 0, 10)
    for (let i = 0; i < n; i++) {
      const ry = y + i * rowH
      prims.push(
        ...sub(
          listItemDef,
          {
            title: pick(names, i),
            subtitle: pick(LIST_PREVIEWS, i),
            showSubtitle: true,
            leading: "avatar",
            trailing: "meta",
            trailingText: pick(LIST_TIMES, i),
            divider: i < n - 1,
          },
          0,
          ry,
          w,
          rowH
        )
      )
    }
    return prims
  },
}

// ===========================================================================
// Detail
// ===========================================================================

const DETAIL_OPTIONS = ["A6", "A5", "A4"]

export const mobileDetailDef: ComponentDef = {
  kind: "mobile-detail",
  name: "Mobile detail",
  category: "blocks",
  group: "Screens",
  keywords: ["mobile", "phone", "ios", "android", "app", "product", "item", "pdp", "buy"],
  size: { w: PHONE_W, h: PHONE_H },
  defaults: {
    title: "The Doodle Pad",
    price: "$24.00",
    options: DETAIL_OPTIONS.join(", "),
    cta: "Take my money",
    image: true,
    rating: true,
    status: true,
  },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "price", label: "Price", type: "text" },
    { key: "options", label: "Options (comma-sep)", type: "text" },
    { key: "cta", label: "Button", type: "text" },
    { key: "image", label: "Hero image", type: "toggle", quick: true },
    { key: "rating", label: "Rating", type: "toggle", quick: true },
    { key: "status", label: "Clock", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    // no tab bar here — a detail view ends in the thing you came to press
    const { prims, top } = chrome(p, w, h, 1, false)
    const pad = padOf(w)
    const cw = w - pad * 2
    let y = top

    // back bar
    const tbH = clamp(h * 0.055, 32, 50)
    const isz = clamp(tbH * 0.42, 14, 20)
    prims.push(...icon("caret-left", pad + isz / 2, y + tbH / 2, isz, { stroke: "muted" }))
    prims.push(...icon("dots-three", w - pad - isz / 2, y + tbH / 2, isz, { stroke: "muted" }))
    y += tbH

    // the action bar is pinned; everything above it fights for what's left
    const barH = clamp(h * 0.1, 52, 84)
    const by = h - barH

    if (bool(p, "image")) {
      const imgH = clamp(h * 0.3, 70, Math.max(70, by - y - 150))
      prims.push(rect(0, y, w, imgH, { fill: "shade", fillColor: "faint" }))
      prims.push(...icon("image", w / 2, y + imgH / 2, clamp(imgH * 0.26, 20, 56), { stroke: "faint" }))
      // the little dots that say there are four more photos
      const dy = y + imgH - clamp(imgH * 0.09, 10, 18)
      for (let i = 0; i < 4; i++) {
        const dx = w / 2 - 21 + i * 14
        prims.push(ellipse(dx, dy - 3, 6, 6, i === 0 ? { fill: "solid", fillColor: "ink" } : { stroke: "muted" }))
      }
      y += imgH
    }
    y += clamp(h * 0.026, 10, 22)

    const ts = clamp(w * 0.062, 15, 24)
    for (const l of wrap(str(p, "title", "The Doodle Pad"), ts, cw, 2)) {
      if (y + ts > by - 30) break
      prims.push(text(pad, y + ts, l, ts, { bold: true }))
      y += ts + 7
    }

    if (bool(p, "rating") && y + 20 < by - 30) {
      const ssz = clamp(w * 0.032, 10, 13)
      for (let i = 0; i < 5; i++) {
        prims.push(...icon("star", pad + ssz / 2 + i * (ssz + 3), y + 8, ssz, { stroke: "muted" }))
      }
      prims.push(text(pad + 5 * (ssz + 3) + 8, y + 12, "128 opinions", clamp(ssz * 0.85, 9, 11), { color: "muted" }))
      y += 24
    }

    const price = str(p, "price", "$24.00")
    const ps = clamp(w * 0.058, 15, 22)
    if (y + ps < by - 20) {
      const shown = truncate(price, ps, cw * 0.6)
      prims.push(text(pad, y + ps, shown, ps, { bold: true }))
      const ox = pad + textWidth(shown, ps) + 16
      if (ox + 50 < w - pad) {
        prims.push(text(ox, y + ps, "$32.00", ps * 0.62, { color: "muted" }))
        prims.push(line(ox - 2, y + ps - ps * 0.2, ox + textWidth("$32.00", ps * 0.62) + 2, y + ps - ps * 0.2, { stroke: "muted", strokeWidth: 1.2 }))
      }
      y += ps + 16
    }

    // body copy stays squiggles — a wireframe shouldn't pretend to have final copy
    const opts = listOr(p, "options", DETAIL_OPTIONS)
    const optH = 32
    const optRoom = 22 + optH + 14
    // the copy breathes into a taller screen rather than leaving all the slack
    // in one lump above the size picker
    const lineGap = clamp((by - y - optRoom - 10) / 8, 17, 26)
    const lines = clamp(Math.floor((by - y - optRoom - 10) / lineGap), 0, 7)
    if (lines > 0) {
      prims.push(...loremLines(pad, y + 6, cw, lines, lineGap))
      y += 6 + lines * lineGap
    }

    // the options sit just above the bar rather than tight under the copy, so a
    // tall screen breaks into description / choose-one instead of one long drift
    if (y + optRoom < by) {
      let oy = Math.max(y, by - optRoom - 14)
      prims.push(text(pad, oy + 12, "Size", 11, { color: "muted", bold: true }))
      oy += 22
      const ow = clamp(cw * 0.17, 40, 62)
      opts.forEach((o, i) => {
        const ox = pad + i * (ow + 10)
        if (ox + ow > w - pad) return
        prims.push(pill(ox, oy, ow, optH, i === 1 ? { fill: "shade", fillColor: "ink" } : { stroke: "muted" }))
        prims.push(text(ox + ow / 2, mid(oy, optH, 13), truncate(o, 13, ow - 10), 13, { align: "center" }))
      })
    }

    // the bar you came here to press
    prims.push(hair(0, by, w))
    const bh = clamp(barH * 0.58, 34, 48)
    const bty = by + (barH - bh) / 2
    const sq = bh
    const hasHeart = cw > 190
    const btnW = cw - (hasHeart ? sq + 12 : 0)
    prims.push(...sub(buttonDef, { label: str(p, "cta", "Take my money"), variant: "filled" }, pad, bty, Math.max(60, btnW), bh))
    if (hasHeart) {
      prims.push(rect(w - pad - sq, bty, sq, bh, { r: 6 }))
      prims.push(...icon("heart", w - pad - sq / 2, bty + bh / 2, clamp(bh * 0.42, 13, 18), { stroke: "muted" }))
    }
    return prims
  },
}

// ===========================================================================
// Settings
// ===========================================================================

const SETTINGS_GROUPS = ["Account", "Notifications", "About"]
const SETTINGS_ROWS = ["Edit profile", "Password", "Push", "Weekly digest", "Language", "Version"]
const SETTINGS_GLYPHS = ["user", "lock", "bell", "envelope", "globe", "info"]
// chevron for a row that opens something, switch for a row that just flips,
// meta for a row that's only telling you a number
const SETTINGS_KINDS = ["chevron", "chevron", "switch", "switch", "chevron", "meta"]
const SETTINGS_META = ["", "", "", "", "English", "1.0.4"]

export const mobileSettingsDef: ComponentDef = {
  kind: "mobile-settings",
  name: "Mobile settings",
  category: "blocks",
  group: "Screens",
  keywords: ["mobile", "phone", "ios", "android", "app", "settings", "preferences", "account", "toggles"],
  size: { w: PHONE_W, h: PHONE_H },
  defaults: {
    title: "Settings",
    name: "Pablo Scribbles",
    groups: SETTINGS_GROUPS.join(", "),
    rows: SETTINGS_ROWS.join(", "),
    navLabels: NAV_LABELS.join(", "),
    profile: true,
    signout: true,
    nav: true,
    status: true,
  },
  controls: [
    { key: "title", label: "Title", type: "text" },
    { key: "name", label: "Your name", type: "text" },
    { key: "groups", label: "Sections (comma-sep)", type: "text" },
    { key: "rows", label: "Rows (comma-sep)", type: "text" },
    { key: "navLabels", label: "Tab bar (comma-sep)", type: "text" },
    { key: "profile", label: "Profile card", type: "toggle", quick: true },
    { key: "signout", label: "Sign out", type: "toggle", quick: true },
    { key: "nav", label: "Tab bar", type: "toggle", quick: true },
    { key: "status", label: "Clock", type: "toggle" },
  ],
  render(p, w, h) {
    const { prims, top, bottom } = chrome(p, w, h, 5)
    const pad = padOf(w)
    const cw = w - pad * 2
    let y = top

    const headH = clamp(h * 0.072, 38, 58)
    if (y + headH < bottom) {
      prims.push(...titleRow(w, y, headH, str(p, "title", "Settings"), ["magnifying-glass"]))
      y += headH
    }

    // sign out is pinned to the floor of the content band
    const outH = clamp(h * 0.05, 30, 42)
    const floor = bool(p, "signout") ? bottom - outH - clamp(h * 0.02, 8, 18) : bottom

    if (bool(p, "profile")) {
      const ph = clamp(h * 0.095, 52, 80)
      if (y + ph < floor) {
        prims.push(rect(pad, y, cw, ph, { r: 6 }))
        prims.push(
          ...sub(
            listItemDef,
            {
              title: str(p, "name", "Pablo Scribbles"),
              subtitle: "Free plan, obviously",
              showSubtitle: true,
              leading: "avatar",
              trailing: "chevron",
              divider: false,
            },
            pad,
            y,
            cw,
            ph
          )
        )
        y += ph + clamp(h * 0.022, 10, 18)
      }
    }

    const groups = listOr(p, "groups", SETTINGS_GROUPS)
    const rows = listOr(p, "rows", SETTINGS_ROWS)
    const perGroup = Math.max(1, Math.ceil(rows.length / Math.max(1, groups.length)))
    const rowH = clamp(h * 0.068, 40, 58)
    const capH = clamp(h * 0.032, 20, 30)

    for (let i = 0; i < rows.length; i++) {
      const g = Math.floor(i / perGroup)
      if (i % perGroup === 0) {
        if (y + capH + rowH > floor) break
        prims.push(text(pad, mid(y, capH, 11), pick(groups, g).toUpperCase(), 11, { color: "muted", bold: true }))
        y += capH
      }
      if (y + rowH > floor) break
      const last = (i + 1) % perGroup === 0 || i === rows.length - 1
      prims.push(
        ...sub(
          listItemDef,
          {
            title: pick(rows, i),
            showSubtitle: false,
            leading: "icon",
            icon: pick(SETTINGS_GLYPHS, i),
            trailing: pick(SETTINGS_KINDS, i),
            trailingText: pick(SETTINGS_META, i),
            divider: !last,
          },
          0,
          y,
          w,
          rowH
        )
      )
      y += rowH
      if (last) y += clamp(h * 0.018, 8, 16)
    }

    if (bool(p, "signout")) {
      const oy = bottom - outH - clamp(h * 0.02, 8, 18) / 2
      prims.push(...sub(buttonDef, { label: "Sign out", variant: "outline", size: "sm" }, pad, oy, cw, outH))
    }
    return prims
  },
}

// ===========================================================================
// Onboarding
// ===========================================================================

export const mobileOnboardingDef: ComponentDef = {
  kind: "mobile-onboarding",
  name: "Mobile onboarding",
  category: "blocks",
  group: "Screens",
  keywords: ["mobile", "phone", "ios", "android", "app", "onboarding", "welcome", "intro", "walkthrough", "steps"],
  size: { w: PHONE_W, h: PHONE_H },
  defaults: {
    title: "Draw it badly first",
    subtitle: "Rough boxes now, real decisions later.",
    cta: "Next",
    skip: "Skip",
    steps: 3,
    active: 2,
    status: true,
  },
  controls: [
    { key: "title", label: "Headline", type: "text" },
    { key: "subtitle", label: "Sub-copy", type: "text" },
    { key: "cta", label: "Button", type: "text" },
    { key: "skip", label: "Skip link", type: "text" },
    { key: "steps", label: "Steps", type: "number", min: 2, max: 5, quick: true },
    { key: "active", label: "This step", type: "number", min: 1, max: 5, quick: true },
    { key: "status", label: "Clock", type: "toggle", quick: true },
  ],
  render(p, w, h) {
    const { prims, top } = chrome(p, w, h, 1, false)
    const pad = padOf(w)
    const cw = w - pad * 2
    let y = top

    const skip = str(p, "skip", "Skip").trim()
    const tbH = clamp(h * 0.05, 28, 44)
    if (skip) {
      prims.push(text(w - pad, mid(y, tbH, 13), truncate(skip, 13, cw * 0.4), 13, { align: "right", color: "muted" }))
    }
    y += tbH

    // the button and the dots are pinned to the floor; the picture and the copy
    // ride in the middle of what's left, so neither crowds the dots
    const bh = clamp(h * 0.058, 34, 48)
    const by = h - bh - clamp(h * 0.045, 16, 34)
    const dotsY = by - clamp(h * 0.038, 18, 32)

    const ts = clamp(w * 0.07, 16, 28)
    const ss = clamp(w * 0.04, 11, 15)
    const titleLines = wrap(str(p, "title", "Draw it badly first"), ts, cw, 2)
    const subLines = wrap(str(p, "subtitle", ""), ss, cw * 0.92, 2)
    const copyH = titleLines.length * (ts + 8) + (subLines.length ? 10 + subLines.length * (ss + 7) : 0)

    const zoneTop = y
    const zoneH = Math.max(0, dotsY - 24 - zoneTop)
    const artGap = clamp(h * 0.05, 18, 40)
    const artH = clamp(zoneH - copyH - artGap, 0, h * 0.42)
    const stackH = (artH > 40 ? artH + artGap : 0) + copyH
    y = zoneTop + Math.max(0, (zoneH - stackH) / 2)

    if (artH > 40) {
      const aw = Math.min(cw, artH * 1.05)
      prims.push(rect(w / 2 - aw / 2, y, aw, artH, { fill: "shade", fillColor: "faint", r: 14 }))
      prims.push(...icon("pencil-simple", w / 2, y + artH / 2, clamp(Math.min(aw, artH) * 0.3, 24, 80), { stroke: "muted" }))
      y += artH + artGap
    }

    for (const l of titleLines) {
      prims.push(text(w / 2, y + ts, l, ts, { align: "center", bold: true }))
      y += ts + 8
    }
    if (subLines.length) {
      y += 10
      for (const l of subLines) {
        prims.push(text(w / 2, y + ss, l, ss, { align: "center", color: "muted" }))
        y += ss + 7
      }
    }

    // dots
    const steps = clamp(Math.round(num(p, "steps", 3)), 2, 5)
    const active = clamp(Math.round(num(p, "active", 2)), 1, steps) - 1
    const dd = 8
    const dgap = 10
    const runW = steps * dd + (steps - 1) * dgap + (dd * 1.4)
    let dx = w / 2 - runW / 2
    for (let i = 0; i < steps; i++) {
      if (i === active) {
        prims.push(pill(dx, dotsY - dd / 2, dd * 2.4, dd, { fill: "shade", fillColor: "ink" }))
        dx += dd * 2.4 + dgap
      } else {
        prims.push(ellipse(dx, dotsY - dd / 2, dd, dd, { stroke: "muted" }))
        dx += dd + dgap
      }
    }

    prims.push(...sub(buttonDef, { label: str(p, "cta", "Next"), variant: "filled", icon: "right", glyph: "arrow-right" }, pad, by, cw, bh))
    return prims
  },
}

// ===========================================================================

export const MOBILE_DEFS: ComponentDef[] = [
  mobileFeedDef,
  mobileListDef,
  mobileDetailDef,
  mobileSettingsDef,
  mobileOnboardingDef,
]
