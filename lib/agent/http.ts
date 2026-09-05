import { ZodError } from "zod"
import { AgentError } from "./engine"
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers })
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return json({ error: "Invalid input", details: error.issues }, 400)
  if (error instanceof AgentError)
    return json({ error: error.message }, error.status)
  console.error(
    "Agent request failed",
    error instanceof Error ? error.message : "Unknown error",
  )
  return json(
    {
      error:
        "Agent storage request failed. Retry or contact the instance operator.",
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
