import { authenticate } from "@/lib/agent/db"
import { execute } from "@/lib/agent/service"
import { AgentError } from "@/lib/agent/engine"
import { checkOrigin, failure, json } from "@/lib/agent/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    checkOrigin(request)
    const { path } = await context.params
    if (path[0] !== "documents" || path.length > 2) throw new AgentError(404, "Only recovery of existing online canvases is available here. See /docs/mcp for local tools.")
    // Recovery must remain possible when the old database cannot accept writes.
    const principal = await authenticate(request, { readOnly: true })
    return json(await execute(path.length === 1 ? "documents" : "get_document", path.length === 1 ? {} : { documentId: path[1] }, principal))
  } catch (error) { return failure(error, { transport: "rest" }) }
}

export function POST() {
  return json({ error: "Hosted editing has retired. Use the local Squig companion to edit files on your computer. Existing canvases can be recovered at /connect.", code: "SQUIG_LOCAL_ONLY", guide: "/docs/mcp" }, 410)
}
