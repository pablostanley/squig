// ---------------------------------------------------------------------------
// Groups on a flat document.
//
// A node's `groupIds` is its path from the outside in. There are no container
// nodes, so every operation that would normally move a tree node has to rewrite
// these paths instead. Keeping that arithmetic here gives grouping, selection,
// duplicate, paste and ungroup one definition of the hierarchy.
// ---------------------------------------------------------------------------

import type { SquigNode } from "../types"

export interface GroupPick {
  ids: string[]
  groupId: string | null
}

/** Defer destructive click changes until release so a press can still move. */
export function selectionForPress(
  current: GroupPick,
  picked: GroupPick,
  additive: boolean,
  deep: boolean
): { press: GroupPick; click: GroupPick | null } {
  const contained = picked.ids.every((id) => current.ids.includes(id))
  if (additive) {
    if (contained) {
      return {
        press: current,
        click: { ids: current.ids.filter((id) => !picked.ids.includes(id)), groupId: null },
      }
    }
    return { press: { ids: [...new Set([...current.ids, ...picked.ids])], groupId: null }, click: null }
  }
  if (deep || !contained || current.ids.length === picked.ids.length) return { press: picked, click: null }
  return { press: current, click: picked }
}

const pathOf = (n: SquigNode | undefined): readonly string[] => n?.groupIds ?? []

/** Canonical path spelling for documents and clipboard payloads. */
export function normalizeGroupIds(groupIds: readonly string[] | undefined): string[] | undefined {
  if (!groupIds?.length) return undefined
  const seen = new Set<string>()
  const clean = groupIds.filter((groupId) => {
    if (!groupId || seen.has(groupId)) return false
    seen.add(groupId)
    return true
  })
  return clean.length ? clean : undefined
}

/** Every loose member of a group, in document order. */
export function groupMembers(
  groupId: string,
  nodes: Record<string, SquigNode>,
  order: readonly string[]
): string[] {
  return order.filter((id) => {
    const n = nodes[id]
    return !!n && !n.locked && pathOf(n).includes(groupId)
  })
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const right = new Set(b)
  return a.every((id) => right.has(id))
}

/**
 * What a plain press on this leaf means.
 *
 * A fresh press takes the outer group. Once somebody has stepped into a
 * subgroup (or deep-selected the leaf), presses inside that same selection
 * keep it there so a second double-click can continue inward instead of
 * bubbling back to the outside between clicks.
 */
export function groupPickForHit(
  hitId: string,
  selection: readonly string[],
  selectedGroupId: string | null,
  nodes: Record<string, SquigNode>,
  order: readonly string[]
): GroupPick {
  const n = nodes[hitId]
  if (!n || n.locked) return { ids: [], groupId: null }
  const path = pathOf(n)

  if (selectedGroupId && path.includes(selectedGroupId)) {
    const ids = groupMembers(selectedGroupId, nodes, order)
    if (sameSet(ids, selection)) return { ids, groupId: selectedGroupId }
  }
  if (!selectedGroupId && selection.length === 1 && selection[0] === hitId) {
    return { ids: [hitId], groupId: null }
  }

  const outer = path[0]
  return outer ? { ids: groupMembers(outer, nodes, order), groupId: outer } : { ids: [hitId], groupId: null }
}

/** The next subgroup (or leaf) reached by a double-click. */
export function stepIntoGroup(
  hitId: string,
  selection: readonly string[],
  selectedGroupId: string | null,
  nodes: Record<string, SquigNode>,
  order: readonly string[]
): GroupPick {
  const n = nodes[hitId]
  if (!n || n.locked) return { ids: [], groupId: null }
  const path = pathOf(n)
  if (!path.length) return { ids: [hitId], groupId: null }

  let at = selectedGroupId ? path.indexOf(selectedGroupId) : -1
  if (at < 0 && sameSet(groupMembers(path[0], nodes, order), selection)) at = 0
  // A leaf reached with Cmd-click is already all the way inside.
  if (at < 0 && selection.length === 1 && selection[0] === hitId) {
    return { ids: [hitId], groupId: null }
  }

  const next = path[at + 1]
  return next ? { ids: groupMembers(next, nodes, order), groupId: next } : { ids: [hitId], groupId: null }
}

interface SelectionUnit {
  key: string
  parent: readonly string[]
}

function membership(nodes: readonly SquigNode[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const n of nodes) {
    for (const groupId of pathOf(n)) {
      const ids = out.get(groupId) ?? new Set<string>()
      ids.add(n.id)
      out.set(groupId, ids)
    }
  }
  return out
}

function completeGroups(selected: ReadonlySet<string>, nodes: readonly SquigNode[]): Set<string> {
  const out = new Set<string>()
  for (const [groupId, ids] of membership(nodes)) {
    if (ids.size && [...ids].every((id) => selected.has(id))) out.add(groupId)
  }
  return out
}

function commonPrefix(paths: readonly (readonly string[])[]): string[] {
  const first = paths[0] ?? []
  let length = first.length
  for (let p = 1; p < paths.length && length; p++) {
    let i = 0
    while (i < length && paths[p][i] === first[i]) i++
    length = i
  }
  return first.slice(0, length)
}

/**
 * Paths produced by grouping this selection, or null when it is already one
 * object. Complete groups count as one selected unit; individual deep-selected
 * leaves count as one each. The new group is inserted below the units' shared
 * parent, so grouping siblings creates a subgroup instead of a crossing path.
 */
export function planGroupPaths(
  selectedIds: readonly string[],
  nodes: Record<string, SquigNode>,
  order: readonly string[],
  newGroupId: string
): Map<string, string[]> | null {
  const selected = new Set(order.filter((id) => selectedIds.includes(id) && nodes[id] && !nodes[id].locked))
  if (selected.size < 2) return null
  const all = order.map((id) => nodes[id]).filter(Boolean)
  const complete = completeGroups(selected, all)
  const units = new Map<string, SelectionUnit>()
  const rootAt = new Map<string, number>()

  for (const id of selected) {
    const path = pathOf(nodes[id])
    const groupIndex = path.findIndex((groupId) => complete.has(groupId))
    const key = groupIndex >= 0 ? `group:${path[groupIndex]}` : `node:${id}`
    rootAt.set(id, groupIndex)
    if (!units.has(key)) {
      units.set(key, {
        key,
        parent: groupIndex >= 0 ? path.slice(0, groupIndex) : path,
      })
    }
  }
  // Wrapping an already-selected group in an otherwise empty parent adds no
  // hierarchy, only another double-click and another ungroup to get through.
  if (units.size < 2) return null

  const parent = commonPrefix([...units.values()].map((unit) => unit.parent))
  const paths = new Map<string, string[]>()
  for (const id of selected) {
    const path = pathOf(nodes[id])
    const at = rootAt.get(id) ?? -1
    paths.set(id, [...parent, newGroupId, ...(at >= 0 ? path.slice(at) : [])])
  }
  return paths
}

export function canGroupSelection(
  selectedIds: readonly string[],
  nodes: Record<string, SquigNode>,
  order: readonly string[]
): boolean {
  return planGroupPaths(selectedIds, nodes, order, "__candidate_group__") !== null
}

export interface CloneGroupPlan {
  paths: Map<string, string[] | undefined>
  groupMap: Map<string, string>
}

/**
 * Group paths for a duplicate made inside this document.
 *
 * A complete copied group gets a new identity. An incomplete group is an
 * unselected ancestor, so it stays put: copying subgroup A out of parent G
 * produces G/A′, while copying all of G produces the independent G′/A′.
 */
export function planCloneGroupPaths(
  selectedNodes: readonly SquigNode[],
  universe: readonly SquigNode[],
  freshGroupId: () => string
): CloneGroupPlan {
  const selected = new Set(selectedNodes.map((n) => n.id))
  const complete = completeGroups(selected, universe)
  const groupMap = new Map<string, string>()
  const paths = new Map<string, string[] | undefined>()

  for (const n of selectedNodes) {
    const path = pathOf(n)
    if (!path.length) {
      paths.set(n.id, undefined)
      continue
    }
    paths.set(
      n.id,
      path.map((groupId) => {
        if (!complete.has(groupId)) return groupId
        const mapped = groupMap.get(groupId) ?? freshGroupId()
        groupMap.set(groupId, mapped)
        return mapped
      })
    )
  }
  return { paths, groupMap }
}

/**
 * Put copies beside their sources without taking them out of an unselected
 * parent's z-range. Copies with no retained parent remain one top-level batch.
 */
export function orderWithClones(
  order: readonly string[],
  sources: readonly SquigNode[],
  clones: readonly SquigNode[]
): string[] {
  const index = new Map(order.map((id, i) => [id, i]))
  const buckets = new Map<string, { at: number; ids: string[] }>()

  for (let i = 0; i < Math.min(sources.length, clones.length); i++) {
    const source = sources[i]
    const clone = clones[i]
    const before = pathOf(source)
    const after = pathOf(clone)
    let retained = "__root__"
    for (let p = 0; p < Math.min(before.length, after.length) && before[p] === after[p]; p++) retained = before[p]
    const at = index.get(source.id)
    if (at === undefined) continue
    const bucket = buckets.get(retained) ?? { at, ids: [] }
    bucket.at = Math.max(bucket.at, at)
    bucket.ids.push(clone.id)
    buckets.set(retained, bucket)
  }

  const insertions = new Map<number, string[]>()
  for (const bucket of buckets.values()) {
    insertions.set(bucket.at, [...(insertions.get(bucket.at) ?? []), ...bucket.ids])
  }
  const out: string[] = []
  for (let i = 0; i < order.length; i++) {
    out.push(order[i])
    const inserted = insertions.get(i)
    if (inserted) out.push(...inserted)
  }
  return out
}

/**
 * Drop wrappers with fewer than two direct children. Deleting the other child
 * of a two-item group should leave an ordinary leaf, not an invisible group
 * that changes how its next duplicate behaves.
 */
export function pruneDegenerateGroups(nodes: Record<string, SquigNode>): Record<string, SquigNode> {
  const children = new Map<string, Set<string>>()
  for (const n of Object.values(nodes)) {
    const path = pathOf(n)
    for (let i = 0; i < path.length; i++) {
      const direct = path[i + 1] ? `group:${path[i + 1]}` : `node:${n.id}`
      const set = children.get(path[i]) ?? new Set<string>()
      set.add(direct)
      children.set(path[i], set)
    }
  }
  const drop = new Set([...children].filter(([, direct]) => direct.size < 2).map(([groupId]) => groupId))
  if (!drop.size) return nodes

  const out = { ...nodes }
  for (const [id, n] of Object.entries(nodes)) {
    if (!n.groupIds?.some((groupId) => drop.has(groupId))) continue
    const groupIds = n.groupIds.filter((groupId) => !drop.has(groupId))
    out[id] = { ...n, groupIds: groupIds.length ? groupIds : undefined } as SquigNode
  }
  return out
}
