// Browser credential regressions with an intercepted API; no database or account.
// Start pnpm dev, then run pnpm test:agent:security-browser.
import { chromium, expect } from "@playwright/test"
import { randomBytes } from "node:crypto"
const base = process.env.SQUIG_TEST_URL ?? "http://localhost:3000"
const owner = `sq_${randomBytes(32).toString("base64url")}`
const saved = `sq_canvas_${randomBytes(32).toString("base64url")}`
const candidate = `sq_canvas_${randomBytes(32).toString("base64url")}`
const slot = "squig:canvas-key:one"
const browser = await chromium.launch()
const errors = []
async function fixture(seed = {}, handler = (route) => route.fulfill({ status: 401, json: { error: "Invalid or revoked canvas key" } })) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  // Seed once, without silently restoring poisoned credentials after navigation.
  await context.addInitScript((seed) => {
    if (!sessionStorage.getItem("security-seeded")) {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value)
      sessionStorage.setItem("security-seeded", "1")
    }
  }, seed)
  const calls = []
  await context.route("**/api/v1/**", async (route) => {
    calls.push({ method: route.request().method(), url: route.request().url(), key: route.request().headers().authorization })
    await handler(route)
  })
  const page = await context.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  return { page, context, calls }
}
try {
  const local = await fixture()
  const response = await local.page.goto(base)
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(response.headers()["x-frame-options"]).toBe("DENY")
  expect(response.headers()["referrer-policy"]).toBe("no-referrer")
  await local.page.waitForFunction(() => !!window.squig)
  await local.page.evaluate(() => window.squig.addText("Private local draft", { x: 10, y: 10 }))
  await expect.poll(() => local.page.evaluate(() => window.squig.doc().order.length)).toBe(1)
  await local.page.waitForTimeout(1200)
  await local.page.reload()
  await local.page.waitForFunction(() => !!window.squig)
  await expect.poll(() => local.page.evaluate(() => Object.values(window.squig.doc().nodes).some((n) => n.text === "Private local draft"))).toBe(true)
  expect(local.calls).toEqual([])
  expect(await local.page.evaluate(() => localStorage.getItem("squig:agent-key"))).toBeNull()
  const document = await local.page.evaluate(() => ({ ...window.squig.doc(), variations: [] }))
  await local.context.close()

  for (const fragment of [owner, "sq_canvas_bad", candidate]) {
    const invalid = await fixture({ "squig:agent-key": owner, [slot]: saved })
    await invalid.page.goto(`${base}/?agent=one#${fragment}`)
    await expect.poll(() => new URL(invalid.page.url()).hash).toBe("")
    await expect(invalid.page.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
    await invalid.page.getByRole("button", { name: "Share", exact: true }).click()
    await expect(invalid.page.getByLabel("Editable canvas link", { exact: true })).toHaveCount(0)
    await invalid.page.waitForTimeout(1200)
    expect(await invalid.page.evaluate((slot) => localStorage.getItem(slot), slot)).toBe(saved)
    expect(invalid.calls.every((c) => c.method === "GET" && c.key === `Bearer ${candidate}`)).toBe(true)
    if (fragment !== candidate) expect(invalid.calls).toEqual([])
    const stoppedAt = invalid.calls.length
    await invalid.page.waitForTimeout(1200)
    expect(invalid.calls.length).toBe(stoppedAt)
    await invalid.page.evaluate(() => {
      const doc = JSON.parse(window.squig.serialize())
      doc.fileName = "Another local drawing"
      window.squig.load(JSON.stringify(doc))
    })
    await expect.poll(() => new URL(invalid.page.url()).search).toBe("")
    expect(invalid.calls.length).toBe(stoppedAt)
    await invalid.context.close()
  }

  let release
  const pending = new Promise((resolve) => { release = resolve })
  let revoked = false
  const valid = await fixture({ "squig:agent-key": owner, [slot]: saved }, async (route) => {
    await pending
    await route.fulfill(revoked
      ? { status: 401, json: { error: "Invalid or revoked canvas key" } }
      : { json: { id: "one", revision: 1, document } })
  })
  await valid.page.goto(`${base}/?agent=one#${candidate}`)
  await expect.poll(() => valid.calls.length).toBeGreaterThan(0)
  expect(await valid.page.evaluate((slot) => localStorage.getItem(slot), slot)).toBe(saved)
  expect(new URL(valid.page.url()).hash).toBe("")
  await valid.page.getByRole("button", { name: "Share", exact: true }).click()
  await expect(valid.page.getByLabel("Editable canvas link", { exact: true })).toHaveCount(0)
  expect(valid.calls.every((c) => c.method === "GET" && c.key === `Bearer ${candidate}`)).toBe(true)
  release()
  await expect(valid.page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  await expect(valid.page.getByLabel("Editable canvas link", { exact: true })).toHaveValue(`${base}/?agent=one#${candidate}`)
  expect(await valid.page.evaluate((slot) => localStorage.getItem(slot), slot)).toBe(candidate)
  revoked = true
  await expect(valid.page.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
  await expect(valid.page.getByLabel("Editable canvas link", { exact: true })).toHaveCount(0)
  expect(valid.calls.every((c) => c.method === "GET" && c.key === `Bearer ${candidate}`)).toBe(true)
  await valid.context.close()

  const poisoned = await fixture({ "squig:agent-key": owner, [slot]: owner })
  await poisoned.page.goto(`${base}/?agent=one`)
  await poisoned.page.getByRole("button", { name: "Share", exact: true }).click()
  await expect(poisoned.page.getByLabel("Editable canvas link", { exact: true })).toHaveCount(0)
  expect(poisoned.calls).toEqual([])
  for (const id of ["../../catalog", ""]) {
    await poisoned.page.goto(`${base}/?agent=${encodeURIComponent(id)}#${candidate}`)
    await expect.poll(() => new URL(poisoned.page.url()).hash).toBe("")
    expect(poisoned.calls).toEqual([])
    await poisoned.page.evaluate(() => window.squig.load(window.squig.serialize()))
    await expect.poll(() => new URL(poisoned.page.url()).search).toBe("")
  }
  await poisoned.context.close()

  const redirected = await fixture({}, (route) => route.fulfill({
    status: 302, headers: { Location: `${base}/credential-sink` },
  }))
  let forwarded = false
  await redirected.context.route("**/credential-sink", (route) => {
    forwarded = true
    return route.fulfill({ json: {} })
  })
  await redirected.page.goto(`${base}/?agent=one#${candidate}`)
  await expect.poll(() => redirected.calls.length).toBeGreaterThan(0)
  await redirected.page.waitForTimeout(1200)
  expect(forwarded).toBe(false)
  expect(await redirected.page.evaluate((slot) => localStorage.getItem(slot), slot)).toBeNull()
  await redirected.context.close()

  const full = await fixture({}, (route) => route.fulfill({ json: { id: "one", revision: 1, document } }))
  await full.context.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("squig:canvas-key:")) throw new DOMException("Full", "QuotaExceededError")
      return set.call(this, key, value)
    }
  })
  await full.page.goto(`${base}/?agent=one#${candidate}`)
  await expect(full.page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  expect(new URL(full.page.url()).hash).toBe("")
  expect(await full.page.evaluate((slot) => localStorage.getItem(slot), slot)).toBeNull()
  await full.page.getByRole("button", { name: "Share", exact: true }).click()
  await expect(full.page.getByLabel("Editable canvas link", { exact: true })).toHaveValue(`${base}/?agent=one#${candidate}`)
  await full.context.close()

  const connect = await fixture()
  await connect.page.goto(`${base}/connect`)
  await connect.page.getByLabel("Workspace key", { exact: true }).fill(candidate)
  await connect.page.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(connect.page.locator(".agent-error")).toContainText("Use a workspace key here")
  expect(connect.calls).toEqual([])
  expect(await connect.page.evaluate(() => localStorage.getItem("squig:agent-key"))).toBeNull()
  await connect.context.close()
  expect(errors).toEqual([])
  console.log("✓ Browser security regressions passed: local persistence without API calls, framing, unvalidated invitations, pending/revoked keys, workspace separation")
} finally {
  await browser.close()
}
