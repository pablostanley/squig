import { check, report } from "./harness.ts"
import { useCanvasSyncIssue } from "../lib/agent/sync-status.ts"
import type { ModelContext, WebMCPTool } from "../lib/webmcp.ts"
;(globalThis as { window?: unknown }).window = {
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
}
const saved = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key),
}
const { useSquig } = await import("../lib/store.ts")
const { installAgentBridge } = await import("../lib/agent-bridge.ts")
const { createWebMCPTools, findModelContext, registerWebMCP, installWebMCP } =
  await import("../lib/webmcp.ts")
useSquig.setState({
  hydrated: true,
  docId: "webmcp-test",
  nodes: {},
  order: [],
  past: [],
  future: [],
})
installAgentBridge()
const api = window.squig!
check("browser invitation can identify the existing canvas", api.documentId() === "webmcp-test")
useSquig.setState({ docId: "another-browser-canvas" })
check("browser identity follows a canvas switch", api.documentId() === "another-browser-canvas")
useSquig.setState({ docId: "webmcp-test" })
const tools = createWebMCPTools(api)
type Result = { isError?: boolean; content: { text: string }[] }
const run = async (name: string, input: object = {}, signal?: AbortSignal) =>
  (await tools
    .find((t) => t.name === `squig_${name}`)!
    .execute(input, { signal })) as Result
const data = (result: Result) => JSON.parse(result.content[0].text)
const target = { documentId: "webmcp-test" }
const tick = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve()
}

check(
  "unique tool names",
  new Set(tools.map((t) => t.name)).size === tools.length
)
check(
  "every tool has an object schema",
  tools.every((t) => (t.inputSchema as { type: string }).type === "object")
)
check(
  "read returns current document identity",
  data(await run("read_canvas")).documentId === target.documentId
)
const before = useSquig.getState().past.length
const added = await run("add_component", {
  ...target,
  kind: "button",
  at: { x: 20, y: 30, id: "button" },
})
check(
  "component tool uses library defaults",
  !added.isError && api.doc().nodes.button.type === "component"
)
check(
  "tool edit makes one undo step",
  useSquig.getState().past.length === before + 1
)
useSquig.getState().undo()
check("human undo removes tool's edit", !api.doc().nodes.button)
useSquig.getState().redo()
check(
  "human redo restores edit and selection",
  !!api.doc().nodes.button && api.selection().includes("button")
)
await run("update_node", {
  ...target,
  id: "button",
  patch: { x: 50, props: { label: "Continue" } },
})
check("update changes live store", api.doc().nodes.button.x === 50)
const unchanged = api.serialize()
const history = useSquig.getState().past.length
check(
  "stale document rejected",
  !!(await run("remove_nodes", { documentId: "old-file", ids: ["button"] }))
    .isError
)
check(
  "unknown field rejected",
  !!(
    await run("update_node", {
      ...target,
      id: "button",
      patch: { secret: true },
    })
  ).isError
)
check(
  "invalid prop rejected",
  !!(
    await run("update_node", {
      ...target,
      id: "button",
      patch: { props: { label: 23 } },
    })
  ).isError
)
check(
  "unknown node rejected",
  !!(await run("remove_nodes", { ...target, ids: ["button", "missing"] }))
    .isError
)
check(
  "invalid creation rejected",
  !!(
    await run("add_shape", {
      ...target,
      shape: "rect",
      at: { x: Infinity, y: 0, w: 10, h: 10 },
    })
  ).isError
)
check(
  "all rejected edits leave history and drawing intact",
  api.serialize() === unchanged && useSquig.getState().past.length === history
)
await run("add_shape", {
  ...target,
  shape: "rect",
  at: { id: "locked", x: 0, y: 0, w: 100, h: 100, locked: true },
})
check(
  "locked node cannot be removed",
  !!(await run("remove_nodes", { ...target, ids: ["button", "locked"] }))
    .isError && !!api.doc().nodes.button
)
check(
  "locked node cannot be selected",
  !!(await run("set_view", { ...target, action: "select", ids: ["locked"] }))
    .isError
)
useSquig.setState({ transforming: true })
check(
  "active human gesture blocks agent edits",
  !!(await run("remove_nodes", { ...target, ids: ["button"] })).isError
)
check(
  "active gesture still allows reading",
  !(await run("read_canvas")).isError
)
useSquig.setState({ transforming: false })
const cancelled = new AbortController()
cancelled.abort()
let aborted = false
try {
  await run("remove_nodes", { ...target, ids: ["button"] }, cancelled.signal)
} catch {
  aborted = true
}
check(
  "cancelled call rejects without mutation",
  aborted && !!api.doc().nodes.button
)
const raw = {
  id: "batch",
  type: "shape",
  shape: "rect",
  x: 0,
  y: 0,
  w: 20,
  h: 20,
  seed: 1,
}
check(
  "invalid batch is atomic",
  !!(
    await run("add_nodes", {
      ...target,
      nodes: [raw, { ...raw, id: "bad", type: "component", kind: "not-real" }],
    })
  ).isError && !api.doc().nodes.batch
)
check(
  "duplicate batch is atomic",
  !!(await run("add_nodes", { ...target, nodes: [raw, raw] })).isError &&
    !api.doc().nodes.batch
)
await run("add_text", {
  ...target,
  text: "Welcome",
  at: { id: "heading", x: 200, y: 0 },
})
check(
  "arrow binds existing nodes",
  !(
    await run("add_arrow", {
      ...target,
      id: "arrow",
      from: "button",
      to: "heading",
    })
  ).isError
)
check(
  "bad spacing order rejected",
  !!(
    await run("arrange_nodes", {
      ...target,
      ids: ["button", "heading"],
      arrangement: { action: "spacing", axis: "x", gap: 20, order: ["button"] },
    })
  ).isError
)
check(
  "SVG exports canvas marks",
  data(
    await run("export_canvas", { format: "svg", ids: ["button"] })
  ).data.includes("<svg")
)
check(
  "JSON export preserves format",
  JSON.parse(data(await run("export_canvas", { format: "json" })).data).app ===
    "squig"
)
check(
  "empty selection accepted",
  !(await run("set_view", { ...target, action: "select", ids: [] })).isError &&
    api.selection().length === 0
)
check(
  "catalog discoverable",
  data(await run("search_components", { query: "button" })).length > 0
)
check(
  "unknown component describes an error",
  !!(await run("describe_component", { kind: "missing" })).isError
)
useSquig.setState({ hydrated: false })
check("hydration blocks calls", !!(await run("read_canvas")).isError)
useSquig.setState({ hydrated: true, docId: "different-file" })
check(
  "read follows file switches",
  data(await run("read_canvas")).documentId === "different-file"
)
check(
  "old target rejected after actual switch",
  !!(
    await run("add_text", { ...target, text: "wrong file", at: { x: 0, y: 0 } })
  ).isError
)

const registered = new Map<string, WebMCPTool>()
const errors: unknown[] = []
const modern: ModelContext = {
  async registerTool(tool, options) {
    if (registered.has(tool.name)) throw new Error("Duplicate")
    registered.set(tool.name, tool)
    options!.signal.addEventListener(
      "abort",
      () => registered.delete(tool.name),
      { once: true }
    )
  },
}
check(
  "current Document API wins over alias",
  findModelContext({ modelContext: modern }, { modelContext: {} }) === modern
)
check(
  "legacy Navigator API detected",
  findModelContext({}, { modelContext: modern }) === modern
)
check("unsupported browser detection", !findModelContext({}, {}))
check(
  "insecure context is a safe no-op",
  typeof installWebMCP(api) === "function"
)
const cleanup = registerWebMCP(modern, tools, (e) => errors.push(e))
await tick()
check("all modern tools register", registered.size === tools.length)
const staleTool = registered.get("squig_read_canvas")!
cleanup()
check("abort unregisters modern tools", registered.size === 0)
let staleRejected = false
try {
  await staleTool.execute({})
} catch {
  staleRejected = true
}
check("stale callback cannot execute after cleanup", staleRejected)
const first = registerWebMCP(modern, tools, (e) => errors.push(e))
first()
const second = registerWebMCP(modern, tools, (e) => errors.push(e))
await tick()
check(
  "Strict Mode setup-cleanup-setup leaves one registration",
  registered.size === tools.length && errors.length === 0
)
second()
const legacy: ModelContext = {
  registerTool(tool) {
    if (registered.has(tool.name)) throw new Error("Duplicate")
    registered.set(tool.name, tool)
  },
  unregisterTool(name) {
    registered.delete(name)
  },
}
const legacyStop = registerWebMCP(legacy, tools, (e) => errors.push(e))
await tick()
legacyStop()
check("legacy explicit cleanup removes tools", registered.size === 0)
const unrelated = { ...tools[0], name: "another_app" }
registered.set(unrelated.name, unrelated)
const failing: ModelContext = {
  ...legacy,
  registerTool(tool) {
    if (tool.name === tools[1].name) throw new Error("Permission denied")
    legacy.registerTool(tool)
  },
}
registerWebMCP(failing, tools, (e) => errors.push(e))
await tick()
check(
  "partial failure rolls back only squig registrations",
  registered.size === 1 && registered.has("another_app")
)
check("registration rejection is reported", errors.length === 1)

let release: (() => void) | undefined
let delayedOnce = true
const delayed: ModelContext = {
  ...legacy,
  registerTool(tool) {
    legacy.registerTool(tool)
    if (delayedOnce) {
      delayedOnce = false
      return new Promise<void>((resolve) => {
        release = resolve
      })
    }
  },
}
const delayedStop = registerWebMCP(delayed, tools, (e) => errors.push(e))
await tick()
delayedStop()
const remountStop = registerWebMCP(delayed, tools, (e) => errors.push(e))
release!()
await tick()
check(
  "late legacy completion cannot unregister a remount",
  registered.size === tools.length + 1 && errors.length === 1
)
remountStop()
const rejecting: ModelContext = {
  async registerTool() {
    throw new Error("Blocked by permissions policy")
  },
}
registerWebMCP(rejecting, tools, (e) => errors.push(e))
await tick()
check("async registration rejection is caught", errors.length === 2)
;(globalThis as { location?: unknown }).location = { search: "?agent=invited" }
check(
  "pending invitation cannot expose the previous local file",
  !!(await run("read_canvas")).isError
)
useSquig.setState({ docId: "agent_invited" })
check("old hosted state remains blocked until recovery finishes", !!(await run("read_canvas")).isError)
;(globalThis as { location?: unknown }).location = { search: "?local=1" }
check("pending local session cannot expose the previous drawing", !!(await run("read_canvas")).isError)
useCanvasSyncIssue.setState({ localFile: { docId: "agent_invited", path: "/canvas.squig.json", status: "Saved to local file" } })
check("ready local session exposes its drawing", !(await run("read_canvas")).isError)
useCanvasSyncIssue.setState({ localFile: null })
delete (globalThis as { location?: unknown }).location
useSquig.setState({ docId: target.documentId })
check(
  "one node can change stacking order",
  !(
    await run("arrange_nodes", {
      ...target,
      ids: ["button"],
      arrangement: { action: "front" },
    })
  ).isError
)
check(
  "group requires two nodes",
  !!(
    await run("arrange_nodes", {
      ...target,
      ids: ["button"],
      arrangement: { action: "group" },
    })
  ).isError
)

await run("add_shape", {
  ...target,
  shape: "rect",
  at: { id: "rotated", x: 10, y: 20, w: 40, h: 30, rotation: 25 },
})
check(
  "shape tool honors advertised rotation",
  api.doc().nodes.rotated.rotation === 25
)
check(
  "shape type can be updated",
  !(
    await run("update_node", {
      ...target,
      id: "rotated",
      patch: { shape: "ellipse" },
    })
  ).isError &&
    (api.doc().nodes.rotated as { shape: string }).shape === "ellipse"
)

report("webmcp")
