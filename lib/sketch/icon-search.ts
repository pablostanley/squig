// ---------------------------------------------------------------------------
// Icon search — fuzzy matching over every Phosphor icon's name and tags.
//
// The index ([name, tags, categories] per icon) is a generated chunk loaded
// alongside the first search UI, not with the app. Callers kick off
// loadIconIndex() when a picker opens and search synchronously after that;
// before it lands, searches fall back to plain name matching, which the eager
// name list can always answer.
// ---------------------------------------------------------------------------

import { ALL_ICON_NAMES } from "./phosphor/names"
import { ICON_ALIASES } from "./icons"

interface IndexEntry {
  name: string
  /** the name's dash-separated words, for word-boundary scoring */
  words: string[]
  tags: string
  categories: string
}

let index: IndexEntry[] | null = null
let indexPromise: Promise<void> | null = null

export function iconIndexReady(): boolean {
  return index !== null
}

/** Load the search index (deduped). Resolves once searches see tags too. */
export function loadIconIndex(): Promise<void> {
  if (index) return Promise.resolve()
  indexPromise ??= import("./phosphor/meta").then((m) => {
    index = m.ICON_META.map(([name, tags, categories]) => ({
      name,
      words: name.split("-"),
      tags,
      categories,
    }))
  })
  return indexPromise
}

// -- scoring ----------------------------------------------------------------

/** True when q appears in s as an in-order subsequence ("usrcl" ⊂ "user-circle"). */
function subsequence(q: string, s: string): boolean {
  let i = 0
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) i++
  }
  return i === q.length
}

/**
 * Score one query token against one entry. 0 means no match — and any token
 * scoring 0 disqualifies the icon, so "arrow up" means both, not either.
 *
 * The ladder: exact name, name prefix, word prefix, name substring, tag word,
 * tag substring, then name subsequence as the true fuzzy tail. Shorter names
 * edge out longer ones inside a band, so "user" beats "user-circle-plus".
 */
function scoreToken(token: string, e: IndexEntry): number {
  if (e.name === token) return 1000
  // the alias table is the app's own vocabulary — "settings" means gear, full
  // stop — so it outranks every fuzzier band below
  if (ICON_ALIASES[token] === e.name) return 950
  if (e.name.startsWith(token)) return 900 - e.name.length
  const wordAt = e.words.findIndex((w) => w.startsWith(token))
  if (wordAt >= 0) return 800 - wordAt * 10 - e.name.length
  const at = e.name.indexOf(token)
  if (at >= 0) return 700 - at - e.name.length
  if (e.tags) {
    // tags are space-separated phrases; a word-boundary hit reads strongest,
    // and shorter names edge out longer ones inside each band
    const words = e.tags.split(" ")
    if (words.includes(token)) return 550 - e.name.length
    if (words.some((w) => w.startsWith(token))) return 450 - e.name.length
    if (e.tags.includes(token)) return 330 - e.name.length
  }
  if (token.length >= 3 && subsequence(token, e.name)) return 200 - e.name.length
  return 0
}

function scoreEntry(tokens: string[], e: IndexEntry): number {
  let total = 0
  for (const t of tokens) {
    const s = scoreToken(t, e)
    if (s === 0) return 0
    total += s
  }
  return total
}

/**
 * Ranked icon names for a query. Synchronous — searches whatever index is in
 * memory, name-only until loadIconIndex() lands.
 */
export function searchIcons(query: string, limit = 36): string[] {
  const tokens = query.trim().toLowerCase().split(/[\s-]+/).filter(Boolean)
  if (!tokens.length) return []
  const entries =
    index ?? ALL_ICON_NAMES.map((name) => ({ name, words: name.split("-"), tags: "", categories: "" }))
  const hits: { name: string; score: number }[] = []
  for (const e of entries) {
    const score = scoreEntry(tokens, e)
    if (score > 0) hits.push({ name: e.name, score })
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return hits.slice(0, limit).map((h) => h.name)
}

// -- suggestions ------------------------------------------------------------

/** The icons people actually reach for — the empty-query grid. */
export const POPULAR_ICONS: string[] = [
  "star", "heart", "user", "house", "gear", "bell",
  "check", "x", "plus", "magnifying-glass", "envelope", "calendar-blank",
  "image", "trash", "lightning", "arrow-right", "chat-circle", "lock",
  "clock", "map-pin", "tag", "folder", "camera", "globe",
]

/**
 * Icons that belong near this one — same catalog category, popular ones
 * first. Before the index loads (or for an unknown name) it's just the
 * popular set, which is an honest fallback rather than a wrong answer.
 */
export function relatedIcons(name: string, limit = 24): string[] {
  const entry = index?.find((e) => e.name === name)
  if (!entry || !entry.categories) return POPULAR_ICONS.filter((n) => n !== name).slice(0, limit)
  const cats = entry.categories.split(" ")
  const related = index!
    .filter((e) => e.name !== name && e.categories && cats.some((c) => e.categories.includes(c)))
    .map((e) => e.name)
  related.sort((a, b) => {
    const pa = POPULAR_ICONS.indexOf(a)
    const pb = POPULAR_ICONS.indexOf(b)
    return (pa < 0 ? POPULAR_ICONS.length : pa) - (pb < 0 ? POPULAR_ICONS.length : pb)
  })
  return related.slice(0, limit)
}
