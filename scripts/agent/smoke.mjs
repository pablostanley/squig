import assert from "node:assert/strict"
import { randomBytes, createHash } from "node:crypto"
import { neon } from "@neondatabase/serverless"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
const base = process.env.SQUIG_TEST_URL ?? "http://localhost:3001"
if (!process.env.DATABASE_URL)
  throw new Error(
    "Run with --env-file=.env.local so fixtures can be cleaned up.",
  )
const sql = neon(process.env.DATABASE_URL)
const hash = (v) => createHash("sha256").update(v).digest("hex")
const workspaces = []
const key = randomBytes(32).toString("hex"),
  other = randomBytes(32).toString("hex")
async function fixture(key) {
  const id = `test_${randomBytes(10).toString("hex")}`
  await sql`INSERT INTO agent_workspaces (id,name,key_hash) VALUES (${id},'Integration test',${hash(key)})`
  workspaces.push(id)
  return id
}
let checks = 0
async function request(path, key, data, status = 200) {
  const r = await fetch(`${base}/api/v1/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  assert.equal(r.status, status, `${path}: ${await r.clone().text()}`)
  checks++
  return r.json()
}
try {
  await fixture(key)
  await fixture(other)
  await request("documents", "bad-key", undefined, 401)
  const doc = await request("documents", key, { name: "Agent smoke" }, 201)
  await request(`documents/${doc.id}`, other, undefined, 404)
  const sibling = await request(
    "documents",
    key,
    { name: "Another canvas" },
    201,
  )
  const scoped = doc.canvasKey
  assert.equal(new URL(doc.canvasUrl).pathname, "/")
  assert.equal(new URL(doc.canvasUrl).hash.slice(1), scoped)
  const visible = await request("documents", scoped)
  assert.deepEqual(
    visible.documents.map((d) => d.id),
    [doc.id],
  )
  await request(`documents/${doc.id}`, scoped)
  await request(`documents/${sibling.id}`, scoped, undefined, 404)
  await request("documents", scoped, { name: "Forbidden" }, 403)
  await request("workspace/rotate-key", scoped, {}, 403)
  await request(
    "tools/delete_document",
    scoped,
    { documentId: doc.id, revision: 1 },
    403,
  )
  await request(
    "tools/rotate_canvas_link",
    scoped,
    { documentId: doc.id },
    403,
  )
  const client = new Client({
    name: "squig-integration-test",
    version: "1.0.0",
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${scoped}` } },
    }),
  )
  const tools = await client.listTools()
  assert.ok(tools.tools.some((t) => t.name === "squig_edit_document"))
  checks++
  const resources = await client.listResources()
  assert.ok(resources.resources.length)
  checks++
  const prompts = await client.listPrompts()
  assert.ok(prompts.prompts.length)
  checks++
  const catalog = await client.callTool({
    name: "squig_catalog",
    arguments: { query: "button" },
  })
  assert.equal(catalog.isError, undefined)
  checks++
  const edited = await client.callTool({
    name: "squig_edit_document",
    arguments: {
      documentId: doc.id,
      revision: 1,
      operations: [
        {
          op: "add",
          nodes: [
            {
              id: "title",
              type: "text",
              x: 20,
              y: 20,
              text: "A real wireframe",
              fontSize: 32,
            },
          ],
        },
        { op: "variation", id: "one", title: "One", nodeIds: ["title"] },
      ],
    },
  })
  assert.ok(!edited.isError, JSON.stringify(edited))
  checks++
  let current = await request(`documents/${doc.id}`, key)
  assert.equal(current.revision, 2)
  checks++
  await request(
    "tools/edit_document",
    key,
    {
      documentId: doc.id,
      revision: 1,
      operations: [{ op: "rename", name: "Stale" }],
    },
    409,
  )
  await request(
    "tools/edit_document",
    key,
    {
      documentId: doc.id,
      revision: 2,
      operations: [
        { op: "rename", name: "Should not save" },
        { op: "delete", ids: ["missing"] },
      ],
    },
    404,
  )
  current = await request(`documents/${doc.id}`, key)
  assert.equal(current.document.fileName, "Agent smoke")
  checks++
  const concurrent = await Promise.all(
    [0, 1].map((i) =>
      fetch(`${base}/api/v1/tools/edit_document`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: doc.id,
          revision: 2,
          operations: [{ op: "rename", name: `Concurrent ${i}` }],
        }),
      }),
    ),
  )
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409])
  checks++
  current = await request(`documents/${doc.id}`, key)
  const history = await request("tools/history", key, {
    documentId: doc.id,
  })
  assert.deepEqual(
    history.revisions.map((r) => r.revision),
    [3, 2, 1],
  )
  checks++
  await request("tools/restore", key, {
    documentId: doc.id,
    revision: 3,
    targetRevision: 2,
  })
  const exported = await request("tools/export_document", key, {
    documentId: doc.id,
  })
  assert.equal(exported.file.nodes.title.text, "A real wireframe")
  checks++
  const malformed = await fetch(`${base}/api/v1/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{",
  })
  assert.equal(malformed.status, 400)
  checks++
  const origin = await fetch(`${base}/api/v1/documents`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Origin: "https://untrusted.example",
    },
  })
  assert.equal(origin.status, 403)
  checks++
  const invalid = await client.callTool({
    name: "squig_edit_document",
    arguments: {
      documentId: doc.id,
      revision: 4,
      operations: [
        {
          op: "add",
          nodes: [{ type: "component", kind: "fake", x: 0, y: 0 }],
        },
      ],
    },
  })
  assert.equal(invalid.isError, true)
  checks++
  const svg = await request("tools/render_document", key, {
    documentId: doc.id,
    format: "svg",
  })
  assert.ok(svg.svg.includes("A real wireframe"))
  checks++
  const png = await client.callTool({
    name: "squig_render_document",
    arguments: { documentId: doc.id, format: "png" },
  })
  assert.ok(!png.isError, JSON.stringify(png))
  assert.equal(png.content[0].type, "image")
  checks += 2
  const canvasRotation = await request("tools/rotate_canvas_link", key, {
    documentId: doc.id,
  })
  await request(`documents/${doc.id}`, scoped, undefined, 401)
  await request(`documents/${doc.id}`, canvasRotation.canvasKey)
  const newKey = await request("workspace/rotate-key", key, {})
  await request(`documents/${doc.id}`, key, undefined, 401)
  await request(
    "tools/delete_document",
    newKey.key,
    { documentId: doc.id, revision: 1 },
    409,
  )
  await request("tools/delete_document", newKey.key, {
    documentId: doc.id,
    revision: 4,
  })
  await request(`documents/${doc.id}`, newKey.key, undefined, 404)
  await client.close()
  console.log(
    `✓ ${checks} REST/MCP integration checks passed; real database, isolation, atomicity, canvas key scopes, rotation and concurrency`,
  )
} finally {
  for (const id of workspaces) {
    await sql`DELETE FROM agent_workspaces WHERE id = ${id}`
    await sql`DELETE FROM agent_limits WHERE key = ${hash(`workspace:${id}`)}`
  }
}
