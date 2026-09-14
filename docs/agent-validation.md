# Local agent validation

The supported workflow is a local file, the full editor served on loopback,
and an external agent connected to that file through MCP or local HTTP.
No database or cloud workspace is required to verify it.

## Required gates

```bash
pnpm lint
pnpm test
pnpm test:agent
pnpm build
pnpm build:local
pnpm exec playwright install chromium
pnpm test:agent:browser
make build-xdc
```

`pnpm test` includes type checking and the plain Node suites in `scripts/`.
Canvas geometry, undo/redo, groups, connectors, clipboard, the agent engine,
merge behavior and WebMCP remain part of the regression bar. Local filesystem
and transport suites use temporary files and remove their fixtures.

`pnpm test:agent:browser` runs the real local companion and Chromium against a
temporary file. It checks both directions of browser/file editing, metadata
preservation, stable revisions while idle, reload, pending-edit protection,
conflict recovery, setup without upload, legacy read-only recovery and the
absence of requests outside loopback. It also verifies a recovery draft stays
available when browser storage is full. Screenshots go to
`test-results/local-agent`. The suite cleans up its process and file fixtures.
CI installs Chromium after `pnpm build:local` and runs this browser suite as
part of the launch gate.


Build the local editor again after `make build-xdc` before starting a
companion: both exports use `out/`, and the companion requires the local
editor build marker. Webxdc remains its own offline browser package.

## Persistence and tool checks

Use a temporary `.squig.json` file and a directory outside the repository.
Confirm that an absent file is created, an existing valid file opens, and an
invalid file is preserved with an actionable error. Read the file after a
successful edit and after restarting the process. Check that no-op saves do
not create history, stale revisions reject writes, external edits are detected,
and a second process cannot own the same file.

Exercise component discovery; every node type; atomic batches; grouping,
spacing, variations and notes; structured comments and resolution; restoration;
SVG and PNG rendering; text measurement; and portable export. Check variations
and comments after browser saves and reopen. Add enough snapshots to verify
both the 50-entry cap and the 16 MiB history cap. Verify render fonts resolve
from the installation even when the command starts in another project.

Connect with the official MCP SDK over stdio and local Streamable HTTP.
Stdio stdout must contain only protocol messages. Invalid Host, browser Origin,
missing tokens, traversal attempts, and oversized requests must be rejected.
Exercise files close to the 16 MiB limit and MCP results above 8 MiB. Both
MCP transports must return a bounded error identifying the selected disk
file, preserve completed edits, and stay usable for the next call. Check that
oversized validation errors report failure without claiming a completed edit.
For completed edits, confirm the returned revision matches the saved file
before retrying any mutation.
Static file serving must expose only built editor assets. Public hosted tools
must reject writes, while authenticated legacy recovery can still read/export.

## Browser check

Start `pnpm squig serve /absolute/path/test.squig.json` after `pnpm build:local`.
Open its printed editor URL. Add and move objects by hand; inspect the disk
file. Edit through MCP or HTTP and watch the changes arrive in the same editor.
Check selections, zoom, undo, text edits and transforms during incoming edits.
Two independent edits should merge; a same-field conflict must preserve the
browser draft and provide recovery. Stop the process, confirm unsaved changes
are visible, restart it and reopen the saved file.

On the public editor, **Connect agent** should explain browser-agent access
and the local-file workflow without uploading a drawing. Export a browser
canvas, start a companion with that downloaded file, and verify it remains
editable. Old cloud links should recover local documents without continuing
cloud writes. Browser local storage is separate from the companion file;
reloading one must not overwrite the other.

Use the browser network panel during a local session: document saves,
rendering and agent tool calls must remain on loopback. Inspect the normal
canvas and `/kitchen-sink` for rendering regressions. Verify popup keyboard
access, copy feedback, mobile layout and errors as well as type safety.

## Practical limits

After deploying, verify the website with
`SQUIG_TEST_URL=https://squig.sh node scripts/agent/release-browser.mjs`.
It checks browser-local persistence, setup and documentation, response headers,
and retired hosted endpoints. It confirms retirement before testing any formerly
mutating route. For a protected preview, provide its temporary access URL in
`SQUIG_PREVIEW_ACCESS_URL`; keep that URL out of logs and source control.

The companion must keep running for live updates. A local link is accessible
only on the same computer; it is not a public invitation. Browser WebMCP
availability depends on the browser and agent. Revision merging is not
character-level collaborative text editing. History is bounded; separate
backups remain useful. Structured comments are accessible to agents but do
not have a canvas comment UI, so visible feedback belongs in note nodes.

Legacy database maintenance scripts remain for recovery operators. They are
not launch requirements for local files. The retired hosted write smoke and
browser scripts have been removed; verify current behavior through the local
filesystem, transport and browser suites.
