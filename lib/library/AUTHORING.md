# Authoring squig library items

Read this before writing any `ComponentDef`. Every library item — a button, a
pricing block, a whole dashboard — is one `ComponentDef`.

## The shape

```ts
import type { ComponentDef, Props } from "./registry"

export const thingDef: ComponentDef = {
  kind: "thing",                  // unique slug, kebab-case
  name: "Thing",                  // shown in the panel
  category: "components",         // "components" | "blocks"
  group: "Forms",                 // section header in the panel (see groups below)
  keywords: ["alias", "synonym"],  // lowercase, for search
  size: { w: 240, h: 80 },        // default drop size
  defaults: { label: "Hi", tone: "filled" },
  controls: [
    { key: "label", label: "Label", type: "text" },
    { key: "tone", label: "Tone", type: "select", options: ["filled", "outline"], quick: true },
    { key: "showIcon", label: "Icon", type: "toggle", quick: true },
    { key: "count", label: "Items", type: "number", min: 1, max: 8, quick: true },
  ],
  render(p, w, h) { /* return Prim[] */ },
}
```

`render` MUST be pure and MUST lay out against the passed `w`/`h`, not the
default size — items get resized on canvas. Clamp/guard so nothing draws
outside the box or overlaps when small. Never divide by an unclamped prop.

`quick: true` surfaces a control in the floating context row — mark the 2–3
that matter, never a `text` control.

## The drawing DSL — `@/lib/sketch/kit`

```ts
import { rect, pill, ellipse, line, poly, text, icon, place, loremLines, truncate, textWidth } from "@/lib/sketch/kit"

rect(x, y, w, h, opts?)                 // opts.r for corner radius
pill(x, y, w, h, opts?)                 // rect with fully rounded ends
ellipse(x, y, w, h, opts?)              // x,y = top-left of bounding box
line(x1, y1, x2, y2, opts?)
poly([[x,y], ...], close?, opts?)
text(x, y, "label", size, { align: "left"|"center"|"right", color, bold })
icon("user", cx, cy, size, opts?)       // returns Prim[] — SPREAD it
place(prims, dx, dy)                     // translate a batch
loremLines(x, y, w, count, gap?)         // squiggly placeholder text lines
truncate("long label", size, maxW)       // ellipsize to fit
textWidth("label", size)                 // measure before laying out
```

`text` y is the **baseline**, not the top. For vertically centered text in a
box of height `h`, use `y = h / 2 + size * 0.35`.

`icon` cx/cy is the **center**. Always spread: `prims.push(...icon(...))`.

### opts (`PrimOpts`)

```ts
{ stroke: "ink" | "muted" | "faint",     // pen PRESSURE, not colour — default "ink"
  strokeWidth: 1.25,
  fill: "none" | "shade" | "solid",
  fillColor: "ink" | "muted" | "faint" | "paper",
  dashed: true,
  roughness: 0.5 }                        // leave unset unless you mean it
```

`stroke` does not change the colour of anything. Every line in a squig prints
in the one ink; `stroke` picks how hard the pen presses — `"ink"` a full
stroke, `"muted"` an ordinary one, `"faint"` a hairline.

## Style rules

The look is **refined hand-drawn** — closer to FigJam/tldraw than to a napkin.

- Monochrome only. No color props, no color controls, ever.
- Area fills come from exactly three tones, and there is no fourth:
  `fill: "shade", fillColor: "faint"` is the light wash for inert areas (image
  placeholders, tracks, empty states, alternating rows);
  `fill: "shade", fillColor: "ink"` is one step darker, for the single thing on
  a surface that should come forward (primary button, selected chip, chart
  bars); `fill: "solid", fillColor: "paper"` is for anything that floats over
  other content (dialogs, menus, popovers) so it occludes properly — draw the
  paper-filled rect FIRST, then the outline, then contents.
- Reserve the darker shade for one emphasis area per item. If a second thing
  wants it, the layout is doing too little work.
- `fill: "solid"` at full ink strength is only for small opaque marks — a
  toggle knob, a status dot — where a tint would vanish at that size.
- Real text for real labels (buttons, nav, headings, table headers). Use
  `loremLines` / plain `line` for body copy and filler — a wireframe shouldn't
  pretend to have final copy.
- Comfortable padding: 12–20px inside containers, 8–14px between rows.
- Corner radius: `{ r: 6 }` on cards/panels/buttons.
- **Anything pill-shaped is `pill()`, never `ellipse()`** — chips, badges, tags,
  status pills, pill tabs, segment indicators. An ellipse bows the top and
  bottom edges inward, which squeezes the label and reads as a balloon. Keep
  `ellipse()` for things that are actually round: avatars, radio marks, status
  dots, chart points, icon bubbles.

## Composition

Import other defs and compose them — this is how blocks are built:

```ts
import { buttonDef, inputDef } from "./defs-basic"

function sub(def: ComponentDef, props: Props, x: number, y: number, w: number, h: number) {
  return place(def.render({ ...def.defaults, ...props }, w, h), x, y)
}

// inside render:
prims.push(...sub(buttonDef, { label: "Get started", variant: "filled" }, 24, y, 140, 40))
```

Existing defs you can compose with, and their prop keys:

- `defs-basic`: `buttonDef` (label, variant: filled|outline|ghost, size: sm|md|lg,
  icon: none|left|right), `inputDef` (label, showLabel, placeholder, icon),
  `textareaDef`, `selectDef` (label, showLabel, value), `checkboxDef`
  (label, checked), `radioDef`, `switchDef` (label, on, showLabel),
  `sliderDef` (value), `badgeDef` (label, variant), `avatarDef`
  (shape: circle|square, content: icon|initials, initials, status),
  `progressDef` (value)
- `defs-display`: `cardDef`, `imageDef`, `paragraphDef`, `dividerDef`,
  `tableDef` (cols, rows, header), `tabsDef` (labels, active), `dialogDef`,
  `dropdownDef`, `toastDef`, `alertDef`, `tooltipDef`, `breadcrumbDef`,
  `paginationDef`, `chartDef` (style: line|bars|pie, title)
- `defs-nav`: `navbarDef` (links, search, avatar, cta), `sidebarDef`
  (items, icons, active, user)

## Panel groups

`category: "components"` → group one of:
`Buttons`, `Forms`, `Selection`, `Display`, `Feedback`, `Navigation`, `Data`, `Media`

`category: "blocks"` → group one of:
`Marketing`, `Content`, `Commerce`, `App`, `AI`, `Screens`

`Screens` is for full-page templates; everything else is a block that slots
into a page.

## Icons

`icon(name, cx, cy, size, opts?, weight?)` — Phosphor-backed. Defs should stick
to the curated inline set (`ICON_NAMES` in `lib/sketch/icons.ts`), which is
bundled and renders synchronously; every other Phosphor name exists too but
rides a lazy chunk, so a def using one may render blank on first paint. The
`weight` param ("thin" | "light" | "regular" | "bold" | "fill") also pulls a
lazy chunk — defs should leave it at the default regular; it exists for the
user-facing Icon component. Curated names:

`user users user-circle image images magnifying-glass caret-down caret-right
caret-left caret-up check x plus minus list star heart arrow-right arrow-left
arrow-up arrow-down dots-three dots-three-vertical bell gear house envelope
lock trash upload-simple download-simple calendar-blank info warning play
squares-four file chart-line chart-bar shopping-cart credit-card
currency-dollar tag bookmark chat-circle chat-teardrop-dots paper-plane-tilt
sparkle robot lightning globe link share-network copy pencil-simple funnel
sliders-horizontal clock map-pin phone video-camera microphone paperclip
folder database code terminal browser device-mobile sign-out eye eye-slash
thumbs-up smiley question shield-check rocket-launch package truck gift
trophy medal fire moon sun palette note kanban graduation-cap buildings
briefcase wallet receipt bank arrows-clockwise magic-wand brain cpu plug
wrench bug git-branch cloud camera text-aa list-bullets table columns rows
sidebar-simple dots-six-vertical playlist quotes megaphone bell-ringing
hand-waving crown seal-check`

If you need a name that isn't listed, pick the nearest one that is. Do not
invent names — an unknown name renders nothing.

Any property whose value is an icon name must declare an `icon` control, not a
`select` with a curated handful. That gives standalone icons, buttons, list
items, cards, and blocks the same searchable catalog in the inspector:

```ts
defaults: { icon: "star" },
controls: [{ key: "icon", label: "Icon", type: "icon" }],
```

Use `allowNone: true` when the renderer treats `"none"` as a real absence. An
icon search is intentionally never `quick`: the floating context row cannot
hold its search field and grid. Mode controls such as `Icon side:
none|left|right` remain ordinary selects; their values are layout choices, not
icon names.

If another property decides whether the configurable icon is drawn, keep the
large picker out of the way until that mode is active:

```ts
{ key: "glyph", label: "Icon", type: "icon",
  visibleWhen: { key: "iconSide", equals: ["left", "right"] } }
```

Conditional controls only appear when every selected component currently
matches its condition, so a multi-selection never offers a property that is
latent on half the selection.

## Registration

Export a single array at the bottom of your file:

```ts
export const MY_DEFS: ComponentDef[] = [thingDef, otherDef]
```

Do NOT edit `registry.ts`, `kit.ts`, `icons.ts`, or another agent's defs file.
The array gets wired in separately.

## Checklist before you finish

- `pnpm exec tsc --noEmit` passes.
- Every def renders sensibly at its default size AND at ~60% and ~150% of it.
- No `any`. No unused imports. No color. No emoji.
- Labels are short, human, and a little funny where it fits — never corporate.
