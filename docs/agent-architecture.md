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
The connection panel provides the editable invitation, key and MCP config.

Any Streamable HTTP MCP client can connect to `/mcp`; any HTTP agent can use
`/api/v1/tools/{name}` with identical inputs. The catalog is Squig’s actual
component registry. All six node types and canvas operations use the same
validated, atomic command engine.

Canvas keys can inspect and edit only their document. They cannot create or
delete canvases, rotate keys, or access siblings in the workspace. Workspace
keys can manage those actions. Keys are random and stored as SHA-256 hashes.
The invitation secret is in the URL fragment; the editor stores it locally
and removes it from the address bar. The server receives it as a bearer header.
`rotate_canvas_link` revokes the previous canvas key without rotating the
workspace key. Treat invitations as editing credentials.

## Synchronization and concurrent editing

The browser checks for changes every second while connected. It preserves
pan, zoom and surviving selections. Saves wait until a text edit or transform
finishes. Each mutation uses an expected revision; a single PostgreSQL CTE
updates the JSON and inserts its immutable history record. A stale writer
receives 409 and must reconcile with the latest document.

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

Render tools use the canvas drawing paths and primitives. Server fonts can
differ from browser fonts; use a browser screenshot for final typography.
No arbitrary code or external URL fetching is exposed. Images are embedded
raster data. Requests, geometry, node counts and batches are bounded.

The migration is additive and rerunnable. Existing unused review columns are
retained for migration compatibility; no review interface or endpoint is
exposed. Database backups, retention and operating budgets belong to the host.
The Webxdc package keeps the offline canvas and excludes hosted connections.

## Verification

Run `pnpm test`, `pnpm test:agent`, `pnpm lint`, `pnpm build` and `make build-xdc`.
With the app running and DATABASE_URL loaded, run the real REST/MCP integration
suite and `pnpm test:agent:browser`. These create isolated fixtures and clean
them up. Browser coverage includes direct invitations, existing local files,
two live editors, independent concurrent writes and conflicting draft recovery.
