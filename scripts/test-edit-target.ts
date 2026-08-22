// ---------------------------------------------------------------------------
// Which words a double-click steps into.
//
//   node --experimental-strip-types scripts/test-edit-target.ts
//
// lib/canvas/edit-target renders library defs to find their labels, so this
// pulls in the whole registry — which is the point: the checks at the bottom
// walk all 150 defs to make sure the aimed route didn't move the unaimed one.
// ---------------------------------------------------------------------------

import {
  editTarget,
  hasEditableText,
  iconControlAt,
  iconControlKeys,
  textControlAt,
  textControlKey,
  textControlKeys,
} from "../lib/canvas/edit-target.ts"
import { ALL_DEFS, getDef } from "../lib/library/registry.ts"
import { nodePrims } from "../lib/sketch/node-prims.ts"
import type { Prim } from "../lib/sketch/kit.ts"
import type { ComponentNode, SquigNode, TextNode } from "../lib/types.ts"

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

function is(name: string, got: unknown, want: unknown) {
  check(name, got === want, got === want ? "" : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

// -- fixtures ---------------------------------------------------------------

type TextPrim = Extract<Prim, { t: "text" }>
type IconPrim = Extract<Prim, { t: "path" }>

/** A library item dropped at its default size, with nothing overridden. */
function drop(kind: string, props: Record<string, unknown> = {}): ComponentNode {
  const def = getDef(kind)
  if (!def) throw new Error(`no such def: ${kind}`)
  return {
    id: "n1",
    type: "component",
    kind,
    x: 0,
    y: 0,
    w: def.size.w,
    h: def.size.h,
    props,
    seed: 1,
  } as ComponentNode
}

function runs(node: ComponentNode): TextPrim[] {
  return nodePrims(node).filter((p): p is TextPrim => p.t === "text")
}

function icons(node: ComponentNode): IconPrim[] {
  return nodePrims(node).filter((p): p is IconPrim => p.t === "path")
}

function iconMiddle(p: IconPrim): [number, number] {
  return [p.x + p.size / 2, p.y + p.size / 2]
}

/**
 * The middle of a drawn run, node-local — where a pointer aimed at those
 * particular words would land. Measured the way the module measures off a
 * browser: the sketch face averages 0.46em a character.
 */
function middleOf(p: TextPrim): [number, number] {
  const w = p.text.length * p.size * 0.46
  const left = p.x - (p.align === "center" ? 0.5 : p.align === "right" ? 1 : 0) * w
  return [left + w / 2, p.y - p.size * 0.3]
}

/** The one run printing exactly this string — throws rather than test a typo. */
function run(node: ComponentNode, text: string, nth = 0): TextPrim {
  const found = runs(node).filter((p) => p.text === text)
  if (!found[nth]) throw new Error(`${node.kind} draws no run ${nth} saying "${text}"`)
  return found[nth]
}

/** Where a double-click on those words would land you. */
function aimAt(node: ComponentNode, text: string, nth = 0): string | null {
  return textControlAt(node, ...middleOf(run(node, text, nth)))
}

// -- a card with several labels ---------------------------------------------

{
  // Stat draws four: a muted label, a big value, a signed delta and a period,
  // stacked close enough that their slop overlaps. Before this, only the
  // label answered to a double-click and the other three were inspector-only.
  const stat = drop("stat")
  is("stat: the controls are all four", textControlKeys(stat).join(","), "label,value,delta,period")

  is("stat: pointing at the label edits the label", aimAt(stat, "Active users"), "label")
  is("stat: pointing at the value edits the value", aimAt(stat, "8,240"), "value")
  is("stat: pointing at the delta edits the delta", aimAt(stat, "+4.2%"), "delta")
  is("stat: pointing at the period edits the period", aimAt(stat, "vs last week"), "period")

  // and the editor stands on the run that was pointed at, not on the first one
  const value = run(stat, "8,240")
  const target = editTarget(stat, "value")!
  is("stat: the editor opens on the value's own string", target.value, "8,240")
  is("stat: …at its anchor", target.x, value.x)
  is("stat: …on its baseline", target.baseline, value.y)
  is("stat: …at its size", target.fontSize, value.size)
  is("stat: …and commits to its prop", target.propKey, "value")
  is("stat: …hiding the run it stands in", target.hidden, runs(stat).findIndex((p) => p.text === "8,240"))

  // The period is truncated to whatever the delta leaves it, so a def that
  // re-fits one run when another changes length is exactly the case a plain
  // before/after diff gets wrong — it would hand the period to the delta.
  is("stat: a re-fitted neighbour still belongs to itself", aimAt(stat, "vs last week"), "period")

  // between the label and the value, both within reach, the nearer wins
  const label = run(stat, "Active users")
  is("stat: a click just under the label is the label's", textControlAt(stat, label.x + 20, label.y + 2), "label")
  is("stat: a click on the value's ascenders is the value's", textControlAt(stat, value.x + 20, value.y - value.size * 0.6), "value")

  // nowhere near any words: no aim, and the first control opens as ever
  is("stat: a click in the empty corner aims at nothing", textControlAt(stat, 175, 82), null)
  is("stat: …so the edit falls back to the first control", editTarget(stat, textControlAt(stat, 175, 82) ?? undefined)!.propKey, "label")

  // just past a small run's slop is already "nowhere near": the label's words
  // end around x=66, and the blank half of the line it sits on is nobody's
  is("stat: reach runs out half a line past the ink", textControlAt(stat, 140, label.y), null)
}

// -- a block where one control prints in several places ----------------------

{
  // A kanban board's column names are one comma-separated control drawn three
  // times over, and its tags another drawn nine times. Every one of them
  // should answer, and all of them should answer with the same key.
  const board = drop("kanban-board")
  is("kanban: two text controls", textControlKeys(board).join(","), "names,tags")

  is("kanban: the first column name", aimAt(board, "To do"), "names")
  is("kanban: the second column name", aimAt(board, "Doing"), "names")
  is("kanban: the third column name", aimAt(board, "Done"), "names")
  is("kanban: a tag on the first card", aimAt(board, "bug"), "tags")
  is("kanban: a tag further down the board", aimAt(board, "chore"), "tags")
  is("kanban: the last card's tag", aimAt(board, "ugh"), "tags")

  // Words the def prints on its own account back no prop at all. Editing the
  // nearest label instead would change something the click never pointed at,
  // so they aim at nothing and the first control opens.
  is("kanban: the card count is nobody's prop", aimAt(board, "3"), null)
  is("kanban: nor is the add-a-card hint", aimAt(board, "Add a card"), null)
  is(
    "kanban: …and a click on one still opens the first control",
    editTarget(board, aimAt(board, "Add a card") ?? undefined)!.propKey,
    "names"
  )

  // A control that prints in nine places is still one string, so the editor
  // stands on the first of its runs — where the words in the box and the words
  // it covers start the same way.
  const tags = editTarget(board, "tags")!
  const firstTag = run(board, "bug")
  is("kanban: the tag editor holds the whole list", tags.value, "bug, copy, design, chore, spike, ugh")
  is("kanban: …standing on the first tag drawn", tags.x, firstTag.x)
  is("kanban: …on its baseline", tags.baseline, firstTag.y)
}

// -- the defs that only ever had one label ----------------------------------

{
  // One control means there is nothing to choose between: no aim is taken (and
  // no extra renders spent taking one), and the edit opens where it always did.
  const button = drop("button")
  is("button: one text control", textControlKeys(button).length, 1)
  const label = run(button, "Click me")
  is("button: a click on the label takes no aim", textControlAt(button, ...middleOf(label)), null)
  const target = editTarget(button)!
  is("button: …and the edit opens on that label anyway", target.propKey, "label")
  is("button: …where the label is drawn", target.baseline, label.y)

  // a def with no words of its own still says so, without rendering to find out
  const wordless = ALL_DEFS.find((d) => !d.controls.some((c) => c.type === "text"))!
  const bare = drop(wordless.kind)
  is(`${wordless.kind}: no text control, no target`, editTarget(bare), null)
  is(`${wordless.kind}: …and no words to step into`, hasEditableText(bare), false)
  is(`${wordless.kind}: …nor a control to name`, textControlKey(bare), null)
  is("button: unlike one that has a label", hasEditableText(button), true)
}

// -- configurable icons ----------------------------------------------------

{
  // A wordless icon button still has a nested property to step into. The
  // pointer names that control from the drawn path, not from the component's
  // kind or from a hard-coded list of special cases.
  const iconButton = drop("icon-button")
  is("icon button: one searchable icon control", iconControlKeys(iconButton).join(","), "icon")
  const plus = icons(iconButton).find((p) => p.name === "plus")!
  is("icon button: its drawn plus owns the icon control", iconControlAt(iconButton, ...iconMiddle(plus)), "icon")

  // Conditional component icons only answer while they are actually drawn.
  // A list item's avatar is structural; switching Leading to Icon reveals the
  // configurable folder at the same spot.
  const avatarItem = drop("list-item")
  const user = icons(avatarItem).find((p) => p.name === "user")!
  is("list item: its fixed avatar glyph is not editable", iconControlAt(avatarItem, ...iconMiddle(user)), null)

  const iconItem = drop("list-item", { leading: "icon" })
  const folder = icons(iconItem).find((p) => p.name === "folder")!
  is("list item: its configurable leading icon is editable", iconControlAt(iconItem, ...iconMiddle(folder)), "icon")

  // A stat card draws both an editable currency glyph and a structural trend
  // arrow. Ownership keeps the arrow from opening the wrong control.
  const stat = drop("card-stat")
  const currency = icons(stat).find((p) => p.name === "currency-dollar")!
  const trend = icons(stat).find((p) => p.name === "arrow-up")!
  is("stat: its currency glyph owns the icon control", iconControlAt(stat, ...iconMiddle(currency)), "icon")
  is("stat: its trend arrow is not the currency control", iconControlAt(stat, ...iconMiddle(trend)), null)

  const avatar = drop("avatar")
  const person = icons(avatar).find((p) => p.name === "user")!
  is("avatar: its formerly fixed person glyph is now editable", iconControlAt(avatar, ...iconMiddle(person)), "glyph")
}

// -- an aim that isn't one ---------------------------------------------------

{
  const stat = drop("stat")
  is("a key this def never declared is no aim", editTarget(stat, "headline")!.propKey, "label")
  const text: TextNode = {
    id: "t1",
    type: "text",
    x: 0,
    y: 0,
    w: 120,
    h: 24,
    text: "hello",
    fontSize: 18,
    seed: 1,
  } as TextNode
  is("a text layer ignores the aim entirely", editTarget(text as SquigNode, "label")!.value, "hello")
  is("…and is always editable", hasEditableText(text as SquigNode), true)

  const tall = { ...text, h: 100, fixedH: true, verticalAlign: "bottom" as const }
  const drawn = nodePrims(tall).find((p): p is TextPrim => p.t === "text")!
  is("a vertically aligned text editor opens on the drawn baseline", editTarget(tall)!.baseline, drawn.y)
}

// -- nothing regressed across the library ------------------------------------

{
  // hasEditableText is a keystroke's cheap answer — it must agree with the
  // registry, for every def, with no rendering involved.
  let mismatched = 0
  let aimedElsewhere = 0
  let sameAsFirst = 0
  for (const def of ALL_DEFS) {
    const node = drop(def.kind)
    const keys = textControlKeys(node)
    const declared = def.controls.filter((c) => c.type === "text").map((c) => c.key)
    if (keys.join(",") !== declared.join(",")) mismatched++
    if (hasEditableText(node) !== declared.length > 0) mismatched++
    if (textControlKey(node) !== (declared[0] ?? null)) mismatched++

    const unaimed = editTarget(node)
    if (!declared.length) {
      if (unaimed !== null) mismatched++
      continue
    }
    // the unaimed route is the aimed route pointed at the first control
    const first = editTarget(node, declared[0])!
    if (JSON.stringify(unaimed) !== JSON.stringify(first)) sameAsFirst++
    if (unaimed?.propKey !== declared[0]) mismatched++

    // and an aim at any control comes back editing that control
    for (const key of declared) {
      if (editTarget(node, key)?.propKey !== key) aimedElsewhere++
    }
  }
  is(`all ${ALL_DEFS.length} defs: the registry and the module agree`, mismatched, 0)
  is("all defs: no aim means the first control, geometry and all", sameAsFirst, 0)
  is("all defs: an aim at a control edits that control", aimedElsewhere, 0)
}

{
  // Every run a control actually prints has to be clickable, or the gesture is
  // a coin toss. Walk the defs that draw more than one editable control and
  // aim at the middle of every one of their runs: whatever comes back must be
  // a control this def declares, and the run's own control when it has one.
  let claimed = 0
  let wrong = 0
  for (const def of ALL_DEFS) {
    const node = drop(def.kind)
    const keys = textControlKeys(node)
    if (keys.length < 2) continue
    for (const prim of runs(node)) {
      const key = textControlAt(node, ...middleOf(prim))
      if (key === null) continue
      claimed++
      if (!keys.includes(key)) wrong++
      // the run it claims must be one the control really prints
      const target = editTarget(node, key)
      if (!target || target.propKey !== key) wrong++
    }
  }
  check("aimed clicks only ever name a control the def declares", wrong === 0, `${wrong} of ${claimed}`)
  check("…and they land on a good few of them", claimed > 250, `${claimed} runs claimed`)
}

{
  // Cost. Every aim renders the component once plainly and once more per text
  // control, so the heaviest block in the library is the one to watch.
  const heavy = ALL_DEFS.map((d) => drop(d.kind)).filter((n) => textControlKeys(n).length >= 2)
  for (const node of heavy) textControlAt(node, 20, 20)
  const started = performance.now()
  for (const node of heavy) textControlAt(node, 20, 20)
  const each = (performance.now() - started) / heavy.length
  check(`an aim costs about ${each.toFixed(3)}ms on a multi-label def`, each < 2, `${each.toFixed(3)}ms`)
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`)
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`✓ ${passed} edit-target checks passed`)
