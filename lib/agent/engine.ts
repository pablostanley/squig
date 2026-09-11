import { lookSchema, nodeFields } from "./schema"
import { nanoid } from "nanoid"
import {
  DocError,
  bringToFront,
  emptyDoc,
  patchNode,
  sendToBack,
  stampGroup,
  textNode,
  vouchNode,
} from "@/lib/doc"
import { pruneDegenerateGroups } from "@/lib/canvas/groups"
import { normalizeRotation } from "@/lib/canvas/rotation"
import { alignNodes, distributeNodes } from "@/lib/canvas/arrange"
import type { TextMeasurer } from "@/lib/canvas/text-metrics"
import type { FontMode } from "@/lib/theme"
import { textMeasurer } from "./text-metrics"
import { getDef } from "@/lib/library/registry"
import { breakApart } from "@/lib/library/break-apart"
import { settleBinds, remapBinds } from "@/lib/canvas/arrow-binding"
import type { SquigNode, SquigDoc } from "@/lib/types"
import { THEMES, type Look } from "@/lib/theme"
import type { Operation } from "./schema"

export class AgentError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export interface Variation {
  id: string
  title: string
  description: string
  nodeIds: string[]
}
export interface CanvasDocument extends SquigDoc {
  look: Look
  variations: Variation[]
}
export function emptyDocument(name: string): CanvasDocument {
  return { ...emptyDoc(name), variations: [] }
}
const safeId = (s: string) =>
  /^[a-zA-Z0-9_-]{1,80}$/.test(s) &&
  !["__proto__", "constructor", "prototype"].includes(s)
/** lib/doc refuses in sentences; the workspace refuses in status codes. */
function withDoc<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (!(error instanceof DocError)) throw error
    throw new AgentError(400, error.message)
  }
}
/**
 * A node from an agent's JSON. Zod is the boundary — its messages name the
 * field and the API documents them — and the prefill is what the workspace
 * assumes when a caller leaves a field out. Everything past that is a node
 * rule, and node rules live in lib/doc.
 */
export function cleanNode(raw: Record<string, unknown>): SquigNode {
  const parsed = nodeFields.safeParse(raw)
  if (!parsed.success)
    throw new AgentError(
      400,
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    )
  const def =
    raw.type === "component" && typeof raw.kind === "string"
      ? getDef(raw.kind)
      : undefined
  if (raw.type === "component" && !def)
    throw new AgentError(
      400,
      `Unknown component: ${raw.kind}. Search catalog first.`,
    )
  return withDoc(() =>
    vouchNode({
      seed: 1,
      id: nanoid(12),
      w: def?.size.w ?? 160,
      h: def?.size.h ?? 80,
      ...(raw.type === "text" ? { fontSize: 20, text: "" } : {}),
      ...(raw.type === "shape" ? { shape: "rect", fill: "none" } : {}),
      ...raw,
      ...(def
        ? { props: { ...def.defaults, ...((raw.props as object) ?? {}) } }
        : {}),
    }),
  )
}
export function validateDocument(doc: CanvasDocument): CanvasDocument {
  lookSchema.parse(doc.look)
  if (
    doc.order.length > 5000 ||
    new Set(doc.order).size !== doc.order.length ||
    Object.keys(doc.nodes).length !== doc.order.length
  )
    throw new AgentError(
      400,
      "Canvas must have unique ordered nodes; limit 5000",
    )
  const nodes: Record<string, SquigNode> = {}
  for (const id of doc.order) {
    if (!safeId(id) || !Object.hasOwn(doc.nodes, id) || doc.nodes[id].id !== id)
      throw new AgentError(400, "Order must match node IDs")
    nodes[id] = cleanNode(doc.nodes[id] as unknown as Record<string, unknown>)
  }
  if (JSON.stringify(doc).length > 4_000_000)
    throw new AgentError(413, "Document exceeds 4 MB")
  return {
    ...doc,
    // the batch's invariants, kept once at the end rather than after every
    // step: a group of one dissolves, an arrow follows its boxes or lets go
    nodes: settleBinds(pruneDegenerateGroups(nodes)),
    variations: doc.variations.filter((v) =>
      v.nodeIds.every((id) => Object.hasOwn(nodes, id)),
    ),
  }
}
export function applyOperations(
  original: CanvasDocument,
  operations: Operation[],
): { document: CanvasDocument; createdIds: string[] } {
  // The batch owns a copy, so a refused operation leaves the caller's
  // document where it was. Steps write into the map and validateDocument
  // settles the whole thing at the end — which is what lets an arrow in one
  // add name a box the next add brings, the way it always could.
  let d = structuredClone(original)
  // the real faces, so a note wraps here exactly where the render breaks it;
  // chosen by the document as it stands, since a look op may have changed
  // it, and kept per face because a measurer carries a width cache worth
  // keeping across the thousand probes a long note costs
  const measurers = new Map<FontMode, TextMeasurer>()
  const measure: TextMeasurer = (text, style) => {
    const font = d.look.font
    let m = measurers.get(font)
    if (!m) measurers.set(font, (m = textMeasurer(font)))
    return m(text, style)
  }
  const createdIds: string[] = []
  const members = (ids: string[], allowLocked = false) =>
    [...new Set(ids)].map((id) => {
      if (!Object.hasOwn(d.nodes, id))
        throw new AgentError(404, `Node not found: ${id}`)
      const n = d.nodes[id]
      if (n.locked && !allowLocked)
        throw new AgentError(409, `Node is locked: ${id}; unlock it explicitly`)
      return n
    })
  const place = (nodes: readonly SquigNode[]) => {
    for (const n of nodes) {
      if (Object.hasOwn(d.nodes, n.id))
        throw new AgentError(409, `there is already a node called "${n.id}"`)
      d.nodes[n.id] = n
      d.order.push(n.id)
      createdIds.push(n.id)
    }
  }
  for (const op of operations) {
    switch (op.op) {
      case "add":
        place(op.nodes.map((n) => cleanNode(n as Record<string, unknown>)))
        break
      case "note":
        place([
          withDoc(() =>
            textNode(
              op.text,
              {
                x: op.x,
                y: op.y,
                w: op.w,
                fontSize: 18,
                boxed: true,
                boxFill: "light",
              },
              measure,
            ),
          ),
        ])
        break
      case "rename":
        d.fileName = op.name
        break
      case "look": {
        const { op: _, ...look } = op
        void _
        d.look = { ...d.look, ...look } as Look
        if (!Object.hasOwn(THEMES, d.look.theme))
          throw new AgentError(400, "Unknown theme")
        break
      }
      case "variation": {
        members(op.nodeIds, true)
        const variation = {
          id: op.id ?? nanoid(12),
          title: op.title,
          description: op.description,
          nodeIds: [...new Set(op.nodeIds)],
        }
        d.variations = [
          ...d.variations.filter((v) => v.id !== variation.id),
          variation,
        ]
        break
      }
      case "update":
        for (const { id, patch, unset } of op.patches) {
          const n = members(
            [id],
            patch.locked === false &&
              Object.keys(patch).length === 1 &&
              !unset?.length,
          )[0]
          if (patch.id !== undefined || patch.type !== undefined)
            throw new AgentError(400, "Node id and type are immutable")
          const changes = {
            ...patch,
            ...Object.fromEntries((unset ?? []).map((f) => [f, undefined])),
          } as Partial<SquigNode>
          // zod first: a patch is an untyped record, and the text fitter
          // would choke on words that aren't a string before the gate saw them
          const parsed = nodeFields.safeParse({ ...n, ...changes })
          if (!parsed.success)
            throw new AgentError(
              400,
              parsed.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "),
            )
          d.nodes[id] = withDoc(() => patchNode(n, changes, measure))
        }
        break
      case "remove_variation":
        if (!d.variations.some((v) => v.id === op.id))
          throw new AgentError(404, "Variation not found")
        d.variations = d.variations.filter((v) => v.id !== op.id)
        break
      case "delete":
        for (const n of members(op.ids)) delete d.nodes[n.id]
        d.order = d.order.filter((id) => !op.ids.includes(id))
        break
      case "duplicate": {
        const originals = members(op.ids, true)
        const ids = new Map(originals.map((n) => [n.id, nanoid(12)]))
        const groups = new Map(
          originals
            .flatMap((n) => n.groupIds ?? [])
            .map((g) => [g, nanoid(12)]),
        )
        const clones = originals.map((n) => ({
          ...structuredClone(n),
          id: ids.get(n.id)!,
          x: n.x + op.dx,
          y: n.y + op.dy,
          groupIds: n.groupIds?.map((g) => groups.get(g)!),
        }))
        remapBinds(clones, ids)
        place(
          clones.map((n) => cleanNode(n as unknown as Record<string, unknown>)),
        )
        break
      }
      case "group": {
        members(op.ids, true)
        // stamp only: pruning waits for validateDocument, or grouping two
        // things here could dissolve a group the batch is still rebuilding
        const grouped = stampGroup(d, op.ids, op.groupId ?? nanoid(12))
        if (!grouped)
          throw new AgentError(
            400,
            "Nothing to group: needs two or more unlocked nodes that are not already one group",
          )
        d = grouped as CanvasDocument
        break
      }
      case "ungroup":
        members(op.ids).forEach((n) => {
          n.groupIds = n.groupIds?.slice(1)
        })
        break
      case "detach":
        for (const n of members(op.ids)) {
          if (n.type !== "component") continue
          const at = d.order.indexOf(n.id)
          const parts = breakApart(n).map((p) =>
            cleanNode({
              ...p,
              groupIds: n.groupIds,
            } as unknown as Record<string, unknown>),
          )
          delete d.nodes[n.id]
          d.order.splice(at, 1)
          place(parts)
          // the parts landed on top; they belong where the component stood
          if (parts.length) d.order.splice(-parts.length)
          d.order.splice(at, 0, ...parts.map((p) => p.id))
        }
        break
      case "flip":
        members(op.ids).forEach((n) => {
          if (op.axis === "x") n.flipX = !n.flipX
          else n.flipY = !n.flipY
          n.rotation = normalizeRotation(-(n.rotation ?? 0)) || undefined
        })
        break
      case "align": {
        const ns = members(op.ids)
        const patches = alignNodes(ns, op.edge)
        ns.forEach((n) => Object.assign(n, patches[n.id]))
        break
      }
      case "distribute": {
        const ids = new Set(members(op.ids).map((n) => n.id))
        const ns = d.order.filter((id) => ids.has(id)).map((id) => d.nodes[id])
        const patches = distributeNodes(ns, op.axis)
        ns.forEach((n) => Object.assign(n, patches[n.id]))
        break
      }

      case "reorder": {
        const picked = members(op.ids).map((n) => n.id)
        if (op.position === "front")
          d = bringToFront(d, picked) as CanvasDocument
        else if (op.position === "back")
          d = sendToBack(d, picked) as CanvasDocument
        else {
          const ids = new Set(picked)
          const forward = op.position === "forward"
          const order = forward ? [...d.order].reverse() : [...d.order]
          for (let i = 1; i < order.length; i++)
            if (ids.has(order[i]) && !ids.has(order[i - 1]))
              [order[i - 1], order[i]] = [order[i], order[i - 1]]
          d.order = forward ? order.reverse() : order
        }
        break
      }
    }
  }
  return { document: validateDocument(d), createdIds }
}
/** Nodes a saved batch created, changed or removed, for a slim edit response. */
export function diffNodes(
  before: CanvasDocument["nodes"],
  after: CanvasDocument["nodes"],
): { changed: CanvasDocument["nodes"]; deletedIds: string[] } {
  const changed: CanvasDocument["nodes"] = {}
  for (const [id, node] of Object.entries(after))
    if (
      !Object.hasOwn(before, id) ||
      JSON.stringify(before[id]) !== JSON.stringify(node)
    )
      changed[id] = node
  return {
    changed,
    deletedIds: Object.keys(before).filter((id) => !Object.hasOwn(after, id)),
  }
}
