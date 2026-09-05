# Shared canvas validation

The correction makes the normal Squig canvas the human/agent workspace.
Wireframes and notes are editable nodes on that canvas. The separate review
page and approval API were removed.

## Coverage

- `pnpm test`: existing canvas geometry, selection, text, groups, connectors,
  clipboard, files, history, navigation and other regression suites.
- `pnpm test:agent`: 194 checks, including all 155 library definitions, all six
  node types, atomic operations, validation, rendering and concurrent merges.
- `scripts/agent/smoke.mjs`: real Neon database and official MCP SDK. Tests
  workspace isolation, canvas key scopes, MCP editing, stale writes, atomic
  rollback, concurrent CAS, history, rendering, key rotation and deletion.
- `scripts/agent/browser.mjs`: clean-browser invitation opens the normal
  editor without workspace credentials; real text objects are visible.
  Human changes save to the shared document, agent edits arrive in the editor,
  and a second browser sees both. An injected concurrent write on a different
  node merges. A competing filename edit preserves a downloadable draft.
  An existing local drawing can be connected in place. Also checks docs SEO,
  mobile overflow and browser errors. Sharing and agent setup have separate
  popovers; browser checks cover outside-click and Escape dismissal, clipboard
  contents, temporary copy checkmarks and sidebar visibility. Shared canvases
  ignore local drawer quota/staleness warnings; a simulated cloud outage shows
  one error beneath the filename and clears it after reconnecting.

The tests use isolated workspaces and delete their fixtures. Run the browser
suite with a running server and DATABASE_URL in .env.local. Install Chromium
with `pnpm exec playwright install chromium`. SQUIG_TEST_URL defaults to
http://localhost:3001.

For protected preview verification, use:

```sh
SQUIG_PREVIEW_URL=https://YOUR-PREVIEW.vercel.app \
  node --env-file=.env.local scripts/agent/preview-smoke.mjs
```

The proxy uses `vercel curl` without disabling protection and keeps credentials
in temporary private files, removed after each request.

## Practical boundaries

Synchronization checks once per second and defers updates during active text
edits or transforms. Independent edits merge; same-field conflicts require
reconciliation. This is not character-level collaborative text editing and
has no cursor avatars. Canvas keys are editing capabilities, not named users.
There is no OAuth or account recovery. Server PNG fonts may differ from the
browser. Implementing the selected design remains the external agent’s job.
