import { chromium, expect } from "@playwright/test"
import { mkdir } from "node:fs/promises"

const base = process.env.SQUIG_TEST_URL
if (!base) throw new Error("Set SQUIG_TEST_URL to the Squig deployment being verified.")
const origin = new URL(base).origin
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = [], writes = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("request", (request) => {
  if (request.url().startsWith(`${origin}/api/`) && request.method() !== "GET") writes.push(request.url())
})
try {
  // Protected previews can establish their short-lived access cookie first.
  await page.goto(process.env.SQUIG_PREVIEW_ACCESS_URL || base)
  await page.waitForURL((url) => url.origin === origin)
  await page.waitForFunction(() => !!window.squig)
  const headers = (await context.request.get(origin)).headers()
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["referrer-policy"]).toBe("no-referrer")
  await page.evaluate(() => window.squig.addText("Release check — local browser drawing", { x: 300, y: 250 }))
  let invitation = ""
  await page.exposeFunction("captureInvitation", (text) => { invitation = text })
  await page.evaluate(() => { navigator.clipboard.writeText = (text) => window.captureInvitation(text) })
  const documentId = await page.evaluate(() => window.squig.documentId())
  await page.getByRole("button", { name: "Connect agent", exact: true }).click()
  await expect(page.locator(".agent-connect-panel").getByRole("button", { name: /Download/ })).toHaveCount(0)
  await expect(page.getByText("Paste this invitation into your agent.")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Invitation for your agent" })).toBeHidden()
  await expect(page.getByRole("button", { name: "Copy invitation", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Copy invitation", exact: true }).click()
  await expect.poll(() => invitation).toContain(documentId)
  expect(invitation).toContain("already-open Squig browser tab")
  expect(invitation).toContain("window.squig.documentId()")
  expect(invitation).not.toContain("pnpm")
  await page.evaluate((expectedId) => {
    if (window.squig.documentId() !== expectedId) throw new Error("The invitation points to a different canvas")
    window.squig.addText("Invited agent edit — autosaved", { x: 300, y: 300 })
  }, documentId)
  await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
  await mkdir("test-results/release", { recursive: true })
  await page.screenshot({ animations: "disabled", path: "test-results/release/connect-agent.png" })
  await page.keyboard.press("Escape")
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("squig:file:") && localStorage.getItem(key)?.includes("Invited agent edit")))
  await page.reload()
  await page.waitForFunction(() => !!window.squig && Object.values(window.squig.doc().nodes).some((node) => node.text?.includes("Release check")))
  expect(await page.evaluate(() => Object.values(window.squig.doc().nodes).some((node) => node.text?.includes("Invited agent edit")))).toBe(true)
  expect(await page.evaluate(() => window.squig.documentId())).toBe(documentId)
  for (const path of ["/connect", "/docs/mcp", "/docs/webmcp", "/docs/api", "/docs/plugin", "/docs/self-hosting"]) {
    const response = await page.goto(origin + path)
    expect(response?.status(), path).toBe(200)
    if (path === "/docs/api") {
      await expect(page.getByRole("heading", { name: "create_document", exact: true })).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "delete_document", exact: true })).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "get_document", exact: true })).toBeVisible()
    }
  }
  const retired = await context.request.get(`${origin}/mcp`)
  expect(retired.status()).toBe(410)
  expect((await retired.json()).code).toBe("SQUIG_LOCAL_ONLY")
  // Verify retirement before sending any formerly mutating request.
  for (const path of ["/mcp", "/api/v1/workspaces", "/api/v1/tools/edit_document"]) {
    const response = await context.request.post(origin + path, { data: {} })
    expect(response.status(), path).toBe(410)
    expect((await response.json()).code).toBe("SQUIG_LOCAL_ONLY")
  }
  expect((await context.request.get(`${origin}/api/v1/documents`)).status()).toBe(401)
  const api = await (await context.request.get(`${origin}/openapi.json`)).json()
  expect(api.servers[0].url).toContain("127.0.0.1")
  expect(api.paths["/tools/create_document"]).toBeUndefined()
  const guide = await (await context.request.get(`${origin}/llms.txt`)).text()
  expect(guide).toContain("pnpm build:local")
  expect(errors).toEqual([])
  console.log(`Release browser checks passed for ${origin}: local drawing persistence, setup/docs, no canvas uploads, retired writes, recovery auth, local OpenAPI and response headers.`)
} finally {
  await browser.close()
}
