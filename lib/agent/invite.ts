/**
 * The one thing a person copies to bring an agent into a canvas.
 *
 * It is a plain message meant to be pasted into any agent's chat. Everything a
 * cold agent needs is in it: where the canvas is, the key that edits it, the
 * two ways to talk to the server, and where the longer guide lives. An agent
 * that can only make HTTP requests starts right away over REST; one with MCP
 * support can add the server itself or read the guide.
 *
 * The canvas link is the plain one, without the key fragment, so an agent
 * quoting it back does not leak the credential twice.
 */
export function agentInvite({
  origin,
  id,
  key,
}: {
  origin: string
  id: string
  key: string
}) {
  return [
    "Wireframe with me in Squig.",
    `Canvas: ${origin}/?agent=${id}`,
    `Key: ${key} (send as Authorization: Bearer; scoped to this canvas; keep it private)`,
    `MCP: ${origin}/mcp · REST: ${origin}/api/v1 · Agent guide: ${origin}/llms.txt`,
    `Start by reading the canvas (squig_get_document, or GET /api/v1/documents/${id}), then edit in small batches so I can watch.`,
  ].join("\n")
}

/** The MCP client entry for people who would rather configure once. */
export function mcpConfig({ origin, key }: { origin: string; key: string }) {
  return JSON.stringify(
    {
      mcpServers: {
        squig: {
          url: `${origin}/mcp`,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  )
}
