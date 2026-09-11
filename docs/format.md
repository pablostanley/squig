# The .squig.json format

A squig document is one JSON file. It is what the app autosaves, what `⇧⌘S`
exports, and what the CLI and the MCP server read and write. Nothing in it is
compressed, encoded or derived from anything else, so writing one by hand or by
script is a reasonable thing to do.

The types this describes live in [`lib/types.ts`](../lib/types.ts), and the
functions that build and check documents live in [`lib/doc.ts`](../lib/doc.ts).
When the two disagree, the code is right.

## The file

```json
{
  "app": "squig",
  "version": 1,
  "fileName": "sign in",
  "look": { "theme": "internet-blue", "paper": "subtle", "font": "hand", "grid": true },
  "nodes": { "<id>": { ... } },
  "order": ["<id>", "<id>"]
}
```

| field | what it is |
|---|---|
| `app`, `version` | stamped on write, ignored on read. `version` is 1. |
| `fileName` | the name the app shows. Missing means "imported scribbles". |
| `look` | how the whole sheet prints. Every field falls back if it is missing or no longer known. |
| `nodes` | every layer, keyed by id. The key is the name the rest of the file uses. |
| `order` | z-order, bottom to top. |

`look.theme` is one of `internet-blue`, `riso-red`, `terminal-green`, `plum`,
`marigold`, `graphite`. `look.paper` is `white`, `subtle` or `shaded`.
`look.font` is `hand`, `sans` or `serif`. `look.grid` is the canvas dot grid.

## Every node

```json
{ "id": "go", "type": "component", "x": 40, "y": 200, "w": 132, "h": 40, "seed": 171131289 }
```

| field | type | meaning |
|---|---|---|
| `id` | string | letters, digits, `-` and `_`, up to 64. Matches its key in `nodes`. |
| `type` | string | `component`, `shape`, `text`, `arrow`, `draw` or `image`. |
| `x`, `y` | number | top left in world pixels. y points down. Keep within ±1,000,000. |
| `w`, `h` | number | the box, in world pixels. |
| `seed` | number | the wobble's random seed. Same seed, same hand-drawn line, every render. |
| `groupIds` | string[]? | the groups this node is in, outermost first. |
| `flipX`, `flipY` | boolean? | mirrored along its own box. Layout flips; glyphs do not. |
| `rotation` | number? | counterclockwise degrees around the box center; absent means zero. Normalized to [-180, 180). Connectors store their orientation in their endpoints instead. |
| `locked` | boolean? | still prints, but the pointer walks past it. Never in a selection. |

Absent is the default for every optional field, and it is the only spelling of
that default: a left-aligned text layer carries no `align` at all, rather than
`"align": "left"`. Two spellings of one state is a bug waiting for a `===`.

### component

A library instance. `kind` is a registry slug and `props` are its variant
values, merged over the def's defaults on the way in.

```json
{ "type": "component", "kind": "button", "props": { "label": "Sign in", "variant": "filled" } }
```

`squig components` lists every kind; `squig describe <kind>` gives that one's
default size, default props, and the controls that say which values are legal.
A `kind` this build does not have is not a document squig can draw.

### shape

```json
{ "type": "shape", "shape": "rect", "fill": "light", "dashed": true }
```

| field | values |
|---|---|
| `shape` | `rect` or `ellipse`. |
| `fill` | `none`, `paper`, `light` or `strong`. Older files wrote `true`, read as `strong`. |
| `stroke` | `light`, `regular` (absent) or `heavy`. |
| `ink` | `ink` (absent), `muted` or `faint`. |
| `dashed` | boolean. |

`paper` is the opaque sheet colour, for a box that has to hide what it sits on.
`light` and `strong` are the two wash tones.

### text

`w` and `h` are the measured box, not a request. The builders and
`update_node` re-fit it; if you write one by hand, get it close and the app
will settle it on the next edit.

| field | values |
|---|---|
| `text` | the words. `\n` is a hard line break. |
| `fontSize` | number, 18 by default. |
| `fixedW` | boolean. Absent means the box hugs the words; set means `w` is the measure they wrap to. |
| `align` | `left` (absent), `center`, `right`. On an auto-sized layer this is which edge holds still. |
| `verticalAlign` | `top` (absent), `center`, `bottom`, for a box with room to spare. |
| `fixedH` | boolean. The height was chosen by hand and deleting words will not take it back. |
| `ink` | `ink` (absent), `muted`, `faint`. |
| `bold`, `italic`, `underline` | booleans. |
| `boxed` | give the words their own surface. Still one text node, never a rectangle plus a label. |
| `boxFill`, `boxBorder`, `boxStroke`, `boxInk`, `boxDashed` | that surface's settings, kept separate from `ink`, which colours the words. |
| `link` | where this text points. Wireframe metadata, drawn as an underline. |

### arrow

```json
{ "type": "arrow", "points": [[0, 0], [8.37, 5.47]], "head": true, "bind": ["note", "go"], "anchors": ["bottom", "top"] }
```

| field | values |
|---|---|
| `points` | `[start, end]`, relative to `x`/`y`, so they scale when the box is resized. |
| `head` | arrowhead at the end. |
| `bind` | `[startId, endId]`, either side `null` for a free end. Absent means both are free. |
| `anchors` | which side of each bound node the end sits on: `top`, `right`, `bottom`, `left`, `center`. |
| `snap` | `false` makes it a plain line that never grabs anything. Absent is the snapping default. |
| `lineStyle` | `straight` (absent), `elbow`, `curved`. |
| `elbowAxis`, `elbowOffset` | a reshaped elbow's first run axis and its offset from the automatic midpoint. |
| `curveBend` | a curve's draggable midpoint, as an offset from the midpoint of its ends. |

### draw

A freehand stroke. `points` are `[x, y]` pairs relative to the node origin,
spanning `0..w` and `0..h`. Same `stroke`, `ink` and `dashed` as a shape.

### image

A pasted picture, the one node that is not drawn by hand. `src` is a
`data:image/...` URL and nothing else, which is what keeps a document one
self-contained file. `naturalW`/`naturalH` are the pixels' own size, `name` is
the file it came from, and `crop` is `{x, y, w, h}` in 0..1 of the picture,
absent meaning all of it.

## Invariants

- **`order` is the whole z-order, bottom to top.** Every id in `nodes` should
  appear in it exactly once. Missing ids get appended on load; ids naming
  nothing are dropped.
- **Groups are stamps, not containers.** A group is a shared path in
  `groupIds`, outermost first, on each member. There is no group node, and no
  layout nesting anywhere in the format.
- **A bound arrow's geometry is a consequence.** If `bind` names nodes, the
  `points`, the box and the `anchors` are recomputed from where those nodes
  actually are, on load and after every edit. Aim it roughly and let the
  document settle it.
- **Broken nodes are dropped, not repaired.** A node that fails the check on
  load disappears, and an arrow bound to a node this file does not have lets
  go. A file that had nodes and lost all of them is refused outright rather
  than opened as a blank sheet.

## A whole document

Three nodes: a button, a text layer above it, and an arrow from the words to
the button.

```json
{
  "app": "squig",
  "version": 1,
  "fileName": "sign in",
  "look": { "theme": "internet-blue", "paper": "subtle", "font": "hand", "grid": true },
  "nodes": {
    "go": {
      "id": "go", "seed": 171131289, "type": "component", "kind": "button",
      "props": { "label": "Sign in", "variant": "filled", "size": "md", "icon": "none", "glyph": "plus" },
      "x": 40, "y": 200, "w": 132, "h": 40
    },
    "note": {
      "id": "note", "seed": 1194139115, "type": "text",
      "text": "the happy path", "fontSize": 18,
      "x": 40, "y": 160, "w": 117.92, "h": 23.4
    },
    "GxfTVMpw": {
      "id": "GxfTVMpw", "seed": 1048032199, "type": "arrow", "head": true,
      "x": 98.29, "y": 188.97, "w": 8.37, "h": 5.47,
      "points": [[0, 0], [8.37, 5.47]],
      "bind": ["note", "go"], "anchors": ["bottom", "top"]
    }
  },
  "order": ["go", "note", "GxfTVMpw"]
}
```

Save that as `anything.squig.json` and `squig validate anything.squig.json`
will tell you whether squig agrees.
