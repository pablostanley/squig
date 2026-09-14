import { pages } from "@/lib/agent/docs"
export const dynamic = "force-static"
export function GET() {
  return new Response(
    `# Squig

> A local wireframing canvas for humans and their own agents. Edit the open canvas together; changes save automatically in browser storage or a chosen disk file.

## Documentation

${pages.map((p) => `- [${p.title}](https://squig.sh/docs/${p.slug}): ${p.description}`).join("\n")}

- [Complete docs](https://squig.sh/llms-full.txt)
- [Local API schemas](https://squig.sh/openapi.json)
- [Connect an agent](https://squig.sh/connect)

## Continue the open canvas

Connect agent in the canvas copies an invitation for an agent with access to that existing tab. Match its document ID with window.squig.documentId() or squig_read_canvas before editing. Use window.squig or supported WebMCP tools; edits share the canvas store, undo history and automatic browser saves. No download, installation or companion is required. A URL alone does not identify a browser drawing: another browser profile has separate storage, and a new tab may open another document. If the original tab is unavailable, explain that browser access is needed instead of creating or importing a substitute canvas.

## Optional local file setup

Use Node.js 24 and pnpm 10 in a real checkout of https://github.com/pablostanley/squig. Run pnpm install --frozen-lockfile and pnpm build:local once. Run pnpm squig serve /absolute/path/canvas.squig.json for the local editor and HTTP MCP, or configure direct Node stdio with scripts/squig.ts mcp and the file path as shown in /docs/mcp. No npx squig package is published.

Call squig_local_session and send its editorUrl before drawing. The companion serves the full editor on 127.0.0.1, owns one selected file, and keeps bounded local history. Keep the process running. MCP tools have a squig_ prefix; HTTP tools are POST /api/v1/tools/{name} on the actual loopback origin, with the same JSON and the session token as Authorization: Bearer. There is no public writable MCP endpoint or workspace signup.

Read the current document and revision before companion edits, preserve human changes, and inspect renders. Components, all node types, atomic edits, variations, notes, comments, history/restore, measurement and SVG/PNG are local tools. Only when the user chooses to move a browser drawing to a disk file, export a copy and start the companion for that saved path. Browser storage and disk copies are separate.

Existing online canvas links support temporary read-only recovery and export. Your agent still uses its own model provider, including that provider's data handling and charges.
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  )
}
