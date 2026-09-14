import { db } from "./db"
import { StorageError, storageFailure } from "./storage"

export const requiredColumns = {
  agent_workspaces: "id, name, key_hash, created_at",
  agent_documents: "id, workspace_id, document, revision, review_hash, canvas_hash, approval, updated_at",
  agent_revisions: "document_id, revision, document, created_at",
  agent_comments: "id, document_id, text, author, node_id, variation_id, resolved, created_at",
  agent_limits: "key, bucket, count",
}
type Query = (sql: string) => Promise<Record<string, unknown>[]>

/** Read-only and deliberately uncached: run against the deployment's own role. */
export async function checkReadiness(query: Query = (sql) => db().query(sql)) {
  try {
    const [mode] = await query("SELECT current_setting('transaction_read_only') AS read_only")
    if (mode?.read_only === "on") throw new StorageError("AGENT_STORAGE_READ_ONLY")
    // Neon enforces a cluster limit, including databases other than this one.
    // Other Postgres hosts have no such setting; their host monitors capacity.
    const [capacity] = await query(`SELECT pg_size_bytes(current_setting('neon.max_cluster_size', true))::text AS limit_bytes,
      CASE WHEN current_setting('neon.max_cluster_size', true) IS NOT NULL
      THEN (SELECT sum(pg_database_size(oid))::text FROM pg_database) END AS used_bytes`)
    const limitBytes = Number(capacity?.limit_bytes), usedBytes = Number(capacity?.used_bytes)
    if (limitBytes > 0 && usedBytes >= limitBytes * 0.9)
      throw new StorageError("AGENT_STORAGE_CAPACITY")
    for (const [table, columns] of Object.entries(requiredColumns)) {
      await query(`SELECT ${columns} FROM ${table} LIMIT 0`)
      const [access] = await query(`SELECT has_table_privilege(current_user, '${table}', 'SELECT')
        AND has_table_privilege(current_user, '${table}', 'INSERT')
        AND has_table_privilege(current_user, '${table}', 'UPDATE')
        AND has_table_privilege(current_user, '${table}', 'DELETE') AS allowed`)
      if (!access?.allowed) throw new StorageError("AGENT_STORAGE_PERMISSIONS")
    }
    const [review] = await query(`SELECT attnotnull FROM pg_attribute
      WHERE attrelid = 'agent_documents'::regclass AND attname = 'review_hash' AND NOT attisdropped`)
    if (!review || review.attnotnull !== false) throw new StorageError("AGENT_STORAGE_SCHEMA")
    return {
      ready: true,
      checks: ["connection", "read-write mode", "columns", "permissions", "nullable review_hash", ...(limitBytes > 0 ? ["storage headroom"] : [])],
      ...(limitBytes > 0 ? { capacity: { usedBytes, limitBytes } } : {}),
    }
  } catch (error) {
    throw storageFailure(error) ?? error
  }
}
