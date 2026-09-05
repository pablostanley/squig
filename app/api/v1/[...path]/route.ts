import { z } from "zod"
import { nanoid } from "nanoid"
import {
  authenticate,
  db,
  hash,
  token,
  rateLimit,
} from "@/lib/agent/db"
import { tools, type ToolName } from "@/lib/agent/schema"
import { execute } from "@/lib/agent/service"
import { AgentError } from "@/lib/agent/engine"
import { body, checkOrigin, failure, json } from "@/lib/agent/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    checkOrigin(request)
    const { path } = await context.params
    if (path.join("/") === "workspaces" && request.method === "POST") {
      const a = z
        .object({ name: z.string().min(1).max(100) })
        .parse(await body(request))
      // Vercel sets x-vercel-forwarded-for. Self hosts must set a trusted proxy header or use the global fallback.
      const ip = process.env.VERCEL
        ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
        : "self-host"
      await rateLimit(`signup:${ip}`, 5, 86400)
      const key = `sq_${token()}`,
        id = nanoid(20)
      await db()`INSERT INTO agent_workspaces (id,name,key_hash) VALUES (${id},${a.name},${hash(key)})`
      return json(
        {
          id,
          key,
          message:
            "Save this key. It is shown only once. It controls every document in this workspace.",
        },
        201,
      )
    }
    const workspace = await authenticate(request)
    if (
      path.join("/") === "workspace/rotate-key" &&
      request.method === "POST"
    ) {
      if (workspace.documentId) throw new AgentError(403, "Workspace key required")
      const key = `sq_${token()}`
      await db()`UPDATE agent_workspaces SET key_hash = ${hash(key)} WHERE id = ${workspace.workspaceId}`
      return json({ key })
    }
    if (
      path[0] === "tools" &&
      path.length === 2 &&
      request.method === "POST" &&
      Object.hasOwn(tools, path[1])
    )
      return json(
        await execute(path[1] as ToolName, await body(request), workspace),
      )
    if (path.join("/") === "catalog" && request.method === "GET")
      return json(
        await execute(
          "catalog",
          {
            query: new URL(request.url).searchParams.get("q") ?? "",
            kind: new URL(request.url).searchParams.get("kind") ?? undefined,
          },
          workspace,
        ),
      )
    if (path.join("/") === "documents") {
      if (request.method === "GET")
        return json(await execute("documents", {}, workspace))
      if (request.method === "POST")
        return json(
          await execute("create_document", await body(request), workspace),
          201,
        )
    }
    if (
      path[0] === "documents" &&
      path.length === 2 &&
      request.method === "GET"
    )
      return json(
        await execute("get_document", { documentId: path[1] }, workspace),
      )
    throw new AgentError(404, "Endpoint not found. See /docs/api.")
  } catch (error) {
    return failure(error)
  }
}
export const GET = handle
export const POST = handle
