import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentError } from "../lib/agent/engine.ts"
import { createLocalStore, LOCAL_HISTORY_BYTES, LOCAL_HISTORY_LIMIT, type LocalStore } from "../lib/agent/local-store.ts"
import { executeLocal, localTools } from "../lib/agent/local-service.ts"
import { MAX_COORD, addNodes, emptyDoc, serializeDoc, shapeNode } from "../lib/doc.ts"
import { check, report } from "./harness.ts"

async function refused(run: () => Promise<unknown>, status?: number) {
  try { await run(); return false } catch (error) { return status === undefined || (error instanceof AgentError && error.status === status) }
}

const folder = await mkdtemp(join(tmpdir(), "squig-local-"))
const opened: LocalStore[] = []
const open = async (file: string) => {
  const store = await createLocalStore(join(folder, file))
  opened.push(store)
  return store
}
const oldCwd = process.cwd()
try {
  const store = await open("canvas.squig.json")
  const documentId = store.documentId
  const first = await store.read()
  check("missing file becomes a portable local document", JSON.parse(await readFile(store.filePath, "utf8")).app === "squig" && first.document.order.length === 0)
  check("revision is a positive safe content token", Number.isSafeInteger(first.revision) && first.revision > 0)
  check("a second writer cannot own the file", await refused(() => createLocalStore(store.filePath), 409))
  check("local tools exclude public workspace management", !Object.hasOwn(localTools, "create_document") && !Object.hasOwn(localTools, "delete_document") && !Object.hasOwn(localTools, "rotate_canvas_link"))
  check("tools cannot address another file", await refused(() => executeLocal("get_document", { documentId: "other" }, store), 404))

  await executeLocal("edit_document", { documentId, revision: first.revision, operations: [
    { op: "add", nodes: [{ id: "button", type: "component", kind: "button", x: 20, y: 60, props: { label: "Save locally" } }] },
    { op: "variation", id: "direction", title: "A", description: "One direction", nodeIds: ["button"] },
  ] }, store)
  const edited = await store.read()
  check("operation engine writes real editable nodes", edited.document.nodes.button?.type === "component" && edited.document.variations[0]?.id === "direction")
  check("a stale edit does not overwrite newer content", await refused(() => executeLocal("edit_document", { documentId, revision: first.revision, operations: [{ op: "rename", name: "Lost change" }] }, store), 409))

  const comment = await executeLocal("comment", { documentId, text: "Keep this feedback", variationId: "direction" }, store)
  check("comments persist in the portable file", JSON.parse(await readFile(store.filePath, "utf8")).comments[0]?.text === "Keep this feedback")
  const withComment = await store.read()
  await executeLocal("replace_document", { documentId, revision: withComment.revision, document: {
    fileName: "Human edit", nodes: withComment.document.nodes, order: withComment.document.order, look: withComment.document.look,
  } }, store)
  let current = await store.read()
  check("browser saves preserve variations and comments", current.document.variations.length === 1 && current.comments[0]?.text === "Keep this feedback")
  const beforeNoop = await readFile(store.filePath, "utf8"), beforeInfo = await stat(store.filePath), beforeHistory = await store.history()
  await executeLocal("edit_document", { documentId, revision: current.revision, operations: [{ op: "rename", name: current.document.fileName }] }, store)
  check("no-op edits do not write or add history", await readFile(store.filePath, "utf8") === beforeNoop && (await stat(store.filePath)).mtimeMs === beforeInfo.mtimeMs && (await store.history()).length === beforeHistory.length)

  const external = JSON.parse(await readFile(store.filePath, "utf8"))
  external.fileName = "Edited by another local program"
  external.extraMetadata = { preserve: true }
  await writeFile(store.filePath, JSON.stringify(external, null, 4))
  check("external file edits invalidate prior revisions", await refused(() => executeLocal("replace_document", { documentId, revision: current.revision, document: current.document }, store), 409))
  current = await store.read()
  check("external changes are visible without reopening", current.document.fileName === external.fileName)
  await executeLocal("edit_document", { documentId, revision: current.revision, operations: [{ op: "rename", name: "Preserved metadata" }] }, store)
  check("local saves preserve unrelated portable metadata", JSON.parse(await readFile(store.filePath, "utf8")).extraMetadata.preserve === true)

  current = await store.read()
  const results = await Promise.allSettled([
    executeLocal("edit_document", { documentId, revision: current.revision, operations: [{ op: "rename", name: "Concurrent A" }] }, store),
    executeLocal("edit_document", { documentId, revision: current.revision, operations: [{ op: "rename", name: "Concurrent B" }] }, store),
  ])
  check("concurrent stale saves cannot both commit", results.filter((result) => result.status === "fulfilled").length === 1 && results.filter((result) => result.status === "rejected").length === 1)
  const original = await readFile(store.filePath, "utf8")
  await writeFile(store.filePath, "{ interrupted external write")
  check("invalid external writes are refused without replacing them", await refused(() => executeLocal("edit_document", { documentId, revision: current.revision, operations: [{ op: "rename", name: "Wrong" }] }, store)) && await readFile(store.filePath, "utf8") === "{ interrupted external write")
  await writeFile(store.filePath, original)

  if (comment && "id" in comment && typeof comment.id === "string") {
    await executeLocal("resolve_comment", { documentId, commentId: comment.id, resolved: true }, store)
    check("comment resolution is saved locally", (await store.read()).comments[0]?.resolved === true)
  } else check("comment returns its identifier", false)
  current = await store.read()
  await executeLocal("restore", { documentId, revision: current.revision, targetRevision: edited.revision }, store)
  current = await store.read()
  check("restore retains current feedback", current.document.variations.length === 1 && current.comments[0]?.resolved === true)
  const exported = await executeLocal("export_document", { documentId }, store)
  check("handoff exports include portable comments", !!exported && "file" in exported && exported.file.comments[0]?.resolved === true)

  process.chdir(folder)
  await executeLocal("edit_document", { documentId, revision: current.revision, operations: [{ op: "note", text: "Fonts work outside the checkout", x: 0, y: 0 }] }, store)
  const rendering = await executeLocal("render_document", { documentId, format: "png" }, store)
  check("PNG rendering finds its fonts from another working directory", !!rendering && "base64" in rendering && typeof rendering.base64 === "string" && Buffer.from(rendering.base64, "base64").subarray(1, 4).toString() === "PNG")
  process.chdir(oldCwd)

  const savedRevision = (await store.read()).revision
  await store.close()
  const reopened = await createLocalStore(store.filePath)
  opened.push(reopened)
  check("close releases the lock and reopening preserves revision and metadata", (await reopened.read()).revision === savedRevision && (await reopened.read()).comments.length === 1)

  const invalidPath = join(folder, "invalid.squig.json")
  await writeFile(invalidPath, "{ invalid")
  check("opening an invalid existing file never replaces it", await refused(() => createLocalStore(invalidPath), 400) && await readFile(invalidPath, "utf8") === "{ invalid")
  check("failed opens release their lock", !(await readdir(folder)).includes("invalid.squig.json.lock"))

  const coordinatePath = join(folder, "coordinates.squig.json")
  await writeFile(coordinatePath, serializeDoc(addNodes(emptyDoc("Far from the origin"), [
    shapeNode("rect", { id: "far", seed: 1, x: MAX_COORD, y: -MAX_COORD, w: 100, h: 100 }),
  ])))
  const coordinates = await open("coordinates.squig.json")
  const atEdge = await coordinates.read()
  await executeLocal("replace_document", { documentId: coordinates.documentId, revision: atEdge.revision, document: { ...atEdge.document, fileName: "Saved at the shared coordinate boundary" } }, coordinates)
  check("valid document coordinates remain editable through the companion", (await coordinates.read()).document.nodes.far.x === MAX_COORD && (await coordinates.read()).document.fileName === "Saved at the shared coordinate boundary")
  const coordinateRevision = (await coordinates.read()).revision
  check("coordinates beyond the shared document boundary are still refused", await refused(() => executeLocal("edit_document", { documentId: coordinates.documentId, revision: coordinateRevision, operations: [{ op: "update", patches: [{ id: "far", patch: { x: MAX_COORD + 1 } }] }] }, coordinates), 400) && (await coordinates.read()).revision === coordinateRevision)

  const linked = await open("linked.squig.json")
  const outside = join(folder, "outside")
  await mkdir(outside)
  await symlink(outside, linked.historyPath)
  check("restore rejects a history directory symlink", await refused(() => linked.getRevision(123), 409))
  await rm(linked.historyPath)
  await mkdir(linked.historyPath)
  const outsideSnapshot = join(outside, "snapshot.json")
  await writeFile(outsideSnapshot, JSON.stringify(await linked.read()))
  await symlink(outsideSnapshot, join(linked.historyPath, "123.json"))
  check("restore rejects a snapshot symlink", await refused(() => linked.getRevision(123), 409))
  await rm(join(linked.historyPath, "123.json"))
  await writeFile(join(linked.historyPath, "123.json"), JSON.stringify(await linked.read()))
  check("restore rejects a snapshot with a different revision token", await refused(() => linked.getRevision(123), 400))

  const large = await open("large.squig.json")
  const largeBefore = await large.read()
  await large.mutate(largeBefore.revision, (value) => ({ ...value, document: { ...value.document, localAttachment: "x".repeat(8 * 1024 * 1024) } }))
  const largeSaved = await large.read()
  await executeLocal("edit_document", { documentId: large.documentId, revision: largeSaved.revision, operations: [{ op: "rename", name: "Large local file" }] }, large)
  check("legitimate local files above the old hosted limit remain editable", (await large.read()).document.fileName === "Large local file")

  const bounded = await open("bounded.squig.json")
  for (let index = 0; index < LOCAL_HISTORY_LIMIT + 6; index++) {
    const before = await bounded.read()
    await bounded.mutate(before.revision, (value) => ({ ...value, document: { ...value.document, fileName: `State ${index}` } }))
  }
  check("local history retains at most fifty states including current", (await bounded.history()).length === LOCAL_HISTORY_LIMIT && (await readdir(bounded.historyPath)).length === LOCAL_HISTORY_LIMIT - 1)
  const bytesBounded = await open("bytes.squig.json")
  for (let index = 0; index < 32; index++) {
    const before = await bytesBounded.read()
    await bytesBounded.mutate(before.revision, (value) => ({ ...value, document: { ...value.document, fileName: `Large ${index}`, notesForTest: "x".repeat(600_000) } }))
  }
  const backups = await readdir(bytesBounded.historyPath)
  const bytes = (await Promise.all(backups.map(async (name) => (await stat(join(bytesBounded.historyPath, name))).size))).reduce((sum, size) => sum + size, 0)
  check("history also respects a sixteen MiB byte budget", bytes <= LOCAL_HISTORY_BYTES && backups.length < 31)
} finally {
  process.chdir(oldCwd)
  for (const store of opened) await store.close()
  await rm(folder, { recursive: true, force: true })
}
report("local agent checks passed")
