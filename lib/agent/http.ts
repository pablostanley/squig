import { ZodError } from "zod"
import { randomUUID } from "node:crypto"
import { AgentError } from "./engine"
import { errorDiagnostics, storageFailure } from "./storage"
import type { ToolName } from "./schema"
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers })
}
export function failure(error: unknown, context?: { transport: "rest" | "mcp"; tool?: ToolName }) {
  if (error instanceof ZodError)
    return json({ error: "Invalid input", details: error.issues }, 400)
  if (error instanceof AgentError)
    return json({ error: error.message }, error.status)
  const storage = storageFailure(error)
  const errorId = randomUUID()
  console.error(JSON.stringify({
    event: "agent_request_failed",
    errorId,
    ...context,
    ...errorDiagnostics(error),
    code: storage?.code ?? "AGENT_INTERNAL_ERROR",
  }))
  if (storage) {
    return json({ error: storage.message, code: storage.code, errorId }, storage.status)
  }
  return json(
    {
      error:
        "Agent request failed. Retry or contact the instance operator with the error ID.",
      code: "AGENT_INTERNAL_ERROR",
      errorId,
    },
    500,
  )
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (
    origin &&
    origin !== new URL(request.url).origin &&
    origin !== process.env.SQUIG_PUBLIC_URL
  )
    throw new AgentError(403, "Cross-origin browser requests are not allowed")
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AgentError(415, "Use application/json")
  const reader = request.body?.getReader()
  if (!reader) throw new AgentError(400, "Missing JSON body")
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 4_500_000) {
      await reader.cancel()
      throw new AgentError(413, "Request exceeds 4.5 MB")
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new AgentError(400, "Malformed JSON")
  }
}
