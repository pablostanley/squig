// ---------------------------------------------------------------------------
// Two tabs, one drawing — the rules for who is allowed to write.
//
// squig keeps its documents in localStorage, which the whole browser shares,
// and it reopens whatever you had open last. So a second tab lands on the same
// drawing by default: two canvases, two copies in memory, one file underneath.
// Both autosaved the whole document over the top of the other's, last write
// won, and neither ever said a word about it.
//
// What follows is a guard, not a merge. squig will not try to reconcile two
// drawings — that is a different program, and a wrong guess about which
// rectangle you meant is worse than an honest stop. The bar is narrower and
// absolute: squig must never overwrite a version of a document it hasn't seen.
//
// Two things get us there, and the rules for both live here, pure, so they can
// be read and checked without a browser in the room — see scripts/test-tabs.ts.
//
//   planTabSync — a `storage` event says another tab wrote this document. The
//     event fires in every tab except the one that did the writing, which is
//     exactly the asymmetry this needs: whoever wrote already knows, everyone
//     else finds out. A tab holding nothing of its own catches up quietly; a
//     tab holding work stops writing and says so.
//
//   canWrite — the same question asked again at the moment of the save, from
//     the drawer's own index rather than from an event. Events can be missed,
//     a tab can be woken from the back of a phone with a whole session's worth
//     of writes behind it, and a debounce can straddle one. The index cannot
//     lie about when the last write that landed landed. A save that refuses is
//     far better than one that lies.
//
// On stamps: a version of a document is identified by its `updatedAt` and
// nothing else. The question asked here is never "which of these is newer" but
// "are these still the bytes I last saw", so an inequality is the whole test —
// which also means a clock that jumps backwards is handled for free, where an
// ordering test would quietly let the older write through. A monotonic
// revision counter would add certainty only for two tabs writing inside the
// same millisecond, which a 400ms debounce and a human hand put out of reach,
// and it would have to be persisted, migrated onto every document written
// before it existed, and kept straight through import and export. Not worth
// a field.
// ---------------------------------------------------------------------------

import type { FileMeta } from "./files"

/** Everything a tab is holding that the drawer might not have. */
export interface TabWork {
  /** an edit is owed to the drawer: the debounce hasn't fired, or its write
   *  was refused and so is still owed */
  dirty: boolean
  /** a hand is on a layer — a move, resize, draw or library drag in flight */
  transforming: boolean
  /** a text editor is open, holding words the document has never seen */
  editing: boolean
}

/**
 * Is this tab holding anything the drawer doesn't already have?
 *
 * "Nothing unsaved" is a claim squig has to be able to make truthfully before
 * it throws this canvas away for another tab's, so it is drawn wider than the
 * save flag on its own. `dirty` covers edits owed to the drawer, a refused
 * write included, since that one stays owed. A hand on a layer counts too: a
 * drag writes to the document on its first move, and in the moment before that
 * it is still a gesture aimed at nodes that a swap would pull out from under
 * it. So does an open text editor, which is the one place in squig where words
 * live on screen before they live in the document.
 */
export function hasUnsavedWork(w: TabWork): boolean {
  return w.dirty || w.transforming || w.editing
}

/** What this tab should do about a write another tab just made. */
export type TabAction =
  /** not our document, or nothing we don't already have */
  | "ignore"
  /** take the other tab's version: this canvas has nothing to lose */
  | "adopt"
  /** this canvas holds work the other version doesn't — stop writing, speak up */
  | "conflict"
  /** the document isn't on disk any more, or isn't readable as one */
  | "gone"

export interface TabSync {
  /** the storage key another tab just wrote */
  key: string
  /** the key this tab's own document lives under */
  docKey: string
  /** `updatedAt` of what was written, or null when the key no longer holds a
   *  document we can read — deleted, cleared, or trimmed off the drawer's tail */
  stamp: number | null
  /** the `updatedAt` of the bytes this tab last read or wrote */
  seen: number | null
  /** what this tab is holding */
  work: TabWork
  /** this tab has already stopped writing — there is nothing new to learn */
  stale: boolean
}

export function planTabSync(s: TabSync): TabAction {
  // Some other document entirely, or the drawer's index, or another app on
  // this origin. This is the line the ordinary one-tab case leaves by: nothing
  // ever writes this tab's document key but this tab, and a tab is never told
  // about its own writes.
  if (s.key !== s.docKey) return "ignore"
  // already stopped, already said so. Saying it twice per keystroke of the
  // other tab's typing would be its own kind of noise.
  if (s.stale) return "ignore"
  if (s.stamp === null) return "gone"
  // the version that landed is the one we're already holding — a tab that
  // adopted and then had the same write reported to it again, say
  if (s.stamp === s.seen) return "ignore"
  return hasUnsavedWork(s.work) ? "conflict" : "adopt"
}

/**
 * May this tab write over what's on disk for `id`?
 *
 * The drawer's index is the witness, for two reasons. It records the
 * `updatedAt` of the last write that landed, whoever made it — and it is read
 * on every save already, to work out where the document goes in the list, so
 * asking costs a lookup over at most forty entries and not one extra trip to
 * storage. Re-reading the document itself to check a timestamp would mean
 * parsing megabytes of drawing on every autosave, in the single-tab case that
 * has nothing to check for, which is exactly the cost this guard must not add.
 *
 * Nothing listed means nothing to clobber: the document's first save, or one
 * whose index entry an earlier refused write never managed to record. Writing
 * is what puts that right.
 *
 * `seen` of null means this tab has never read this document — and yet the
 * drawer lists one under its name. A freshly minted id cannot be listed, so
 * this is a tab that has lost track of what it has open, and the one safe
 * answer to that is no.
 */
export function canWrite(index: readonly FileMeta[], id: string, seen: number | null): boolean {
  const onDisk = index.find((f) => f.id === id)?.updatedAt
  if (onDisk === undefined) return true
  return onDisk === seen
}
