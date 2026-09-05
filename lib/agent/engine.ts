import { lookSchema, nodeFields } from "./schema"
import { nanoid } from "nanoid"
import { validNode } from "@/lib/clipboard-payload"
import { getDef } from "@/lib/library/registry"
import { breakApart } from "@/lib/library/break-apart"
import { settleBinds, remapBinds } from "@/lib/canvas/arrow-binding"
import { unionBox, type SquigNode, type SquigDoc } from "@/lib/types"
import { DEFAULT_LOOK, THEMES, type Look } from "@/lib/theme"
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
  return {
    fileName: name,
    nodes: {},
    order: [],
    look: { ...DEFAULT_LOOK },
    variations: [],
  }
}
const safeId = (s: string) =>
  /^[a-zA-Z0-9_-]{1,80}$/.test(s) &&
  !["__proto__", "constructor", "prototype"].includes(s)
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
  const n = validNode({
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
  })
  if (
    !n ||
    !safeId(n.id) ||
    [n.x, n.y, n.w, n.h].some((v) => Math.abs(v) > 100000)
  )
    throw new AgentError(400, "Invalid node or geometry")
  if (n.type === "text" && (n.fontSize <= 0 || n.fontSize > 1000))
    throw new AgentError(400, "fontSize must be 1–1000")
  if (
    n.type === "image" &&
    (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(n.src) ||
      !Number.isFinite(n.naturalW) ||
      !Number.isFinite(n.naturalH) ||
      n.naturalW <= 0 ||
      n.naturalH <= 0)
  )
    throw new AgentError(
      400,
      "Images require a raster data URL and positive naturalW/naturalH",
    )
  if (n.type === "component") {
    try {
      def!.render(n.props, n.w, n.h)
    } catch {
      throw new AgentError(400, `Invalid properties for ${n.kind}`)
    }
    for (const c of def!.controls) {
      const v = n.props[c.key]
      if (v === undefined) continue
      if (c.type === "select" && c.options && !c.options.includes(String(v)))
        throw new AgentError(400, `Invalid ${n.kind}.${c.key}`)
      if (
        c.type === "number" &&
        (typeof v !== "number" ||
          !Number.isFinite(v) ||
          (c.min !== undefined && v < c.min) ||
          (c.max !== undefined && v > c.max))
      )
        throw new AgentError(400, `Invalid ${n.kind}.${c.key}`)
      if (c.type === "toggle" && typeof v !== "boolean")
        throw new AgentError(400, `Invalid ${n.kind}.${c.key}`)
      if ((c.type === "text" || c.type === "icon") && typeof v !== "string")
        throw new AgentError(400, `Invalid ${n.kind}.${c.key}`)
    }
  }
  return n
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
    nodes: settleBinds(nodes),
    variations: doc.variations.filter((v) =>
      v.nodeIds.every((id) => Object.hasOwn(nodes, id)),
    ),
  }
}
export function applyOperations(
  original: CanvasDocument,
  operations: Operation[],
): { document: CanvasDocument; createdIds: string[] } {
  const d = structuredClone(original)
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
  const add = (raw: Record<string, unknown>) => {
    const n = cleanNode(raw)
    if (Object.hasOwn(d.nodes, n.id))
      throw new AgentError(409, `Duplicate node ID: ${n.id}`)
    d.nodes[n.id] = n
    d.order.push(n.id)
    createdIds.push(n.id)
  }
  for (const op of operations) {
    switch (op.op) {
      case "add":
        op.nodes.forEach(add)
        break
      case "note":
        add({
          type: "text",
          x: op.x,
          y: op.y,
          w: op.w,
          h: Math.max(100, Math.ceil(op.text.length / 25) * 26),
          text: op.text,
          fontSize: 18,
          boxed: true,
          boxFill: "light",
          fixedW: true,
        })
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
          const next: Record<string, unknown> = {
            ...n,
            ...patch,
            ...(n.type === "component" && patch.props
              ? { props: { ...n.props, ...(patch.props as object) } }
              : {}),
          }
          for (const field of unset ?? []) delete next[field]
          d.nodes[id] = cleanNode(next)
        }
        break
      case "remove_variation":
        if (!d.variations.some((v) => v.id === op.id))
          throw new AgentError(404, "Variation not found")
        d.variations = d.variations.filter((v) => v.id !== op.id)
        break
      case "delete":
        members(op.ids).forEach((n) => {
          delete d.nodes[n.id]
        })
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
        clones.forEach((n) => add(n as unknown as Record<string, unknown>))
        break
      }
      case "group": {
        const g = op.groupId ?? nanoid(12)
        members(op.ids).forEach((n) => {
          n.groupIds = [g, ...(n.groupIds ?? []).filter((id) => id !== g)]
        })
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
          const index = d.order.indexOf(n.id)
          const parts = breakApart(n)
          delete d.nodes[n.id]
          d.order.splice(index, 1)
          for (const p of parts) {
            p.groupIds = n.groupIds
            add(p as unknown as Record<string, unknown>)
          }
          if (parts.length) d.order.splice(-parts.length)
          d.order.splice(index, 0, ...parts.map((p) => p.id))
        }
        break
      case "flip":
        members(op.ids).forEach((n) => {
          if (op.axis === "x") n.flipX = !n.flipX
          else n.flipY = !n.flipY
        })
        break
      case "align": {
        const ns = members(op.ids)
        const box = unionBox(ns)!
        ns.forEach((n) => {
          switch (op.edge) {
            case "left":
              n.x = box.minX
              break
            case "right":
              n.x = box.maxX - n.w
              break
            case "top":
              n.y = box.minY
              break
            case "bottom":
              n.y = box.maxY - n.h
              break
            case "hcenter":
              n.x = (box.minX + box.maxX - n.w) / 2
              break
            case "vcenter":
              n.y = (box.minY + box.maxY - n.h) / 2
              break
          }
        })
        break
      }
      case "distribute": {
        const axis = op.axis,
          size = axis === "x" ? "w" : "h"
        const ns = members(op.ids).sort((a, b) => a[axis] - b[axis])
        if (ns.length < 3) break
        const start = ns[0][axis],
          last = ns[ns.length - 1]
        const gap =
          (last[axis] +
            last[size] -
            start -
            ns.reduce((s, n) => s + n[size], 0)) /
          (ns.length - 1)
        let cursor = start
        ns.forEach((n) => {
          n[axis] = cursor
          cursor += n[size] + gap
        })
        break
      }
      case "reorder": {
        members(op.ids)
        const ids = new Set(op.ids),
          selected = d.order.filter((id) => ids.has(id)),
          other = d.order.filter((id) => !ids.has(id))
        if (op.position === "front") d.order = [...other, ...selected]
        else if (op.position === "back") d.order = [...selected, ...other]
        else {
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
