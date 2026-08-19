// ---------------------------------------------------------------------------
// Two tabs on one drawing — who is allowed to write, and what the other one is
// told.
//
//   node --experimental-strip-types scripts/test-tabs.ts
//
// The whole decision is two pure functions in lib/tabs, which is the point:
// the failure this guards against takes two browser tabs, a debounce and
// twenty minutes to reproduce by hand, and none of that is needed to check the
// rules. planTabSync answers "another tab just wrote this document"; canWrite
// answers "may I write over what's on disk" at the moment of the save, which
// is the backstop for every event that never arrives.
// ---------------------------------------------------------------------------

import { canWrite, hasUnsavedWork, planTabSync, type TabSync, type TabWork } from "../lib/tabs.ts"
import { planSave, type FileMeta } from "../lib/files.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

// -- fixtures ---------------------------------------------------------------

const DOC = "squig:file:abc123"
const idle: TabWork = { dirty: false, transforming: false, editing: false }

/** a tab sitting on doc abc123, having last seen the bytes written at 1000 */
function tab(over: Partial<TabSync> = {}): TabSync {
  return { key: DOC, docKey: DOC, stamp: 2000, seen: 1000, work: idle, stale: false, ...over }
}

function meta(id: string, updatedAt: number): FileMeta {
  return { id, name: "a drawing", updatedAt }
}

// -- a tab with nothing to lose ---------------------------------------------

{
  // The everyday version of the bug: two tabs open on the same drawing, one of
  // them just sitting there. It has no reason to argue — what it has on screen
  // is exactly what was on disk a moment ago, so it takes the newer version.
  check("a clean tab adopts a newer write", planTabSync(tab()) === "adopt")

  // a tab that has already caught up hears about the same write again — a
  // second event, a re-read, whatever — and has nothing left to do
  check("…and doesn't adopt the same write twice", planTabSync(tab({ seen: 2000 })) === "ignore")

  // a tab that has never written this document at all: hydrate found nothing
  // under the key, then another tab created it. Still nothing to lose.
  check("a tab that has seen nothing adopts what appears", planTabSync(tab({ seen: null })) === "adopt")
}

// -- a tab holding work -----------------------------------------------------

{
  // The bug proper. This tab has edits the drawer has never seen, so adopting
  // would throw them away and saving would throw the other tab's away. Neither
  // is squig's to choose, so it stops and says so.
  const busy = planTabSync(tab({ work: { ...idle, dirty: true } }))
  check("a tab with unsaved edits refuses to adopt", busy === "conflict")

  // "nothing unsaved" has to be true when squig claims it, so it is drawn
  // wider than the save flag. A drag hasn't written to the document until its
  // first move, and swapping the nodes out from under it mid-gesture is the
  // same loss arriving a different way.
  check("a hand on a layer counts as work", planTabSync(tab({ work: { ...idle, transforming: true } })) === "conflict")

  // and the text editor is the one place in squig where words exist on screen
  // before they exist in the document
  check("an open text editor counts as work", planTabSync(tab({ work: { ...idle, editing: true } })) === "conflict")

  check("an idle tab holds nothing", hasUnsavedWork(idle) === false)
  check("…and any one of the three is enough", hasUnsavedWork({ ...idle, editing: true }) === true)

  // said once. Every keystroke in the other tab writes again, and a flash per
  // keystroke is noise, not news — the standing line under the file name is
  // what carries it from there.
  check("a tab that already stopped says nothing more", planTabSync(tab({ stale: true, work: { ...idle, dirty: true } })) === "ignore")
}

// -- the document that went away --------------------------------------------

{
  // deleted from the file menu in the other tab. squig neither blanks this
  // canvas nor quietly writes the document back into existence: it stops, and
  // the drawing stays on screen where the user can export it.
  check("a deleted document stops this tab", planTabSync(tab({ stamp: null })) === "gone")

  // …including when this tab is the one holding work
  check("…whatever this tab was holding", planTabSync(tab({ stamp: null, work: { ...idle, dirty: true } })) === "gone")

  // the same answer covers a write we can't read back, which is the honest
  // reading of it: whatever is under that key now, it isn't this document
  check("an unreadable write is treated the same", planTabSync(tab({ stamp: null, seen: null })) === "gone")
}

// -- one tab, one drawing, no other windows ---------------------------------

{
  // By far the ordinary case, and it must take exactly the path it took
  // before. A tab is never told about its own writes, so the only events it
  // ever sees are about other keys — the drawer's index, another document,
  // some other app on the same origin — and every one of them leaves here
  // without touching the canvas.
  check("another document's write is not ours", planTabSync(tab({ key: "squig:file:zzz" })) === "ignore")
  check("the drawer's index is not ours", planTabSync(tab({ key: "squig:files:v1" })) === "ignore")
  check("nor is somebody else's key", planTabSync(tab({ key: "some-other-app" })) === "ignore")
  // localStorage.clear() reports a null key, which arrives here as no key at all
  check("a cleared origin is not ours either", planTabSync(tab({ key: "" })) === "ignore")

  // and the same tab saving over and over, as an autosave does: each write
  // records what it wrote, and the next one is checked against that and goes
  // through. Nothing here ever refuses.
  let index: FileMeta[] = []
  let seen: number | null = null
  for (let i = 1; i <= 50; i++) {
    const at = 1000 + i
    check(`save ${i} of a lone tab goes through`, canWrite(index, "abc123", seen))
    index = planSave(index, meta("abc123", at), true).index
    seen = at
  }
  check("…and the drawer lists it once", index.filter((f) => f.id === "abc123").length === 1)
  check("…at the timestamp of the last write", index[0].updatedAt === 1050)
}

// -- the write that would clobber -------------------------------------------

{
  // The backstop. Even if the event never arrived — a tab asleep at the back
  // of a phone, a write that landed inside this debounce — the index still
  // knows when the last write that landed landed, and it doesn't match what
  // this tab last saw.
  const index = [meta("abc123", 2000), meta("other", 500)]
  check("a save over an unseen version refuses", canWrite(index, "abc123", 1000) === false)
  check("…and over the version we did see, writes", canWrite(index, "abc123", 2000) === true)

  // the question is "are these the bytes I last saw", not "is mine newer" —
  // so a clock that jumped backwards in the other tab is caught too, where an
  // ordering test would have waved it through
  check("a backwards clock is still a version we haven't seen", canWrite(index, "abc123", 3000) === false)

  // a document nothing is listed for: its first save, or one whose index entry
  // a refused write never managed to record. There is nothing there to lose.
  check("a first save has nothing to clobber", canWrite(index, "brand-new", null) === true)
  check("…and neither does another tab's document", canWrite([], "abc123", null) === true)

  // a listed document this tab has never read is a tab that has lost track of
  // what it has open, and the only safe answer to that is no
  check("a tab that has seen nothing won't write over something", canWrite(index, "abc123", null) === false)

  // one document's trouble is not another's
  check("a stale tab doesn't block the drawer's other files", canWrite(index, "other", 500) === true)
}

// -- what the drawer reports ------------------------------------------------

{
  // planSave never speaks for the tab guard: by the time it runs, the write
  // has already been allowed and either landed or been refused for room
  check("an ordinary save isn't stale", planSave([], meta("abc123", 1000), true).stale === false)
  check("nor is a save the browser had no room for", planSave([], meta("abc123", 1000), false).stale === false)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} tab checks passed`)
