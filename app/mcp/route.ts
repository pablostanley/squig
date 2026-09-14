import { json } from "@/lib/agent/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
function retired() {
  return json({ error: "Squig MCP now runs on your computer with a local .squig.json file. Follow /docs/mcp to connect your agent. Recover existing online canvases at /connect.", code: "SQUIG_LOCAL_ONLY", guide: "https://squig.sh/docs/mcp" }, 410)
}
export const GET = retired
export const POST = retired
export const DELETE = retired
