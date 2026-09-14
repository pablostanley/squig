// ---------------------------------------------------------------------------
// squig from a terminal.
//
//   pnpm squig <command> [...]
//
// Every command is argument parsing, one call into lib/doc.ts, and a file
// written back. Nothing about documents is decided here on purpose: if the CLI
// knew a rule the library didn't, the same drawing would be legal at one door
// and illegal at another.
//
// Negative numbers need the equals form — `--x=-40` — because node's parseArgs
// can't tell `-40` from a flag.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  DocError, arrowNode, componentNode, describeComponent, docBounds,
  listComponents, nodeRow, nodesOf, parseDoc,
  shapeNode, textNode, type ArrowEnd, type SquigDocument,
} from "@/lib/doc"
import { AgentError, emptyDocument } from "@/lib/agent/engine"
import { createLocalStore } from "@/lib/agent/local-store"
import { executeLocal } from "@/lib/agent/local-service"
import type { Operation } from "@/lib/agent/schema"
import { loadIconsFor, renderSvg } from "@/lib/sketch/svg"
import type { InkTone, LineStyle, ShapeKind, SquigNode, TextAlign } from "@/lib/types"

const USAGE = `squig — draw wireframes from a terminal

  serve <file> [--port N]                    open a local editor and HTTP MCP server
  mcp <file> [--port N]                      local editor plus stdio MCP (use node directly in MCP config)
  components [query]                          the library, one line each
  describe <kind>                             one component's props in full
  new <file> [--name "..."] [--force]         a blank document
  ls <file>                                   what's on the sheet, bottom to top
  add <file> <kind> --x N --y N [--w N] [--h N] [--props '{"label":"Go"}'] [--id ID]
  text <file> "<words>" --x N --y N [--size N] [--w N] [--align left|center|right] [--bold] [--ink ink|muted|faint]
  shape <file> rect|ellipse --x N --y N --w N --h N [--fill none|light|strong|paper] [--dashed]
  arrow <file> --from <id|x,y> --to <id|x,y> [--no-head] [--style straight|elbow|curved]
  set <file> <id> --patch '{"w":320}'         change one node
  rm|group|front|back <file> <id...>          remove, group, reorder
  render <file> [--out picture.svg] [--transparent]
  validate <file>                             does squig still read this file`

const str = { type: "string" } as const
const bool = { type: "boolean" } as const
const OPTIONS = {
  name: str, id: str, x: str, y: str, w: str, h: str, props: str, size: str, align: str,
  ink: str, fill: str, from: str, to: str, style: str, patch: str, out: str,
  port: str,
  force: bool, bold: bool, dashed: bool, "no-head": bool, transparent: bool,
} as const

/** parseArgs on a typo'd flag says the right thing already; it just says it with a stack. */
function readArgv() {
  try {
    return parseArgs({ options: OPTIONS, allowPositionals: true })
  } catch (err) {
    console.error((err as Error).message)
    return process.exit(1)
  }
}

const { values: flag, positionals } = readArgv()

// `squig components | head` shuts the pipe mid-sentence. That's the reader's
// call, not a crash worth a stack trace.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0)
})

// -- small helpers -----------------------------------------------------------

function need(value: string | undefined, what: string): string {
  if (value === undefined || value === "") throw new DocError(`${what} is required`)
  return value
}

function num(value: string | undefined, what: string): number {
  const n = Number(need(value, what))
  if (!Number.isFinite(n)) throw new DocError(`${what} wants a number, got "${value}"`)
  return n
}

const maybeNum = (value: string | undefined, what: string) => (value === undefined ? undefined : num(value, what))

function json(raw: string | undefined, name: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? "{}")
  } catch {
    parsed = null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DocError(`--${name} wants a JSON object, like --${name} '{"label":"Go"}'`)
  }
  return parsed as Record<string, unknown>
}

function one<T extends string>(value: string | undefined, allowed: readonly T[], name: string): T | undefined {
  if (value === undefined) return undefined
  if (!(allowed as readonly string[]).includes(value)) {
    throw new DocError(`--${name} is one of ${allowed.join(", ")}, not "${value}"`)
  }
  return value as T
}

function readDoc(file: string): SquigDocument {
  const path = resolve(file)
  if (!existsSync(path)) throw new DocError(`no file at ${path}`)
  const doc = parseDoc(readFileSync(path, "utf8"), basename(path).replace(/\.squig\.json$/, ""))
  if (!doc) throw new DocError(`${path} isn't a squig document squig can read`)
  return doc
}

/** The CLI shares the companion's lock, atomic save and metadata retention. */
async function touch(file: string, change: (doc: SquigDocument) => { operations: Operation[]; ids: string[]; verb: string }): Promise<void> {
  if (!existsSync(resolve(file))) throw new DocError(`no file at ${resolve(file)}`)
  const store = await createLocalStore(file)
  try {
    const before = await store.read()
    const { operations, ids, verb } = change(before.document)
    await executeLocal("edit_document", { documentId: store.documentId, revision: before.revision, operations }, store)
    console.log(`${verb} ${ids.join(" ")}`)
  } finally { await store.close() }
}

/** Columns that line up, with the last one left ragged. */
function table(rows: string[][]): string {
  const widths = rows.reduce<number[]>((acc, row) => {
    row.forEach((cell, i) => (acc[i] = Math.max(acc[i] ?? 0, cell.length)))
    return acc
  }, [])
  return rows
    .map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join("  ").trimEnd())
    .join("\n")
}

const r = (v: number) => String(Math.round(v))

function arrowEnd(raw: string, which: string): ArrowEnd {
  const point = raw.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/)
  if (!point) return raw
  const [x, y] = [Number(point[1]), Number(point[2])]
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new DocError(`--${which} wants "x,y" or a node id`)
  return [x, y]
}

// -- the commands ------------------------------------------------------------

const INKS = ["ink", "muted", "faint"] as const satisfies readonly InkTone[]
const ALIGNS = ["left", "center", "right"] as const satisfies readonly TextAlign[]
const FILLS = ["none", "paper", "light", "strong"] as const
const STYLES = ["straight", "elbow", "curved"] as const satisfies readonly LineStyle[]
const SHAPES = ["rect", "ellipse"] as const satisfies readonly ShapeKind[]

/** The four commands that put something new on the sheet, minus the paperwork. */
function built(command: string, args: string[], doc: SquigDocument): SquigNode {
  const at = () => ({ x: num(flag.x, "--x"), y: num(flag.y, "--y"), id: flag.id })
  if (command === "add") {
    return componentNode(need(args[1], "a component kind"), {
      ...at(),
      w: maybeNum(flag.w, "--w"),
      h: maybeNum(flag.h, "--h"),
      props: json(flag.props, "props"),
    })
  }
  if (command === "text") {
    return textNode(need(args[1], "some words"), {
      ...at(),
      fontSize: maybeNum(flag.size, "--size"),
      w: maybeNum(flag.w, "--w"),
      align: one(flag.align, ALIGNS, "align"),
      bold: flag.bold,
      ink: one(flag.ink, INKS, "ink"),
    })
  }
  if (command === "shape") {
    return shapeNode(one(need(args[1], "rect or ellipse"), SHAPES, "shape")!, {
      ...at(),
      w: num(flag.w, "--w"),
      h: num(flag.h, "--h"),
      fill: one(flag.fill, FILLS, "fill"),
      ink: one(flag.ink, INKS, "ink"),
      dashed: flag.dashed,
    })
  }
  return arrowNode(
    {
      from: arrowEnd(need(flag.from, "--from"), "from"),
      to: arrowEnd(need(flag.to, "--to"), "to"),
      head: !flag["no-head"],
      lineStyle: one(flag.style, STYLES, "style"),
      id: flag.id,
    },
    doc.nodes
  )
}

async function run(command: string | undefined, args: string[]): Promise<void> {
  switch (command) {
    case "serve":
    case "mcp": {
      if (args.length !== 1) throw new DocError("Supply exactly one local .squig.json file")
      const { runLocalAgent } = await import("./agent/local")
      await runLocalAgent(command, need(args[0], "a local file"), { port: flag.port === undefined ? undefined : num(flag.port, "--port") })
      return
    }
    case "components": {
      const found = listComponents(args[0] ?? "")
      if (!found.length) throw new DocError(`nothing in the library matches "${args[0]}"`)
      const g = (d: (typeof found)[number]) => (d.group ? `${d.category}/${d.group}` : d.category)
      console.log(table(found.map((d) => [d.kind, d.name, g(d), `${d.size.w}×${d.size.h}`])))
      return
    }
    case "describe": {
      const info = describeComponent(need(args[0], "a component kind"))
      if (!info) throw new DocError(`no component called "${args[0]}" — try: squig components ${args[0]}`)
      console.log(JSON.stringify(info, null, 2))
      return
    }
    case "new": {
      const file = need(args[0], "a file to write")
      if (existsSync(resolve(file)) && !flag.force) throw new DocError(`${resolve(file)} is already there — pass --force to replace it`)
      const replacement = { document: emptyDocument(flag.name ?? (basename(file).replace(/\.squig\.json$/, "") || "untitled scribbles")), comments: [] }
      const store = await createLocalStore(file, flag.force ? { replaceInvalidWith: replacement } : {})
      try {
        const before = await store.read()
        await store.mutate(before.revision, () => replacement)
        if (store.replacedFilePath) console.log(`preserved previous bytes at ${store.replacedFilePath}`)
      } finally { await store.close() }
      console.log(`wrote ${resolve(file)}`)
      return
    }
    case "ls": {
      const nodes = nodesOf(readDoc(need(args[0], "a document")))
      console.log(nodes.length ? table(nodes.map(nodeRow)) : "empty sheet")
      return
    }
    case "add":
    case "text":
    case "shape":
    case "arrow": {
      const file = need(args[0], "a document")
      await touch(file, (doc) => {
        const node = built(command, args, doc)
        return { operations: [{ op: "add", nodes: [{ ...node }] }], ids: [node.id], verb: "added" }
      })
      return
    }
    case "set": {
      const file = need(args[0], "a document")
      const id = need(args[1], "a node id")
      const patch = json(need(flag.patch, "--patch"), "patch") as Partial<SquigNode>
      await touch(file, () => ({ operations: [{ op: "update", patches: [{ id, patch }] }], ids: [id], verb: "changed" }))
      return
    }
    case "rm":
    case "group":
    case "front":
    case "back": {
      const file = need(args[0], "a document")
      const ids = args.slice(1)
      if (!ids.length) throw new DocError("name at least one node id")
      await touch(file, (doc) => {
        for (const id of ids) if (!doc.nodes[id]) throw new DocError(`no node called "${id}"`)
        const operation: Operation = command === "rm" ? { op: "delete", ids }
          : command === "group" ? { op: "group", ids }
          : { op: "reorder", ids, position: command }
        const verb = command === "rm" ? "removed" : command === "group" ? "grouped" : command === "front" ? "brought to front" : "sent to back"
        return { operations: [operation], ids, verb }
      })
      return
    }
    case "render": {
      const doc = readDoc(need(args[0], "a document"))
      await loadIconsFor(nodesOf(doc))
      const svg = renderSvg(nodesOf(doc), doc.look, flag.transparent ? "transparent" : "paper")
      if (!svg) throw new DocError("nothing on the sheet to draw")
      if (!flag.out) {
        process.stdout.write(svg + "\n")
        return
      }
      writeFileSync(resolve(flag.out), svg + "\n")
      console.log(`wrote ${resolve(flag.out)}`)
      return
    }
    case "validate": {
      const doc = readDoc(need(args[0], "a document"))
      const box = docBounds(doc)
      const where = box
        ? `bounds ${r(box.minX)} ${r(box.minY)} ${r(box.maxX - box.minX)}×${r(box.maxY - box.minY)}`
        : "no bounds, it's blank"
      console.log(`ok: ${doc.order.length} nodes, ${where}`)
      return
    }
    default:
      console.log(USAGE)
      process.exit(command ? 1 : 0)
  }
}

try {
  await run(positionals[0], positionals.slice(1))
} catch (err) {
  if (err instanceof DocError || err instanceof AgentError || positionals[0] === "serve" || positionals[0] === "mcp") {
    console.error(err instanceof Error ? err.message : "Unable to run Squig")
    process.exit(1)
  }
  throw err
}
