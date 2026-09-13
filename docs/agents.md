# Driving squig as an agent

squig is a wireframing tool: an infinite canvas of UI components that render as
a hand-drawn sketch. A document is a flat map of nodes saved as
[`.squig.json`](format.md), and everything below writes exactly that same file.

There are three doors. Use the first one that fits.

1. **The file door.** You have a shell and you want a `.squig.json` on disk
   that a person can open. This is almost always the one.
2. **The browser door.** The app is already open and you are driving the canvas
   somebody is looking at.
3. **The library door.** You are writing TypeScript in this repo.

---

## 1. The file door

### The CLI

```bash
pnpm squig <command> [...]
```

Negative numbers need the equals form, because node's argument parser cannot
tell `-40` from a flag: `--x=-40`, not `--x -40`.

| command | what it does |
|---|---|
| `components [query]` | the library, one line each: kind, name, group, default size |
| `describe <kind>` | that component's default size, default props and legal prop values |
| `new <file>` | a blank document |
| `ls <file>` | what is on the sheet, bottom to top |
| `add <file> <kind>` | place a component |
| `text <file> "<words>"` | place a text layer |
| `shape <file> rect\|ellipse` | place a rectangle or an ellipse |
| `arrow <file>` | connect two nodes, or two points |
| `set <file> <id>` | change one node |
| `rm\|group\|front\|back <file> <id...>` | remove, group, reorder |
| `render <file>` | the drawing as SVG |
| `validate <file>` | does squig still read this file |

```bash
pnpm squig components card                 # kinds matching "card"
pnpm squig describe button                 # every prop a button takes
pnpm squig new signin.squig.json --name "sign in"
pnpm squig ls signin.squig.json
pnpm squig add signin.squig.json card --x 0 --y 0 --id card1
pnpm squig add signin.squig.json button --x 40 --y 200 --props '{"label":"Sign in"}' --id go
pnpm squig text signin.squig.json "the happy path" --x 40 --y 160 --size 20 --bold --id note
pnpm squig shape signin.squig.json rect --x=-24 --y=-24 --w 320 --h 300 --fill light --dashed
pnpm squig arrow signin.squig.json --from note --to go --style elbow
pnpm squig set signin.squig.json go --patch '{"w":180}'
pnpm squig rm signin.squig.json note
pnpm squig group signin.squig.json card1 go
pnpm squig front signin.squig.json go       # or back
pnpm squig render signin.squig.json --out signin.svg
pnpm squig validate signin.squig.json
```

Every mutating command prints the ids it touched. Anything you got wrong prints
one sentence on stderr and exits 1.

### The hosted MCP

A canvas can also live on squig.sh instead of on your disk, and then a person
watches it fill in while you draw. squig.sh serves an MCP over Streamable HTTP
at `https://squig.sh/mcp`, where every tool is prefixed `squig_`; an agent
without an MCP client runs the same commands over plain HTTP at
`POST /api/v1/tools/{name}`.

Setup is one paste. In the editor, **Connect agent** then **Copy for your
agent** hands over the canvas link, a key scoped to that canvas, and both
addresses. The client configs are at
[squig.sh/docs/mcp](https://squig.sh/docs/mcp), the machine-readable schema at
[/openapi.json](https://squig.sh/openapi.json), and the whole workflow at
[/llms-full.txt](https://squig.sh/llms-full.txt). Running your own needs a
Postgres `DATABASE_URL`; [agent-architecture.md](agent-architecture.md) has
the shape of it.

---

## 2. The browser door

With the app open, `window.squig` edits the canvas somebody is watching. Every
call is synchronous, throws on bad input with a sentence worth reading, lands
in the undo stack (`⌘Z` takes it back) and autosaves.

```js
squig.version                      // the bridge's version
squig.doc()                        // the whole document as a value
squig.serialize()                  // it as .squig.json text
squig.load(json)                   // replace the canvas with a document
squig.add(nodes)                   // nodes built by hand, in one undo step
squig.addComponent(kind, { x, y, w, h, props })
squig.addText("the happy path", { x, y, fontSize, w, align, bold, ink })
squig.addShape("rect", { x, y, w, h, fill, dashed })
squig.addArrow({ from, to, head, lineStyle })
squig.update(id, patch)
squig.remove(ids)
squig.group(ids)                   // the new group id, or null
squig.toFront(ids)                 // z-order: later is on top
squig.toBack(ids)
squig.select(ids)
squig.selection()                  // the ids currently selected
squig.zoomToFit()
squig.zoomTo(ids)
squig.bounds()                     // the world box the drawing covers
squig.components(query)            // the same index as `pnpm squig components`
squig.describe(kind)
squig.svg(ids)                     // markup for those nodes, or the whole sheet
```

```js
squig.addComponent("card", { x: 0, y: 0 })
squig.addText("empty state", { x: 0, y: -40, bold: true })
squig.zoomToFit()
```

---

## 3. The library door

From node or a test inside this repo, [`lib/doc.ts`](../lib/doc.ts) is the
whole API the other two doors are built on. It is pure: every function returns
a new document and leaves its input alone.

```ts
import { addNodes, componentNode, emptyDoc, nodesOf, serializeDoc, textNode } from "@/lib/doc"
import { renderSvg } from "@/lib/sketch/svg"

let doc = emptyDoc("pricing")
doc = addNodes(doc, [componentNode("pricing", { x: 0, y: 0 }), textNode("three tiers", { x: 0, y: -40 })])
writeFileSync("pricing.squig.json", serializeDoc(doc))
console.log(renderSvg(nodesOf(doc), doc.look))
```

Run it the way this repo runs any TypeScript from node:

```bash
node --experimental-strip-types --import ./scripts/register-loader.mjs yourfile.ts
```

---

## How to draw well

The loop: **list, describe, place, render, look, adjust.** List the library
(`pnpm squig components`, `squig_catalog`, `squig.components()`) before you
invent a component that already exists, describe the one you picked before
you guess at a prop name, then place things at their default sizes, render the
SVG, and actually read it before you say you are done. A wireframe you have not
looked at is a guess.

**Place at default sizes.** Every component ships the size it was drawn for.
Set `w` and `h` when the layout genuinely needs it, not as a reflex.

**Keep an 8px rhythm.** Positions and gaps in multiples of 8, and 16 to 24px of
air inside a container before its contents start. Things that line up read as
deliberate even in a sketch.

**Real words where a person reads them.** Button labels, nav items, headings,
empty states: write the actual copy. It is where half the design decisions
hide. For body copy nobody is meant to read, drop a `paragraph` or another
placeholder-line component rather than writing sentences to fill the space.

**Stay monochrome and low fidelity.** One ink on paper. No colour, no shadows,
no pixel-precision. The napkin look is the point: nothing looks decided, so the
feedback is about the idea.

**Variations go side by side.** Three takes on one screen belong on one sheet,
spaced apart with a text label over each saying what it is, not in three files.
Comparing is the whole reason to draw three.

**Group what belongs together.** A card and its contents, a nav and its items.
Then a person can move the idea instead of eleven rectangles.

**Lock the background.** If you draw a big rectangle behind everything, give it
`"locked": true` so nobody grabs it by accident when they start editing.

### Tidy up and exact spacing

Use `squig_edit_document` (MCP) or `POST /api/v1/tools/edit_document`
(REST) with the normal document ID and expected revision, and these operations:

```json
[
  { "op": "tidy", "ids": ["a", "b", "c"], "gap": 16 },
  { "op": "spacing", "ids": ["a", "b", "c"], "axis": "x", "gap": 24 },
  { "op": "spacing", "ids": ["a", "b", "c"], "axis": "x", "gap": 24, "order": ["c", "a", "b"] }
]
```

Tidy infers rows from vertical overlap, aligns row tops, and uses a uniform gap.
Omit `gap` to use the median nonnegative existing gap (16 px when none exists).
Spacing measures visual bounds, supports unequal sizes, and anchors the leading
edge. `axis` is `x` or `y`; `gap` must be finite and nonnegative. Spatial `order`
must contain every selected ID exactly once. It changes positions, not layer
stacking. Locked nodes must be unlocked first. These commands need at least two
nodes and are atomic, revision checked edits. The generated `/openapi.json`
includes these operation schemas.

In the browser, use `window.squig.tidy(ids, gap?)` and
`window.squig.spacing(ids, { axis, gap, order? })`. Each call is one undo step.

On the canvas, select two or more objects and choose **Tidy up** from the
selection’s bottom-right grid button, inspector, or context menu. Hover a uniform
gap to reveal its pink handle; dragging changes matching gaps on the same axis.
The live label shows pixels. Arrow keys adjust a focused gap by 1 px, or 10 with
Shift. Enter exact horizontal or vertical gaps in the inspector, including when
existing gaps differ. Drag a centre ring to reorder within its row or column.
Click rings to mark items, then drag **Resize width** or **Resize height** to
resize the marked items while retaining the gaps. Escape cancels a drag;
undo restores the whole gesture. Spacing is geometry, not a persistent layout
constraint: ordinary move/resize controls still work freely.

For marked resizing through MCP or REST, use
`{ "op": "spacing_resize", "ids": ["a", "b", "c"], "marked": ["b"], "axis": "x", "delta": 20 }`.
`marked` must be a subset of `ids`; `axis` chooses width (`x`) or height (`y`).
The browser equivalent is `window.squig.resizeSpaced(ids, marked, axis, delta)`.
Focused rings reorder with arrow keys; focused resize controls change sizes by
1 px with arrow keys, or 10 px with Shift.
