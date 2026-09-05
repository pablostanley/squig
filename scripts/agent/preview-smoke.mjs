// Verify a protected Vercel preview through the CLI's supported bypass.
// Credentials and bodies go into private temporary files, never command output.
import { createServer } from "node:http"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
const run = promisify(execFile),
  deployment = process.env.SQUIG_PREVIEW_URL
if (!deployment)
  throw new Error("Set SQUIG_PREVIEW_URL to the protected deployment URL.")
const server = createServer(async (req, res) => {
  const dir = await mkdtemp(join(tmpdir(), "squig-preview-check-"))
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = join(dir, "body"),
      output = join(dir, "response"),
      config = join(dir, "curl.conf")
    await writeFile(body, Buffer.concat(chunks), { mode: 0o600 })
    const escape = (value) =>
      String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/[\r\n]/g, "")
    const headers = Object.entries(req.headers)
      .filter(
        ([name]) =>
          ![
            "host",
            "connection",
            "content-length",
            "transfer-encoding",
          ].includes(name),
      )
      .map(([name, value]) => `header = "${escape(name)}: ${escape(value)}"`)
      .join("\n")
    await writeFile(config, headers, { mode: 0o600 })
    const args = [
      "curl",
      req.url,
      "--deployment",
      deployment,
      "--",
      "--silent",
      "--compressed",
      "--config",
      config,
      "--request",
      req.method,
      "--output",
      output,
      "--write-out",
      "%{http_code}",
    ]
    if (chunks.length) args.push("--data-binary", `@${body}`)
    const { stdout } = await run("vercel", args, {
      maxBuffer: 1024 * 1024,
      timeout: 60000,
    })
    const status = Number(stdout.trim().slice(-3))
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(await readFile(output))
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: `Preview proxy failed: ${error.code ?? "request error"}`,
      }),
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
try {
  const child = spawn(process.execPath, ["scripts/agent/smoke.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SQUIG_TEST_URL: `http://127.0.0.1:${server.address().port}`,
    },
  })
  const code = await new Promise((resolve) => child.on("exit", resolve))
  if (code !== 0) process.exitCode = code ?? 1
} finally {
  server.close()
}
