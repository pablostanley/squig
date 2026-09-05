import { renderSvg } from "../lib/agent/render.ts"
import assert from "node:assert/strict"
import {
  applyOperations,
  cleanNode,
  emptyDocument,
  validateDocument,
} from "../lib/agent/engine.ts"
import { operation } from "../lib/agent/schema.ts"
import { ALL_DEFS } from "../lib/library/registry.ts"
let checks = 0
function check(fn: () => void) {
  fn()
  checks++
}
let d = emptyDocument("Test")
for (const def of ALL_DEFS)
  check(() => {
    assert.equal(
      cleanNode({ type: "component", kind: def.kind, x: 0, y: 0 }).type,
      "component",
    )
  })
const batch = operation.array().parse([
  {
    op: "add",
    nodes: [
      { id: "a", type: "component", kind: "button", x: 0, y: 0 },
      { id: "b", type: "shape", x: 200, y: 20, w: 100, h: 80 },
      {
        id: "c",
        type: "text",
        x: 400,
        y: 100,
        text: "Hello",
        fontSize: 20,
      },
      {
        id: "line",
        type: "arrow",
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        points: [
          [0, 0],
          [100, 100],
        ],
        head: true,
        bind: ["a", "b"],
      },
      {
        id: "draw",
        type: "draw",
        x: 0,
        y: 200,
        points: [
          [0, 0],
          [10, 20],
        ],
      },
      {
        id: "img",
        type: "image",
        x: 200,
        y: 200,
        src: "data:image/png;base64,AA==",
        naturalW: 10,
        naturalH: 10,
      },
    ],
  },
  { op: "variation", id: "v1", title: "First", nodeIds: ["a", "b", "c"] },
  { op: "note", x: 0, y: 400, text: "Make the action clear" },
])
d = applyOperations(d, batch).document
check(() => assert.equal(d.order.length, 7))
check(() => assert.equal(d.variations.length, 1))
check(() => assert.equal(d.nodes.line.type, "arrow"))
const before = JSON.stringify(d)
check(() =>
  assert.throws(() =>
    applyOperations(
      d,
      operation.array().parse([
        { op: "rename", name: "Changed" },
        { op: "delete", ids: ["missing"] },
      ]),
    ),
  ),
)
check(() => assert.equal(JSON.stringify(d), before))
check(() =>
  assert.throws(() =>
    cleanNode({ id: "__proto__", type: "text", x: 0, y: 0, text: "oops" }),
  ),
)
check(() =>
  assert.throws(() =>
    cleanNode({ type: "component", kind: "not-real", x: 0, y: 0 }),
  ),
)
check(() =>
  assert.throws(() =>
    cleanNode({ type: "text", x: Infinity, y: 0, text: "oops" }),
  ),
)
check(() =>
  assert.throws(() =>
    cleanNode({
      type: "image",
      x: 0,
      y: 0,
      src: "data:image/svg+xml;base64,xxx",
      naturalW: 10,
      naturalH: 10,
    }),
  ),
)
check(() =>
  assert.throws(() =>
    applyOperations(
      d,
      operation
        .array()
        .parse([
          { op: "update", patches: [{ id: "a", patch: { type: "text" } }] },
        ]),
    ),
  ),
)
check(() =>
  assert.throws(() => validateDocument({ ...d, order: [...d.order, "a"] })),
)
let locked = applyOperations(
  d,
  operation
    .array()
    .parse([
      { op: "update", patches: [{ id: "a", patch: { locked: true } }] },
    ]),
).document
check(() =>
  assert.throws(() =>
    applyOperations(
      locked,
      operation.array().parse([{ op: "delete", ids: ["a"] }]),
    ),
  ),
)
locked = applyOperations(
  locked,
  operation.array().parse([
    { op: "update", patches: [{ id: "a", patch: { locked: false } }] },
    { op: "update", patches: [{ id: "a", patch: { x: 15 } }] },
  ]),
).document
check(() => assert.equal(locked.nodes.a.x, 15))
const cloned = applyOperations(
  d,
  operation.array().parse([
    { op: "group", ids: ["a", "b"] },
    { op: "duplicate", ids: ["a", "b", "line"], dx: 800, dy: 0 },
  ]),
)
check(() => assert.equal(cloned.createdIds.length, 3))
check(() =>
  assert.notEqual(
    cloned.document.nodes.a.groupIds?.[0],
    cloned.document.nodes[cloned.createdIds[0]].groupIds?.[0],
  ),
)
check(() => {
  const n = cloned.document.nodes[cloned.createdIds[2]]
  assert.equal(n.type, "arrow")
  if (n.type === "arrow")
    assert.deepEqual(n.bind, cloned.createdIds.slice(0, 2))
})
const arranged = applyOperations(
  d,
  operation.array().parse([
    { op: "align", ids: ["a", "b", "c"], edge: "top" },
    { op: "distribute", ids: ["a", "b", "c"], axis: "x" },
    { op: "reorder", ids: ["a"], position: "front" },
    { op: "flip", ids: ["c"], axis: "x" },
  ]),
).document
check(() => assert.equal(arranged.nodes.a.y, arranged.nodes.c.y))
check(() => assert.equal(arranged.order.at(-1), "a"))
check(() => assert.equal(arranged.nodes.c.flipX, true))
const detached = applyOperations(
  d,
  operation.array().parse([{ op: "detach", ids: ["a"] }]),
).document
check(() => assert.equal(detached.nodes.a, undefined))
check(() => assert.ok(detached.order.length > 5))
check(() => assert.ok(detached.order.every((id) => !!detached.nodes[id])))
const escaped = applyOperations(
  emptyDocument("<unsafe>"),
  operation.array().parse([
    {
      op: "add",
      nodes: [
        {
          id: "text",
          type: "text",
          x: 0,
          y: 0,
          text: '<script>alert("x")</script>',
          fontSize: 20,
        },
      ],
    },
  ]),
).document
check(() => {
  const svg = renderSvg(escaped).svg
  assert.ok(svg.includes("&lt;script&gt;"))
  assert.ok(!svg.includes("<script>"))
})
check(() => assert.equal(renderSvg(escaped).svg, renderSvg(escaped).svg))
check(() => assert.throws(() => renderSvg(escaped, "missing")))
check(() =>
  assert.throws(() =>
    cleanNode({ type: "text", x: 0, y: 0, w: -5, text: "bad" }),
  ),
)
check(() =>
  assert.throws(() =>
    cleanNode({
      type: "text",
      x: 0,
      y: 0,
      link: "javascript:alert(1)",
      text: "bad",
    }),
  ),
)
check(() =>
  assert.throws(() =>
    validateDocument({
      ...d,
      nodes: { ...d.nodes, a: null },
    } as unknown as typeof d),
  ),
)
const cropped = applyOperations(
  d,
  operation.array().parse([
    {
      op: "update",
      patches: [
        { id: "img", patch: { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } } },
      ],
    },
  ]),
).document
check(() =>
  assert.ok(cropped.nodes.img.type === "image" && cropped.nodes.img.crop),
)
const uncropped = applyOperations(
  cropped,
  operation
    .array()
    .parse([{ op: "update", patches: [{ id: "img", unset: ["crop"] }] }]),
).document
check(() =>
  assert.ok(
    uncropped.nodes.img.type === "image" && !uncropped.nodes.img.crop,
  ),
)
check(() =>
  assert.equal(
    applyOperations(
      d,
      operation.array().parse([{ op: "remove_variation", id: "v1" }]),
    ).document.variations.length,
    0,
  ),
)
check(() =>
  assert.throws(() =>
    cleanNode({ type: "component", kind: "constructor", x: 0, y: 0 }),
  ),
)
check(() =>
  assert.throws(() =>
    cleanNode({ type: "component", kind: "__proto__", x: 0, y: 0 }),
  ),
)
// Shared canvas merging must preserve concurrent human and agent changes.
const { mergeCanvas, canvasEqual } = await import("../lib/agent/merge")
check(() => assert.ok(canvasEqual({ a: 1, b: 2 }, { b: 2, a: 1 })))
const baseCanvas = { nodes: { a: { x: 0, text: "hello" } }, order: ["a"] }
check(() =>
  assert.deepEqual(
    mergeCanvas(
      baseCanvas,
      { nodes: { a: { x: 10, text: "hello" } }, order: ["a"] },
      { nodes: { a: { x: 0, text: "world" } }, order: ["a"] },
    ),
    {
      value: { nodes: { a: { x: 10, text: "world" } }, order: ["a"] },
      conflicts: [],
    },
  ),
)
check(() =>
  assert.deepEqual(
    mergeCanvas(
      baseCanvas,
      { nodes: { a: { x: 10, text: "hello" } }, order: ["a"] },
      { nodes: { a: { x: 20, text: "hello" } }, order: ["a"] },
    ).conflicts,
    ["nodes.a.x"],
  ),
)
check(() =>
  assert.deepEqual(
    mergeCanvas<Record<string, unknown>>(
      baseCanvas,
      { nodes: { ...baseCanvas.nodes, b: { x: 20 } }, order: ["a", "b"] },
      { nodes: { ...baseCanvas.nodes, c: { x: 30 } }, order: ["a", "c"] },
    ).value,
    {
      nodes: { ...baseCanvas.nodes, b: { x: 20 }, c: { x: 30 } },
      order: ["a", "c", "b"],
    },
  ),
)
check(() =>
  assert.deepEqual(
    mergeCanvas<Record<string, unknown>>(
      baseCanvas,
      { nodes: {}, order: [] },
      { nodes: { a: { x: 20, text: "hello" } }, order: ["a"] },
    ).conflicts,
    ["nodes.a"],
  ),
)
check(() =>
  assert.deepEqual(
    mergeCanvas(
      { order: ["a", "b", "c"] },
      { order: ["b", "a", "c"] },
      { order: ["a", "c", "b"] },
    ).conflicts,
    ["order"],
  ),
)
console.log(
  `✓ ${checks} agent engine checks passed (${ALL_DEFS.length} library definitions)`,
)
