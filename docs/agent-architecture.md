# Local agent architecture

Squig's optional companion runs on the user's computer and owns one explicitly
selected `.squig.json` file. It serves the normal editor on `127.0.0.1` and
exposes the same canvas engine through MCP and local HTTP. Human and agent
edit the same file. There is no public collaboration service, signup or model
hosted by Squig.

## Three places a drawing can live

The ordinary website autosaves drafts in browser storage. A downloaded
`.squig.json` is a separate portable copy. A companion session reads and writes
a chosen disk file, so browser edits and agent edits persist to that file.
Opening a website draft does not give the website access to its downloaded
copy. The user exports the draft and starts the companion with its file path.
A browser agent can also edit the open tab through `window.squig` or WebMCP;
those tools use whichever document the tab currently has open.

## Local runtime

`pnpm build:local` exports the editor assets. `pnpm squig serve /path/file.squig.json`
starts the loopback editor and HTTP transport. `pnpm squig mcp /path/file.squig.json`
adds stdio MCP for a client that launches its own process. Use direct Node
arguments in an MCP configuration so package-manager output cannot enter the
protocol stream. Startup details go to stderr for stdio sessions.

Run one companion per file. Its tools can access only the selected document;
there are no workspace creation, document deletion or key-rotation tools.
The process does not expose arbitrary filesystem paths, command execution or
external URL fetching. A new file is created only when the chosen path is
absent. An existing invalid file produces an error and stays intact.

The HTTP listener binds to loopback, validates Host and Origin, and requires
an unpredictable session token for document access. The editor and API share
an origin; the public website does not contact a localhost API behind the
user's back. Treat the local editor link as a session credential. It works
only on the computer running the companion while the process remains active.
Stopping the process ends live access and leaves the file on disk.

## Persistence and history

The selected file is the source of truth. Mutations are serialized, validate
the complete result, then save with a temporary file and rename in the same
directory. A per-file session lock rejects a second companion. Revision tokens
are derived from file content: agents read the current token and pass it back,
never calculate the next revision. External file changes invalidate stale
writes. Filesystem failures surface as actionable errors instead of a
successful save; no cloud fallback is used.

A no-op save returns the same revision without another snapshot. History is
stored beside the file in a `.squig.json.history` directory, with an active
`.squig.json.lock` file identifying its companion session. History is bounded to 50 entries and 16 MiB per file, so embedded images and
frequent edits cannot accumulate unlimited history. Older snapshots expire.
History is a convenience, not an unlimited backup service; users can copy the
portable file or use their own backup and version-control tools.

Variations and structured comments are kept with the portable document.
Browser updates replace editable fields while preserving this metadata.
Restoration creates a new current state after checking the expected revision.
The engine still enforces node counts, request/document sizes, operation
limits, locks and valid geometry.

Portable files are capped at 16 MiB including comments. MCP responses are
capped separately at 8 MiB including the protocol envelope. Larger tool results
or validation errors return a bounded error with the selected file path and
revision when available. The error distinguishes a completed operation from
a failed request. A completed mutation remains saved; read that disk file and
check the current revision before editing again. Local HTTP document reads
remain available for the full file.

## Synchronization

The local editor checks for incoming changes while connected. It preserves
pan, zoom and surviving selections, and defers incoming changes during active
text edits and transforms. A three-way merge compares the last synchronized
state, the browser's edits and the latest file. Independent changes merge.
Competing edits preserve the browser draft and offer explicit recovery.

Edits made during a save remain pending. Canonicalized saved fields become
the new baseline, preventing normalization from triggering a save loop.
Undo snapshots are rebased where independent incoming edits permit it.
Unsaved changes trigger a leave-page warning. This is revision-based merging;
it does not provide character-level collaborative text editing or presence.

## Engine and transports

- `lib/agent/schema.ts` and `engine.ts`: validated atomic node operations.
- `lib/agent/local-store.ts` and `local-service.ts`: filesystem persistence and tools.
- `scripts/agent/local.ts`: local editor, HTTP and stdio MCP transport.
- `lib/agent/merge.ts`: browser-independent concurrent edit merging.
- `components/agent/bridge.tsx`: connection and editor synchronization.
- `lib/agent/render.ts` and `text-metrics.ts`: local rendering and measurement.

The catalog is the actual component registry. All six node types, arrange
operations, variations, notes, comments, export, history and restoration are
available to local MCP clients. Browser WebMCP has a smaller canvas-focused
catalog; it remains useful when a browser agent already controls the tab.

SVG and PNG use the same drawing paths as the canvas. Vendored Patrick Hand,
Geist and Source Serif 4 fonts are resolved from the application installation.
Fontkit provides real text advances. Measurement reports text-node overflow
and missing glyphs; component labels and italic ink bounds still need visual
inspection. Embedded WebP is converted locally before PNG rendering, subject
to the image pixel limit. No rendering request goes to a hosted Squig service.

## Retiring hosted collaboration

Public hosted writes and new workspace creation are disabled. Old authenticated
canvas reads and exports remain temporarily available for recovery. Opening
an old link recovers a local copy instead of restarting cloud synchronization.
Existing data is preserved for export; it is not silently deleted during this
migration. The remaining recovery storage is separate from all new local work.

Ordinary website and companion builds need no database. The old database code
and operator scripts exist only to maintain recovery data. Do not run them
as a prerequisite to building or launching the local app. A database outage
cannot prevent the editor or local companion from saving local files.

The public website still incurs normal hosting traffic. The companion's
storage, rendering and agent traffic use the user's computer. Model usage
belongs to the external agent's provider and can still cost money; Squig
neither supplies nor pays for that model.

## Verification

Run `pnpm lint`, `pnpm test`, `pnpm test:agent`, `pnpm build`,
`pnpm build:local`, `pnpm test:agent:browser` and `make build-xdc`. Install
Chromium once with `pnpm exec playwright install chromium`. Test the local companion from outside
the repository directory too: assets, fonts and loaders must resolve from
the installation. Verify live browser-to-file and agent-to-browser edits,
stale writes, external edits, lock contention, metadata, history limits and
restart persistence. See [agent-validation.md](agent-validation.md).
