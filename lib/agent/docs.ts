export interface DocSection {
  title: string
  text: string
  code?: string
}
export interface DocPage {
  slug: string
  title: string
  description: string
  sections: DocSection[]
}
export const pages: DocPage[] = [
  {
    slug: "getting-started",
    title: "Wireframe with your agent",
    description:
      "Create three directions in Squig, review them with your team, and hand the chosen wireframe back to your coding agent.",
    sections: [
      {
        title: "Give the idea a little room",
        text: "Squig gives your coding agent an editable canvas with real UI components, shapes, text, images, freehand strokes and connectors. You get a private link to compare ideas before investing in code. The agent uses its own model; Squig does not require another AI subscription.",
      },
      {
        title: "Connect once",
        text: "Open /connect, create a workspace key, and save it privately. This browser remembers it. Add the MCP server to Codex, Claude Code, Cursor, or another client that supports Streamable HTTP with bearer authentication. The MCP setup page has exact configurations.",
      },
      {
        title: "Ask for distinct directions",
        text: "Ask the agent to search the component library, create a document, and explore three different layouts. Each variation should have a title, rationale and its own member nodes. Good variations change the content hierarchy or interaction model. Changing only color is not a new direction.",
        code: "Sketch a book club homepage in Squig. Explore three directions: the next meeting first, the current book first, and a member-led reading journal. Use real copy, label the tradeoffs, and send me the review link before writing code.",
      },
      {
        title: "Review and revise",
        text: "Open the full review link. Select a variation to inspect it without the other canvases in the way. Leave a note on that variation or on the whole canvas. The page refreshes automatically. Ask your agent to read the notes, make changes, and resolve the feedback it addressed. You can edit directly in the main canvas by connecting the same workspace key in your browser.",
      },
      {
        title: "Choose, then build",
        text: "Choose a variation on the review page. The choice records the current revision. Canvas changes clear approval so an old decision cannot silently authorize a new design. Ask the agent to export the handoff and implement the approved direction in your project. Squig itself does not generate or deploy the production site.",
      },
      {
        title: "Bring an existing sketch",
        text: "Open a local Squig canvas and choose Share with agent. Squig creates an online copy in your connected workspace. The original browser file remains available. Your agent can list the workspace documents and continue that canvas.",
      },
    ],
  },
  {
    slug: "mcp",
    title: "Install the Squig MCP server",
    description:
      "Connect Codex, Claude Code, Cursor and other MCP clients to Squig’s remote Streamable HTTP server using a scoped workspace key.",
    sections: [
      {
        title: "Server and authentication",
        text: "The server is https://squig.sh/mcp on a deployed instance, or your own instance’s /mcp endpoint. Create a key at /connect. Every request requires Authorization: Bearer <workspace key>. This release uses bearer keys, not an OAuth login flow. Clients that only support OAuth cannot connect directly. The server is stateless Streamable HTTP with JSON responses; it does not offer legacy SSE or a persistent event stream.",
      },
      {
        title: "Codex",
        text: "Set SQUIG_API_KEY in the environment that launches Codex. Avoid putting the key in source control or pasting it into a task. Then run:",
        code: "codex mcp add squig --url https://squig.sh/mcp --bearer-token-env-var SQUIG_API_KEY",
      },
      {
        title: "Codex configuration file",
        text: "The equivalent entry in ~/.codex/config.toml is below. Restart or reconnect the client after changing its environment or MCP configuration.",
        code: '[mcp_servers.squig]\nurl = "https://squig.sh/mcp"\nbearer_token_env_var = "SQUIG_API_KEY"',
      },
      {
        title: "Claude Code",
        text: "Set SQUIG_API_KEY privately in your shell, then add the HTTP server. Claude Code stores the expanded header in its local MCP configuration; protect that file. Use user scope to keep it out of the repository.",
        code: 'claude mcp add --transport http --scope user squig https://squig.sh/mcp --header "Authorization: Bearer $SQUIG_API_KEY"',
      },
      {
        title: "Cursor and generic MCP clients",
        text: "Use this server entry in a private MCP configuration. Replace YOUR_WORKSPACE_KEY locally. Cursor supports remote HTTP servers through the url field. Do not commit a configuration containing a key.",
        code: '{\n  "mcpServers": {\n    "squig": {\n      "url": "https://squig.sh/mcp",\n      "headers": { "Authorization": "Bearer YOUR_WORKSPACE_KEY" }\n    }\n  }\n}',
      },
      {
        title: "Tools, resources and prompts",
        text: "Every API command is also an MCP tool with a squig_ prefix. Start with squig_catalog and squig_create_document. The server exposes squig://guides/wireframing as a text resource and wireframe-first as a prompt. Tool schemas include descriptions and read-only/destructive annotations. Tool errors carry isError with an HTTP-style status and an actionable message.",
      },
      {
        title: "Troubleshooting",
        text: "401 means the key is missing, invalid or rotated. 403 means a browser origin is not allowed. 409 means the document revision changed; read it and reconcile. 429 means the request quota was reached. 503 means the instance’s database is not configured. A GET /mcp returning 405 is expected: tools use POST. Check that your client sends Accept: application/json, text/event-stream and supports Streamable HTTP.",
      },
    ],
  },
  {
    slug: "api",
    title: "Squig API reference",
    description:
      "REST endpoints, authentication, JSON schemas, errors and examples for creating and editing wireframes programmatically.",
    sections: [
      {
        title: "One command model",
        text: "REST and MCP call the same validated command layer. REST uses POST /api/v1/tools/{name}; MCP uses squig_{name}. The complete machine-readable schema lives at /openapi.json. A tool input that works through REST works unchanged through MCP.",
      },
      {
        title: "Create a workspace",
        text: "POST /api/v1/workspaces with a name returns an id and key once. The public signup endpoint allows five workspaces per day per trusted client address on Vercel. Self-hosted instances use a shared limit unless a trusted reverse proxy policy is added. Workspace keys are stored as SHA-256 hashes. Keep the returned key private.",
        code: 'curl -X POST https://squig.sh/api/v1/workspaces \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"My wireframes"}\'',
      },
      {
        title: "Create a document",
        text: "All subsequent agent requests require a bearer workspace key. Creating a document returns a private review URL whose fragment contains its review capability. Save the full URL. GET does not return the secret again; rotate_review_link issues a replacement and revokes the previous one.",
        code: 'curl https://squig.sh/api/v1/documents \\\n  -H "Authorization: Bearer $SQUIG_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"Book club homepage"}\'',
      },
      {
        title: "Read and discover",
        text: "GET /api/v1/documents lists the newest 100 documents in the workspace. GET /api/v1/documents/{id} reads one with its revision, comments and approval. GET /api/v1/catalog?q=hero searches all components; ?kind=button returns one definition with defaults, dimensions and controls.",
      },
      {
        title: "Atomic canvas editing",
        text: "Send the current revision with every canvas mutation. All operations succeed together or none are saved. Explicit node IDs make a batch easy to reference. Successful edits return createdIds and the new revision. If a request times out, read the document before retrying: do not assume it failed.",
        code: '{\n  "documentId": "DOCUMENT_ID",\n  "revision": 1,\n  "operations": [\n    {"op":"add","nodes":[\n      {"id":"title","type":"text","x":80,"y":60,"w":520,"h":64,"fontSize":36,"text":"A good book. Better company."},\n      {"id":"join","type":"component","kind":"button","x":80,"y":160,"props":{"label":"Join the next meeting"}}\n    ]},\n    {"op":"variation","id":"meeting-first","title":"Meeting first","description":"Make the next gathering easy to find.","nodeIds":["title","join"]},\n    {"op":"note","x":660,"y":60,"text":"This direction puts attending ahead of browsing."}\n  ]\n}',
      },
      {
        title: "Limits and errors",
        text: "Limits: 240 authenticated requests per workspace per minute, 100 documents per workspace, 5000 nodes per document, 100 operations per batch, 1000 nodes per add, 4 MB document JSON and 4.5 MB request bytes. History returns the latest 50 revisions; older revisions remain restorable by number. Errors are JSON with error and optional validation details. Status codes include 400, 401, 403, 404, 409, 413, 415, 429 and 503. No cross-origin browser API access is enabled.",
      },
      {
        title: "Keys and review links",
        text: "POST /api/v1/workspace/rotate-key replaces the authenticated workspace key and returns the new one. Existing keys stop working immediately; update agents and connected browsers. Review links are separate, document-scoped capabilities: their holders can read, comment and choose a direction, but cannot edit the canvas or list workspace documents. rotate_review_link revokes a document’s previous capability.",
      },
    ],
  },
  {
    slug: "canvas-tools",
    title: "Canvas tools and document model",
    description:
      "All supported wireframe operations, node types, library properties, variations and the coordinate system for agents.",
    sections: [
      {
        title: "The canvas is a flat document",
        text: "A document has fileName, nodes (an ID-to-node map), order (back to front), look and variations. Coordinates are world pixels on an infinite plane: x increases right, y increases down. Each node has id, type, x, y, w, h and a stable drawing seed. Components default to the catalog size. Use explicit dimensions for text. Groups are groupIds arrays, outermost first, not container nodes or automatic layouts.",
      },
      {
        title: "The complete node vocabulary",
        text: "component: kind plus props from the catalog. shape: rect or ellipse with fill. text: text and fontSize, with align, verticalAlign, fixedW/fixedH, bold, italic, underline, link and optional box styling. arrow: two points relative to its origin, head, optional bind/anchors and straight/elbow/curved lineStyle. draw: relative freehand points. image: raster data URL, naturalW/naturalH and optional normalized crop. All support geometry, groupIds, flipX/flipY and locked.",
      },
      {
        title: "Create and modify",
        text: "add inserts any node type. update merges node fields, and merges props for component instances; IDs and node types cannot change. Optional fields can be reset with a patch entry’s unset array (for example removing crop restores a full image, removing snap restores connector snapping). This covers moving, resizing, variant switching, text editing and styling, image crop, connector binding, fill, strokes and locking. delete removes named nodes and settles arrow bindings. note creates a boxed text annotation. rename and look update document presentation. Arbitrary JavaScript or external URL fetching is never executed.",
      },
      {
        title: "Compose and arrange",
        text: "duplicate clones nodes with remapped group and connector IDs and dx/dy offsets. group prepends a group path; ungroup removes one outer path level. detach converts component drawing primitives into editable nodes. align supports left, right, top, bottom, hcenter and vcenter. distribute uses x or y and even gaps. reorder supports front, back, forward and backward. flip mirrors a node’s visual content horizontally or vertically. Use update geometry for moving an entire composition; no DOM or CSS layout engine is involved.",
      },
      {
        title: "Locked nodes and explicit scope",
        text: "Operations act on exactly the IDs supplied. Include all group members when editing a whole group. Locked nodes reject mutations until explicitly unlocked with an update containing only locked:false. Duplication and variation membership can read locked nodes. To change every button, first read the canvas, select its button IDs, then submit patches for those nodes.",
      },
      {
        title: "Variations and notes",
        text: "variation creates or updates a named set of member node IDs with a title and description. Place directions side by side, include their annotations in nodeIds when you want them visible in the focused view, and make the rationale specific. Removing a member node removes its variation unless that variation is updated in the same batch. remove_variation removes a named direction without deleting its nodes. Review comments stay in their own list; resolve them after addressing the feedback.",
      },
      {
        title: "Undo, export and visual inspection",
        text: "history and restore are durable revision-based undo. restore records a new revision and clears approval. export_document returns portable .squig.json plus the chosen variation, feedback and implementation guidance. render_document returns SVG or a PNG image directly to the agent. Drawing paths match the canvas; server font availability can differ, so use a browser screenshot for final typography checks. The browser also exports SVG and PNG. Pan, zoom, selection and the clipboard remain browser UI state; agents edit the same underlying geometry directly.",
      },
    ],
  },
  {
    slug: "plugin",
    title: "Squig agent plugin",
    description:
      "Install the Squig wireframing workflow for Codex and other agents, alongside the remote MCP server.",
    sections: [
      {
        title: "A workflow, with the canvas attached",
        text: "The repository includes plugins/squig: a Codex plugin manifest, a remote MCP definition, and a wireframing skill. The skill tells agents to inspect the catalog, explore distinct layouts, share a review link, read feedback, and wait for a chosen direction before implementation. The remote MCP server supplies the actual canvas tools.",
      },
      {
        title: "Install from the repository",
        text: "Clone the Squig repository and add its bundled local marketplace to Codex, then install the Squig plugin. The repository includes .agents/plugins/marketplace.json and plugins/squig. Restart the client or start a new task after installation. If your client does not support plugins, use the MCP setup directly; the wireframe-first skill is also plain Markdown.",
      },
      {
        title: "Install with the CLI",
        text: "Run these commands from the cloned repository. A preview branch must be checked out before installation until this feature is merged.",
        code: "codex plugin marketplace add .\ncodex plugin add squig@squig-plugins",
      },
      {
        title: "Configure credentials",
        text: "Create a workspace key at /connect and set SQUIG_API_KEY in the environment where your agent runs. The plugin’s .mcp.json references that environment variable. If your client does not expand variables in headers, use Codex’s bearer_token_env_var configuration from the MCP guide. Never commit your actual key into the plugin files.",
      },
      {
        title: "Use the skill",
        text: "Ask the agent to use Squig to wireframe a page or app before building it. The skill does not install code into your project, choose a framework or deploy a site. It gives your existing coding agent a repeatable design review step. Other agents can read the same skill as Markdown or use /llms.txt and the MCP guide resource.",
      },
    ],
  },
  {
    slug: "self-hosting",
    title: "Self-host Squig’s agent tools",
    description:
      "Run the Next.js MCP and REST server with Neon Postgres, migrations, environment settings and deployment checks.",
    sections: [
      {
        title: "Requirements",
        text: "Use Node.js 22 or newer, pnpm 10, and a Neon Postgres database. The existing offline canvas works without a database. Agent endpoints fail explicitly with 503 until DATABASE_URL is configured. The provisioned database is the durable source of truth; process memory and browser storage are never used as a cloud persistence fallback.",
      },
      {
        title: "Install and migrate",
        text: "Create a Neon database through the Vercel Marketplace or your own Neon account. Set DATABASE_URL in .env.local. Set SQUIG_PUBLIC_URL to the public origin of your instance (http://localhost:3000 for local development). The app uses this value for returned review/editor links. Keep secrets out of NEXT_PUBLIC_ variables.",
        code: "pnpm install --frozen-lockfile\nnode --env-file=.env.local scripts/agent/migrate.mjs\npnpm dev",
      },
      {
        title: "Deployment",
        text: "Run the additive, idempotent migration before serving traffic. On Vercel, connect the database integration to the deployment environments and configure SQUIG_PUBLIC_URL. Run pnpm test, pnpm test:agent, pnpm lint and pnpm build. Verify a preview with the MCP integration smoke test before promoting it. All API and MCP routes use the Node.js runtime. Back up the database and set retention/budget policies suitable for your instance.",
      },
      {
        title: "Storage and access",
        text: "agent_workspaces stores hashed workspace keys. agent_documents stores current JSON, revision, review hash and approval. agent_revisions stores immutable canvas versions. agent_comments stores feedback. agent_limits stores one counter per hashed quota key. Canvas saves and revision records are written in one SQL statement. The revision predicate provides compare-and-swap conflict detection across server instances.",
      },
      {
        title: "Operating an instance",
        text: "Set signup limits appropriate for your audience, and configure network or platform rate limiting for hostile traffic. This release is capability-based: there are no user accounts, named reviewer identities, email invitations, OAuth, billing or account recovery. Anyone holding a review link can comment or choose a direction. Delete abandoned workspaces administratively with a parameterized SQL query; document, revision and comment rows cascade. There is no automatic expiry. Keys and private links must not appear in logs or analytics.",
      },
      {
        title: "Offline packaging",
        text: "The Webxdc build excludes server-only routes and includes the original offline canvas. Agent connection and review features require the hosted Next.js server and are unavailable in the offline package.",
      },
    ],
  },
]
export function markdown(page: DocPage) {
  return (
    "# " +
    page.title +
    "\n\n" +
    page.description +
    "\n\n" +
    page.sections
      .map(
        (s) =>
          "## " +
          s.title +
          "\n\n" +
          s.text +
          "\n" +
          (s.code ? "\n```\n" + s.code + "\n```\n" : ""),
      )
      .join("\n")
  )
}
