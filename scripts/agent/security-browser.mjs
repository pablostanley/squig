// Browser credential regressions with an intercepted API; no database or account.
// Start pnpm dev, then run pnpm test:agent:security-browser.
import { chromium, expect } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { mkdir } from "node:fs/promises"
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
    expect(await invalid.page.evaluate(() => localStorage.getItem("squig:shared-files:v1"))).toBeNull()
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

  let sharedDocument = { ...document, fileName: "Agent recent canvas" }
  const localFile = { id: "local", name: "Local recent drawing", updatedAt: 1, nodes: document.nodes, order: document.order, look: document.look }
  let recentRevoked = false
  const recent = await fixture({
    "squig:files:v1": JSON.stringify([{ id: localFile.id, name: localFile.name, updatedAt: localFile.updatedAt }]),
    "squig:file:local": JSON.stringify(localFile),
  }, async (route) => {
    if (recentRevoked) return route.fulfill({ status: 401, json: { error: "Invalid or revoked canvas key" } })
    if (route.request().method() === "POST") sharedDocument = route.request().postDataJSON().document
    await route.fulfill({ json: { id: "one", revision: 1, document: sharedDocument } })
  })
  const openRecents = async () => {
    await recent.page.getByRole("button", { name: "squig", exact: true }).click()
    await recent.page.getByRole("menuitem", { name: "Open recent", exact: true }).hover()
    await expect(recent.page.getByRole("menuitem", { name: /Local recent drawing/ })).toBeVisible()
  }
  await recent.page.goto(`${base}/?agent=one#${candidate}`)
  await expect(recent.page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  await openRecents()
  await expect(recent.page.getByRole("menuitem", { name: /Agent recent canvas shared/ })).toBeVisible()
  await mkdir("test-results/agent-recents", { recursive: true })
  await recent.page.screenshot({ path: "test-results/agent-recents/menu.png" })
  await recent.page.getByRole("menuitem", { name: /Local recent drawing/ }).click()
  await expect(recent.page.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
  expect(new URL(recent.page.url()).search).toBe("")
  await recent.page.reload()
  await openRecents()
  sharedDocument = { ...sharedDocument, fileName: "Latest agent canvas" }
  await recent.page.getByRole("menuitem", { name: /Agent recent canvas shared/ }).click()
  await expect(recent.page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  await expect(recent.page.getByRole("button", { name: "Latest agent canvas", exact: true })).toBeVisible()
  expect(new URL(recent.page.url()).search).toBe("?agent=one")
  expect(recent.calls.every((c) => c.key === `Bearer ${candidate}` && c.method === "GET")).toBe(true)
  expect(await recent.page.evaluate(() => JSON.parse(localStorage.getItem("squig:shared-files:v1")).length)).toBe(1)
  expect(await recent.page.evaluate(() => localStorage.getItem("squig:file:agent_one"))).toBeNull()
  // Both remote and local renames update the shortcut without another visit.
  sharedDocument = { ...sharedDocument, fileName: "Remote rename" }
  await expect(recent.page.getByRole("button", { name: "Remote rename", exact: true })).toBeVisible()
  await recent.page.getByRole("button", { name: "Remote rename", exact: true }).click()
  await recent.page.getByRole("textbox", { name: "file name", exact: true }).fill("Renamed shared canvas")
  await recent.page.getByRole("textbox", { name: "file name", exact: true }).press("Enter")
  await expect.poll(() => sharedDocument.fileName).toBe("Renamed shared canvas")
  await expect.poll(() => recent.page.evaluate(() => JSON.parse(localStorage.getItem("squig:shared-files:v1"))[0].name)).toBe("Renamed shared canvas")
  // Another tab's drawer refresh must not detach this live canvas.
  const otherTab = await recent.context.newPage()
  await otherTab.goto(base)
  await otherTab.waitForFunction(() => !!window.squig)
  await otherTab.evaluate(() => window.squig.addText("Another tab's local edit", { x: 80, y: 80 }))
  await expect.poll(() => otherTab.evaluate(() => JSON.parse(localStorage.getItem("squig:file:local")).order.length)).toBe(localFile.order.length + 1)
  await expect(recent.page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  await otherTab.close()
  await openRecents()
  await recent.page.getByRole("menuitem", { name: /Local recent drawing/ }).click()
  await recent.page.getByRole("button", { name: /^Search / }).click()
  await recent.page.getByRole("textbox", { name: "Search commands, layers, components, blocks, and icons" }).fill("Renamed shared canvas")
  await recent.page.getByRole("dialog", { name: "Search Squig", exact: true }).getByRole("button", { name: /Renamed shared canvas/ }).click()
  await expect(recent.page.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  await openRecents()
  await recent.page.getByRole("menuitem", { name: /Local recent drawing/ }).click()
  recentRevoked = true
  await openRecents()
  await recent.page.getByRole("menuitem", { name: /Renamed shared canvas shared/ }).click()
  await expect(recent.page.getByText("Invalid or revoked canvas key", { exact: true })).toBeVisible()
  await expect(recent.page.getByRole("button", { name: "Local recent drawing", exact: true })).toBeVisible()
  await openRecents()
  await recent.page.getByRole("button", { name: "remove Renamed shared canvas from recent files", exact: true }).click()
  const removeDialog = recent.page.getByRole("alertdialog", { name: "Remove from recent files?" })
  await expect(removeDialog).toBeVisible()
  await expect(removeDialog).toContainText("The shared canvas stays online.")
  expect(await recent.page.evaluate(() => JSON.parse(localStorage.getItem("squig:shared-files:v1")).length)).toBe(1)
  await removeDialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await openRecents()
  await expect(recent.page.getByRole("menuitem", { name: /Renamed shared canvas shared/ })).toBeVisible()
  await recent.page.getByRole("button", { name: "remove Renamed shared canvas from recent files", exact: true }).click()
  await removeDialog.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(removeDialog).toHaveCount(0)
  await openRecents()
  await expect(recent.page.getByRole("menuitem", { name: /Renamed shared canvas shared/ })).toHaveCount(0)
  expect(await recent.page.evaluate(() => JSON.parse(localStorage.getItem("squig:shared-files:v1")))).toEqual([])
  expect(await recent.page.evaluate(() => localStorage.getItem("squig:file:local"))).not.toBeNull()
  expect(await recent.page.evaluate((slot) => localStorage.getItem(slot), slot)).toBe(candidate)
  expect(recent.calls.some((c) => c.method === "DELETE")).toBe(false)
  await recent.context.close()

  const unsaved = await fixture({
    "squig:files:v1": JSON.stringify([{ id: localFile.id, name: localFile.name, updatedAt: localFile.updatedAt }]),
    "squig:file:local": JSON.stringify(localFile),
    "squig:shared-files:v1": JSON.stringify([{ id: "agent_one", agentId: "one", name: "Shared shortcut", updatedAt: 2 }]),
    [slot]: candidate,
  })
  await unsaved.page.goto(base)
  await unsaved.page.waitForFunction(() => !!window.squig)
  await unsaved.page.evaluate(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("squig:file:")) throw new DOMException("Full", "QuotaExceededError")
      return set.call(this, key, value)
    }
  })
  await unsaved.page.evaluate(() => window.squig.addText("Unsaved local work", { x: 40, y: 40 }))
  await unsaved.page.getByRole("button", { name: "squig", exact: true }).click()
  await unsaved.page.getByRole("menuitem", { name: "Open recent", exact: true }).hover()
  await unsaved.page.getByRole("menuitem", { name: /Shared shortcut shared/ }).click()
  await expect(unsaved.page.getByText("Export this drawing before opening a shared canvas. Its changes could not be saved.", { exact: true })).toBeVisible()
  expect(new URL(unsaved.page.url()).search).toBe("")
  expect(unsaved.calls).toEqual([])
  expect(await unsaved.page.evaluate(() => Object.values(window.squig.doc().nodes).some((n) => n.text === "Unsaved local work"))).toBe(true)
  await unsaved.context.close()

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
  console.log("✓ Browser security regressions passed: local persistence, shared recents and live reopening, renames, quota protection, framing, invitation validation, revoked keys, workspace separation")
} finally {
  await browser.close()
}
