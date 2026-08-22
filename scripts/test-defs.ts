// ---------------------------------------------------------------------------
// Render smoke test for the component library. Every def gets drawn at three
// sizes — the one it ships with, and the two ends of a plausible resize — and
// the prims that come back are inspected for the failures a wireframe tool
// can't survive: a throw, an empty component, a NaN in a coordinate, or a
// layout that spills outside the box the user dragged.
//
//   node --experimental-strip-types --import ./scripts/register-loader.mjs \
//        scripts/test-defs.ts
//
// It also reads the control metadata, which is where the inspector gets its
// fields from: a control with no default, or a select whose default isn't one
// of its options, shows up as a blank or wrong-looking field in the panel.
// ---------------------------------------------------------------------------

import { ALL_DEFS, type ComponentDef } from "../lib/library/registry.ts"
import type { Prim } from "../lib/sketch/kit.ts"
import { resolveIconName } from "../lib/sketch/icons.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

// -- reading a prim ---------------------------------------------------------

/**
 * Every number a prim carries that has to be a real number, labelled so a
 * failure names the field. Strings (path data, label text) are skipped, and so
 * are the style opts, which are checked separately.
 */
function coords(p: Prim): [string, number][] {
  const out: [string, number][] = []
  const add = (...entries: [string, number | undefined][]) => {
    for (const [k, v] of entries) if (v !== undefined) out.push([k, v])
  }
  switch (p.t) {
    case "rect":
      add(["x", p.x], ["y", p.y], ["w", p.w], ["h", p.h], ["r", p.r])
      break
    case "ellipse":
      add(["x", p.x], ["y", p.y], ["w", p.w], ["h", p.h])
      break
    case "line":
      add(["x1", p.x1], ["y1", p.y1], ["x2", p.x2], ["y2", p.y2])
      break
    case "curve":
      add(["x1", p.x1], ["y1", p.y1], ["cx", p.cx], ["cy", p.cy], ["x2", p.x2], ["y2", p.y2])
      break
    case "poly":
      p.pts.forEach(([x, y], i) => add([`pts[${i}].x`, x], [`pts[${i}].y`, y]))
      break
    case "text":
      add(["x", p.x], ["y", p.y], ["size", p.size], ["maxW", p.maxW])
      break
    case "path":
      add(["x", p.x], ["y", p.y], ["size", p.size], ["vb", p.vb])
      break
  }
  if ("o" in p && p.o) {
    add(["o.strokeWidth", p.o.strokeWidth], ["o.roughness", p.o.roughness], ["o.r", p.o.r])
  }
  return out
}

/**
 * The box a prim occupies. Text is the exception: its width depends on font
 * metrics we don't have here, so only the anchor is measured — enough to catch
 * a label positioned off the component, not enough to catch one that runs long.
 */
function span(p: Prim): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (p.t) {
    case "rect":
    case "ellipse":
      return { minX: p.x, minY: p.y, maxX: p.x + p.w, maxY: p.y + p.h }
    case "line":
      return {
        minX: Math.min(p.x1, p.x2),
        minY: Math.min(p.y1, p.y2),
        maxX: Math.max(p.x1, p.x2),
        maxY: Math.max(p.y1, p.y2),
      }
    case "curve":
      // The control-point box is a safe superset of a quadratic's bounds.
      return {
        minX: Math.min(p.x1, p.cx, p.x2),
        minY: Math.min(p.y1, p.cy, p.y2),
        maxX: Math.max(p.x1, p.cx, p.x2),
        maxY: Math.max(p.y1, p.cy, p.y2),
      }
    case "poly": {
      const xs = p.pts.map(([x]) => x)
      const ys = p.pts.map(([, y]) => y)
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    case "path":
      return { minX: p.x, minY: p.y, maxX: p.x + p.size, maxY: p.y + p.size }
    case "text":
      return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
  }
}

const where = (p: Prim) => JSON.stringify(p).slice(0, 120)

/**
 * How far outside its own box a component is allowed to draw. Strokes are
 * centred on the path, so a shape sitting flush on the edge legitimately hangs
 * half a stroke over it, and a couple of defs inset a ring by an eyelash more
 * than that. Anything past this is layout that doesn't fit, not ink bleed.
 */
const OVERHANG = 2

/**
 * Defs that draw outside the box on purpose. `frame` hangs its name above the
 * artboard the way Figma does — the label is about the frame, not in it.
 */
const DRAWS_OUTSIDE = new Set(["frame"])

// the sizes a def has to survive: its own, dragged in, dragged out
const SCALES = [1, 0.6, 1.5]
const sizeAt = (def: ComponentDef, s: number) => ({
  w: Math.round(def.size.w * s),
  h: Math.round(def.size.h * s),
  label: s === 1 ? "default" : `${Math.round(s * 100)}%`,
})

// -- rendering --------------------------------------------------------------

for (const def of ALL_DEFS) {
  const renders: { label: string; w: number; h: number; prims: Prim[] }[] = []

  let threw = ""
  for (const s of SCALES) {
    const { w, h, label } = sizeAt(def, s)
    try {
      renders.push({ label, w, h, prims: def.render({ ...def.defaults }, w, h) })
    } catch (e) {
      threw ||= `${label} (${w}×${h}): ${(e as Error).message}`
    }
  }
  check(`${def.kind} renders at every size`, !threw, threw)
  if (threw) continue

  const empty = renders.find((r) => !Array.isArray(r.prims) || r.prims.length === 0)
  check(`${def.kind} draws something at every size`, !empty, empty && `nothing at ${empty.label}`)

  // a NaN reaches rough.js as a broken path and takes the whole canvas with it
  let bad = ""
  for (const r of renders) {
    for (const p of r.prims) {
      for (const [field, v] of coords(p)) {
        if (!Number.isFinite(v)) bad ||= `${r.label}: ${field}=${v} in ${where(p)}`
      }
    }
  }
  check(`${def.kind} has no NaN coordinates`, !bad, bad)

  // a component that draws past its own box overlaps its neighbours on the
  // board and can't be laid out against anything
  let over = 0
  let worst = ""
  for (const r of DRAWS_OUTSIDE.has(def.kind) ? [] : renders) {
    for (const p of r.prims) {
      const b = span(p)
      const out = Math.max(-b.minX, -b.minY, b.maxX - r.w, b.maxY - r.h)
      if (out > over) {
        over = out
        worst = `${r.label} (${r.w}×${r.h}) by ${out.toFixed(1)}px: ${where(p)}`
      }
    }
  }
  check(`${def.kind} stays inside its box`, over <= OVERHANG, worst)
}

// -- controls ---------------------------------------------------------------

for (const def of ALL_DEFS) {
  // the inspector reads a field's current value out of defaults; a control
  // without one renders empty and writes undefined back into the node
  const orphans = def.controls.filter((c) => !(c.key in def.defaults)).map((c) => c.key)
  check(`${def.kind} defaults every control it declares`, orphans.length === 0, orphans.join(", "))

  // a select whose default isn't one of its options opens with nothing chosen
  const strays = def.controls
    .filter((c) => c.type === "select" && c.key in def.defaults)
    .filter((c) => !(c.options ?? []).includes(String(def.defaults[c.key])))
    .map((c) => `${c.key}=${JSON.stringify(def.defaults[c.key])} not in [${(c.options ?? []).join("|")}]`)
  check(`${def.kind} select defaults are one of their options`, strays.length === 0, strays.join("; "))

  // the floating row sits over the canvas, so it stays a handful of knobs —
  // past three it stops being a shortcut and starts being the panel again
  const quick = def.controls.filter((c) => c.quick && c.type !== "text")
  check(`${def.kind} keeps the quick row to three`, quick.length <= 3, quick.map((c) => c.key).join(", "))

  // and a text field can't live there: it needs room to type in
  const quickText = def.controls.filter((c) => c.quick && c.type === "text").map((c) => c.key)
  check(`${def.kind} keeps text out of the quick row`, quickText.length === 0, quickText.join(", "))

  // An icon-name select quietly limits the catalog to its authored handful.
  // Searchable icon properties all use the same full picker; selects remain
  // appropriate for modes such as "Icon side" or "Content: icon/initials".
  const limitedIcons = def.controls
    .filter((c) => c.type === "select" && /icon|glyph/i.test(c.label))
    .filter((c) => (c.options ?? []).some((o) => !!resolveIconName(o)))
    .map((c) => c.key)
  check(`${def.kind} has no curated icon-name selects`, limitedIcons.length === 0, limitedIcons.join(", "))

  const badIconDefaults = def.controls
    .filter((c) => c.type === "icon")
    .filter((c) => {
      const value = String(def.defaults[c.key] ?? "")
      return value !== "logo" && !(c.allowNone && value === "none") && !resolveIconName(value)
    })
    .map((c) => `${c.key}=${JSON.stringify(def.defaults[c.key])}`)
  check(`${def.kind} icon controls have drawable defaults`, badIconDefaults.length === 0, badIconDefaults.join(", "))

  const quickIcons = def.controls.filter((c) => c.type === "icon" && c.quick).map((c) => c.key)
  check(`${def.kind} keeps icon search in the inspector`, quickIcons.length === 0, quickIcons.join(", "))

  const orphanConditions = def.controls
    .filter((c) => c.visibleWhen && !(c.visibleWhen.key in def.defaults))
    .map((c) => `${c.key} → ${c.visibleWhen!.key}`)
  check(`${def.kind} conditions refer to real props`, orphanConditions.length === 0, orphanConditions.join(", "))

  const emptyConditions = def.controls
    .filter((c) => c.visibleWhen && Array.isArray(c.visibleWhen.equals) && c.visibleWhen.equals.length === 0)
    .map((c) => c.key)
  check(`${def.kind} conditions allow at least one value`, emptyConditions.length === 0, emptyConditions.join(", "))
}

// -- phone screens ----------------------------------------------------------
// The whole point of the `mobile-*` family is that a phone wireframe starts at
// phone width. One that drifts wider is back to being resized by hand before
// the first idea lands, and one that loses its text controls is back to labels
// nobody can rename.

/** A shade over the widest phone anyone wireframes, so a def can't quietly grow into a tablet. */
const PHONE_MAX_W = 430

const phones = ALL_DEFS.filter((d) => d.kind.startsWith("mobile-"))
check("there are phone screens at all", phones.length > 0)
for (const def of phones) {
  check(`${def.kind} drops at phone width`, def.size.w <= PHONE_MAX_W, `${def.size.w}px wide`)
  const texts = def.controls.filter((c) => c.type === "text").map((c) => c.key)
  check(`${def.kind} has words you can change`, texts.length > 0, "no text control")
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} def checks passed across ${ALL_DEFS.length} components`)
