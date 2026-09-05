import { nanoid } from "nanoid"
import { tools, type ToolName } from "./schema"
import {
  AgentError,
  emptyDocument,
  applyOperations,
  validateDocument,
} from "./engine"
import { db, hash, token, owned, save, type StoredDocument } from "./db"
import { ALL_DEFS, getDef, searchAll } from "@/lib/library/registry"

export const origin = () =>
  process.env.SQUIG_PUBLIC_URL ??
  (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://squig.sh")
export const publicDoc = (row: StoredDocument) => ({
  id: row.id,
  revision: row.revision,
  document: row.document,
  approval: row.approval,
  updatedAt: row.updated_at,
  editorUrl: `${origin()}/?agent=${row.id}`,
})
export async function comments(id: string) {
  return await db()`SELECT id, text, author, node_id AS "nodeId", variation_id AS "variationId", resolved, created_at AS "createdAt" FROM agent_comments WHERE document_id = ${id} ORDER BY created_at`
}
export async function execute(
  name: ToolName,
  input: unknown,
  workspace: string,
) {
  const args = tools[name].schema.parse(input)
  // Each branch parses its own schema to preserve discriminated input types.
  switch (name) {
    case "catalog": {
      const a = tools.catalog.schema.parse(args)
      const defs = a.kind
        ? [getDef(a.kind)].filter(Boolean)
        : searchAll(a.query)
      return {
        total: ALL_DEFS.length,
        components: defs.map((d) => {
          const { render: _, ...metadata } = d!
          void _
          return metadata
        }),
      }
    }
    case "documents": {
      const rows =
        await db()`SELECT id, document->>'fileName' AS name, revision, updated_at AS "updatedAt" FROM agent_documents WHERE workspace_id = ${workspace} ORDER BY updated_at DESC LIMIT 100`
      return { documents: rows }
    }
    case "create_document": {
      const a = tools.create_document.schema.parse(args),
        id = nanoid(20),
        reviewToken = token(),
        document = emptyDocument(a.name)
      const rows = await db()`WITH inserted AS (
        INSERT INTO agent_documents (id, workspace_id, document, review_hash)
        SELECT ${id}, ${workspace}, ${JSON.stringify(document)}::jsonb, ${hash(reviewToken)}
        WHERE (SELECT count(*) FROM agent_documents WHERE workspace_id = ${workspace}) < 100 RETURNING *
      ), recorded AS (INSERT INTO agent_revisions (document_id, revision, document) SELECT id, revision, document FROM inserted RETURNING document_id)
      SELECT inserted.* FROM inserted JOIN recorded ON recorded.document_id = inserted.id`
      if (!rows.length)
        throw new AgentError(429, "Workspace document limit reached (100)")
      return {
        ...publicDoc(rows[0] as StoredDocument),
        reviewUrl: `${origin()}/review?id=${id}#${reviewToken}`,
      }
    }
    case "get_document": {
      const a = tools.get_document.schema.parse(args)
      return {
        ...publicDoc(await owned(workspace, a.documentId)),
        comments: await comments(a.documentId),
      }
    }
    case "edit_document": {
      const a = tools.edit_document.schema.parse(args),
        row = await owned(workspace, a.documentId)
      if (row.revision !== a.revision)
        throw new AgentError(409, "Revision conflict; read latest first")
      const result = applyOperations(row.document, a.operations)
      return {
        ...publicDoc(
          await save(workspace, row.id, a.revision, result.document),
        ),
        createdIds: result.createdIds,
      }
    }
    case "replace_document": {
      const a = tools.replace_document.schema.parse(args),
        row = await owned(workspace, a.documentId)
      const document = validateDocument({
        ...row.document,
        ...a.document,
        look: a.document.look ?? row.document.look,
      } as typeof row.document)
      return publicDoc(await save(workspace, row.id, a.revision, document))
    }
    case "history": {
      const a = tools.history.schema.parse(args)
      await owned(workspace, a.documentId)
      return {
        revisions:
          await db()`SELECT revision, created_at AS "createdAt", document->>'fileName' AS name FROM agent_revisions WHERE document_id = ${a.documentId} ORDER BY revision DESC LIMIT 50`,
      }
    }
    case "restore": {
      const a = tools.restore.schema.parse(args)
      await owned(workspace, a.documentId)
      const rows =
        await db()`SELECT document FROM agent_revisions WHERE document_id = ${a.documentId} AND revision = ${a.targetRevision}`
      if (!rows.length) throw new AgentError(404, "Revision not found")
      return publicDoc(
        await save(workspace, a.documentId, a.revision, rows[0].document),
      )
    }
    case "comment": {
      const a = tools.comment.schema.parse(args)
      const row = await owned(workspace, a.documentId)
      return addComment(row, a, "agent")
    }
    case "resolve_comment": {
      const a = tools.resolve_comment.schema.parse(args)
      await owned(workspace, a.documentId)
      const rows =
        await db()`UPDATE agent_comments SET resolved = ${a.resolved} WHERE id = ${a.commentId} AND document_id = ${a.documentId} RETURNING id`
      if (!rows.length) throw new AgentError(404, "Comment not found")
      return { resolved: a.resolved }
    }
    case "export_document": {
      const a = tools.export_document.schema.parse(args),
        row = await owned(workspace, a.documentId)
      return {
        format: "squig.json",
        ...publicDoc(row),
        file: { app: "squig", version: 1, ...row.document },
        handoff: {
          approved: row.approval,
          variations: row.document.variations,
          comments: await comments(row.id),
          instruction:
            "Build only the direction explicitly chosen by the user. An approval applies to its exact revision. Preserve content, hierarchy and layout; choose production styling separately.",
        },
      }
    }
    case "render_document": {
      const a = tools.render_document.schema.parse(args),
        row = await owned(workspace, a.documentId)
      const { renderSvg } = await import("./render")
      const rendered = renderSvg(row.document, a.variationId)
      if (a.format === "svg")
        return {
          ...rendered,
          mimeType: "image/svg+xml",
          revision: row.revision,
        }
      const { default: sharp } = await import("sharp")
      const png = await sharp(Buffer.from(rendered.svg), {
        limitInputPixels: 2400 * 2400,
      })
        .png()
        .toBuffer()
      return {
        mimeType: "image/png",
        base64: png.toString("base64"),
        bounds: rendered.bounds,
        revision: row.revision,
      }
    }
    case "delete_document": {
      const a = tools.delete_document.schema.parse(args)
      await owned(workspace, a.documentId)
      const rows =
        await db()`DELETE FROM agent_documents WHERE id = ${a.documentId} AND workspace_id = ${workspace} AND revision = ${a.revision} RETURNING id`
      if (!rows.length)
        throw new AgentError(409, "Revision conflict; read latest first")
      return { deleted: a.documentId }
    }
    case "rotate_review_link": {
      const a = tools.rotate_review_link.schema.parse(args)
      await owned(workspace, a.documentId)
      const reviewToken = token()
      await db()`UPDATE agent_documents SET review_hash = ${hash(reviewToken)} WHERE id = ${a.documentId} AND workspace_id = ${workspace}`
      return {
        reviewUrl: `${origin()}/review?id=${a.documentId}#${reviewToken}`,
      }
    }
  }
}
export async function addComment(
  row: StoredDocument,
  a: { text: string; nodeId?: string; variationId?: string },
  author: string,
) {
  if (a.nodeId && !Object.hasOwn(row.document.nodes, a.nodeId))
    throw new AgentError(400, "Unknown node")
  if (
    a.variationId &&
    !row.document.variations.some((v) => v.id === a.variationId)
  )
    throw new AgentError(400, "Unknown variation")
  const id = nanoid(16)
  await db()`INSERT INTO agent_comments (id,document_id,text,author,node_id,variation_id) VALUES (${id},${row.id},${a.text},${author},${a.nodeId ?? null},${a.variationId ?? null})`
  return { id }
}
