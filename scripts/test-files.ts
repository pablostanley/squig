// ---------------------------------------------------------------------------
// The drawer's bookkeeping — what a save does to the index, and above all what
// it must never do to somebody else's drawing.
//
//   node --experimental-strip-types scripts/test-files.ts
//
// planSave is the whole decision, pulled out of saveFile so it can be read and
// checked without a localStorage in the room: given what the drawer holds, the
// document in hand, and whether the browser took it, what should change.
// ---------------------------------------------------------------------------

// The one thing planSave can't answer is what happens when the *index* write
// is the one refused, since planSave never sees it — so the last section drives
// saveFile itself, over a localStorage that can be told to say no to one key.
import { INDEX_KEY, MAX_FILES, listFiles, planSave, saveFile, type FileMeta, type StoredDoc } from "../lib/files.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const ids = (list: FileMeta[]) => list.map((f) => f.id).join(",")

// -- fixtures ---------------------------------------------------------------

/** newest first, the way listFiles hands them over */
function drawer(n: number): FileMeta[] {
  const out: FileMeta[] = []
  for (let i = 0; i < n; i++) out.push({ id: `f${i}`, name: `drawing ${i}`, updatedAt: 10_000 - i })
  return out
}

function meta(id: string, updatedAt = 20_000, name = "in hand"): FileMeta {
  return { id, name, updatedAt }
}

// -- the ordinary save ------------------------------------------------------

{
  const index = drawer(3)

  // a document nobody has seen before goes on the front of the list
  const fresh = planSave(index, meta("new"), true)
  check("a new document joins the drawer", ids(fresh.index) === "new,f0,f1,f2", ids(fresh.index))
  check("…and nothing is forgotten to make room for it", fresh.forget.length === 0)
  check("…and the drawer isn't full", fresh.full === false)

  // saving one that's already listed moves it to the front rather than
  // listing it twice — the drawer is keyed by document, not by save
  const again = planSave(index, meta("f2", 20_000, "renamed"), true)
  check("saving a listed document moves it to the front", ids(again.index) === "f2,f0,f1", ids(again.index))
  check("…exactly once", again.index.filter((f) => f.id === "f2").length === 1)
  check("…and the entry is the one we just wrote", again.index[0].name === "renamed" && again.index[0].updatedAt === 20_000)

  // an empty drawer is the first save of a browser's life, not a special case
  const first = planSave([], meta("only"), true)
  check("the first save of all works the same", ids(first.index) === "only" && first.forget.length === 0)
}

// -- the tail trim ----------------------------------------------------------

{
  // a full drawer plus one more: the oldest falls off the end, and only the
  // oldest. This is the drawer's own bound, nothing to do with the quota.
  const index = drawer(MAX_FILES)
  const plan = planSave(index, meta("new"), true)
  check("the drawer stops at MAX_FILES", plan.index.length === MAX_FILES, `${plan.index.length}`)
  check("…and the one that falls off is the oldest", plan.forget.join(",") === `f${MAX_FILES - 1}`, plan.forget.join(","))
  check("…and it's gone from the index too", !plan.index.some((f) => f.id === `f${MAX_FILES - 1}`))
  check("…while the document in hand is at the front", plan.index[0].id === "new")

  // re-saving something already listed can't push the drawer over the edge,
  // so nothing should fall off at all
  const resave = planSave(index, meta("f9"), true)
  check("re-saving a listed document forgets nothing", resave.forget.length === 0)
  check("…and the drawer is the same size", resave.index.length === MAX_FILES)

  // a drawer already over the line — an index written before MAX_FILES was
  // this number, or by another tab — is trimmed back to it
  const over = planSave(drawer(MAX_FILES + 5), meta("f0"), true)
  check("an over-long drawer is trimmed back", over.index.length === MAX_FILES)
  check("…forgetting only the tail", over.forget.length === 5 && over.forget[0] === `f${MAX_FILES}`)
}

// -- the document that won't fit --------------------------------------------

{
  const index = drawer(5)
  const before = ids(index)
  const plan = planSave(index, meta("new"), false)

  check("a refused write says so", plan.full === true)
  check("…and forgets nothing at all", plan.forget.length === 0, plan.forget.join(","))
  check("…and leaves the drawer exactly as it found it", ids(plan.index) === before, ids(plan.index))
  check("…and doesn't list a document that was never written", !plan.index.some((f) => f.id === "new"))

  // the point of the whole exercise: squig used to delete the user's other
  // drawings, oldest first, until the one in hand fit. Every id that went in
  // comes back out, however badly the write went.
  for (const f of index) {
    check(`a failed save keeps ${f.id}`, plan.index.some((g) => g.id === f.id && g.updatedAt === f.updatedAt))
  }

  // a document that has been saved before keeps its old entry — the bytes on
  // disk are the previous version, and that is what the entry describes
  const known = planSave(index, meta("f1", 20_000, "renamed"), false)
  check("a failed re-save keeps the entry that matches what's on disk", known.index.some((f) => f.id === "f1" && f.name === "drawing 1"))
  check("…and doesn't move it to the front", known.index[0].id === "f0", ids(known.index))

  // and it must not trim either: the tail would be paying for a document that
  // never landed
  const packed = drawer(MAX_FILES)
  const squeezed = planSave(packed, meta("new"), false)
  check("a failed save doesn't trim the tail", squeezed.forget.length === 0)
  check("…and the whole drawer is still listed", ids(squeezed.index) === ids(packed))

  // there is nothing to lose on an empty drawer, and nothing to invent either
  const nothing = planSave([], meta("new"), false)
  check("a first save that won't fit lists nothing", nothing.index.length === 0 && nothing.full)
}

// -- the half-landed save ---------------------------------------------------

// A save is two writes: the document, then the entry that says where and when
// it landed. The document is the big one, so it is the one a full quota
// usually refuses — but the index *grows* too, by an entry on a document's
// first save and by a few characters on a rename, and it goes down second. So
// there is a real save in which the drawing lands and the drawer never hears
// about it.
//
// That used to be reported as a success. The caller would move its `seen`
// stamp forward onto a version the index had never heard of, canWrite would
// read the disagreement as another tab writing this document, and every save
// for the rest of the session was refused with "this drawing changed in
// another tab" — in the one tab there was. Freeing space didn't help; only
// opening another document did. It counts as a full drawer now, which is the
// policy planSave already argues for: a failed save changes nothing at all.
{
  const store = new Map<string, string>()
  let refuse: string | null = null
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === refuse) throw new Error("QuotaExceededError")
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
  }

  const doc = (updatedAt: number, name = "d"): StoredDoc => ({ id: "d1", name, nodes: {}, order: [], updatedAt })

  // a normal first save, and the tab now knows what's on disk
  let seen: number | null = null
  let plan = saveFile(doc(1000), seen)
  if (!plan.full && !plan.stale) seen = 1000
  check("the ordinary save lands", !plan.full && !plan.stale && listFiles()[0]?.updatedAt === 1000)

  // now the index write alone is refused — the document write still gets through
  refuse = INDEX_KEY
  plan = saveFile(doc(2000), seen)
  if (!plan.full && !plan.stale) seen = 2000
  check("a refused index write is a refused save", plan.full === true && plan.stale === false)
  check("…and the drawer it reports is the one on disk", plan.index[0]?.updatedAt === 1000, JSON.stringify(plan.index))
  check("…so the caller is still holding the stamp the index has", seen === 1000, `seen ${seen}`)

  // and that is the whole point: the next save must go out normally, rather
  // than being mistaken for another tab's work forever after
  refuse = null
  for (const at of [3000, 4000]) {
    const again = saveFile(doc(at), seen)
    if (!again.full && !again.stale) seen = at
    check(`the save at ${at} goes out as normal`, !again.stale && !again.full, JSON.stringify(again))
  }
  check("…and the drawer ends up describing what's on disk", listFiles()[0]?.updatedAt === 4000 && seen === 4000)

  // the tail is trimmed against an index that says so, never before it: a
  // refused index write must not leave rows pointing at documents whose bytes
  // have already been dropped
  store.clear()
  seen = null
  const packed: FileMeta[] = []
  for (let i = 0; i < MAX_FILES; i++) packed.push({ id: `f${i}`, name: `drawing ${i}`, updatedAt: 10_000 - i })
  store.set(INDEX_KEY, JSON.stringify(packed))
  for (const f of packed) store.set(`squig:file:${f.id}`, JSON.stringify({ id: f.id, name: f.name, nodes: {}, order: [], updatedAt: f.updatedAt }))
  refuse = INDEX_KEY
  const overflow = saveFile({ id: "new", name: "new", nodes: {}, order: [], updatedAt: 20_000 }, null)
  check("a refused index write on a full drawer is refused too", overflow.full === true)
  check("…and the oldest drawing is still on disk", store.has(`squig:file:f${MAX_FILES - 1}`))
  check("…and still listed", listFiles().some((f) => f.id === `f${MAX_FILES - 1}`))
  refuse = null
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} drawer checks passed`)
