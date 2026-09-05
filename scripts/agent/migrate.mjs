import { neon } from "@neondatabase/serverless"
if (!process.env.DATABASE_URL)
  throw new Error(
    "Load DATABASE_URL, e.g. node --env-file=.env.local scripts/agent/migrate.mjs",
  )
const sql = neon(process.env.DATABASE_URL)
await sql.transaction([
  sql`CREATE TABLE IF NOT EXISTS agent_workspaces (id text PRIMARY KEY, name text NOT NULL, key_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE TABLE IF NOT EXISTS agent_documents (id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE, document jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, review_hash text UNIQUE NOT NULL, approval jsonb, updated_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE INDEX IF NOT EXISTS agent_documents_workspace ON agent_documents(workspace_id, updated_at DESC)`,
  sql`CREATE TABLE IF NOT EXISTS agent_revisions (document_id text NOT NULL REFERENCES agent_documents(id) ON DELETE CASCADE, revision integer NOT NULL, document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id, revision))`,
  sql`CREATE TABLE IF NOT EXISTS agent_comments (id text PRIMARY KEY, document_id text NOT NULL REFERENCES agent_documents(id) ON DELETE CASCADE, text text NOT NULL, author text NOT NULL, node_id text, variation_id text, resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE INDEX IF NOT EXISTS agent_comments_document ON agent_comments(document_id, created_at)`,
  sql`CREATE TABLE IF NOT EXISTS agent_limits (key text PRIMARY KEY, bucket bigint NOT NULL, count integer NOT NULL)`,
])
console.log("Agent database schema is ready.")
