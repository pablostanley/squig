import { chromium, expect } from "@playwright/test"
import { neon } from "@neondatabase/serverless"
import { createHash, randomBytes } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
const base = process.env.SQUIG_TEST_URL ?? "http://localhost:3001"
const sql = neon(process.env.DATABASE_URL)
const workspace = `browser_${randomBytes(10).toString("hex")}`,
  key = randomBytes(32).toString("hex")
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
async function api(path, data) {
  const r = await fetch(`${base}/api/v1/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
try {
  await sql`INSERT INTO agent_workspaces(id,name,key_hash) VALUES(${workspace},'Browser verification',${createHash("sha256").update(key).digest("hex")})`
  const doc = await api("documents", { name: "Browser test canvas" })
  await api("tools/edit_document", {
    documentId: doc.id,
    revision: 1,
    operations: [
      {
        op: "add",
        nodes: [
          {
            id: "a",
            type: "text",
            x: 0,
            y: 0,
            w: 500,
            h: 100,
            text: "Meeting first",
            fontSize: 36,
          },
          {
            id: "b",
            type: "text",
            x: 800,
            y: 0,
            w: 500,
            h: 100,
            text: "Book first",
            fontSize: 36,
          },
        ],
      },
      {
        op: "variation",
        id: "a-direction",
        title: "Meeting first",
        nodeIds: ["a"],
      },
      {
        op: "variation",
        id: "b-direction",
        title: "Book first",
        nodeIds: ["b"],
      },
    ],
  })
  // A clean browser opens a document-scoped invitation directly into the editor.
  await page.goto(
    doc.canvasUrl.replace(new URL(doc.canvasUrl).origin, base),
  )
  await expect(page.locator(".agent-sync")).toHaveAttribute(
    "data-connected",
    "true",
  )
  await expect(
    page.getByText("Meeting first", { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByText("Book first", { exact: true }).first(),
  ).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem("squig:agent-key")),
  ).toBeNull()
  expect(new URL(page.url()).hash).toBe("")
  await page.getByRole("button", { name: "Share" }).click()
  await expect(
    page.getByLabel("Editable canvas link", { exact: true }),
  ).toHaveValue(doc.canvasUrl.replace(new URL(doc.canvasUrl).origin, base))
  await expect(
    page.getByRole("button", { name: "Copy for your agent", exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Copy editable canvas link", exact: true })
    .click()
  await expect(
    page.getByRole("button", {
      name: "Copied editable canvas link",
      exact: true,
    }),
  ).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    doc.canvasUrl.replace(new URL(doc.canvasUrl).origin, base),
  )
  await expect(
    page.getByRole("button", {
      name: "Copy editable canvas link",
      exact: true,
    }),
  ).toBeVisible({ timeout: 4000 })
  await page.mouse.click(700, 800)
  await expect(
    page.getByLabel("Editable canvas link", { exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Connect agent", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Copy for your agent", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel("Editable canvas link", { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByLabel("Invitation for your agent"),
  ).not.toBeVisible()
  await page
    .getByRole("button", { name: "Copy for your agent", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible()
  const invitation = await page.evaluate(() =>
    navigator.clipboard.readText(),
  )
  expect(invitation).toContain(`GET /api/v1/documents/${doc.id}`)
  expect(invitation).toContain(doc.canvasKey)
  await expect(
    page.getByRole("button", { name: "Copy for your agent", exact: true }),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("button", { name: "Copy for your agent", exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Hide sidebar", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Sans serif", exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Show sidebar", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Sans serif", exact: true }),
  ).toBeVisible()
  // Shared saves ignore local drawer failures and cross-tab cache events.
  await page.evaluate((id) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("squig:file:agent_"))
        throw new DOMException("Full", "QuotaExceededError")
      return original.call(this, key, value)
    }
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: `squig:file:agent_${id}`,
        newValue: null,
        storageArea: localStorage,
      }),
    )
  }, doc.id)
  await expect(page.getByText("Live canvas", { exact: true })).toHaveCount(
    0,
  )
  await expect(
    page.getByText("not saved — export to keep this one", { exact: true }),
  ).toHaveCount(0)
  const documentRoute = `**/api/v1/documents/${doc.id}`
  await page.route(documentRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Connection interrupted. Reconnecting…",
      }),
    }),
  )
  await expect(
    page.getByText("Connection interrupted. Reconnecting…", {
      exact: true,
    }),
  ).toBeVisible()
  await page.unroute(documentRoute)
  await expect(
    page.getByText("Connection interrupted. Reconnecting…", {
      exact: true,
    }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Browser test canvas", exact: true })
    .click()
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .fill("A human edited this")
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .press("Enter")
  await expect
    .poll(async () => (await api(`documents/${doc.id}`)).document.fileName)
    .toBe("A human edited this")
  let current = await api(`documents/${doc.id}`)
  expect(current.document.fileName).toBe("A human edited this")
  await expect(
    page.getByText("not saved — export to keep this one", { exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Sans serif", exact: true })
    .click()
  await expect
    .poll(async () => (await api(`documents/${doc.id}`)).document.look.font)
    .toBe("sans")
  current = await api(`documents/${doc.id}`)
  expect(current.document.look.font).toBe("sans")
  await api("tools/edit_document", {
    documentId: doc.id,
    revision: current.revision,
    operations: [
      { op: "rename", name: "The agent replied" },
      { op: "look", font: "hand" },
    ],
  })
  await expect(
    page.getByRole("button", { name: "The agent replied", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect
    .poll(async () => (await api(`documents/${doc.id}`)).document.look.font)
    .toBe("hand")
  await expect(
    page.getByRole("button", { name: "Hand-drawn", exact: true }),
  ).toBeVisible()
  // A second browser sees the same objects. A racing edit on a different node
  // merges with the human's filename change instead of pausing collaboration.
  const viewer = await browser.newPage()
  await viewer.goto(
    doc.canvasUrl.replace(new URL(doc.canvasUrl).origin, base),
  )
  await expect(viewer.locator(".agent-sync")).toHaveAttribute(
    "data-connected",
    "true",
  )
  let independentRace = false
  await page.route("**/api/v1/tools/replace_document", async (route) => {
    if (!independentRace) {
      independentRace = true
      const data = route.request().postDataJSON()
      await api("tools/edit_document", {
        documentId: doc.id,
        revision: data.revision,
        operations: [
          {
            op: "update",
            patches: [
              { id: "a", patch: { text: "Agent drew this beside you" } },
            ],
          },
        ],
      })
    }
    await route.continue()
  })
  await page
    .getByRole("button", { name: "The agent replied", exact: true })
    .click()
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .fill("Working together")
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .press("Enter")
  await expect
    .poll(async () => (await api(`documents/${doc.id}`)).document.fileName, { timeout: 15000 })
    .toBe("Working together")
  await expect(
    page.getByText("Agent drew this beside you", { exact: true }).first(),
  ).toBeVisible()
  await expect(
    viewer.getByRole("button", { name: "Working together", exact: true }),
  ).toBeVisible()
  await expect(
    viewer.getByText("Agent drew this beside you", { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Download my draft" }),
  ).toHaveCount(0)
  await page.unroute("**/api/v1/tools/replace_document")
  await viewer.close()
  // Force a real concurrent server edit between the browser's snapshot and save.
  let raced = false
  await page.route("**/api/v1/tools/replace_document", async (route) => {
    if (!raced) {
      raced = true
      const data = route.request().postDataJSON()
      await api("tools/edit_document", {
        documentId: doc.id,
        revision: data.revision,
        operations: [{ op: "rename", name: "Newer remote version" }],
      })
    }
    await route.continue()
  })
  await page
    .getByRole("button", { name: "Working together", exact: true })
    .click()
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .fill("My unsaved local draft")
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .press("Enter")
  await expect(
    page.getByRole("button", { name: "Download my draft" }),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    page.getByRole("button", {
      name: "My unsaved local draft",
      exact: true,
    }),
  ).toBeVisible()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download my draft" }).click()
  const download = await downloadPromise
  const downloaded = JSON.parse(
    await readFile(await download.path(), "utf8"),
  )
  expect(downloaded.fileName).toBe("My unsaved local draft")
  await page.getByRole("button", { name: "Load latest canvas" }).click()
  await expect(
    page.getByRole("button", { name: "Newer remote version", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    page.getByRole("button", { name: "Download my draft" }),
  ).toHaveCount(0)
  // Hiding all chrome must never detach the cloud sync session.
  await page.keyboard.press("Meta+Backslash")
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).not.toBeVisible()
  const hiddenDoc = await api(`documents/${doc.id}`)
  await api("tools/edit_document", {
    documentId: doc.id,
    revision: hiddenDoc.revision,
    operations: [
      {
        op: "update",
        patches: [
          {
            id: "a",
            patch: { text: "Still syncing while chrome is hidden" },
          },
        ],
      },
    ],
  })
  await expect(
    page
      .getByText("Still syncing while chrome is hidden", { exact: true })
      .first(),
  ).toBeVisible()
  await page.keyboard.press("Meta+Backslash")
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toBeVisible()
  // Start with a user's local .squig file and attach the agent in place.
  const localContext = await browser.newContext()
  await localContext.addInitScript(
    (value) => localStorage.setItem("squig:agent-key", value),
    key,
  )
  const local = await localContext.newPage()
  await local.goto(base)
  await local.getByTitle("file menu", { exact: true }).click()
  const chooserPromise = local.waitForEvent("filechooser")
  await local
    .getByRole("menuitem", { name: "Open from disk…", exact: true })
    .click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: "existing.squig.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        app: "squig",
        version: 1,
        fileName: "My existing drawing",
        nodes: {
          existing: {
            id: "existing",
            type: "text",
            x: 0,
            y: 0,
            w: 500,
            h: 100,
            seed: 42,
            fontSize: 32,
            text: "Already on my canvas",
          },
        },
        order: ["existing"],
      }),
    ),
  })
  await expect(
    local.getByText("Already on my canvas", { exact: true }).first(),
  ).toBeVisible()
  await expect(local.getByRole("menu", { includeHidden: true })).toHaveCount(0)
  await local
    .getByRole("button", { name: "Connect agent", exact: true })
    .click()
  await expect(
    local.getByRole("button", { name: "Copy for your agent", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await local.keyboard.press("Escape")
  await local.getByRole("button", { name: "Share", exact: true }).click()
  await expect(
    local.getByLabel("Editable canvas link", { exact: true }),
  ).not.toHaveValue("")
  const attachedId = new URL(local.url()).searchParams.get("agent")
  expect(attachedId).toBeTruthy()
  expect(
    (await api(`documents/${attachedId}`)).document.nodes.existing.text,
  ).toBe("Already on my canvas")
  await expect(local.locator(".agent-sync")).toHaveAttribute("data-connected", "true")
  const idleRevision = (await api(`documents/${attachedId}`)).revision
  let idlePolls = 0
  const countIdlePoll = (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === `/api/v1/documents/${attachedId}`)
      idlePolls++
  }
  local.on("request", countIdlePoll)
  await expect.poll(() => idlePolls, { timeout: 15000 }).toBeGreaterThanOrEqual(3)
  local.off("request", countIdlePoll)
  expect((await api(`documents/${attachedId}`)).revision).toBe(idleRevision)
  await expect(
    local.getByText("Already on my canvas", { exact: true }).first(),
  ).toBeVisible()
  // Switching files releases the old share key without waiting for a poll.
  await local.keyboard.press("Escape")
  await local.getByTitle("file menu", { exact: true }).click()
  await local.getByRole("menuitem", { name: "New file", exact: true }).click()
  await expect(local.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
  expect(new URL(local.url()).search).toBe("")

  // Hold the first save response, then switch files while connecting. The
  // invitation must never attach the newly opened file to that older canvas.
  let releaseSave, markSaveHeld, heldDocumentId
  const saveHeld = new Promise((resolve) => { markSaveHeld = resolve })
  const saveRelease = new Promise((resolve) => { releaseSave = resolve })
  await local.route("**/api/v1/tools/replace_document", async (route) => {
    heldDocumentId = route.request().postDataJSON().documentId
    const response = await route.fetch()
    markSaveHeld()
    await saveRelease
    await route.fulfill({ response })
  })
  await local.getByRole("button", { name: "Connect agent", exact: true }).click()
  await saveHeld
  await local.keyboard.press("Escape")
  await local.getByTitle("file menu", { exact: true }).click()
  await local.getByRole("menuitem", { name: "New file", exact: true }).click()
  const saveFinished = local.waitForResponse("**/api/v1/tools/replace_document")
  releaseSave()
  await saveFinished
  await expect(local.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
  await local.unroute("**/api/v1/tools/replace_document")
  // A fresh share must create a fresh canvas; it must not reuse the held save.
  await local.getByRole("button", { name: "Share", exact: true }).click()
  await expect(local.getByLabel("Editable canvas link", { exact: true })).not.toHaveValue("")
  const newId = new URL(local.url()).searchParams.get("agent")
  expect(newId).toBeTruthy()
  expect(newId).not.toBe(attachedId)
  expect(newId).not.toBe(heldDocumentId)
  expect((await api(`documents/${newId}`)).document.nodes).toEqual({})
  await localContext.close()

  // A delayed initial load must not overwrite a file opened in the meantime.
  const openingContext = await browser.newContext()
  const opening = await openingContext.newPage()
  opening.on("pageerror", (e) => errors.push(e.message))
  let releaseOpen, markOpenHeld
  const openHeld = new Promise((resolve) => { markOpenHeld = resolve })
  const openRelease = new Promise((resolve) => { releaseOpen = resolve })
  await opening.route(`**/api/v1/documents/${doc.id}`, async (route) => {
    const response = await route.fetch()
    markOpenHeld()
    await openRelease
    await route.fulfill({ response })
  })
  await opening.goto(doc.canvasUrl.replace(new URL(doc.canvasUrl).origin, base))
  await openHeld
  await opening.getByTitle("file menu", { exact: true }).click()
  await opening.getByRole("menuitem", { name: "New file", exact: true }).click()
  const openFinished = opening.waitForResponse(`**/api/v1/documents/${doc.id}`)
  releaseOpen()
  await openFinished
  await expect(opening).toHaveURL(`${base}/`)
  await expect(opening.locator(".agent-sync")).toHaveAttribute("data-connected", "false")
  await expect(opening.getByRole("button", { name: "untitled scribbles", exact: true })).toBeVisible()
  await openingContext.close()
  await page.goto(`${base}/docs/mcp`)
  await expect(page.locator("h1")).toHaveText(
    "Install the Squig MCP server",
  )
  expect(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
  ).toBe("https://squig.sh/docs/mcp")
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ["/docs", "/docs/api", "/connect"]) {
    await page.goto(`${base}${path}`)
    await expect(page.locator("h1")).toBeVisible()
    const overflow = await page
      .locator(".agent-page")
      .evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1)
  }
  expect(errors).toEqual([])
  await mkdir("test-results", { recursive: true })
  await page.screenshot({ path: "test-results/agent-connect-mobile.png" })
  console.log(
    "✓ Browser workflow passed: direct canvas invitation, scoped connection, visible editable wireframes, human edits, remote sync, genuine conflict, draft recovery, SEO and mobile layouts; no page errors.",
  )
} finally {
  await browser.close()
  await sql`DELETE FROM agent_workspaces WHERE id=${workspace}`
  await sql`DELETE FROM agent_limits WHERE key=${createHash("sha256").update(`workspace:${workspace}`).digest("hex")}`
}
