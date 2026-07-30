# Contributing

squig is a small project with a specific taste. Pull requests are welcome, and
so is opening an issue first if you're about to spend real time on something —
a five-minute conversation beats a rejected branch.

## Getting set up

```bash
pnpm install
pnpm dev
```

That's the whole setup. No environment variables, no database, no accounts —
documents live in the browser's own storage.

Before you push:

```bash
pnpm lint
pnpm test     # type-checks, then runs the geometry, selection and clipboard suites
pnpm build
```

All three should be green before you open a pull request.

## The easiest thing to contribute

A component. The library is just data: a `ComponentDef` whose `render()`
returns drawing primitives, added to an array.
[`lib/library/AUTHORING.md`](lib/library/AUTHORING.md) walks through it, and
`/kitchen-sink` renders every def at its default size and again squeezed, so
you can see a bad layout without dragging a hundred things onto a canvas.

Good candidates: anything in the shadcn/ui vocabulary that's missing, and
blocks or templates for screens people actually draw.

## What tends to get merged

**It looks drawn, not rendered.** Everything on the canvas goes through
rough.js. The exception is icons, which are drawn crisp — at 14px the wobble
just reads as mush.

**It matches Figma's keyboard.** If Figma has a shortcut for it, squig uses
the same one. Muscle memory is the feature.

**It stays low fidelity on purpose.** squig is a napkin for working out ideas,
not a mockup tool. Features that push toward pixel-precision — gradients,
shadows, exact color pickers — are usually the wrong direction, because the
whole point is that nothing looks decided yet.

**It doesn't add a backend.** No accounts, no sync, no cloud. Files stay in
the browser.

## Style

Match the file you're in. A few conventions worth knowing:

- Comments explain *why*, not what. Most of the codebase's comments are there
  because a decision would look arbitrary otherwise — keep that bar.
- Components never render to DOM. They return primitives the canvas draws.
- Geometry and selection logic lives in `lib/` and is testable without React.
  If you're writing math, add a case to `scripts/test-geometry.ts` or
  `scripts/test-selection.ts`.

## Reporting bugs

Include what you drew, what you expected, and what happened. A `.squig` file
exported with `⇧⌘S` is the fastest possible repro.
