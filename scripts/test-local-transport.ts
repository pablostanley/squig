import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, access, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { request } from "node:http"
import { spawnSync } from "node:child_process"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { createLocalStore } from "../lib/agent/local-store"
import { startLocalServer, localEditorRoot, LOCAL_REQUEST_BYTES, LOCAL_MCP_RESPONSE_BYTES, type LocalSession } from "../lib/agent/local-server"
import { check, report } from "./harness.ts"

const directory = await mkdtemp(join(tmpdir(), "squig-transport-"))
const editor = join(directory, "editor")
const file = join(directory, "drawing.squig.json")
await mkdir(editor)
await writeFile(join(editor, "index.html"), "<!doctype html><title>Squig local fixture</title>")
await writeFile(join(editor, "style.css"), "body { color: black }")
await writeFile(join(editor, ".secret"), "private")
await writeFile(join(directory, "outside.txt"), "private outside")
await symlink(join(directory, "outside.txt"), join(editor, "escape.txt"))
let session: LocalSession | undefined
const clients: Client[] = []
function raw(origin: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(origin, { path, headers }, (response) => {
      let body = ""
      response.setEncoding("utf8").on("data", (chunk) => { body += chunk })
      response.on("end", () => resolve({ status: response.statusCode!, body }))
    })
    req.on("error", reject)
    req.end()
  })
}
const exists = async (path: string) => access(path).then(() => true, () => false)
const decode = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse((result.content as Array<{ type: string; text: string }>).find((item) => item.type === "text")!.text)
try {
  try { await localEditorRoot(editor); check("hosted exports need a local marker", false) }
  catch (error) { check("missing local build gives a recovery command", error instanceof Error && error.message.includes("pnpm build:local")) }
  await writeFile(join(editor, ".squig-local-editor.json"), JSON.stringify({ version: 1 }))
  const store = await createLocalStore(file)
  session = await startLocalServer({ store, editorRoot: editor })
  const { origin, token, documentId } = session
  const authorization = `Bearer ${token}`
  const headers = { Authorization: authorization, "Content-Type": "application/json" }
  const call = (name: string, input: unknown) => fetch(`${origin}/api/v1/tools/${name}`, { method: "POST", headers, body: JSON.stringify(input) })
  check("server binds an ephemeral loopback address", /^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  check("editor token stays in the URL fragment", new URL(session.editorUrl).hash === `#token=${token}` && !new URL(session.editorUrl).search.includes(token))
  const index = await fetch(origin)
  check("static editor loads without leaking file data", index.status === 200 && (await index.text()).includes("Squig local fixture"))
  check("editor forbids framing and referrer disclosure", index.headers.get("x-frame-options") === "DENY" && index.headers.get("referrer-policy") === "no-referrer")
  const css = await fetch(`${origin}/style.css`)
  check("static assets receive their MIME type", css.headers.get("content-type") === "text/css; charset=utf-8")
  check("session info requires authentication", (await fetch(`${origin}/api/local/session`)).status === 401)
  const info = await fetch(`${origin}/api/local/session`, { headers })
  check("authorized browser handshake opens precisely one file", info.status === 200 && (await info.json()).documentId === documentId)
  check("foreign browser origins cannot use a stolen token", (await fetch(`${origin}/api/local/session`, { headers: { ...headers, Origin: "https://evil.example" } })).status === 403)
  check("opaque origins are rejected", (await fetch(`${origin}/api/local/session`, { headers: { ...headers, Origin: "null" } })).status === 403)
  check("matching browser origin works", (await fetch(`${origin}/api/local/session`, { headers: { ...headers, Origin: origin } })).status === 200)
  check("DNS rebinding host rejected before static content", (await raw(origin, "/", { Host: "evil.example" })).status === 403)
  check("localhost alias cannot bypass exact Host policy", (await raw(origin, "/api/local/session", { Host: `localhost:${new URL(origin).port}`, Authorization: authorization })).status === 403)
  for (const path of ["/.secret", "/%2e%73ecret", "/.squig-local-editor.json", "/%2e%2e/outside.txt", "/escape.txt", "/foo%5c..%5coutside.txt", "/%00.txt", "/%ZZ"])
    check(`static request cannot escape through ${path}`, (await raw(origin, path)).status === 404)
  check("one file session cannot enumerate other documents", (await fetch(`${origin}/api/v1/documents/another`, { headers })).status === 404)
  check("workspace creation is absent locally", (await fetch(`${origin}/api/v1/workspaces`, { method: "POST", headers, body: '{"name":"x"}' })).status === 404)
  check("foreign file paths cannot retarget the session", (await call("get_document", { documentId: resolve(directory, "outside.txt") })).status === 400)
  check("non JSON writes are rejected", (await fetch(`${origin}/api/v1/tools/edit_document`, { method: "POST", headers: { Authorization: authorization, "Content-Type": "text/plain" }, body: "{}" })).status === 415)
  check("malformed JSON is a clear 400", (await fetch(`${origin}/api/v1/tools/edit_document`, { method: "POST", headers, body: "{" })).status === 400)
  check("oversized requests return 413", (await fetch(`${origin}/api/v1/tools/edit_document`, { method: "POST", headers, body: "x".repeat(LOCAL_REQUEST_BYTES + 1) })).status === 413)
  check("local requests can exceed the retired hosted body limit", (await call("catalog", { query: "button", envelopePadding: "x".repeat(4_500_001) })).status === 200)
  const current = await (await fetch(`${origin}/api/v1/documents/${documentId}`, { headers })).json()
  const saved = await call("edit_document", { documentId, revision: current.revision, operations: [{ op: "add", nodes: [{ id: "title", type: "text", x: 20, y: 20, w: 220, h: 40, text: "A local drawing" }] }] })
  check("REST edits persist real editable nodes to the selected file", saved.status === 200 && JSON.parse(await readFile(file, "utf8")).nodes.title.text === "A local drawing")
  check("stale browser saves preserve the newer file", (await call("edit_document", { documentId, revision: current.revision, operations: [{ op: "rename", name: "stale" }] })).status === 409)
  const http = new Client({ name: "squig-http-test", version: "1" })
  clients.push(http)
  await http.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: authorization } } }))
  const names = (await http.listTools()).tools.map((tool) => tool.name)
  check("HTTP MCP exposes local workflow and complete editing tools", ["squig_local_session", "squig_edit_document", "squig_measure_text", "squig_render_document", "squig_history", "squig_comment"].every((name) => names.includes(name)))
  check("HTTP MCP omits hosted creation/deletion capabilities", !names.includes("squig_create_document") && !names.includes("squig_delete_document") && !names.includes("squig_rotate_canvas_link"))
  const mcpInfo = decode(await http.callTool({ name: "squig_local_session", arguments: {} }))
  check("MCP returns the same private live editor URL", mcpInfo.editorUrl === session.editorUrl && mcpInfo.filePath === await realpath(file))
  const read = decode(await http.callTool({ name: "squig_get_document", arguments: { documentId } }))
  const edited = await http.callTool({ name: "squig_edit_document", arguments: { documentId, revision: read.revision, operations: [{ op: "rename", name: "Saved by MCP" }] } })
  check("official MCP client writes through the local store", !edited.isError && JSON.parse(await readFile(file, "utf8")).fileName === "Saved by MCP")
  const wrong = await http.callTool({ name: "squig_get_document", arguments: { documentId: "other" } })
  check("MCP tool failures are structured errors", wrong.isError === true && decode(wrong).status === 404)
  await http.close()
  await session.close()
  check("closing local HTTP server releases the file lock", !await exists(`${file}.lock`))
  session = undefined

  const stdioFile = join(directory, "stdio.squig.json")
  const stdioTransport = new StdioClientTransport({ command: process.execPath, args: ["--experimental-strip-types", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", resolve("scripts/register-loader.mjs"), resolve("scripts/agent/local.ts"), "mcp", stdioFile, "--editor-root", editor], stderr: "pipe" })
  let stderr = ""
  stdioTransport.stderr?.on("data", (chunk) => { stderr += chunk.toString() })
  const stdio = new Client({ name: "squig-stdio-test", version: "1" })
  clients.push(stdio)
  await stdio.connect(stdioTransport)
  const stdioInfo = decode(await stdio.callTool({ name: "squig_local_session", arguments: {} }))
  check("stdio protocol is clean and discovers its live editor", stdioInfo.filePath === await realpath(stdioFile) && /^http:\/\/127\.0\.0\.1:/.test(stdioInfo.editorUrl))
  check("startup guidance is sent only to stderr", stderr.includes("Open canvas:"))
  const largeStdio = await stdio.callTool({ name: "squig_catalog", arguments: { query: "button", envelopePadding: "x".repeat(4_500_001) } })
  check("stdio accepts the same local request sizes as HTTP", !largeStdio.isError)
  const stdioRead = decode(await stdio.callTool({ name: "squig_get_document", arguments: { documentId: stdioInfo.documentId } }))
  const written = await stdio.callTool({ name: "squig_edit_document", arguments: { documentId: stdioInfo.documentId, revision: stdioRead.revision, operations: [{ op: "note", text: "Local stdio works", x: 10, y: 10 }] } })
  check("stdio MCP writes the same portable local file", !written.isError && JSON.parse(await readFile(stdioFile, "utf8")).order.length === 1)
  const browserUrl = new URL(stdioInfo.editorUrl)
  const browserInfo = await fetch(`${browserUrl.origin}/api/local/session`, { headers: { Authorization: `Bearer ${new URLSearchParams(browserUrl.hash.slice(1)).get("token")}` } })
  check("stdio sessions include a functioning authenticated browser companion", browserInfo.status === 200)
  const stdioDrawing = JSON.parse(await readFile(stdioFile, "utf8"))
  await writeFile(stdioFile, JSON.stringify({ ...stdioDrawing, attachment: "x".repeat(6 * 1024 * 1024) }))
  const singleExport = await stdio.callTool({ name: "squig_export_document", arguments: { documentId: stdioInfo.documentId } })
  const exportedDrawing = decode(singleExport)
  check("MCP export includes one copy of a large portable canvas", !singleExport.isError && !Object.hasOwn(exportedDrawing, "document") && exportedDrawing.file.attachment.length === 6 * 1024 * 1024)

  await writeFile(stdioFile, JSON.stringify({ ...stdioDrawing, attachment: "x".repeat(11 * 1024 * 1024) }))
  const largeRevision = decode(await stdio.callTool({ name: "squig_documents", arguments: {} })).documents[0].revision
  for (const name of ["squig_get_document", "squig_export_document"]) {
    const result = await stdio.callTool({ name, arguments: { documentId: stdioInfo.documentId } })
    const handoff = decode(result)
    check(`${name} hands off oversized output without closing the default stdio client`, result.isError === true && handoff.status === 413 && handoff.filePath === await realpath(stdioFile) && handoff.revision === largeRevision && handoff.editorUrl === stdioInfo.editorUrl && Buffer.byteLength(JSON.stringify(result)) < LOCAL_MCP_RESPONSE_BYTES)
  }
  const savedLarge = await stdio.callTool({ name: "squig_replace_document", arguments: { documentId: stdioInfo.documentId, revision: largeRevision, document: { ...stdioDrawing, fileName: "Saved despite a bounded response" } } })
  const savedHandoff = decode(savedLarge)
  const afterLarge = decode(await stdio.callTool({ name: "squig_documents", arguments: {} })).documents[0]
  check("an oversized mutation response identifies the committed revision", savedLarge.isError === true && savedHandoff.status === 413 && savedHandoff.revision === afterLarge.revision && savedHandoff.revision !== largeRevision && JSON.parse(await readFile(stdioFile, "utf8")).fileName === "Saved despite a bounded response")
  const invalidLarge = await stdio.callTool({ name: "squig_local_session", arguments: { ["x".repeat(11 * 1024 * 1024)]: true } })
  const invalidHandoff = decode(invalidLarge)
  check("SDK validation errors are bounded without claiming an edit completed", invalidLarge.isError === true && invalidHandoff.status === 413 && invalidHandoff.error.includes("request failed") && !invalidHandoff.error.includes("operation completed") && decode(await stdio.callTool({ name: "squig_documents", arguments: {} })).documents[0].revision === afterLarge.revision)
  check("stdio tools remain usable after oversized responses", !(await stdio.callTool({ name: "squig_catalog", arguments: { query: "button" } })).isError)
  await stdio.close()
  check("stdio shutdown releases its local lock", !await exists(`${stdioFile}.lock`))

  const fixture = JSON.parse(await readFile(file, "utf8"))
  fixture.variations = [{ id: "direction", title: "Direction", description: "Keep this metadata", nodeIds: ["title"] }]
  fixture.comments = [{ id: "feedback", text: "Keep this feedback", author: "human", resolved: false, createdAt: new Date().toISOString() }]
  await writeFile(file, JSON.stringify(fixture))
  const cli = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-loader.mjs", "scripts/squig.ts", "text", file, "CLI addition", "--x", "50", "--y", "100"], { encoding: "utf8" })
  const afterCli = JSON.parse(await readFile(file, "utf8"))
  check("existing CLI mutations retain variations and comments", cli.status === 0 && afterCli.variations[0].id === "direction" && afterCli.comments[0].id === "feedback" && afterCli.order.length === 2, cli.stderr)

  const brokenFile = join(directory, "broken.squig.json")
  const brokenBytes = Buffer.from('{"nodes":{ interrupted\xff', "latin1")
  await writeFile(brokenFile, brokenBytes)
  const forced = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-loader.mjs", "scripts/squig.ts", "new", brokenFile, "--force", "--name", "Recovered blank"], { encoding: "utf8" })
  const backups = (await readdir(directory)).filter((name) => name.startsWith("broken.squig.json.before-replace-") && name.endsWith(".bak"))
  check("CLI force can replace corrupt JSON while preserving its exact bytes", forced.status === 0 && JSON.parse(await readFile(brokenFile, "utf8")).fileName === "Recovered blank" && backups.length === 1 && (await readFile(join(directory, backups[0]))).equals(brokenBytes) && forced.stdout.includes(join(directory, backups[0])), forced.stderr)
  const heldStore = await createLocalStore(brokenFile)
  try {
    const lockedForce = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-loader.mjs", "scripts/squig.ts", "new", brokenFile, "--force"], { encoding: "utf8" })
    check("CLI force still refuses a file owned by a live companion", lockedForce.status !== 0 && lockedForce.stderr.includes("already has a local Squig session") && (await heldStore.read()).document.fileName === "Recovered blank")
  } finally { await heldStore.close() }
} finally {
  await Promise.allSettled(clients.map((client) => client.close()))
  await session?.close()
  await rm(directory, { recursive: true, force: true })
}
report("local transport checks passed")
