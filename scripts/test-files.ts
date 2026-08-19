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

import { MAX_FILES, planSave, type FileMeta } from "../lib/files.ts"

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

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} drawer checks passed`)
