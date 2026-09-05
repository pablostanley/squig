import { neon } from "@neondatabase/serverless"
import { createHash, randomBytes } from "node:crypto"
import { AgentError, type CanvasDocument } from "./engine"

export const token = () => randomBytes(32).toString("base64url")
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function db() {
  if (!process.env.DATABASE_URL)
    throw new AgentError(
      503,
      "Agent storage is not configured. See /docs/self-hosting.",
    )
  return neon(process.env.DATABASE_URL)
}
export interface StoredDocument {
  id: string
  workspace_id: string
  revision: number
  document: CanvasDocument
  updated_at: string
}
export interface AgentPrincipal {
  workspaceId: string
  documentId?: string
}
export async function authenticate(
  request: Request,
): Promise<AgentPrincipal> {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1]
  if (!bearer)
    throw new AgentError(
      401,
      "Supply Authorization: Bearer <key>. Get a canvas key from Connect agent in the editor, or a workspace key at /connect.",
    )
  if (bearer.startsWith("sq_canvas_")) {
    const rows =
      await db()`SELECT id, workspace_id FROM agent_documents WHERE canvas_hash = ${hash(bearer)}`
    if (!rows.length)
      throw new AgentError(401, "Invalid or revoked canvas key")
    await rateLimit(`canvas:${rows[0].id}`, 600)
    return {
      workspaceId: rows[0].workspace_id as string,
      documentId: rows[0].id as string,
    }
  }
  const rows =
    await db()`SELECT id FROM agent_workspaces WHERE key_hash = ${hash(bearer)}`
  if (!rows.length)
    throw new AgentError(401, "Invalid or revoked workspace key")
  await rateLimit(`workspace:${rows[0].id}`, 240)
  return { workspaceId: rows[0].id as string }
}
export async function rateLimit(key: string, limit: number, seconds = 60) {
  const bucket = Math.floor(Date.now() / (seconds * 1000))
  const rows =
    await db()`INSERT INTO agent_limits (key, bucket, count) VALUES (${hash(key)}, ${bucket}, 1)
    ON CONFLICT (key) DO UPDATE SET bucket = EXCLUDED.bucket,
    count = CASE WHEN agent_limits.bucket = EXCLUDED.bucket THEN agent_limits.count + 1 ELSE 1 END RETURNING count`
  if (rows[0].count > limit)
    throw new AgentError(429, "Too many requests. Try again later.")
}
export async function owned(
  workspace: string,
  id: string,
): Promise<StoredDocument> {
  const rows =
    await db()`SELECT * FROM agent_documents WHERE id = ${id} AND workspace_id = ${workspace}`
  if (!rows.length) throw new AgentError(404, "Document not found")
  return rows[0] as StoredDocument
}
export async function save(
  workspace: string,
  id: string,
  revision: number,
  document: CanvasDocument,
) {
  const rows = await db()`WITH changed AS (
    UPDATE agent_documents SET document = ${JSON.stringify(document)}::jsonb, revision = revision + 1, updated_at = now()
    WHERE id = ${id} AND workspace_id = ${workspace} AND revision = ${revision} RETURNING *
  ), recorded AS (
    INSERT INTO agent_revisions (document_id, revision, document) SELECT id, revision, document FROM changed RETURNING revision
  ) SELECT changed.* FROM changed JOIN recorded USING (revision)`
  if (!rows.length)
    throw new AgentError(
      409,
      "Revision conflict. Read the latest document and reconcile before retrying.",
    )
  return rows[0] as StoredDocument
}
