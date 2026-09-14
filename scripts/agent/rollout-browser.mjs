import { chromium, expect } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { randomBytes } from "node:crypto"

// Run against a dev server with DATABASE_URL unset. Recovery uses an isolated
// HTTP fixture so this check never needs, or writes to, a hosted database.
const base = process.env.SQUIG_TEST_URL ?? "http://localhost:3011"
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const requests = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("request", (request) => { if (request.url().includes("/api/v1/")) requests.push(request.url()) })
try {
  await page.goto(base)
  await page.waitForFunction(() => !!window.squig)
  await page.evaluate(() => {
    window.squig.addText("My local drawing", { x: 150, y: 180 })
  })
  const original = await page.evaluate(() => window.squig.serialize())
  expect(requests).toHaveLength(0)
  await page.getByRole("button", { name: "Connect agent", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Agent storage is not configured" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  expect(await page.evaluate(() => window.squig.serialize())).toBe(original)
  expect(new URL(page.url()).search).toBe("")
  await mkdir("test-results/agent-rollout", { recursive: true })
  await page.screenshot({ path: "test-results/agent-rollout/missing-database.png" })

  // A schema failure must be retryable without closing the popover.
  await page.route("**/api/v1/**", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({
      code: "AGENT_STORAGE_SCHEMA",
      error: "Agent storage needs a database migration. Operator: run pnpm db:migrate, then pnpm db:check. See /docs/self-hosting.",
    }),
  }))
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "needs a database migration" })).toBeVisible()
  expect(await page.evaluate(() => window.squig.serialize())).toBe(original)
  await page.keyboard.press("Escape")
  await page.evaluate(() => window.squig.addText("Still editable", { x: 150, y: 250 }))
  expect(await page.evaluate(() => window.squig.serialize())).toContain("Still editable")

  // Load an older local canvas containing an embedded SVG.
  await page.evaluate(() => {
    const doc = JSON.parse(window.squig.serialize())
    doc.nodes.logo = {
      id: "logo", type: "image", x: 150, y: 320, w: 240, h: 120,
      naturalW: 240, naturalH: 120, seed: 1, name: "Legacy logo",
      src: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#333"/><text x="25" y="65" fill="white" font-size="25">Legacy SVG</text></svg>')}`,
    }
    doc.order.push("logo")
    window.squig.load(JSON.stringify(doc))
  })
  const legacy = await page.evaluate(() => window.squig.serialize())
  await page.getByRole("button", { name: "Connect agent", exact: true }).click()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  expect(await page.evaluate(() => window.squig.serialize())).toBe(legacy)

  await page.unroute("**/api/v1/**")
  let uploaded
  let revision = 1
  let saves = 0
  let reads = 0
  const canvasKey = `sq_canvas_${randomBytes(32).toString("base64url")}`
  const id = "rollout_fixture"
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1/", "")
    const body = route.request().postDataJSON()
    let result
    if (path === "workspaces") result = { key: `sq_${randomBytes(32).toString("base64url")}` }
    else if (path === "documents") result = { id, revision, canvasKey }
    else if (path === "tools/replace_document") {
      uploaded = body.document
      saves++
      for (const node of Object.values(uploaded.nodes)) {
        if (node.type === "text") node.align ??= "left"
      }
      revision++
      result = { id, revision, document: uploaded }
    } else if (path === `documents/${id}`) {
      reads++
      result = { id, revision, document: uploaded }
    }
    else throw new Error(`Unexpected route ${path}`)
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(result) })
  })
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("button", { name: "Copy for your agent" })).toBeVisible()
  await expect(page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  expect(uploaded.nodes.logo.src).toMatch(/^data:image\/(png|webp);base64,/)
  expect(uploaded.nodes.logo.w).toBe(240)
  expect(await page.evaluate(() => window.squig.doc().nodes.logo.src)).toBe(uploaded.nodes.logo.src)
  await page.screenshot({ path: "test-results/agent-rollout/connected-svg.png" })

  // Actual clipboard ingestion must rasterize even small SVGs.
  await page.keyboard.press("Escape")
  await expect(page.locator(".agent-connect-panel")).toHaveCount(0)
  await page.evaluate(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="12"/></svg>'
    const transfer = new DataTransfer()
    transfer.items.add(new File([svg], "tiny.svg", { type: "image/svg+xml" }))
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }))
  })
  await expect.poll(() => page.evaluate(() => Object.values(window.squig.doc().nodes).filter((n) => n.type === "image").length)).toBe(2)
  expect(await page.evaluate(() => Object.values(window.squig.doc().nodes).filter((n) => n.type === "image").every((n) => /^data:image\/(png|webp|jpeg|gif);base64,/.test(n.src)))).toBe(true)
  await expect.poll(() => Object.values(uploaded.nodes).filter((n) => n.type === "image").length).toBe(2)
  await page.evaluate(() => window.squig.addText("Normalize once", { x: 150, y: 500 }))
  await expect.poll(() => page.evaluate(() => Object.values(window.squig.doc().nodes).find((n) => n.text === "Normalize once")?.align)).toBe("left")
  const settledSaves = saves
  const settledReads = reads
  await expect.poll(() => reads, { timeout: 10000 }).toBeGreaterThanOrEqual(settledReads + 3)
  expect(saves).toBe(settledSaves)
  expect(errors).toEqual([])
  console.log("Browser rollout checks passed: local editing, missing database, schema diagnostic, retry, legacy SVG sharing, SVG paste and normalized saves settle without repeated writes.")
} finally {
  await browser.close()
}
