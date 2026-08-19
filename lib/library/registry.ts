// ---------------------------------------------------------------------------
// Component registry — every library item is a ComponentDef: default size,
// variant props, inspector controls, and a render() that emits sketch prims.
// ---------------------------------------------------------------------------

import type { Prim } from "@/lib/sketch/kit"
import { place } from "@/lib/sketch/kit"
import { BASIC_DEFS } from "./defs-basic"
import { DISPLAY_DEFS } from "./defs-display"
import { NAV_DEFS } from "./defs-nav"
import { TEMPLATE_DEFS } from "./defs-templates"
import { MORE_DEFS } from "./defs-more"
import { EXTRA_DEFS } from "./defs-extra"
import { MARKETING_DEFS } from "./defs-blocks-marketing"
import { APP_DEFS } from "./defs-blocks-app"
import { MOBILE_DEFS } from "./defs-mobile"

export type ControlType = "select" | "toggle" | "text" | "number" | "icon"

export interface ControlDef {
  key: string
  label: string
  type: ControlType
  options?: string[]
  min?: number
  max?: number
  /** surfaced in the floating context row */
  quick?: boolean
}

export type Props = Record<string, unknown>

export type Category = "components" | "blocks"

export const GROUPS: Record<Category, string[]> = {
  components: ["Buttons", "Forms", "Selection", "Display", "Feedback", "Navigation", "Data", "Media"],
  blocks: ["Marketing", "Content", "Commerce", "App", "AI", "Screens"],
}

export interface ComponentDef {
  kind: string
  name: string
  category: Category
  /** section header in the library panel — see GROUPS */
  group?: string
  keywords?: string[]
  size: { w: number; h: number }
  defaults: Props
  controls: ControlDef[]
  render: (props: Props, w: number, h: number) => Prim[]
}

const SOURCES: ComponentDef[][] = [
  BASIC_DEFS,
  DISPLAY_DEFS,
  NAV_DEFS,
  MORE_DEFS,
  EXTRA_DEFS,
  MARKETING_DEFS,
  APP_DEFS,
  TEMPLATE_DEFS,
  MOBILE_DEFS,
]

/** First definition of a `kind` wins, so a duplicate slug can't shadow a core one. */
export const ALL_DEFS: ComponentDef[] = (() => {
  const seen = new Set<string>()
  const out: ComponentDef[] = []
  for (const source of SOURCES) {
    for (const d of source) {
      if (seen.has(d.kind)) continue
      seen.add(d.kind)
      out.push(d)
    }
  }
  return out
})()

export const REGISTRY: Record<string, ComponentDef> = Object.fromEntries(ALL_DEFS.map((d) => [d.kind, d]))

export function getDef(kind: string): ComponentDef | undefined {
  return REGISTRY[kind]
}

export function renderComponent(kind: string, props: Props, w: number, h: number): Prim[] {
  const def = REGISTRY[kind]
  if (!def) return []
  return def.render({ ...def.defaults, ...props }, w, h)
}

/** Compose a child component into a parent render at an offset — templates use this. */
export function sub(def: ComponentDef, props: Props, x: number, y: number, w: number, h: number): Prim[] {
  return place(def.render({ ...def.defaults, ...props }, w, h), x, y)
}

export function matches(d: ComponentDef, q: string): boolean {
  if (!q) return true
  return (
    d.name.toLowerCase().includes(q) ||
    d.kind.includes(q) ||
    (d.group?.toLowerCase().includes(q) ?? false) ||
    (d.keywords?.some((k) => k.includes(q)) ?? false)
  )
}

export function searchDefs(category: Category, query: string): ComponentDef[] {
  const q = query.trim().toLowerCase()
  return ALL_DEFS.filter((d) => d.category === category && matches(d, q))
}

/** Search everything, for the command palette. */
export function searchAll(query: string): ComponentDef[] {
  const q = query.trim().toLowerCase()
  return ALL_DEFS.filter((d) => matches(d, q))
}

/** Group defs into panel sections, preserving GROUPS order. */
export function groupDefs(defs: ComponentDef[], category: Category): { group: string; defs: ComponentDef[] }[] {
  const order = GROUPS[category]
  const buckets = new Map<string, ComponentDef[]>()
  for (const d of defs) {
    const g = d.group && order.includes(d.group) ? d.group : "Other"
    const arr = buckets.get(g)
    if (arr) arr.push(d)
    else buckets.set(g, [d])
  }
  const out: { group: string; defs: ComponentDef[] }[] = []
  for (const g of [...order, "Other"]) {
    const arr = buckets.get(g)
    if (arr?.length) out.push({ group: g, defs: arr })
  }
  return out
}
