# squig multi-select — UX spec

Target: a user coming from Figma / FigJam should never be surprised. Every
behaviour below is either a direct match to those tools or the obvious
adaptation for a tool that has no groups/frames.

Legend: **[new]** to build, **[has]** already works, **[fix]** exists but wrong.

---

## A. Marquee (rubber-band) selection

| # | Behaviour | Status |
|---|---|---|
| A1 | Drag on empty canvas with the select tool draws a marquee | [has] |
| A2 | Hit rule is **intersect** (touch), not contain — matches Figma/FigJam | [has] |
| A2b | Hit testing uses **real geometry**, not bounding boxes: an unfilled shape is grabbable by its outline and transparent in the middle, and arrows/scribbles are hit by distance to their line. Otherwise a big empty rectangle swallows every press inside it and there's nowhere left to start a marquee. The same predicate serves click, hover, right-click and marquee | [new] |
| A3 | Live selection updates during the drag | [has] |
| A4 | Marquee starting on empty canvas with no modifier clears the previous selection first | [has] |
| A5 | **Shift or Ctrl/Cmd + marquee = XOR** against the selection captured at gesture start: unselected things sweep in, already-selected things sweep out. One modifier, matching Figma. The base is frozen at gesture start; the *mode* is re-read every frame. | [new] |
| A6 | ~~Alt+marquee = subtract~~ — **dropped.** Figma has no such thing, and it would collide head-on with B10's Alt-drag-duplicate, where the only discriminator is whether the press landed on a node. XOR covers both intents. | — |
| A7 | Alt over empty canvas carries no marquee meaning of its own | [new] |
| A8 | The 3px threshold **latches** and is measured radially: once a gesture is a drag it stays one, even if it returns to the origin. A press that never crosses it is a click, and the deselect already happened on pointer-down | [new] |
| A9 | **Escape mid-marquee cancels** and restores the selection as it was at gesture start | [new] |
| A10 | **Edge auto-pan**, driven by a rAF loop off the last known pointer position (not by pointermove, which stops firing once the pointer parks at the edge). Active for marquee, move, resize and create | [new] |
| A11 | Marquee is anchored in **world space**, so auto-pan/zoom during the drag doesn't warp the box | [fix] |
| A12 | Marquee never starts from a click on chrome (rail, inspector, panels) | [has] |
| A13 | Right-drag does not marquee | [has] |

## B. Click selection & modifiers

| # | Behaviour | Status |
|---|---|---|
| B1 | Plain click on a node selects only it | [has] |
| B2 | **Shift+click** on an unselected node adds it | [has] |
| B3 | **Shift+click** on a selected node removes it | [has] |
| B4 | **Ctrl+click and Cmd+click behave as Shift+click** (toggle). squig has no nesting, so "deep select" is meaningless. | [new] |
| B5 | On macOS this deliberately diverges from Figma, where Ctrl+click is the OS right-click: it was asked for explicitly, and a two-finger tap or a real right-click still opens the context menu, so nothing is lost. Ctrl+click therefore suppresses the menu under the select tool. | [new] |
| B5b | **Shift+drag axis-locks a move** to whichever axis you committed to. Composes with B6 (a shift-click that adds, then drags, is locked) and with Alt (axis-locked duplicate) | [new] |
| B5c | **Cmd/Ctrl held during a move or resize bypasses snapping** — the escape hatch from a magnetised board | [new] |
| B6 | **Additive click can immediately drag.** After a shift/ctrl-click that *adds* a node, the pointer is already in a move gesture for the whole selection. A shift-click that *removes* does not drag. | [fix] |
| B7 | **Click on an already-multi-selected node does not collapse the selection on pointer-down** — it starts a drag of the whole selection. Only a pointer-*up* with no movement collapses to that single node. (Classic Figma/Sketch behaviour.) | [new] |
| B8 | Click on empty canvas clears the selection | [has] |
| B9 | Shift/Ctrl+click on empty canvas keeps the selection and starts an additive marquee | [new] |
| B10 | **Alt/Option+drag on a selection duplicates it** and drags the copies; the originals stay put. Works for multi-selection. One undo step. | [new] |
| B11 | Double-click a node inside a multi-selection collapses the selection to it and enters text edit (when it has text) | [new] |
| B12 | Right-click **inside** the selection keeps the multi-selection and shows the multi menu | [has] |
| B13 | Right-click **outside** the selection re-targets to that node alone | [has] |
| B14 | **Escape mid-drag cancels the move** and restores original positions | [new] |
| B15 | Hovering a node with the select tool shows a faint hover ring so you can see what a click would hit | [new] |

## C. Selection commands

| # | Behaviour | Status |
|---|---|---|
| C1 | `⌘A` select all | [has] |
| C2 | `Esc` deselect all | [has] |
| C3 | **`Tab` / `Shift+Tab`** cycle selection forward/backward through z-order | [new] |
| C4 | **Select all of the same kind** — context-menu action; for components matches `kind`, otherwise matches node `type` | [new] |
| C5 | **Invert selection** — context-menu action | [new] |
| C6 | **`Shift+1` zoom to fit everything, `Shift+2` zoom to selection** | [new] |
| C7 | `⌘D` duplicate works on a multi-selection and selects the clones | [has] |
| C8 | `[` / `]` send-to-back / bring-to-front preserve relative z-order within the selection | [has] |
| C9 | Arrow-key nudge (1px, 10px with Shift) moves the whole selection as one undo step | [has] |

## D. Clipboard

| # | Behaviour | Status |
|---|---|---|
| D1 | **`⌘C` copies the selection** to an in-app clipboard | [new] |
| D2 | **`⌘X` cuts** | [new] |
| D3 | **`⌘V` pastes** with a small offset, selecting the pasted nodes; repeated paste keeps stepping | [new] |
| D4 | **Paste here** from the canvas context menu pastes at the cursor, preserving relative layout | [fix] |
| D5 | Pasted nodes get fresh ids and fresh wobble seeds | [new] |

## E. Transforming a multi-selection

| # | Behaviour | Status |
|---|---|---|
| E1 | Drag moves the whole selection, snapping the **union bbox** | [has] |
| E2 | **Resize handles appear on a multi-selection** and scale every node proportionally inside the bbox: position, size, draw/arrow points, and text font size | [new] |
| E3 | **Shift+resize locks aspect ratio** (single and multi) | [new] |
| E4 | **Alt+resize resizes from the centre** (single and multi) | [new] |
| E5 | Resize clamps rather than flips — no negative scale | [has] |
| E6 | Group resize is one undo step | [new] |
| E7 | Minimum bbox of 8×8 respected | [new] |
| E8 | **Align** left/h-centre/right/top/v-middle/bottom on ≥2 nodes | [has] |
| E9 | **Distribute** horizontal / vertical spacing on ≥3 nodes | [new] |
| E10 | Align/distribute are one undo step each | [has] |

## F. Selection overlay

| # | Behaviour | Status |
|---|---|---|
| F1 | Union bounding box with ring | [has] |
| F2 | **Faint per-node outlines inside the union box** so you can see exactly what's selected | [new] |
| F3 | Resize handles rendered on the union box for multi | [new] |
| F4 | Marquee box style unchanged (dashed, tinted) | [has] |
| F5 | Overlay hidden while text editing | [has] |

## G. Inspector — multi-edit

The heart of the request.

| # | Behaviour | Status |
|---|---|---|
| G1 | Header shows the count and a type summary, e.g. "3 selected · 2 buttons, 1 rectangle" | [new] |
| G2 | **X / Y / W / H shown for a multi-selection.** Equal across the selection → the number. Not equal → **`–`**. | [new] |
| G3 | Typing into a mixed field **unifies** — every selected node gets that value. This is how you "override so they're the same". | [new] |
| G4 | W/H clamp to ≥8 and apply per node (not to the bbox) | [new] |
| G5 | Number fields commit on blur / Enter, **one checkpoint per edit**, not per keystroke — also fixes the existing single-select history spam | [fix] |
| G6 | Escape in a number field reverts the draft | [new] |
| G7 | **Shared variant controls.** The control list is the *intersection* across the selected components, matched on `key` + `type` (and, for selects, the intersection of `options`). Mixed component kinds still expose whatever they genuinely share. | [new] |
| G8 | Mixed **select** value renders `–` and choosing an option applies to all | [new] |
| G9 | Mixed **toggle** renders a **tri-state switch** with a centred thumb and a dash; clicking it sets all → on; clicking again sets all → off | [new] |
| G10 | Mixed **number**/**text** control renders `–` as placeholder; typing applies to all | [new] |
| G11 | `fill` (shapes) and `head` (arrows) get the same tri-state treatment across the selection | [new] |
| G12 | Text nodes: shared `text` and `fontSize` fields with mixed handling | [new] |
| G13 | **Align + distribute icon row** in the inspector when ≥2 / ≥3 selected — currently only reachable from the context menu | [new] |
| G14 | **Break apart** applies to every selected component | [fix] |
| G15 | Delete applies to the selection | [has] |
| G16 | Every multi-edit is a single undo step | [new] |
| G17 | Controls that would apply to zero selected nodes are simply not rendered | [new] |

## H. Context row (floating quick controls)

| # | Behaviour | Status |
|---|---|---|
| H1 | Shows for a multi-selection, positioned above the **union bbox** | [new] |
| H2 | Surfaces the shared `quick` controls, with the same mixed semantics as the inspector | [new] |
| H3 | Shows an align cluster when ≥2 are selected | [new] |
| H4 | Hidden while text editing or while a gesture is in flight | [fix] |

## I. Undo / history

| # | Behaviour | Status |
|---|---|---|
| I1 | One checkpoint per gesture (move, resize, marquee-free) | [has] |
| I2 | Snapshots capture the selection at **both ends**: `selection` (before the edit) for undo, `selAfter` (what the edit produced) for redo | [fix] |
| I5 | Selection changes alone — marquee, shift-click, ⌘A, Tab, invert — never push history | [has] |
| I6 | A cancelled gesture leaves **zero** history entries, and a no-op field commit takes no checkpoint | [new] |
| I7 | `bringToFront` / `sendToBack` checkpoint, so `[` and `]` are undoable | [fix] |
| I3 | Alt-drag duplicate is one step | [new] |
| I4 | Multi-edit from inspector/context row is one step | [new] |

## J. Explicitly out of scope

- **Groups / frames**, and therefore group-nesting selection semantics (`⌘G`,
  enter-group double-click, deep select). squig's model is a flat node list;
  adding a container type is a separate feature.
- **Lock / hide**, and their effect on marquee hit-testing.
- **Rotation** — squig has no rotation on any node.
- **Flip on resize past the opposite edge** — squig clamps instead, matching
  the existing single-node behaviour.
- **System clipboard interop** — the clipboard is in-app, which keeps paste
  deterministic and avoids permission prompts.

---

## K. Decisions taken against reviewer advice

A four-lens review pressure-tested this spec. Two of its recommendations were
deliberately not taken:

- **"Don't make Ctrl+click a selection toggle on macOS."** Correct about Figma,
  but multi-select via the control key was the explicit ask. Right-click and
  two-finger tap still open the context menu, so the only thing given up is a
  legacy fallback.
- **"Give each history entry a full transaction primitive."** The cheaper
  version — stamping `selAfter` from inside the mutators, so the last write of
  an operation wins — gets the same redo behaviour without a new abstraction.

Everything else it flagged was adopted: real hit geometry, the latched radial
threshold, pointer capture and pointer-id filtering, live modifiers, physical
`e.code` key handling, the keyboard-ownership predicate, commit-on-outside-press
for panel fields, def-defaults resolution and min/max intersection for mixed
values, one-step break-apart with z-order preserved, and non-finite guards on
load.
