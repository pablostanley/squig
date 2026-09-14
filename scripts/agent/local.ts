import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createLocalStore } from "../../lib/agent/local-store"
import { boundedLocalTransport, createLocalMcpServer, localEditorRoot, startLocalServer, LOCAL_REQUEST_BYTES } from "../../lib/agent/local-server"

export async function runLocalAgent(mode: "serve" | "mcp", file: string, options: { port?: number; editorRoot?: string } = {}): Promise<void> {
  const editorRoot = await localEditorRoot(options.editorRoot)
  const store = await createLocalStore(file)
  const session = await startLocalServer({ store, editorRoot, port: options.port }).catch(async (error) => {
    await store.close()
    throw error
  })
  const mcp = mode === "mcp" ? createLocalMcpServer(store, session) : null
  let stopping: Promise<void> | undefined
  const stop = () => {
    stopping ??= (async () => {
      process.removeListener("SIGINT", signal)
      process.removeListener("SIGTERM", signal)
      process.stdin.removeListener("end", signal)
      process.stdin.removeListener("close", signal)
      try { await mcp?.close() } finally { await session.close() }
    })()
    return stopping
  }
  const signal = () => { void stop().catch(() => { process.exitCode = 1 }) }
  process.once("SIGINT", signal)
  process.once("SIGTERM", signal)
  if (mcp) {
    process.stdin.once("end", signal)
    process.stdin.once("close", signal)
    try { await mcp.connect(boundedLocalTransport(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: LOCAL_REQUEST_BYTES }), session)) }
    catch (error) { await stop(); throw error }
    mcp.server.onclose = signal
  }
  // stdout belongs exclusively to the MCP transport, including startup.
  process.stderr.write(`Squig local file: ${session.filePath}\nOpen canvas: ${session.editorUrl}\n${mode === "serve" ? `MCP: ${session.mcpUrl}\n` : ""}Keep this process running while editing. Stop with Ctrl+C.\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: { port: { type: "string" }, "editor-root": { type: "string" } }, allowPositionals: true })
    const [mode, file] = positionals
    if ((mode !== "serve" && mode !== "mcp") || !file || positionals.length !== 2)
      throw new Error("Usage: node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/agent/local.ts serve|mcp <file.squig.json> [--port N]")
    await runLocalAgent(mode, file, { port: values.port === undefined ? undefined : Number(values.port), editorRoot: values["editor-root"] })
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Unable to start Squig locally"}\n`)
    process.exitCode = 1
  }
}
