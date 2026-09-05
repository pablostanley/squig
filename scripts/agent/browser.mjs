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
  await page.goto(`${base}/connect`)
  await page.getByLabel("Workspace key", { exact: true }).fill(key)
  await page.getByRole("button", { name: "Connect this browser" }).click()
  await expect(page.getByText("You’re connected.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Browser test canvas/ }),
  ).toBeVisible()
  await page.goto(doc.reviewUrl.replace(new URL(doc.reviewUrl).origin, base))
  await expect(
    page.getByRole("heading", { name: "Browser test canvas" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Meeting first", exact: true }).click()
  await expect(page.locator(".review-sheet")).toContainText("Meeting first")
  await expect(page.locator(".review-sheet")).not.toContainText("Book first")
  await page
    .getByLabel("Note on Meeting first")
    .fill("Keep this direction, with more room for the invitation.")
  await page.getByRole("button", { name: "Add note", exact: true }).click()
  await expect(page.locator(".review-comments")).toContainText(
    "Keep this direction",
  )
  await page
    .getByRole("button", { name: "Choose Meeting first", exact: true })
    .click()
  await expect(page.getByText("Chosen: Meeting first")).toBeVisible()
  await page.goto(`${base}/?agent=${doc.id}`)
  await expect(page.locator(".agent-sync")).toContainText("revision 2")
  await page
    .getByRole("button", { name: "Browser test canvas", exact: true })
    .click()
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .fill("A human edited this")
  await page
    .getByRole("textbox", { name: "file name", exact: true })
    .press("Enter")
  await expect(page.locator(".agent-sync")).toContainText("revision 3", {
    timeout: 15000,
  })
  let current = await api(`documents/${doc.id}`)
  expect(current.document.fileName).toBe("A human edited this")
  expect(current.approval).toBeNull()
  await page.getByRole("button", { name: "Sans serif", exact: true }).click()
  await expect(page.locator(".agent-sync")).toContainText("revision 4", {
    timeout: 15000,
  })
  current = await api(`documents/${doc.id}`)
  expect(current.document.look.font).toBe("sans")
  await api("tools/edit_document", {
    documentId: doc.id,
    revision: 4,
    operations: [{ op: "rename", name: "The agent replied" }, { op: "look", font: "hand" }],
  })
  await expect(
    page.getByRole("button", { name: "The agent replied", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect.poll(async()=> (await api(`documents/${doc.id}`)).document.look.font).toBe("hand")
  await expect(page.getByRole("button",{name:"Hand-drawn",exact:true})).toBeVisible()
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
    .getByRole("button", { name: "The agent replied", exact: true })
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
    page.getByRole("button", { name: "My unsaved local draft", exact: true }),
  ).toBeVisible()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download my draft" }).click()
  const download = await downloadPromise
  const downloaded = JSON.parse(await readFile(await download.path(), "utf8"))
  expect(downloaded.fileName).toBe("My unsaved local draft")
  await page.getByRole("button", { name: "Load latest canvas" }).click()
  await expect(
    page.getByRole("button", { name: "Newer remote version", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    page.getByRole("button", { name: "Download my draft" }),
  ).toHaveCount(0)
  await page.goto(`${base}/docs/mcp`)
  await expect(page.locator("h1")).toHaveText("Install the Squig MCP server")
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(
    "https://squig.sh/docs/mcp",
  )
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
    "✓ Browser workflow passed: connect, compare, comment, approve, human edits, remote sync, genuine conflict, draft recovery, SEO and mobile layouts; no page errors.",
  )
} finally {
  await browser.close()
  await sql`DELETE FROM agent_workspaces WHERE id=${workspace}`
  await sql`DELETE FROM agent_limits WHERE key=${createHash("sha256").update(`workspace:${workspace}`).digest("hex")}`
}
