# squig

A wireframing tool for people who think by drawing.

Open Figma and you get sucked into high fidelity. Open tldraw and you're
hand-drawing every button from scratch. squig sits in between: an infinite
canvas where you drag in real UI components, but everything renders as a
hand-drawn sketch.

The sketchy look is the whole point. It signals "this is not decided yet," so
people give feedback on structure instead of arguing about corner radius.

## What's in it

**Infinite canvas.** Pan, zoom, multi-select, marquee, smart-guide snapping,
keyboard nudge, undo/redo. Everything you'd expect.

**A real component library.** The shadcn/ui vocabulary — buttons, inputs,
selects, switches, tables, dialogs, tabs, nav, sidebars — plus blocks (heroes,
pricing, FAQ, AI chat, checkout, kanban) and whole screen templates.

**Everything is a component with variants.** Drop a button, and the inspector
flips it: icon left, icon right, size, filled or outline. It stays a component
while you do that — you're switching variants, not editing shapes.

**Break apart when you need to.** If no variant covers what you want, break the
component and its pieces become editable primitives. One-way, on purpose.

**⌘K searches everything.** Tools, actions, and every component and block, in
one sheet. Enter drops it in the middle of your view.

## Keyboard

Figma's, so your hands already know it. `?` opens the full list in the app.

| | |
|---|---|
| `V` `R` `O` `P` `T` `L` `⇧L` | select, rectangle, ellipse, draw, text, line, arrow |
| `C` / `B` | components / blocks panel |
| `⌘K` / `⌘/` | search everything (`⌘K` over text links it instead) |
| `⌘Z` / `⇧⌘Z` | undo / redo |
| `⌘D`, `⌥`-drag | duplicate |
| `⌘C` `⌘X` `⌘V` / `⇧⌘V` | copy, cut, paste at cursor / paste in place |
| `⌘G` / `⇧⌘G` | group / ungroup — and ungroup detaches an instance |
| `⌥⌘B` | detach instance |
| `⌘`-click, double-click | reach inside a group |
| `⌘]` / `⌘[` | bring forward / send backward |
| `⌥⌘]` / `⌥⌘[` (or `]` / `[`) | bring to front / send to back |
| `⇧H` / `⇧V` | flip horizontal / vertical |
| `⌘B` `⌘I` `⌘U` | bold, italic, underline |
| arrows (`⇧` for 10px) | nudge |
| space-drag, middle-drag | pan |
| `⌘+` / `⌘-`, `⌘`-scroll | zoom the canvas, never the browser |
| `⇧0` `⇧1` `⇧2` | 100%, fit, selection |
| `⌘\` | hide the interface |

## Running it

```bash
pnpm install
pnpm dev
```

## How it's put together

Documents are a flat map of nodes on an infinite plane — no nesting, no flow
layout. A node is a component instance, a shape, a freehand stroke, text, or
an arrow.

Components never render to DOM. Each one is a `ComponentDef` whose `render()`
returns an array of drawing primitives (`rect`, `line`, `text`, `icon`, …),
which the canvas draws through [rough.js](https://roughjs.com) into SVG. That
one indirection buys a lot: previews in the panel, ⌘K thumbnails, and
break-apart all reuse the exact same primitives the canvas draws.

Icons are Phosphor paths, rendered crisp rather than roughened — at 14px the
wobble just reads as mush.

To add a component, write a `ComponentDef` and add it to an array. See
[`lib/library/AUTHORING.md`](lib/library/AUTHORING.md).

```
app/                     the single page
components/canvas/       canvas, interactions, rough.js renderer
components/chrome/       rail, panels, inspector, ⌘K, menus
lib/sketch/              drawing primitives + Phosphor icons
lib/library/             every component and block definition
lib/canvas/snap-engine   alignment/snapping math
lib/store.ts             zustand doc state + history
```

## Stack

Next.js, React, TypeScript, Tailwind, shadcn/ui for the tool's own chrome,
rough.js for the sketch rendering, Phosphor for icons.
