# Agent workspace architecture

Squig's existing browser store remains the local canvas editor. Hosted agent
workspaces introduce a server-side document contract with independent access
control and durable revision history. There is no model running inside Squig.

## Entry points

- `app/mcp/route.ts`: official MCP SDK, stateless Streamable HTTP, JSON replies,
  tools, a workflow resource, and a wireframe-first prompt.
- `app/api/v1/[...path]/route.ts`: REST commands, key creation/rotation and the
  document-scoped review API.
- `lib/agent/schema.ts`: shared command schemas and node field validation.
- `lib/agent/engine.ts`: pure, atomic canvas operations. Every batch operates
  on a clone and validates the whole result before a write can occur.
- `lib/agent/service.ts`: ownership checks, command dispatch and handoff.
- `lib/agent/db.ts`: Neon queries, hashed capabilities, quotas and CAS saves.

The catalog reads the actual component registry. The renderer uses
`lib/sketch/paths.ts`, extracted unchanged from the browser renderer, plus the
same node primitives. Server PNG typography can differ because browser fonts
are not embedded; final visual verification should include the browser.

## Access model

A workspace key controls only documents belonging to its workspace. The raw
key is returned once; the server stores its SHA-256 hash. The browser keeps
its key in localStorage so subsequent visits reconnect. Rotating a key revokes
all clients using the old key. There is no account recovery or OAuth in this
release.

A review URL carries a random document capability in its fragment. Browsers
send it only as a bearer header to the review API; it is never in the request
URL, referrer, metadata, sitemap or HTML. Reviewers can read, comment and choose
a variation. They cannot mutate the canvas or list the workspace. Reviewer
identity is intentionally described as “Reviewer,” not an authenticated person.

Review links are returned once on creation/rotation. The agent should retain
the link; a browser that has no cached link offers an explicit replacement
flow explaining that the old link will stop working. A partial URL is never
returned as a usable review link.

## Persistence and concurrency

Each canvas mutation includes its expected revision. A single PostgreSQL CTE
updates the document only at that revision and inserts its immutable history
row. A mismatch returns 409. The JSON is never written if any batch operation
fails. Restoring history creates a new revision and retains feedback.

The browser polls at two-second intervals while a shared document is open.
It uploads changes only outside active text edits and geometry gestures. If
local changes happen during a request, they stay dirty for the next save. It
never replaces dirty local state with a remote response. Conflicts stop sync
and offer a local draft download and explicit reload. Leaving with an unsaved
shared draft triggers the browser's standard leave-page warning.

Approval names a variation at a particular revision. Every canvas save clears
approval; comment changes do not. Approval uses the same revision predicate
so a stale review cannot approve unseen content.

## Operations and limits

No arbitrary execution, URL fetching or cross-origin browser API is exposed.
Nodes have finite bounded geometry; images use embedded raster data, never
remote URLs or SVG payloads. Input, document and operation sizes are bounded.
Quota state is stored in Postgres so server instances share counters.

The migration is additive and rerunnable. Workspace deletion cascades to its
canvases, history and comments. There is no automatic retention or account
billing. Operators should set database backups, storage budgets and signup
limits for their audience before broad public rollout.

Webxdc uses only TSX pages and omits server route handlers. The offline canvas
hides the agent bridge. Hosted docs and interfaces are independent of local
file storage.

## Validation

- `pnpm test`: existing canvas regression suite.
- `pnpm test:agent`: pure engine, catalog, validation and SVG checks.
- `node --env-file=.env.local scripts/agent/smoke.mjs`: real database and MCP
  client; isolation, CAS races, atomic rollback, feedback, approval, restore,
  image rendering, key rotation, review revocation and deletion.
- `pnpm test:agent:browser`: reproducible Chromium workflow and mobile checks.
- `pnpm lint`, `pnpm build`, `make build-xdc`.
- Browser review: compare variations, add feedback, choose a direction,
  connect a workspace, edit through the normal inspector, and observe both
  remote-to-local updates and local-to-remote saves.

The smoke test deletes its workspace fixtures even on failure. The optional
`demo.mjs` creates a retained, three-direction book-club canvas for visual
inspection; its credentials go to a private file, not stdout.
