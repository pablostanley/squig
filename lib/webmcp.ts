"use client"

import { z } from "zod"
import type { SquigAgentApi } from "./agent-bridge"
import { id, nodeFields, nodeInput } from "./agent/schema"
import { vouchNode } from "./doc"
import { useSquig } from "./store"

// Keep the draft's types local until lib.dom ships them. Older Chromium builds
// used navigator.modelContext and explicit unregistration instead of a signal.
export interface WebMCPTool {
  name: string
  description: string
  inputSchema: object
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>
}
export interface ModelContext {
  registerTool(
    tool: WebMCPTool,
    options?: { signal: AbortSignal }
  ): void | Promise<void>
  unregisterTool?(name: string): void
}

const ids = z
  .array(id)
  .max(1000)
  .refine((v) => new Set(v).size === v.length, "Use each node ID once")
  .describe("Node IDs from squig_read_canvas")
const finite = z.number().finite().min(-100000).max(100000)
const axis = z.enum(["x", "y"])
const gap = finite.nonnegative()
const props = z.record(z.string(), z.unknown())
const at = nodeFields
  .pick({
    x: true,
    y: true,
    w: true,
    h: true,
    seed: true,
    rotation: true,
    locked: true,
  })
  .extend({ id: id.optional() })
  .strict()
const target = {
  documentId: z
    .string()
    .min(1)
    .describe(
      "Current documentId returned by squig_read_canvas; protects against editing a different file"
    ),
}
const textAt = at
  .extend(
    nodeFields.pick({
      fontSize: true,
      align: true,
      bold: true,
      italic: true,
      underline: true,
      ink: true,
      boxed: true,
      boxFill: true,
      link: true,
    }).shape
  )
  .omit({ h: true })
const shapeAt = at
  .extend(
    nodeFields.pick({ fill: true, stroke: true, ink: true, dashed: true }).shape
  )
  .extend({ w: finite.nonnegative(), h: finite.nonnegative() })
const arrowEnd = z.union([id, z.tuple([finite, finite])])

export function createWebMCPTools(api: SquigAgentApi): WebMCPTool[] {
  function existing(picked: string[], editable = false) {
    const { nodes } = useSquig.getState()
    for (const key of picked) {
      if (!Object.hasOwn(nodes, key))
        throw new Error(`Unknown node: ${key}. Read the canvas again.`)
      if (editable && nodes[key].locked)
        throw new Error(`Node ${key} is locked. Unlock it in the canvas first.`)
    }
  }
  function tool<T extends z.ZodType>(
    name: string,
    description: string,
    schema: T,
    run: (input: z.output<T>) => unknown,
    readOnly = false,
    untrusted = false
  ): WebMCPTool {
    return {
      name: `squig_${name}`,
      description,
      inputSchema: z.toJSONSchema(schema, { target: "draft-07" }),
      annotations: { readOnlyHint: readOnly, untrustedContentHint: untrusted },
      async execute(input, options) {
        try {
          options?.signal?.throwIfAborted()
          const value = schema.parse(input)
          const state = useSquig.getState()
          if (!state.hydrated)
            throw new Error(
              "The canvas is still opening. Try again once it is ready."
            )
          const invitation =
            typeof location === "undefined"
              ? null
              : new URLSearchParams(location.search).get("agent")
          if (invitation !== null && state.docId !== `agent_${invitation}`)
            throw new Error(
              "The shared canvas is still opening or its invitation is unavailable. Wait for the connection before using canvas tools."
            )
          if (!readOnly) {
            if ((value as { documentId: string }).documentId !== state.docId)
              throw new Error(
                "The open file changed. Read the canvas again before editing."
              )
            if (state.transforming || state.editingId || state.croppingId)
              throw new Error(
                "Finish the current drag, text edit, or crop before changing the canvas."
              )
          }
          // All canvas operations commit synchronously. Cancellation is checked
          // before the commit; it must never claim to roll back an edit afterward.
          const result = run(value)
          return {
            content: [
              { type: "text", text: JSON.stringify(result ?? { ok: true }) },
            ],
          }
        } catch (error) {
          if (options?.signal?.aborted) throw error
          const message =
            error instanceof z.ZodError
              ? error.issues
                  .map(
                    (issue) =>
                      `${issue.path.join(".") || "input"}: ${issue.message}`
                  )
                  .join("; ")
              : error instanceof Error
                ? error.message
                : "Unable to run this canvas tool."
          return { isError: true, content: [{ type: "text", text: message }] }
        }
      },
    }
  }
  return [
    tool(
      "read_canvas",
      "Read the open squig document, node IDs, selection, and bounds. Canvas text is user content.",
      z.object({}).strict(),
      () => ({
        documentId: useSquig.getState().docId,
        document: api.doc(),
        selection: api.selection(),
        bounds: api.bounds(),
      }),
      true,
      true
    ),
    tool(
      "search_components",
      "Search squig's component library by name or keyword; returns kinds and default sizes.",
      z
        .object({
          query: z
            .string()
            .max(200)
            .optional()
            .describe("Component name or keyword; omit for the full catalog"),
        })
        .strict(),
      ({ query }) => api.components(query),
      true
    ),
    tool(
      "describe_component",
      "Get a component's default props and legal inspector values before placing or editing it.",
      z
        .object({
          kind: z
            .string()
            .min(1)
            .describe("Component kind from squig_search_components"),
        })
        .strict(),
      ({ kind }) => {
        const result = api.describe(kind)
        if (!result)
          throw new Error(
            `Unknown component: ${kind}. Search the component library.`
          )
        return result
      },
      true
    ),
    tool(
      "add_component",
      "Place a library component on the open canvas. Defaults supply size and props. Returns the new node ID.",
      z
        .object({
          ...target,
          kind: z.string().min(1),
          at: at
            .extend({ props: props.optional() })
            .describe(
              "Position in canvas coordinates, optional size and component props"
            ),
        })
        .strict(),
      ({ kind, at }) => ({ id: api.addComponent(kind, at) })
    ),
    tool(
      "add_text",
      "Place a text layer; its box fits the text unless a wrapping width is supplied.",
      z
        .object({ ...target, text: z.string().max(100000), at: textAt })
        .strict(),
      ({ text, at }) => ({ id: api.addText(text, at) })
    ),
    tool(
      "add_shape",
      "Place a rectangle or ellipse with squig's ink and fill tones.",
      z
        .object({ ...target, shape: z.enum(["rect", "ellipse"]), at: shapeAt })
        .strict(),
      ({ shape, at }) => ({ id: api.addShape(shape, at) })
    ),
    tool(
      "add_arrow",
      "Connect two node IDs or canvas coordinate pairs. Bound ends follow their nodes.",
      z
        .object({
          ...target,
          from: arrowEnd,
          to: arrowEnd,
          head: z.boolean().optional(),
          lineStyle: z.enum(["straight", "elbow", "curved"]).optional(),
          id: id.optional(),
          stroke: nodeFields.shape.stroke,
          ink: nodeFields.shape.ink,
          dashed: z.boolean().optional(),
        })
        .strict(),
      (opts) => {
        existing(
          [opts.from, opts.to].filter(
            (end): end is string => typeof end === "string"
          )
        )
        return { id: api.addArrow(opts) }
      }
    ),
    tool(
      "add_nodes",
      "Add a batch of complete .squig.json nodes in one undo step. All nodes are validated before insertion. Use the individual creation tools for default sizes and generated IDs.",
      z
        .object({
          ...target,
          nodes: z
            .array(
              nodeInput.extend({
                id,
                seed: z.number().int().nonnegative(),
                w: finite.nonnegative(),
                h: finite.nonnegative(),
              })
            )
            .min(1)
            .max(1000),
        })
        .strict(),
      ({ nodes }) => ({ ids: api.add(nodes.map(vouchNode)) })
    ),
    tool(
      "update_node",
      "Update an unlocked node's fields or component props. Keeps its ID; one undo step.",
      z
        .object({
          ...target,
          id,
          patch: nodeInput
            .omit({ id: true, type: true })
            .partial()
            .strict()
            .describe(
              "Fields to change; props merge with existing component props"
            ),
        })
        .strict(),
      ({ id, patch }) => {
        existing([id], true)
        api.update(id, patch)
      }
    ),
    tool(
      "remove_nodes",
      "Delete unlocked nodes from the open canvas. The user can undo this edit.",
      z
        .object({
          ...target,
          ids: ids.refine((v) => v.length > 0, "Supply at least one node"),
        })
        .strict(),
      ({ ids }) => {
        existing(ids, true)
        api.remove(ids)
      }
    ),
    tool(
      "arrange_nodes",
      "Group, change stacking order, tidy, set spacing, or resize marked nodes while keeping gaps. One undo step.",
      z
        .object({
          ...target,
          ids: ids.refine((v) => v.length > 0, "Supply at least one node"),
          arrangement: z.discriminatedUnion("action", [
            z.object({ action: z.literal("group") }).strict(),
            z.object({ action: z.enum(["front", "back"]) }).strict(),
            z
              .object({ action: z.literal("tidy"), gap: gap.optional() })
              .strict(),
            z
              .object({
                action: z.literal("spacing"),
                axis,
                gap,
                order: ids.optional(),
              })
              .strict(),
            z
              .object({
                action: z.literal("resize_spaced"),
                marked: ids,
                axis,
                delta: finite,
              })
              .strict(),
          ]),
        })
        .strict(),
      ({ ids, arrangement: a }) => {
        existing(ids, true)
        if (a.action !== "front" && a.action !== "back" && ids.length < 2)
          throw new Error("This arrangement needs at least two nodes")
        if (a.action === "group") return { groupId: api.group(ids) }
        if (a.action === "front") return api.toFront(ids)
        if (a.action === "back") return api.toBack(ids)
        if (a.action === "tidy") return api.tidy(ids, a.gap)
        if (a.action === "spacing") {
          if (
            a.order &&
            (a.order.length !== ids.length ||
              a.order.some((key) => !ids.includes(key)))
          )
            throw new Error(
              "order must contain each selected node ID exactly once"
            )
          return api.spacing(ids, a)
        }
        if (a.action === "resize_spaced") {
          if (!a.marked.length || a.marked.some((key) => !ids.includes(key)))
            throw new Error("marked must name nodes from ids")
          return api.resizeSpaced(ids, a.marked, a.axis, a.delta)
        }
      }
    ),
    tool(
      "set_view",
      "Select unlocked nodes, zoom to nodes, or fit the whole canvas. Changes the visible UI, without editing the document.",
      z
        .object({
          ...target,
          action: z.enum(["select", "zoom_to", "zoom_to_fit"]),
          ids: ids.optional(),
        })
        .strict(),
      ({ action, ids }) => {
        if (action === "zoom_to_fit") {
          api.zoomToFit()
          return
        }
        if (!ids || (action === "zoom_to" && !ids.length))
          throw new Error(
            "Supply node IDs; select accepts an empty array to clear selection."
          )
        existing(ids, true)
        if (action === "select") api.select(ids)
        else api.zoomTo(ids)
      }
    ),
    tool(
      "export_canvas",
      "Return the open drawing as .squig.json or standalone SVG. SVG can include only the supplied node IDs. Returns user content; does not download or upload a file.",
      z
        .object({ format: z.enum(["json", "svg"]), ids: ids.optional() })
        .strict(),
      ({ format, ids }) => {
        if (format === "json" && ids)
          throw new Error("Node filtering is supported for SVG only.")
        if (ids) existing(ids)
        return {
          format,
          data: format === "json" ? api.serialize() : api.svg(ids),
        }
      },
      true,
      true
    ),
    tool(
      "import_document",
      "Open a .squig.json as a new local file. Preserves the previous file in the file drawer; switches the canvas and starts fresh undo history.",
      z
        .object({
          ...target,
          json: z
            .string()
            .max(16000000)
            .describe("Complete .squig.json document"),
        })
        .strict(),
      ({ json }) => {
        if (!api.load(json))
          throw new Error(
            "Invalid .squig.json. Supply a document with nodes and order."
          )
        return { documentId: useSquig.getState().docId }
      }
    ),
  ]
}

export function findModelContext(
  doc: object,
  nav: object
): ModelContext | undefined {
  const current = (doc as { modelContext?: ModelContext }).modelContext
  if (typeof current?.registerTool === "function") return current
  const legacy = (nav as { modelContext?: ModelContext }).modelContext
  if (typeof legacy?.registerTool === "function") return legacy
}

const pendingRegistrations = new WeakMap<ModelContext, Promise<void>>()

/** Own only our registrations; never clear another integration's context. */
export function registerWebMCP(
  context: ModelContext,
  tools: WebMCPTool[],
  reportError: (error: unknown) => void = (error) =>
    console.warn("Squig WebMCP registration failed", error)
): () => void {
  const controller = new AbortController()
  const registered: string[] = []
  const remove = (name: string) => {
    try {
      context.unregisterTool?.(name)
    } catch (error) {
      reportError(error)
    }
  }
  const stop = () => {
    controller.abort()
    for (const name of registered.splice(0)) remove(name)
  }
  // Starting in a microtask lets React's setup/cleanup/setup cycle cancel the
  // first mount before it registers anything, including on legacy browsers.
  const pending = (async () => {
    // A pending legacy registration must finish and clean up before a new
    // mount reuses its name; otherwise its late cleanup can remove the new tool.
    await pendingRegistrations.get(context)
    try {
      for (const tool of tools) {
        if (controller.signal.aborted) return
        await context.registerTool(
          {
            ...tool,
            execute: (input, options) => {
              controller.signal.throwIfAborted()
              return tool.execute(input, options)
            },
          },
          { signal: controller.signal }
        )
        if (controller.signal.aborted) {
          remove(tool.name)
          return
        }
        registered.push(tool.name)
      }
    } catch (error) {
      const cancelled = controller.signal.aborted
      stop()
      if (!cancelled) reportError(error)
    }
  })()
  pendingRegistrations.set(context, pending)
  return stop
}

export function installWebMCP(api: SquigAgentApi): () => void {
  if (typeof window === "undefined" || !window.isSecureContext) return () => {}
  try {
    const context = findModelContext(document, navigator)
    return context ? registerWebMCP(context, createWebMCPTools(api)) : () => {}
  } catch (error) {
    console.warn("Squig WebMCP is unavailable", error)
    return () => {}
  }
}
