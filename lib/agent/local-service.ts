import { nanoid } from "nanoid"
import { ALL_DEFS, getDef, searchAll } from "../library/registry"
import { loadIconsFor } from "../sketch/svg"
import { AgentError, applyOperations, diffNodes, validateDocument } from "./engine"
import { tools } from "./schema"
import { LOCAL_FILE_BYTES, type LocalSnapshot, type LocalStore } from "./local-store"

export const localTools = {
  catalog: tools.catalog,
  documents: { ...tools.documents, description: "Show the one local .squig.json file explicitly opened by this companion." },
  get_document: { ...tools.get_document, description: "Read the complete local file, variations, comments and revision token before editing. Revisions are opaque content tokens, not counters." },
  edit_document: tools.edit_document,
  replace_document: { ...tools.replace_document, description: "Save editable canvas fields into the local .squig.json at the expected revision, retaining local comments and surviving variations." },
  history: { ...tools.history, description: "List up to 50 local saved states, including the current file. Older backups are also capped at 16 MiB." },
  restore: tools.restore,
  comment: tools.comment,
  resolve_comment: tools.resolve_comment,
  export_document: { ...tools.export_document, description: "Export the portable local .squig.json and implementation handoff, including variations and comments. Nothing is uploaded." },
  measure_text: tools.measure_text,
  render_document: tools.render_document,
} as const
export type LocalToolName = keyof typeof localTools

const publicDoc = (snapshot: LocalSnapshot, store: LocalStore) => ({
  id: store.documentId, filePath: store.filePath, revision: snapshot.revision,
  updatedAt: snapshot.updatedAt, document: { ...snapshot.document, comments: snapshot.comments },
})

export async function executeLocal(name: LocalToolName, input: unknown, store: LocalStore) {
  if (!Object.hasOwn(localTools, name)) throw new AgentError(404, "Unknown local Squig tool.")
  const args = localTools[name].schema.parse(input)
  if ("documentId" in args && args.documentId !== store.documentId)
    throw new AgentError(404, "This companion can only access its selected local file. Read documents to find its ID.")
  switch (name) {
    case "catalog": {
      const a = localTools.catalog.schema.parse(args)
      if (!a.kind && !a.query) return {
        total: ALL_DEFS.length,
        components: ALL_DEFS.map(({ kind, name, category, group, size }) => ({ kind, name, category, group, size })),
        hint: "Pass query or kind for defaults and editable controls.",
      }
      const defs = a.kind ? [getDef(a.kind)].filter(Boolean) : searchAll(a.query)
      return { total: ALL_DEFS.length, components: defs.map((def) => {
        const { render: _, ...metadata } = def!
        void _
        return metadata
      }) }
    }
    case "documents": {
      const snapshot = await store.read()
      return { documents: [{ id: store.documentId, filePath: store.filePath, name: snapshot.document.fileName, revision: snapshot.revision, updatedAt: snapshot.updatedAt }] }
    }
    case "get_document": {
      const snapshot = await store.read()
      return { ...publicDoc(snapshot, store), comments: snapshot.comments }
    }
    case "edit_document": {
      const a = localTools.edit_document.schema.parse(args)
      let createdIds: string[] = [], changed = {}, deletedIds: string[] = []
      const saved = await store.mutate(a.revision, (current) => {
        const result = applyOperations(current.document, a.operations, LOCAL_FILE_BYTES)
        createdIds = result.createdIds
        const diff = diffNodes(current.document.nodes, result.document.nodes)
        changed = diff.changed
        deletedIds = diff.deletedIds
        return { ...current, document: result.document }
      })
      return {
        id: store.documentId, filePath: store.filePath, revision: saved.revision, updatedAt: saved.updatedAt,
        createdIds, changed, deletedIds, nodeCount: saved.document.order.length, variations: saved.document.variations,
      }
    }
    case "replace_document": {
      const a = localTools.replace_document.schema.parse(args)
      const saved = await store.mutate(a.revision, (current) => ({ ...current, document: validateDocument({
        ...current.document, ...a.document, look: a.document.look ?? current.document.look,
      } as typeof current.document, LOCAL_FILE_BYTES) }))
      return publicDoc(saved, store)
    }
    case "history":
      return { revisions: await store.history() }
    case "restore": {
      const a = localTools.restore.schema.parse(args)
      const target = await store.getRevision(a.targetRevision)
      const saved = await store.mutate(a.revision, (current) => ({ ...current, document: target.document }))
      return publicDoc(saved, store)
    }
    case "comment": {
      const a = localTools.comment.schema.parse(args), commentId = nanoid(16)
      const saved = await store.mutate(undefined, (current) => {
        if (a.nodeId && !Object.hasOwn(current.document.nodes, a.nodeId)) throw new AgentError(400, "Unknown node")
        if (a.variationId && !current.document.variations.some((variation) => variation.id === a.variationId)) throw new AgentError(400, "Unknown variation")
        return { ...current, comments: [...current.comments, {
          id: commentId, text: a.text, author: "agent", resolved: false, createdAt: new Date().toISOString(),
          ...(a.nodeId ? { nodeId: a.nodeId } : {}), ...(a.variationId ? { variationId: a.variationId } : {}),
        }] }
      })
      return { id: commentId, revision: saved.revision }
    }
    case "resolve_comment": {
      const a = localTools.resolve_comment.schema.parse(args)
      const saved = await store.mutate(undefined, (current) => {
        if (!current.comments.some((comment) => comment.id === a.commentId)) throw new AgentError(404, "Comment not found")
        return { ...current, comments: current.comments.map((comment) => comment.id === a.commentId ? { ...comment, resolved: a.resolved } : comment) }
      })
      return { resolved: a.resolved, revision: saved.revision }
    }
    case "export_document": {
      const snapshot = await store.read()
      return {
        format: "squig.json", ...publicDoc(snapshot, store),
        file: { ...snapshot.document, app: "squig", version: 1, comments: snapshot.comments },
        handoff: {
          variations: snapshot.document.variations, comments: snapshot.comments,
          instruction: "Build only the direction explicitly chosen by the user. Preserve content, hierarchy and layout; choose production styling separately.",
        },
      }
    }
    case "measure_text": {
      const a = localTools.measure_text.schema.parse(args), snapshot = await store.read()
      if (a.nodeIds?.some((nodeId) => !Object.hasOwn(snapshot.document.nodes, nodeId))) throw new AgentError(404, "Node not found")
      const { measureDocumentText } = await import("./text-metrics")
      return { revision: snapshot.revision, measurements: measureDocumentText(snapshot.document, a.nodeIds) }
    }
    case "render_document": {
      const a = localTools.render_document.schema.parse(args), snapshot = await store.read()
      const { renderSvg, renderPng, pngDocument } = await import("./render")
      await loadIconsFor(snapshot.document.order.map((nodeId) => snapshot.document.nodes[nodeId]))
      const rendered = renderSvg(a.format === "png" ? await pngDocument(snapshot.document) : snapshot.document, a.variationId)
      if (a.format === "svg") return { ...rendered, mimeType: "image/svg+xml", revision: snapshot.revision }
      const png = await renderPng(rendered.svg)
      return { mimeType: "image/png", base64: png.toString("base64"), bounds: rendered.bounds, revision: snapshot.revision }
    }
  }
}
