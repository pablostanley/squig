import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink,
} from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { z } from "zod"
import { parseDoc } from "../doc"
import type { SquigComment } from "../types"
import { AgentError, emptyDocument, validateDocument, type CanvasDocument } from "./engine"
import { canvasEqual } from "./merge"
import { id } from "./schema"

export const LOCAL_HISTORY_LIMIT = 50
export const LOCAL_HISTORY_BYTES = 16 * 1024 * 1024
export const LOCAL_FILE_BYTES = 16 * 1024 * 1024

const variationSchema = z.object({
  id, title: z.string().min(1).max(120), description: z.string().max(4000).default(""),
  nodeIds: z.array(id).max(5000),
})
const commentSchema = z.object({
  id, text: z.string().min(1).max(4000), author: z.string().max(80),
  nodeId: id.nullish().transform((value) => value ?? undefined),
  variationId: id.nullish().transform((value) => value ?? undefined), resolved: z.boolean(),
  createdAt: z.string().datetime(),
})
export type LocalComment = SquigComment
export interface LocalContent {
  document: CanvasDocument
  comments: LocalComment[]
}
export interface LocalSnapshot extends LocalContent {
  revision: number
  updatedAt: string
}
interface DiskFile {
  raw: Buffer
  signature: string
  mode: number
  updatedAt: string
}
interface DiskSnapshot extends LocalSnapshot {
  signature: string
  mode: number
}
export interface LocalStore {
  documentId: string
  filePath: string
  historyPath: string
  replacedFilePath?: string
  read(): Promise<LocalSnapshot>
  mutate(revision: number | undefined, change: (current: LocalSnapshot) => LocalContent): Promise<LocalSnapshot>
  history(): Promise<Array<{ revision: number; createdAt: string; name: string }>>
  getRevision(revision: number): Promise<LocalSnapshot>
  close(): Promise<void>
}

const signature = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
// These are content tokens, not counters. The same file has the same token after
// restart; an edit by another program invalidates a stale agent's next write.
const revisionOf = (hash: string) => Number.parseInt(hash.slice(0, 13), 16) + 1
const codeOf = (error: unknown) => (error as NodeJS.ErrnoException)?.code
const visible = ({ document, comments, revision, updatedAt }: LocalSnapshot): LocalSnapshot =>
  structuredClone({ document, comments, revision, updatedAt })

function decode(raw: string): LocalContent {
  let value: Record<string, unknown>
  try {
    value = JSON.parse(raw)
  } catch {
    throw new AgentError(400, "The local file contains invalid JSON. Fix it or choose another file; it has not been replaced.")
  }
  const parsed = parseDoc(raw)
  if (!value || typeof value !== "object" || Array.isArray(value) || !parsed ||
    (value.app !== undefined && value.app !== "squig") ||
    (value.version !== undefined && value.version !== 1) ||
    Array.isArray(value.nodes) || Object.keys(value.nodes as object).length !== parsed.order.length ||
    !Array.isArray(value.order) || value.order.length !== parsed.order.length ||
    new Set(value.order).size !== value.order.length ||
    value.order.some((key) => typeof key !== "string" || !Object.hasOwn(parsed.nodes, key))) {
    throw new AgentError(400, "The local file is not a complete Squig document. Fix it or choose another file; it has not been replaced.")
  }
  const { app: _app, version: _version, comments, ...metadata } = value
  void _app
  void _version
  return {
    document: validateDocument({
      ...metadata, ...parsed,
      variations: z.array(variationSchema).max(1000).parse(value.variations ?? []),
    }, LOCAL_FILE_BYTES),
    comments: z.array(commentSchema).max(1000).parse(comments ?? []),
  }
}

function encode(content: LocalContent): string {
  const raw = JSON.stringify({
    ...content.document, app: "squig", version: 1, comments: content.comments,
  }, null, 2) + "\n"
  if (Buffer.byteLength(raw) > LOCAL_FILE_BYTES)
    throw new AgentError(413, "Local document exceeds 16 MiB, including comments.")
  return raw
}

function localFailure(error: unknown): never {
  if (codeOf(error) === "ENOSPC" || codeOf(error) === "EDQUOT")
    throw new AgentError(507, "Your local disk is full. Free some space and retry; the previous file is intact.")
  if (codeOf(error) === "EACCES" || codeOf(error) === "EPERM")
    throw new AgentError(403, "Squig cannot write this local file. Check its folder permissions.")
  throw error
}

/** One companion owns one selected file. The sibling lock also excludes a second
 * MCP process, so two independent in-memory queues cannot overwrite each other. */
export async function createLocalStore(selectedPath: string, options: { replaceInvalidWith?: LocalContent } = {}): Promise<LocalStore> {
  const requested = resolve(selectedPath)
  await mkdir(dirname(requested), { recursive: true })
  let filePath: string
  try {
    filePath = await realpath(requested)
  } catch (error) {
    if (codeOf(error) !== "ENOENT") throw error
    filePath = join(await realpath(dirname(requested)), basename(requested))
  }
  const lockPath = `${filePath}.lock`
  const historyPath = `${filePath}.history`
  const lockToken = randomUUID()
  let lock
  try {
    lock = await open(lockPath, "wx", 0o600)
  } catch (error) {
    if (codeOf(error) === "EEXIST")
      throw new AgentError(409, `This file already has a local Squig session. Stop that companion first. If it crashed, remove the stale lock at ${lockPath} after confirming it is no longer running.`)
    return localFailure(error)
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, token: lockToken }) + "\n")
    await lock.close()
  } catch (error) {
    await lock.close().catch(() => {})
    await unlink(lockPath).catch(() => {})
    return localFailure(error)
  }

  let queue: Promise<unknown> = Promise.resolve()
  let closed = false
  const documentId = `local_${signature(filePath).slice(0, 24)}`
  function serial<T>(work: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new AgentError(410, "This local Squig session has closed."))
    const next = queue.then(work)
    queue = next.catch(() => {})
    return next
  }
  async function close() {
    if (closed) return
    closed = true
    await queue
    try {
      const owner = JSON.parse(await readFile(lockPath, "utf8"))
      if (owner.token === lockToken) await unlink(lockPath)
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw error
    }
  }
  async function diskFile(): Promise<DiskFile> {
    let handle
    try {
      // A replaced symlink must never redirect a live session to another file.
      handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      const info = await handle.stat()
      if (!info.isFile()) throw new AgentError(400, "Choose a regular .squig.json file.")
      if (info.size > LOCAL_FILE_BYTES) throw new AgentError(413, "Local document exceeds 16 MiB.")
      const raw = await handle.readFile()
      return { raw, signature: signature(raw), updatedAt: info.mtime.toISOString(), mode: info.mode & 0o777 }
    } catch (error) {
      if (codeOf(error) === "ENOENT") throw new AgentError(404, "The local file was moved or removed. Reopen its new path to continue.")
      if (codeOf(error) === "ELOOP") throw new AgentError(409, "The local file was replaced with a link. Reopen the file to continue.")
      return localFailure(error)
    } finally {
      await handle?.close()
    }
  }
  async function disk(): Promise<DiskSnapshot> {
    const { raw, ...file } = await diskFile()
    return { ...decode(raw.toString("utf8")), ...file, revision: revisionOf(file.signature) }
  }
  async function atomic(raw: string, previous?: Pick<DiskFile, "mode" | "signature">) {
    const temporary = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temporary, "wx", previous?.mode ?? 0o600)
      await handle.writeFile(raw)
      await handle.sync()
      await handle.close()
      handle = undefined
      if (previous) {
        const latest = await diskFile()
        if (latest.signature !== previous.signature)
          throw new AgentError(409, "The local file changed outside Squig. Read the latest revision and reconcile before saving.")
        await rename(temporary, filePath)
      } else {
        // link is an atomic create-if-absent; rename would replace a file another
        // program created while the new canvas was being prepared.
        await link(temporary, filePath)
      }
    } catch (error) {
      if (codeOf(error) === "EEXIST") throw new AgentError(409, "The local file was created by another program. Reopen it to continue.")
      localFailure(error)
    } finally {
      await handle?.close()
      await unlink(temporary).catch((error) => { if (codeOf(error) !== "ENOENT") throw error })
    }
  }
  async function historyFiles() {
    try {
      const info = await lstat(historyPath)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new AgentError(409, "The local history path must be a regular directory.")
      const entries = await readdir(historyPath, { withFileTypes: true })
      const files = await Promise.all(entries.filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name)).map(async (entry) => {
        const path = join(historyPath, entry.name)
        const info = await lstat(path)
        return { path, bytes: info.size, time: info.mtimeMs }
      }))
      return files.sort((a, b) => b.time - a.time || b.path.localeCompare(a.path))
    } catch (error) {
      if (codeOf(error) === "ENOENT") return []
      throw error
    }
  }
  async function pruneHistory() {
    let bytes = 0, count = 0
    for (const file of await historyFiles()) {
      if (count >= LOCAL_HISTORY_LIMIT - 1 || bytes + file.bytes > LOCAL_HISTORY_BYTES) {
        await unlink(file.path)
      } else {
        bytes += file.bytes
        count++
      }
    }
  }
  async function archive(snapshot: LocalSnapshot) {
    const raw = JSON.stringify(visible(snapshot)) + "\n"
    // A single oversized snapshot must not consume unbounded backup space.
    if (Buffer.byteLength(raw) > LOCAL_HISTORY_BYTES) return
    await mkdir(historyPath, { recursive: true, mode: 0o700 })
    await historyFiles()
    const path = join(historyPath, `${snapshot.revision}.json`)
    let handle
    try {
      handle = await open(path, "wx", 0o600)
      await handle.writeFile(raw)
      await handle.sync()
    } catch (error) {
      if (codeOf(error) !== "EEXIST") {
        if (handle) await unlink(path).catch(() => {})
        localFailure(error)
      }
    } finally {
      await handle?.close()
    }
    await pruneHistory()
  }
  async function savedRevision(path: string): Promise<LocalSnapshot> {
    const directory = await lstat(historyPath)
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new AgentError(409, "The local history path must be a regular directory.")
    let handle
    try {
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      const info = await handle.stat()
      if (!info.isFile() || info.size > LOCAL_HISTORY_BYTES) throw new AgentError(400, "This local history snapshot is invalid or too large.")
      const saved = JSON.parse(await handle.readFile("utf8")) as LocalSnapshot
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 1 || basename(path) !== `${saved.revision}.json` || typeof saved.updatedAt !== "string")
        throw new AgentError(400, "This local history snapshot is invalid.")
      return { ...decode(encode(saved)), revision: saved.revision, updatedAt: saved.updatedAt }
    } catch (error) {
      if (codeOf(error) === "ELOOP") throw new AgentError(409, "Local history cannot follow a symbolic link.")
      throw error
    } finally {
      await handle?.close()
    }
  }
  const store: LocalStore = {
    documentId, filePath, historyPath, close,
    read: () => serial(async () => visible(await disk())),
    mutate: (expected, change) => serial(async () => {
      const current = await disk()
      if (expected !== undefined && current.revision !== expected)
        throw new AgentError(409, "Revision conflict; read the latest local file and reconcile before saving.")
      const next = change(visible(current))
      const encoded = encode(next)
      const normalized = decode(encoded)
      if (canvasEqual(normalized.document, current.document) && canvasEqual(normalized.comments, current.comments))
        return visible(current)
      await archive(current)
      await atomic(encoded, current)
      return visible(await disk())
    }),
    history: () => serial(async () => {
      const current = await disk()
      const snapshots = [visible(current)]
      for (const file of await historyFiles()) {
        try {
          const snapshot = await savedRevision(file.path)
          if (!snapshots.some((entry) => entry.revision === snapshot.revision)) snapshots.push(snapshot)
        } catch {
          // A damaged backup should not hide the valid current drawing.
        }
      }
      return snapshots.slice(0, LOCAL_HISTORY_LIMIT).map((snapshot) => ({ revision: snapshot.revision, createdAt: snapshot.updatedAt, name: snapshot.document.fileName }))
    }),
    getRevision: (revision) => serial(async () => {
      const current = await disk()
      if (current.revision === revision) return visible(current)
      if (!Number.isSafeInteger(revision) || revision < 1) throw new AgentError(400, "Invalid revision token.")
      try {
        return await savedRevision(join(historyPath, `${revision}.json`))
      } catch (error) {
        if (codeOf(error) === "ENOENT") throw new AgentError(404, "Local revision not found. Older snapshots are removed when the history limit is reached.")
        throw error
      }
    }),
  }
  try {
    try {
      await lstat(filePath)
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw error
      await atomic(encode({ document: emptyDocument(basename(filePath).replace(/\.squig\.json$/, "") || "Untitled"), comments: [] }))
    }
    try {
      await disk()
    } catch (error) {
      if (!options.replaceInvalidWith || !(error instanceof z.ZodError || error instanceof AgentError && error.status === 400)) throw error
      const replacement = encode(options.replaceInvalidWith)
      decode(replacement)
      const previous = await diskFile()
      // --force is explicit replacement authority. Preserve unreadable bytes
      // separately because they cannot enter the validated revision history.
      const backupPath = `${filePath}.before-replace-${randomUUID()}.bak`
      const backup = await open(backupPath, "wx", 0o600)
      try {
        await backup.writeFile(previous.raw)
        await backup.sync()
      } catch (error) {
        await unlink(backupPath).catch(() => {})
        throw error
      } finally {
        await backup.close()
      }
      await atomic(replacement, previous)
      store.replacedFilePath = backupPath
      await disk()
    }
    await pruneHistory()
    return store
  } catch (error) {
    await close()
    return localFailure(error)
  }
}
