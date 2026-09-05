import { z } from "zod"
import { nanoid } from "nanoid"
import {
  authenticate,
  db,
  hash,
  token,
  rateLimit,
  type StoredDocument,
} from "@/lib/agent/db"
import { tools, type ToolName } from "@/lib/agent/schema"
import { execute, comments, publicDoc, addComment } from "@/lib/agent/service"
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
    if (path[0] === "review" && path.length === 2) {
      const capability =
        request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? ""
      if (!capability) throw new AgentError(401, "Review link required")
      const reviewIp = process.env.VERCEL
        ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
        : "self-host"
      await rateLimit(`review-ip:${reviewIp}`, 300)
      const rows =
        await db()`SELECT * FROM agent_documents WHERE id = ${path[1]} AND review_hash = ${hash(capability)}`
      if (!rows.length)
        throw new AgentError(404, "Review link is invalid or revoked")
      const row = rows[0] as StoredDocument
      if (request.method === "GET")
        return json({ ...publicDoc(row), comments: await comments(row.id) })
      if (request.method !== "POST")
        throw new AgentError(405, "Method not allowed")
      const a = z
        .discriminatedUnion("action", [
          z.object({
            action: z.literal("comment"),
            text: z.string().min(1).max(4000),
            variationId: z.string().optional(),
            nodeId: z.string().optional(),
          }),
          z.object({
            action: z.literal("approve"),
            variationId: z.string(),
            revision: z.number().int().positive(),
          }),
        ])
        .parse(await body(request))
      if (a.action === "comment")
        return json(await addComment(row, a, "reviewer"), 201)
      if (!row.document.variations.some((v) => v.id === a.variationId))
        throw new AgentError(400, "Choose an existing variation")
      const approval = {
        variationId: a.variationId,
        revision: a.revision,
        at: new Date().toISOString(),
      }
      const result =
        await db()`UPDATE agent_documents SET approval = ${JSON.stringify(approval)}::jsonb WHERE id = ${row.id} AND revision = ${a.revision} AND review_hash = ${hash(capability)} RETURNING id`
      if (!result.length)
        throw new AgentError(
          409,
          "This canvas changed. Reload before approving.",
        )
      return json({ approval })
    }
    const workspace = await authenticate(request)
    if (
      path.join("/") === "workspace/rotate-key" &&
      request.method === "POST"
    ) {
      const key = `sq_${token()}`
      await db()`UPDATE agent_workspaces SET key_hash = ${hash(key)} WHERE id = ${workspace}`
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
