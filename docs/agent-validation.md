# Agent wireframing validation

Validated on September 5, 2026 against the local app, a real Neon database,
and a protected Vercel preview. The existing local canvas is still covered by
its full regression suite.

## Automated checks

- `pnpm test`: existing canvas regressions passed.
- `pnpm test:agent`: 188 checks passed, including all 155 registered component
  definitions, all six node types, atomic batch failures, ID validation,
  prototype-name rejection, locking, group/connector clone remapping,
  alignment, distribution, stacking, detach, crop reset, variation removal,
  SVG escaping and deterministic drawing paths.
- `node --env-file=.env.local scripts/agent/smoke.mjs`: 45 REST/MCP checks
  passed against real storage. Includes SDK initialization, tools/resources/
  prompts, workspace isolation, review permissions, stale approval, a real
  concurrent write race, history, restore, SVG/PNG rendering, workspace key
  rotation, review revocation, deletion, malformed JSON and browser origins.
- The same 45 checks passed on the protected Vercel preview using
  `scripts/agent/preview-smoke.mjs`, which forwards through `vercel curl`
  without disabling deployment protection.
- `pnpm test:agent:browser`: Chromium workflow passed. Connect a workspace,
  compare variations, comment, approve, edit filename and typography through
  the ordinary editor, observe agent changes, provoke a genuine write race,
  download the preserved local draft, and explicitly load the newest canvas.
  Also checks canonical metadata and 390px layouts. No page errors.
- `pnpm lint`, `pnpm build` and `make build-xdc`: passed.
- Plugin and skill manifests validated. `codex plugin marketplace add .` and
  `codex plugin add squig@squig-plugins` both succeeded.

The database smoke and browser tests create isolated workspaces and delete
those fixtures when done. They require the running application and its
DATABASE_URL. For browser tests, first run `pnpm exec playwright install
chromium`. Set SQUIG_TEST_URL when using a port other than 3001.

For a protected deployment:

```bash
SQUIG_PREVIEW_URL=https://YOUR-PREVIEW.vercel.app \
  node --env-file=.env.local scripts/agent/preview-smoke.mjs
```

Use the database associated with that deployment; do not run against an
unrelated database. The preview proxy uses private temporary files and removes
them after each request. It never prints workspace keys.

## Issues caught and corrected

- The shared-state control initially covered the existing filename button.
  It now sits above the bottom command control, leaving renaming reachable.
- Missing optional-field resets would have prevented agents from uncropping
  an image or restoring automatic connector snapping. Update patches now
  accept an explicit unset array.
- New review links initially replaced old links without explanation. The
  browser now explains revocation and requires an explicit replacement click.
- Native libvips loaded locally but was missing from Vercel's traced function
  bundle. Agent routes now explicitly include the installed Linux libraries;
  hosted PNG rendering is exercised by the deployment smoke test.
- Registry lookups could resolve inherited JavaScript property names. They
  now require an own registry entry before a component can be created.

## Intentional release boundaries

Authentication uses workspace bearer keys and document review capabilities.
There is no OAuth, account recovery or verified reviewer identity. Server
image previews share canvas paths but use available system fonts; use browser
screenshots for final typography. Agent documents use durable Postgres;
ordinary local files remain in browser storage. Production application
implementation and deployment belong to the external coding agent, after the
user chooses a wireframe.
