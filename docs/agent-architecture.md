# Shared canvas architecture

Squig’s normal browser editor is the shared workspace. External agents use
MCP or REST to read and mutate that same document; no model runs inside Squig.
The user watches real editable nodes arrive and can draw alongside the agent.
There is no separate review application.

## Connections

A workspace bearer key can create canvases. `create_document` returns a
`canvasUrl` opening the normal editor, plus a `canvasKey` scoped to that one
canvas. Agents should send the link before drawing, then work in small,
coherent batches. An existing local drawing becomes shared through **Connect
agent** in the editor, retaining its objects and the user's current view.
Share provides the editable invitation. Connect agent provides the key and MCP config. Both are popovers in the top-right toolbar, beside the sidebar toggle.

Successfully opened shared canvases appear in Open recent and the command
palette. This browser remembers their names and IDs separately from local
drawings; reopening fetches the live canvas with the saved invitation or
workspace key. Removing a shared entry only forgets the shortcut. It does not
delete the online canvas or revoke its invitation.

Any Streamable HTTP MCP client can connect to `/mcp`; any HTTP agent can use
`/api/v1/tools/{name}` with identical inputs. The catalog is Squig’s actual
component registry. All six node types and canvas operations use the same
validated, atomic command engine.

Canvas keys can inspect and edit only their document. They cannot create or
delete canvases, rotate keys, or access siblings in the workspace. Workspace
keys can manage those actions. Keys are random and stored as SHA-256 hashes.
The invitation secret is in the URL fragment. The editor removes it from the
address bar before reading storage, and saves or shares it only after the server
confirms access to that document. A supplied invitation never falls back to the
browser's workspace key. Rejected or revoked invitations stop synchronization
and clear the displayed sharing credential, preserving the local draft.
Workspace and canvas keys have separate formats and storage slots; the workspace
connection form accepts only workspace keys. The server receives keys as bearer headers.
`rotate_canvas_link` revokes the previous canvas key without rotating the
workspace key. Treat invitations as editing credentials.

## Synchronization and concurrent editing

The browser checks for changes every second while connected. It preserves
pan, zoom and surviving selections. Saves wait until a text edit or transform
finishes. Each mutation uses an expected revision; a single PostgreSQL CTE
updates the JSON and inserts its immutable history record. A stale writer
receives 409 and must reconcile with the latest document.
The save locks the expected revision before comparing JSON. An identical
document returns that revision and timestamp without writing another snapshot;
an identical payload with a stale revision still receives 409. Server-normalized
fields are applied back to the browser after saving, including when local edits
arrive during the request, so normalization cannot trigger endless resaves.

The editor uses a three-way merge between its last synchronized document,
local changes and the remote document. Independent objects and fields merge;
concurrent additions keep both sets of nodes. Competing edits to the same
field preserve the local draft and offer download and explicit reload.
Edits made during a save remain pending. Undo snapshots are rebased for
independent remote changes; snapshots that would overwrite remote edits are
discarded. Unsaved changes trigger the browser’s leave-page warning.

This is revision-based collaboration, not a character-level CRDT. Incoming
changes are deferred during active text editing and transforms. There are no
remote cursor avatars or named presence identities. The canvas status reports
connection, saves, incoming changes and errors.

## Modules

- `app/mcp/route.ts`: official MCP SDK, tools, guide resource and workflow prompt.
- `app/api/v1/[...path]/route.ts`: REST commands and workspace key management.
- `lib/agent/schema.ts`, `engine.ts`: schemas and atomic canvas operations.
- `lib/agent/service.ts`, `db.ts`: capability scopes, storage, quotas and CAS.
- `lib/agent/merge.ts`: browser-independent concurrent edit merging.
- `components/agent/bridge.tsx`: in-canvas connection and synchronization.

Render tools use the canvas drawing paths and primitives. PNGs use resvg and
vendored Patrick Hand, Geist and Source Serif 4 fonts. Fontkit supplies real
advance widths to the shared wrapping function; measurement stays local to a
request, so parallel canvases cannot switch each other's font. `measure_text`
reports text-node overflow and missing glyphs; component labels and italic
ink bounds still need visual inspection. Embedded WebP images are converted
to PNG before resvg sees them, with a 16-million-pixel input limit.

Sync stays mounted when the user hides the editor chrome. The agent invitation
is one copy action; raw credentials and manual MCP configuration are optional
details. Edit responses return changed/deleted nodes instead of echoing the
full canvas. An empty catalog query returns a compact index.
No arbitrary code or external URL fetching is exposed. Images are embedded
raster data. Requests, geometry, node counts and batches are bounded.

The migration is additive and rerunnable. Existing unused review columns are
retained for migration compatibility; no review interface or endpoint is
exposed. Database backups, retention and operating budgets belong to the host.
The Webxdc package keeps the offline canvas and excludes hosted connections.

Before promoting a deployment, run `pnpm db:check` with that deployment's
`DATABASE_URL` and database role. It is a read-only preflight: required columns
in all five tables, table privileges and the nullable `review_hash` upgrade.
It also rejects read-only storage and Neon clusters at least 90% full. The Neon
check includes every database in the cluster; other Postgres hosts must monitor
their provider's capacity. This is a point-in-time check, not ongoing monitoring.
It emits JSON and exits nonzero when storage is not ready. Run `pnpm db:migrate`
and repeat the check for a schema failure. Both commands accept environment
variables directly and optionally load `.env.local`. They are intentionally
separate from ordinary local builds: the editor and offline package need no database.
The REST/MCP preview smoke suite remains the check for actual writes.

Vercel's build command is `pnpm build:hosted`: migrate, check readiness, then
build. Schema upgrades happen automatically before the new deployment can
receive traffic. A missing database or failed migration stops the deployment;
so that release cannot replace the working live site. Other
hosts can use the same command. Keep migrations additive and compatible with
the currently serving release. Runtime requests never run migrations.

REST and MCP return sanitized 503 diagnostics with stable `AGENT_STORAGE_*`
codes for missing configuration, migration, permissions, availability, full
storage (`53100`) and read-only storage (`25006`). Unexpected errors keep their
SQLSTATE in structured server logs, alongside the transport, tool name and an
error ID returned to the caller. Database error text, credentials and query
details are never returned or logged.
Failed connections retain the local canvas and show a retry action. Legacy SVG
images are rasterized in the browser for sharing; failed uploads leave the
local document unchanged. Newly pasted SVGs are also stored as raster images.

## Verification

Run `pnpm test`, `pnpm test:agent`, `pnpm lint`, `pnpm build` and `make build-xdc`.
With the app running, `pnpm test:agent:security-browser` checks invitation
validation, credential storage, revocation, framing headers and the local canvas
with an intercepted API, requiring no database. Set `SQUIG_TEST_URL` to override
the default `http://localhost:3000`.
With the app running and DATABASE_URL loaded, run the real REST/MCP integration
suite and `pnpm test:agent:browser`. These create isolated fixtures and clean
them up. Browser coverage includes direct invitations, existing local files,
two live editors, independent concurrent writes and conflicting draft recovery.

For rollout regressions without a database, start `DATABASE_URL='' pnpm dev
--port 3011`, then run `pnpm test:agent:rollout`. This checks the real missing
configuration response, then uses isolated HTTP fixtures for an unmigrated
database and recovery. It covers retry, preserved local editing, legacy SVG
sharing and SVG paste. Screenshots are saved under `test-results/agent-rollout`.
