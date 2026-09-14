import { chromium, expect } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"

const directory = await mkdtemp(join(tmpdir(), "squig-local-browser-"))
const file = join(directory, "canvas.squig.json")
const child = spawn(process.execPath, ["--experimental-strip-types", "--import", resolve("scripts/register-loader.mjs"), resolve("scripts/agent/local.ts"), "serve", file], { stdio: ["ignore", "pipe", "pipe"] })
let output = ""
child.stderr.on("data", (data) => { output += data.toString() })
let browser
try {
  await expect.poll(() => /Open canvas: (http:\/\/[^\s]+)/.exec(output)?.[1], { timeout: 15000 }).toBeTruthy()
  const editorUrl = /Open canvas: (http:\/\/[^\s]+)/.exec(output)[1]
  const url = new URL(editorUrl)
  const token = new URLSearchParams(url.hash.slice(1)).get("token")
  const request = async (path, input) => {
    const response = await fetch(`${url.origin}/api/v1/${path}`, { method: input ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) })
    const data = await response.json()
    expect(response.ok, data.error).toBeTruthy()
    return data
  }
  const id = (await request("documents")).documents[0].id
  const read = () => request(`documents/${id}`)
  const edit = async (operations) => request("tools/edit_document", { documentId: id, revision: (await read()).revision, operations })
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = [], outside = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => { if (!request.url().startsWith(url.origin) && /^https?:/.test(request.url())) outside.push(request.url()) })
  await page.goto(editorUrl)
  await expect(page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  expect(new URL(page.url()).hash).toBe("")
  await page.waitForFunction(() => !!window.squig)
  await edit([{ op: "add", nodes: [{ id: "agent_text", type: "text", text: "Agent drew this locally", x: 300, y: 200, w: 300, h: 32, seed: 1, size: 24 }] }])
  await page.waitForFunction(() => window.squig.doc().nodes.agent_text?.text === "Agent drew this locally")
  const human = await page.evaluate(() => window.squig.addText("Drawn in the browser", { x: 300, y: 270 }))
  await expect.poll(async () => (await read()).document.nodes[human]?.text).toBe("Drawn in the browser")
  expect(JSON.parse(await readFile(file, "utf8")).nodes[human].text).toBe("Drawn in the browser")
  await edit([{ op: "variation", id: "direction", title: "Local direction", nodeIds: ["agent_text", human] }])
  await request("tools/comment", { documentId: id, text: "Keep these notes in the local file" })
  await page.waitForFunction(() => window.squig.doc().variations?.length === 1 && window.squig.doc().comments?.length === 1)
  await page.evaluate((id) => window.squig.update(id, { x: 320 }), human)
  await expect.poll(async () => (await read()).document.nodes[human]?.x).toBe(320)
  const savedRevision = (await read()).revision
  await expect.poll(async () => { await new Promise((resolve) => setTimeout(resolve, 3200)); return (await read()).revision }).toBe(savedRevision)
  const cacheCount = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("squig:file:")).length)
  await page.reload()
  await expect(page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  await page.waitForFunction(() => window.squig.doc().comments?.length === 1)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("squig:file:")).length)).toBe(cacheCount)
  const portable = JSON.parse(await page.evaluate(() => window.squig.serialize()))
  expect(portable.variations).toHaveLength(1)
  expect(portable.comments).toHaveLength(1)
  await page.getByRole("button", { name: "Connect agent", exact: true }).click()
  await expect(page.getByText("Agent on this computer", { exact: true })).toBeVisible()
  await expect(page.getByText(/canvas.squig.json/, { exact: false }).first()).toBeVisible()
  await mkdir("test-results/local-agent", { recursive: true })
  await page.screenshot({ animations: "disabled", path: "test-results/local-agent/connected.png" })
  await page.keyboard.press("Escape")

  await page.evaluate(() => window.squig.addText("Keep this pending edit", { x: 300, y: 340 }))
  expect(await page.evaluate(() => window.squig.load(JSON.stringify({ fileName: "Other drawing", nodes: {}, order: [] })))).toBe(false)
  await expect.poll(async () => Object.values((await read()).document.nodes).some((node) => node.text === "Keep this pending edit")).toBe(true)

  // Competing edits must stop the bridge, preserving both the file and local draft.
  await page.route("**/api/v1/documents/*", async (route) => {
    const response = await route.fetch()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.fulfill({ response })
  })
  await page.evaluate(() => window.squig.update("agent_text", { text: "Human draft" }))
  await edit([{ op: "update", patches: [{ id: "agent_text", patch: { text: "Agent draft" } }] }])
  await expect(page.getByRole("button", { name: "Download my draft" })).toBeVisible()
  expect(await page.evaluate(() => window.squig.doc().nodes.agent_text.text)).toBe("Human draft")
  expect((await read()).document.nodes.agent_text.text).toBe("Agent draft")
  await page.screenshot({ animations: "disabled", path: "test-results/local-agent/conflict.png" })
  await page.getByRole("button", { name: "Load file version" }).click()
  await page.waitForFunction(() => window.squig.doc().nodes.agent_text?.text === "Agent draft")
  const draftKey = `squig:file:${id}_draft`
  const originalDraft = await page.evaluate((key) => localStorage.getItem(key), draftKey)
  expect(JSON.parse(originalDraft).nodes.agent_text.text).toBe("Human draft")

  // A later conflict cannot replace the only backup of an earlier human edit.
  await page.evaluate(() => window.squig.update("agent_text", { text: "Second human draft" }))
  await edit([{ op: "update", patches: [{ id: "agent_text", patch: { text: "Second agent draft" } }] }])
  await expect(page.getByRole("button", { name: "Load file version" })).toBeVisible()
  await page.getByRole("button", { name: "Load file version" }).click()
  await expect(page.getByText("A previous local draft is already saved. Download your current draft before loading the file.")).toBeVisible()
  expect(await page.evaluate(() => window.squig.doc().nodes.agent_text.text)).toBe("Second human draft")
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(originalDraft)
  const currentDraftDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download my draft" }).click()
  const downloadedDraft = JSON.parse(await readFile(await (await currentDraftDownload).path(), "utf8"))
  expect(downloadedDraft.nodes.agent_text.text).toBe("Second human draft")
  expect(downloadedDraft.comments).toHaveLength(1)
  await page.getByRole("button", { name: "Load file version" }).click()
  await page.waitForFunction(() => window.squig.doc().nodes.agent_text?.text === "Second agent draft")
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(originalDraft)
  await page.unroute("**/api/v1/documents/*")

  // A disconnected companion still offers the download required to switch files.
  await page.route("**/api/v1/**", (route) => route.abort())
  await page.evaluate(() => window.squig.update("agent_text", { text: "Offline human draft" }))
  await expect(page.getByText("Failed to fetch", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.squig.load(JSON.stringify({ fileName: "Other drawing", nodes: {}, order: [] })))).toBe(false)
  await page.getByRole("button", { name: "Connect agent", exact: true }).click()
  const offlineDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download a copy", exact: true }).click()
  expect(JSON.parse(await readFile(await (await offlineDownload).path(), "utf8")).nodes.agent_text.text).toBe("Offline human draft")
  expect(await page.evaluate(() => window.squig.load(JSON.stringify({ fileName: "Other drawing", nodes: {}, order: [] })))).toBe(true)
  await expect(page.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
  expect((await read()).document.nodes.agent_text.text).toBe("Second agent draft")
  await page.unroute("**/api/v1/**")
  expect(outside).toEqual([])
  expect(errors).toEqual([])

  // Public-style canvas setup never uploads the browser document.
  const plain = await context.newPage()
  const hostedWrites = []
  plain.on("request", (request) => { if (request.url().includes("/api/") && request.method() !== "GET") hostedWrites.push(request.url()) })
  await plain.goto(url.origin)
  await plain.waitForFunction(() => !!window.squig)
  await plain.getByRole("button", { name: "Connect agent", exact: true }).click()
  await expect(plain.getByRole("button", { name: "Download local file", exact: true })).toBeVisible()
  await expect(plain.getByRole("button", { name: "Copy for your agent" })).toBeVisible()
  expect(hostedWrites).toEqual([])
  await plain.screenshot({ animations: "disabled", path: "test-results/local-agent/setup.png" })
  await plain.keyboard.press("Escape")
  const recoveryKey = `sq_canvas_${"r".repeat(43)}`
  await plain.route("**/api/v1/documents/legacy", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "legacy", revision: 10, document: portable, comments: portable.comments.map((comment) => ({ ...comment, nodeId: null, variationId: null })) }) }))
  await plain.goto(`${url.origin}/?agent=legacy#${recoveryKey}`)
  await expect(plain.getByText("Recovered to this browser. Download a copy to keep it as a local file.")).toBeVisible()
  expect(new URL(plain.url()).hash).toBe("")
  expect(new URL(plain.url()).search).toBe("")
  expect(JSON.parse(await plain.evaluate(() => window.squig.serialize())).comments).toHaveLength(1)
  await plain.reload()
  await plain.waitForFunction(() => !!window.squig && window.squig.doc().comments?.length === 1)
  expect(hostedWrites).toEqual([])
  const full = await context.newPage()
  await full.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("squig:file:")) throw new DOMException("Full", "QuotaExceededError")
      return set.call(this, key, value)
    }
  })
  await full.route("**/api/v1/documents/legacy", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "legacy", revision: 10, document: portable, comments: portable.comments }) }))
  await full.goto(`${url.origin}/?agent=legacy#${recoveryKey}`)
  await expect(full.getByText("Recovered in this tab only; browser storage could not save it. Download a local file now. The original online canvas is unchanged.")).toBeVisible()
  expect(JSON.parse(await full.evaluate(() => window.squig.serialize())).comments).toHaveLength(1)

  // A pending recovery cannot discard new work, including when the drawer is full.
  const recoveryContext = await browser.newContext()
  const pending = await recoveryContext.newPage()
  await pending.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("squig:file:")) throw new DOMException("Full", "QuotaExceededError")
      return set.call(this, key, value)
    }
  })
  let releaseRecovery
  const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve })
  await pending.route("**/api/v1/documents/legacy", async (route) => {
    await recoveryGate
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "legacy", revision: 10, document: portable, comments: portable.comments }) })
  })
  await pending.goto(`${url.origin}/?agent=legacy#${recoveryKey}`)
  await pending.waitForFunction(() => !!window.squig)
  const pendingId = await pending.evaluate(() => window.squig.addText("Keep the only unsaved drawing", { x: 80, y: 80 }))
  releaseRecovery()
  await expect(pending.getByText("This drawing changed while the canvas was recovering. Download your draft before retrying recovery.")).toBeVisible()
  expect(await pending.evaluate((id) => window.squig.doc().nodes[id]?.text, pendingId)).toBe("Keep the only unsaved drawing")
  await pending.getByRole("button", { name: "Retry recovery", exact: true }).click()
  await expect(pending.getByText("This drawing could not be saved in this browser. Download your draft before retrying recovery.")).toBeVisible()
  expect(await pending.evaluate((id) => window.squig.doc().nodes[id]?.text, pendingId)).toBe("Keep the only unsaved drawing")
  const recoveryDraftDownload = pending.waitForEvent("download")
  await pending.getByRole("button", { name: "Download my draft", exact: true }).click()
  expect(JSON.parse(await readFile(await (await recoveryDraftDownload).path(), "utf8")).nodes[pendingId].text).toBe("Keep the only unsaved drawing")
  await pending.getByRole("button", { name: "Retry recovery", exact: true }).click()
  await expect(pending.getByText("Recovered in this tab only; browser storage could not save it. Download a local file now. The original online canvas is unchanged.")).toBeVisible()
  expect(JSON.parse(await pending.evaluate(() => window.squig.serialize())).comments).toHaveLength(1)

  // A scrubbed invitation remains usable after a transient error and page reload.
  const retryContext = await browser.newContext()
  const retry = await retryContext.newPage()
  let recoveryAttempts = 0
  await retry.route("**/api/v1/documents/legacy", (route) => {
    recoveryAttempts++
    return route.fulfill(recoveryAttempts === 1
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary recovery failure" }) }
      : { contentType: "application/json", body: JSON.stringify({ id: "legacy", revision: 10, document: portable, comments: portable.comments }) })
  })
  await retry.goto(`${url.origin}/?agent=legacy#${recoveryKey}`)
  await expect(retry.getByRole("button", { name: "Retry recovery", exact: true })).toBeVisible()
  expect(new URL(retry.url()).hash).toBe("")
  await retry.reload()
  await expect(retry.getByText("Recovered to this browser. Download a copy to keep it as a local file.")).toBeVisible()
  expect(recoveryAttempts).toBe(2)
  console.log("Local browser checks passed: disk sync, metadata, no-op saves, immutable conflict backups, offline draft escape, recovery races and retry, no hosted writes or outside requests.")
} finally {
  await browser?.close()
  child.kill("SIGTERM")
  await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve) })
  await rm(directory, { recursive: true, force: true })
}
