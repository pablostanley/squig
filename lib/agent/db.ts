import { neon } from "@neondatabase/serverless"
import { createHash, randomBytes } from "node:crypto"
import { AgentError, type CanvasDocument } from "./engine"
import { StorageError } from "./storage"
import { keyKind } from "./credentials"

export const token = () => randomBytes(32).toString("base64url")
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function db() {
  if (!process.env.DATABASE_URL?.trim())
    throw new StorageError("AGENT_STORAGE_UNCONFIGURED")
  try {
    return neon(process.env.DATABASE_URL, {
      fetchOptions: { signal: AbortSignal.timeout(10_000) },
    })
  } catch {
    throw new StorageError("AGENT_STORAGE_UNAVAILABLE")
  }
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
  options: { readOnly?: boolean } = {},
): Promise<AgentPrincipal> {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1]
  if (!bearer)
    throw new AgentError(
      401,
      "Supply your original canvas or workspace key to recover an existing online canvas.",
    )
  const kind = keyKind(bearer)
  if (!kind) throw new AgentError(401, "Invalid key format")
  if (kind === "canvas") {
    const rows =
      await db()`SELECT id, workspace_id FROM agent_documents WHERE canvas_hash = ${hash(bearer)}`
    if (!rows.length)
      throw new AgentError(401, "Invalid or revoked canvas key")
    if (!options.readOnly) await rateLimit(`canvas:${rows[0].id}`, 600)
    return {
      workspaceId: rows[0].workspace_id as string,
      documentId: rows[0].id as string,
    }
  }
  const rows =
    await db()`SELECT id FROM agent_workspaces WHERE key_hash = ${hash(bearer)}`
  if (!rows.length)
    throw new AgentError(401, "Invalid or revoked workspace key")
  if (!options.readOnly) await rateLimit(`workspace:${rows[0].id}`, 240)
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
  // Lock before comparing: an unchanged save must still reject a stale revision.
  // jsonb equality also ignores object key order and omitted optional fields.
  const payload = JSON.stringify(document)
  const rows = await db()`WITH current AS MATERIALIZED (
    SELECT * FROM agent_documents
    WHERE id = ${id} AND workspace_id = ${workspace} AND revision = ${revision} FOR UPDATE
  ), changed AS (
    UPDATE agent_documents AS target SET document = ${payload}::jsonb, revision = target.revision + 1, updated_at = now()
    FROM current WHERE target.id = current.id AND current.document IS DISTINCT FROM ${payload}::jsonb RETURNING target.*
  ), recorded AS (
    INSERT INTO agent_revisions (document_id, revision, document) SELECT id, revision, document FROM changed RETURNING revision
  ) SELECT changed.* FROM changed JOIN recorded USING (revision)
    UNION ALL SELECT current.* FROM current WHERE current.document = ${payload}::jsonb`
  if (!rows.length)
    throw new AgentError(
      409,
      "Revision conflict. Read the latest document and reconcile before retrying.",
    )
  return rows[0] as StoredDocument
}
