"use client"

// ---------------------------------------------------------------------------
// The file drawer — every document this browser has ever held, kept in
// localStorage. Each doc lives under its own key with a small index on the
// side, so the file menu can list names and times without parsing every
// document it has.
//
// No cloud, no accounts. Clearing site data still clears everything, which is
// why Export stays one keystroke away.
// ---------------------------------------------------------------------------

import type { SquigNode } from "./types"
import { DEFAULT_FONT, DEFAULT_PAPER, DEFAULT_THEME, THEMES, type FontMode, type PaperShade, type ThemeName } from "./theme"

export interface FileMeta {
  id: string
  name: string
  updatedAt: number
}

export interface StoredDoc {
  id: string
  name: string
  nodes: Record<string, SquigNode>
  order: string[]
  updatedAt: number
}

/** Everything that belongs to the app rather than to any one document. */
export interface Prefs {
  theme: ThemeName
  font: FontMode
  /** how bright the sheet is */
  paper: PaperShade
  /** the canvas dot grid is drawn */
  grid: boolean
  contextRow: boolean
  activeId: string | null
}

/** exported so another tab writing the drawer can be noticed */
export const INDEX_KEY = "squig:files:v1"
const PREFS_KEY = "squig:prefs:v1"
const LEGACY_KEY = "squig:doc:v1"
const fileKey = (id: string) => `squig:file:${id}`

/** Past this many the drawer starts forgetting its oldest documents. */
const MAX_FILES = 40

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Returns false when the browser refuses the write — usually a full quota. */
function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function drop(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // nothing to do about it
  }
}

function isMeta(v: unknown): v is FileMeta {
  const m = v as FileMeta
  return !!m && typeof m.id === "string" && typeof m.name === "string" && typeof m.updatedAt === "number"
}

const byRecent = (a: FileMeta, b: FileMeta) => b.updatedAt - a.updatedAt

/** Every saved document, newest first. */
export function listFiles(): FileMeta[] {
  const parsed = readJSON(INDEX_KEY)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isMeta).sort(byRecent)
}

function writeIndex(list: FileMeta[]) {
  writeJSON(INDEX_KEY, list)
}

export function readFile(id: string): StoredDoc | null {
  const doc = readJSON(fileKey(id)) as StoredDoc | null
  if (!doc || typeof doc !== "object" || !doc.nodes || !Array.isArray(doc.order)) return null
  return { ...doc, id, name: typeof doc.name === "string" ? doc.name : "untitled scribbles" }
}

/**
 * Write a document and return the new index. If the browser is out of room we
 * forget the oldest documents — never the one in hand — and try again.
 */
export function saveFile(doc: StoredDoc): FileMeta[] {
  const meta: FileMeta = { id: doc.id, name: doc.name, updatedAt: doc.updatedAt }
  let index = [meta, ...listFiles().filter((f) => f.id !== doc.id)]

  // trim the tail first, so the common case never hits the quota at all
  for (const old of index.slice(MAX_FILES)) drop(fileKey(old.id))
  index = index.slice(0, MAX_FILES)

  let stored = writeJSON(fileKey(doc.id), doc)
  while (!stored) {
    const oldest = [...index].reverse().find((f) => f.id !== doc.id)
    if (!oldest) break
    drop(fileKey(oldest.id))
    index = index.filter((f) => f.id !== oldest.id)
    stored = writeJSON(fileKey(doc.id), doc)
  }

  // a document we couldn't store has no business being listed
  if (!stored) index = index.filter((f) => f.id !== doc.id)
  writeIndex(index)
  return index
}

export function deleteFile(id: string): FileMeta[] {
  drop(fileKey(id))
  const index = listFiles().filter((f) => f.id !== id)
  writeIndex(index)
  return index
}

/** A palette that has since been renamed or retired must not take the app down. */
function knownTheme(t: unknown): ThemeName {
  return typeof t === "string" && t in THEMES ? (t as ThemeName) : DEFAULT_THEME
}

function knownFont(f: unknown): FontMode {
  // "clean" was the old name for the one non-hand face, back when there was one
  if (f === "clean") return "sans"
  return f === "hand" || f === "sans" || f === "serif" ? f : DEFAULT_FONT
}

function knownPaper(s: unknown): PaperShade {
  return s === "white" || s === "subtle" || s === "shaded" ? s : DEFAULT_PAPER
}

export function loadPrefs(): Prefs {
  const p = (readJSON(PREFS_KEY) ?? {}) as Partial<Prefs>
  return {
    theme: knownTheme(p.theme),
    font: knownFont(p.font),
    paper: knownPaper(p.paper),
    // the grid is on unless someone turned it off
    grid: p.grid !== false,
    contextRow: p.contextRow === true,
    activeId: typeof p.activeId === "string" ? p.activeId : null,
  }
}

export function savePrefs(p: Prefs) {
  writeJSON(PREFS_KEY, p)
}

/**
 * squig used to keep a single autosaved document. Move it into the drawer as
 * a real file the first time we see it, so nobody's canvas disappears.
 */
export function migrateLegacyDoc(newId: () => string): { doc: StoredDoc; prefs: Prefs } | null {
  const old = readJSON(LEGACY_KEY) as
    | { fileName?: string; nodes?: Record<string, SquigNode>; order?: string[]; theme?: ThemeName; font?: FontMode; contextRow?: boolean }
    | null
  if (!old || !old.nodes || !Array.isArray(old.order)) {
    drop(LEGACY_KEY)
    return null
  }
  const doc: StoredDoc = {
    id: newId(),
    name: old.fileName || "untitled scribbles",
    nodes: old.nodes,
    order: old.order,
    updatedAt: Date.now(),
  }
  saveFile(doc)
  const prefs: Prefs = {
    theme: knownTheme(old.theme),
    font: knownFont(old.font),
    paper: DEFAULT_PAPER,
    grid: true,
    contextRow: old.contextRow === true,
    activeId: doc.id,
  }
  savePrefs(prefs)
  drop(LEGACY_KEY)
  return { doc, prefs }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "20m", "3h", "yesterday", "Mar 4" — short enough for a menu. */
export function relativeTime(ts: number, now = Date.now()): string {
  const d = now - ts
  if (d < MINUTE) return "just now"
  if (d < HOUR) return `${Math.floor(d / MINUTE)}m ago`
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  if (d < 2 * DAY) return "yesterday"
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
