// ---------------------------------------------------------------------------
// The cheat sheet is data, so the guard is a reading of the data: every row
// prints something on both platforms, every group has rows, no group says the
// same thing twice, and the gestures the sheet claims still exist in the
// canvas that has to honour them.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-shortcuts.ts
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { SHORTCUT_GROUPS, kbd } from "../lib/shortcuts.ts"
import { DEFAULT_BIG_NUDGE, MAX_BIG_NUDGE, normalizeBigNudge } from "../lib/nudge.ts"

let passed = 0
const failures: string[] = []
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

/** kbd() asks navigator which machine it's on, so the test answers for it. */
const asPlatform = (ua: string) =>
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: ua }, configurable: true })
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

// the parts kbd() knows how to print: modifiers, named keys, and the handful
// of pointer words. Anything else is a typo — "atl+drag" would render as the
// word "atl" rather than an option key, and nobody would notice in review.
const MODIFIERS = new Set(["mod", "alt", "shift", "ctrl", "far"])
const NAMED = new Set(["del", "enter", "esc", "plus"])
const WORDS = new Set(["drag", "click", "double-click", "right-click", "scroll", "tab", "space drag", "←↑→↓"])

// -- shape of the list ------------------------------------------------------

check("the sheet has groups", SHORTCUT_GROUPS.length > 0)

const titles = SHORTCUT_GROUPS.map((g) => g.title)
check("group titles are unique", new Set(titles).size === titles.length, titles.join(", "))

for (const group of SHORTCUT_GROUPS) {
  check(`${group.title} has rows`, group.rows.length > 0)

  // the sheet keys its rows by label, so a repeat inside one group is both a
  // React collision and a reader wondering which of the two is the real one
  const labels = group.rows.map((r) => r.label)
  check(`${group.title} says each thing once`, new Set(labels).size === labels.length, labels.join(" / "))

  for (const row of group.rows) {
    check(`${group.title}: "${row.label}" has keys`, row.keys.length > 0)
    for (const spec of row.keys) {
      const parts = spec.split("+")
      const rest = parts.filter((p) => !MODIFIERS.has(p))
      check(
        `${group.title}: "${row.label}" spells "${spec}" in parts kbd() knows`,
        parts.every((p) => MODIFIERS.has(p) || NAMED.has(p) || p.length === 1 || WORDS.has(p)),
        spec
      )
      check(`${group.title}: "${row.label}" — "${spec}" names one key`, rest.length === 1, rest.join(","))
    }
  }
}

// -- both platforms print something -----------------------------------------

for (const [name, ua] of [["Mac", MAC], ["PC", PC]] as const) {
  asPlatform(ua)
  for (const group of SHORTCUT_GROUPS) {
    for (const row of group.rows) {
      for (const spec of row.keys) {
        const printed = kbd(spec)
        check(`${name}: "${spec}" prints`, printed.trim().length > 0, JSON.stringify(printed))
        check(`${name}: "${spec}" prints no holes`, !printed.includes("undefined"), printed)
      }
    }
  }
}

// -- the printing rules themselves ------------------------------------------

asPlatform(MAC)
check("a Mac packs symbols tight", kbd("mod+shift+g") === "⇧⌘G", kbd("mod+shift+g"))
check("a word gets air around it", kbd("alt+drag") === "⌥ drag", kbd("alt+drag"))
check("far is ⌥⌘ on a Mac", kbd("far+]") === "⌥⌘]", kbd("far+]"))
check("a lone word stands alone", kbd("double-click") === "double-click", kbd("double-click"))

asPlatform(PC)
check("a PC joins with pluses", kbd("mod+shift+g") === "Ctrl+Shift+G", kbd("mod+shift+g"))
check("a PC needs no extra air", kbd("alt+drag") === "Alt+drag", kbd("alt+drag"))
check("far is Ctrl+Shift on a PC", kbd("far+]") === "Ctrl+Shift+]", kbd("far+]"))

// -- the configurable large step --------------------------------------------

check("the big nudge defaults to ten pixels", DEFAULT_BIG_NUDGE === 10)
check("an absent big nudge falls back safely", normalizeBigNudge(undefined) === 10)
check("a custom big nudge is rounded to whole pixels", normalizeBigNudge(12.6) === 13)
check("the big nudge never drops below one pixel", normalizeBigNudge(-20) === 1)
check("a corrupt giant big nudge is bounded", normalizeBigNudge(Infinity) === 10 && normalizeBigNudge(99999) === MAX_BIG_NUDGE)

// -- the sheet isn't describing a canvas that stopped doing it ---------------

const here = dirname(fileURLToPath(import.meta.url))
const canvas = readFileSync(join(here, "../components/canvas/canvas.tsx"), "utf8")

// each claim, and the thing in the canvas that has to be there for it to hold
const CLAIMS: [string, string][] = [
  ["shift-drag 45-degree lock", "constrainMoveTo45"],
  ["shift-resize proportion lock", "aspect: lockAspect"],
  ["alt-resize from the middle", "fromCenter: mods.alt"],
  ["the modifier that skips snapping", "!mods.toggle"],
  ["Tab cycles the selection", "cycleSelection"],
  ["double-click a side handle to unfix a text width", "resetTextWidth"],
  ["double-click a corner handle to restore a picture", "restoreAspect"],
  ["shift-drag draws a square", 'mods.shift && g.what === "shape"'],
  ["the modifier wheel zooms", "e.ctrlKey || e.metaKey"],
  ["modifier arrows resize the selection", "resizeNodesBy"],
  ["Shift uses the custom big nudge", "s.bigNudge"],
]
for (const [claim, token] of CLAIMS) {
  check(`the canvas still does ${claim}`, canvas.includes(token), token)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} shortcut checks passed`)
