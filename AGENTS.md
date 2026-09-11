# Working on squig

squig is a wireframing tool: an infinite canvas where you drag in real UI
components and everything renders as a hand-drawn sketch through
[rough.js](https://roughjs.com). A document is a flat map of nodes saved as
`.squig.json`, kept in the browser's own storage; the canvas itself has no
backend, no accounts and no sync. This file is for changing the codebase. To
*drive* squig from a CLI, an MCP client or the console, read
[docs/agents.md](docs/agents.md), and for the file format itself
[docs/format.md](docs/format.md).

## The map

```
app/                     the single page (and /kitchen-sink)
app/mcp/route.ts         the hosted MCP door at squig.sh/mcp
app/api/v1/              the same commands over REST
components/canvas/       canvas, interactions, rough.js renderer
components/chrome/       rail, panels, inspector, ⌘K, menus
components/agent/        connect an agent to this canvas, and stay in sync
lib/doc.ts               the document as a value: read, build, change, write
lib/store.ts             zustand doc state + history
lib/files.ts             the local file drawer: autosave, recents, prefs
lib/agent-bridge.ts      window.squig, the same API from the console
lib/agent/               the hosted workspace: schema, engine, service, db, render
lib/sketch/              drawing primitives + Phosphor icons
lib/sketch/paths.ts      primitives to rough.js paths
lib/sketch/svg.ts        a drawing as SVG, with no DOM in the room
lib/library/             every component and block definition
lib/canvas/snap-engine   alignment/snapping math
scripts/squig.ts         the CLI
scripts/test.ts          the test runner, over scripts/test-*.ts
scripts/harness.ts       the four lines of test framework there are
```

## The gate

```bash
pnpm typecheck        # the app and scripts/, both
pnpm test             # typecheck, then every suite, the agent engine included
pnpm test crop text   # just the suites whose names match
pnpm test:agent       # just the agent engine
pnpm lint
pnpm build
make build-xdc        # the offline webxdc package
pnpm verify           # lint, test, build, in that order
```

All of it green before you push. CI (`.github/workflows/check.yml`) runs lint,
test, test:agent, build and `make build-xdc`, so the package build is part of
the bar even though `pnpm verify` stops short of it.

Tests are plain node scripts: no framework, no globals to learn, just
`check(name, condition)` and `report(...)` from `scripts/harness.ts`, each
suite run in its own process. New behaviour gets a case in the nearest
`scripts/test-*.ts` rather than a new file, unless it is genuinely a new
subject.

## Conventions

- **Comments explain why, not what.** Most comments in this codebase are there
  because a decision would look arbitrary otherwise. Keep that bar.
- **Components never render to DOM.** A `ComponentDef.render()` returns drawing
  primitives, and the canvas draws them. That indirection is what makes panel
  previews, ⌘K thumbnails and break-apart reuse the exact same marks.
- **Geometry lives in `lib/` and is testable without React.** If you are
  writing math, it goes in a `lib/` module with a case in a test suite, not
  inside a component.
- **Match Figma's keyboard.** If Figma has a shortcut for it, squig uses the
  same one. Muscle memory is the feature.
- **Low fidelity is the point.** Gradients, shadows, exact colour pickers and
  anything else pushing toward pixel precision are usually the wrong direction.
  It is a napkin for working out ideas.
- **Monochrome.** One ink on paper, three fill tones, three ink tones. No
  fourth.
- **The local canvas needs no backend.** Documents live in the browser's own
  storage. The agent workspace is the one server-side piece, it is optional,
  and it is Postgres-backed; see
  [docs/agent-architecture.md](docs/agent-architecture.md).
- **No emoji in UI copy.**
- **Keep UI copy concise.** Labels name the control; optional explanation goes
  in a short, delayed helper on its label. Help must also work with keyboard
  focus, screen readers and touch. Use a disclosure for longer setup guidance.
  Keep live status, errors, recovery steps and security or destructive
  consequences visible. Do not remove accessible names to shorten visible copy.
- **Use the shared UI type scale.** Sizes, line heights and spacing live in
  `app/globals.css`; [docs/ui-typography.md](docs/ui-typography.md) explains the
  roles. Make room for labels instead of shrinking them.

## The big files

**`components/canvas/canvas.tsx`** (~2,500 lines) is the pointer state machine,
and it is one file because splitting a state machine hides its transitions. The
seams: the `Gesture` union at the top names every state a pointer can be in;
`updateGesture` moves one along; `finishGesture` commits it to the store; and
the keyboard effect near the bottom owns shortcuts. Find the gesture first,
then change it.

**`lib/store.ts`** (~2,000 lines) is document state, the undo/redo stack and
the file drawer's calls into `lib/files.ts`. Edits go through the store so
history and autosave stay honest.

**`lib/doc.ts`** is where a node rule lives, and **`lib/agent/engine.ts`**
stands on it. The engine keeps only what is its own: zod at the API boundary,
revisions, variations, and the workspace's policy about locked nodes and
status codes. Everything past that boundary is `vouchNode`, `addNodes`,
`updateNode`, `removeNodes` and `groupNodes`, so a rule that changes changes
once and the agent's canvas behaves like the one in the browser.

**`lib/sketch/svg.ts`** is the only thing that turns nodes into SVG markup. The
image export, the CLI, `window.squig` and the workspace's PNG all print through
it, so a fix to how a node is written out lands everywhere at once.

**`lib/library/defs-*.ts`** are data, not logic. They are long because there
are a lot of components, and each one is independent of the rest.

## Adding a component

The easiest useful change. A library item is one `ComponentDef`: a default
size, variant props, inspector controls, and a `render()` returning
primitives, added to an array. [`lib/library/AUTHORING.md`](lib/library/AUTHORING.md)
walks through the whole thing, including the drawing DSL.

## Verifying UI work

Types compiling is not evidence that a canvas looks right.

```bash
pnpm dev
```

Then look at it. `/kitchen-sink` renders every def at its default size and
again squeezed, which is where a bad layout shows up without dragging a
hundred things onto a canvas. For work that is easier to check as a file than
by hand, `pnpm squig render some.squig.json --out some.svg` prints the same
marks the canvas draws.
