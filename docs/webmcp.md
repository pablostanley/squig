# WebMCP in squig

Squig exposes the **open browser canvas** as WebMCP tools. WebMCP runs in the user's tab and uses
the canvas store. The local companion MCP server is a separate connection
for agents that need a selected disk file, rendering and durable local history. It needs no account, API key, server workspace, or
network request to edit a local document.

For an existing drawing, **Connect agent** copies instructions identifying
the current document. An agent with access to that existing tab can start
there immediately. Edits already autosave in browser storage; no download,
installation or companion is required. A copied website URL does not transfer
a drawing to another browser profile. Match the invitation's document ID
with `squig_read_canvas` or `window.squig.documentId()` before editing, and
keep using the original tab.

## Readiness assessment

Research baseline: September 13, 2026. WebMCP is still an evolving web API,
not a final certification target. Squig implements the imperative tool
provider surface. Browser availability and agent discovery remain browser
capabilities, not something a website can enable for every visitor.

| Area | Before | Implementation |
| --- | --- | --- |
| Browser discovery | `window.squig` and local companion MCP | Tools registered on `document.modelContext`; fallback to older `navigator.modelContext` |
| Structured inputs | TypeScript console methods | JSON Schema generated from Zod, with runtime validation |
| Shared human/agent state | Already present | Reuses the bridge and store for selection, undo, redo, autosave and rendering |
| Lifecycle | No WebMCP registrations | Registers after hydration; aborts registrations on unmount; handles Strict Mode and asynchronous failures |
| Cancellation | No WebMCP callbacks | Aborted calls cannot start edits; disposed callbacks cannot execute |
| Editing safeguards | Console access | Rejects stale document IDs, locked targets, missing IDs and active gestures; waits for the selected document to finish opening |
| Results | Console values | Text content containing JSON; actionable `isError` results; read-only and untrusted-content annotations |
| Compatibility | No browser protocol | No-op on unsupported/insecure contexts; legacy explicit cleanup without clearing another app's tools |
| Verification | Existing bridge/store suites | Dedicated WebMCP regression suite plus browser discovery, invocation and visual/keyboard checks |

The canvas is drawn by JavaScript, so the imperative API is the appropriate
integration. Adding declarative form attributes to canvas controls would not
make it more complete. No polyfill or cross-origin tool exposure is added.

## Available tools

All names start with `squig_`.

| Tool | Purpose |
| --- | --- |
| `read_canvas` | Current document ID, document, selection and bounds |
| `search_components` | Library kinds and default sizes |
| `describe_component` | Default props and legal component values |
| `add_component` | Library component with default sizing |
| `add_text` | Text with fitted dimensions |
| `add_shape` | Rectangle or ellipse |
| `add_arrow` | Connector between IDs or coordinate pairs |
| `add_nodes` | Atomic batch of complete `.squig.json` nodes |
| `update_node` | Patch an unlocked node |
| `remove_nodes` | Undoable deletion of unlocked nodes |
| `arrange_nodes` | Group, stack, tidy, space or resize marked nodes |
| `set_view` | Selection or zoom |
| `export_canvas` | JSON or SVG returned as text |
| `import_document` | Open JSON as a new local file; preserve the previous file |

Read the canvas first and pass its `documentId` to each mutating tool.
This prevents a delayed agent request from editing a different file after
someone switches documents. Tool calls act on current state, not a saved
snapshot. They do not provide revision-based concurrency control within a
single document. The user can undo content edits using the usual keyboard
shortcuts. Import starts a new file and a new history; the old file remains
in the drawer.

Canvas reads and exports contain user-authored content. Their annotations
mark it as untrusted; clients must not treat canvas text as instructions.
Browser permissions mediate tool discovery and execution. Squig does not
expose workspace credentials, other local files, or sharing/publication tools.
In a companion editor, local synchronization handles WebMCP edits like
manual edits and saves them to the selected disk file. On squig.sh, edits
autosave in browser storage. Exporting a portable copy is optional.

## Example with the current draft

In a browser implementing the current document API, after the canvas loads:

```js
const tools = await document.modelContext.getTools()
const read = tools.find((tool) => tool.name === "squig_read_canvas")
const raw = await document.modelContext.executeTool(read, {})
// The current draft serializes the callback result as JSON text.
const result = JSON.parse(raw)
const { documentId } = JSON.parse(result.content[0].text)
const add = tools.find((tool) => tool.name === "squig_add_component")
await document.modelContext.executeTool(add, {
  documentId,
  kind: "button",
  at: { x: 160, y: 200, props: { label: "Continue" } },
})
```

Browser agents normally discover and invoke these tools through the browser's
own interface. They do not need to run this JavaScript themselves. If no
model context is exposed, use the documented `window.squig` console API or
the local companion MCP server instead. See [the agent guide](agents.md).

## Verification and limits

Run `pnpm test webmcp` for schemas, live store edits, undo/redo, atomic failed
batches, input errors, cancellation, document switching, invitation readiness,
modern/legacy cleanup, asynchronous rejection and remount races. It is part
of the standard `pnpm test` gate.

For browser verification, run `pnpm dev`, discover tools using a browser
agent's WebMCP interface, create a component, check the canvas and inspector,
press Undo/Redo, and reload to check autosave. Navigate to `/kitchen-sink` to
check that the canvas's tools disappear, then return and check registration.
A test registry verifies application contracts; it does not establish browser
standards conformance. The in-app browser was also used to discover and call
these tools against the real page. This does not imply every browser or
agent supports the current draft.

## Primary sources

- [WebMCP explainer](https://github.com/webmachinelearning/webmcp): imperative vs. declarative APIs and tool design.
- [Current WebMCP specification](https://webmachinelearning.github.io/webmcp/): `Document.modelContext`, registration signals, callback cancellation, annotations and default origin exposure.
- [Chrome early preview announcement](https://developer.chrome.com/blog/webmcp-epp): experimental availability and the two integration APIs.
- [Move the API to Document](https://github.com/webmachinelearning/webmcp/pull/184): why older integrations may use Navigator.
