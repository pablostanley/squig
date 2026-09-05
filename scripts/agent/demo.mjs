// Create a real three-direction canvas for manual verification. Credentials are
// written only to the requested private file; never printed to the terminal.
import { writeFile } from "node:fs/promises"
import { randomBytes, createHash } from "node:crypto"
import { neon } from "@neondatabase/serverless"
const base = process.env.SQUIG_TEST_URL ?? "http://localhost:3001"
const output = process.env.SQUIG_DEMO_FILE ?? "/tmp/squig-agent-demo.json"
const sql = neon(process.env.DATABASE_URL)
const key = randomBytes(32).toString("base64url"),
  workspace = `demo_${randomBytes(8).toString("hex")}`
await sql`INSERT INTO agent_workspaces (id,name,key_hash) VALUES (${workspace},'Book club exploration',${createHash("sha256").update(key).digest("hex")})`
async function call(path, data) {
  const r = await fetch(`${base}/api/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
  const result = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(result))
  return result
}
const doc = await call("documents", {
  name: "The Sunday Chapter — three ways in",
})
const nodes = [],
  operations = []
const text = (id, x, y, w, h, value, size = 20) =>
  nodes.push({
    id,
    type: "text",
    x,
    y,
    w,
    h,
    text: value,
    fontSize: size,
    fixedW: true,
  })
const shape = (id, x, y, w, h, fill = "paper") =>
  nodes.push({ id, type: "shape", shape: "rect", x, y, w, h, fill })
const button = (id, x, y, label) =>
  nodes.push({
    id,
    type: "component",
    kind: "button",
    x,
    y,
    w: 220,
    h: 44,
    props: { label },
  })
const variations = [
  [
    "meeting",
    "Meeting first",
    "For visitors ready to join. The next gathering is the first thing they see.",
  ],
  [
    "book",
    "The book is the invitation",
    "For curious readers. Lead with a story worth talking about, then invite them in.",
  ],
  [
    "people",
    "A club made by its readers",
    "For people looking for community. Member voices make the invitation feel personal.",
  ],
]
for (let i = 0; i < variations.length; i++) {
  const [id, title, description] = variations[i],
    x = i * 880,
    start = nodes.length
  shape(`${id}-page`, x, 0, 780, 980)
  text(`${id}-brand`, x + 40, 32, 320, 40, "The Sunday Chapter", 26)
  text(
    `${id}-nav`,
    x + 450,
    42,
    280,
    30,
    "Our shelf    Gatherings    About",
    16,
  )
  if (i === 0) {
    text(
      `${id}-eyebrow`,
      x + 48,
      125,
      600,
      32,
      "A neighborhood book club. Everyone is welcome.",
      18,
    )
    text(
      `${id}-headline`,
      x + 48,
      183,
      660,
      124,
      "A good book.\nBetter company.",
      52,
    )
    text(
      `${id}-body`,
      x + 48,
      325,
      620,
      72,
      "One Sunday a month, we put the kettle on and talk about what we’ve read. Come as you are.",
      22,
    )
    shape(`${id}-meeting`, x + 48, 440, 684, 230, "light")
    text(
      `${id}-date`,
      x + 76,
      467,
      580,
      30,
      "Next gathering · Sunday, September 20 · 11 am",
      18,
    )
    text(`${id}-book`, x + 76, 514, 580, 50, "The Creative Act", 34)
    text(
      `${id}-location`,
      x + 76,
      568,
      580,
      35,
      "At Chapter House, 14 Willow Street",
      18,
    )
    button(`${id}-join`, x + 76, 613, "Save me a seat")
    text(
      `${id}-below`,
      x + 48,
      724,
      620,
      40,
      "Come for the book. Stay for the conversation.",
      26,
    )
    text(
      `${id}-footer`,
      x + 48,
      804,
      620,
      80,
      "No reading quiz. No membership fee. Just a room full of people who are glad you came.",
      21,
    )
  } else if (i === 1) {
    shape(`${id}-cover`, x + 48, 145, 240, 330, "light")
    text(`${id}-cover-title`, x + 72, 200, 190, 120, "THE\nCREATIVE\nACT", 32)
    text(`${id}-cover-author`, x + 72, 390, 190, 35, "Rick Rubin", 20)
    text(
      `${id}-eyebrow`,
      x + 328,
      150,
      400,
      30,
      "On our nightstands this month",
      18,
    )
    text(
      `${id}-headline`,
      x + 328,
      205,
      400,
      140,
      "What does it mean\nto make something?",
      38,
    )
    text(
      `${id}-body`,
      x + 328,
      365,
      390,
      100,
      "A book about noticing, experimenting, and finding your own way. Let’s talk about it.",
      21,
    )
    button(`${id}-join`, x + 328, 500, "Read along with us")
    text(
      `${id}-section`,
      x + 48,
      608,
      680,
      50,
      "Three questions to bring with you",
      30,
    )
    text(
      `${id}-questions`,
      x + 48,
      685,
      680,
      160,
      "What did you underline?\nWhat made you change your mind?\nWhat will you try differently tomorrow?",
      23,
    )
    text(
      `${id}-date`,
      x + 48,
      890,
      680,
      35,
      "Talk it over September 20, 11 am · Chapter House",
      18,
    )
  } else {
    text(
      `${id}-headline`,
      x + 48,
      136,
      660,
      124,
      "Your next chapter\nstarts with people.",
      48,
    )
    text(
      `${id}-body`,
      x + 48,
      292,
      660,
      70,
      "A small circle of readers with wonderfully different lives. There’s an empty chair for you.",
      22,
    )
    shape(`${id}-quote`, x + 48, 404, 684, 194, "light")
    text(
      `${id}-quote-text`,
      x + 76,
      430,
      628,
      102,
      "“I came because I loved the book.\nI stayed because someone saw it\ncompletely differently.”",
      26,
    )
    text(
      `${id}-quote-by`,
      x + 76,
      555,
      600,
      30,
      "Maya · reading with us since March",
      17,
    )
    text(
      `${id}-section`,
      x + 48,
      648,
      600,
      50,
      "Bring your curiosity. We’ll bring the tea.",
      28,
    )
    button(`${id}-join`, x + 48, 721, "Meet your fellow readers")
    text(
      `${id}-book`,
      x + 48,
      813,
      660,
      70,
      "This month: The Creative Act, by Rick Rubin\nNext gathering: September 20 at Chapter House",
      20,
    )
  }
  const nodeIds = nodes.slice(start).map((n) => n.id)
  operations.push({ op: "variation", id, title, description, nodeIds })
}
await call("tools/edit_document", {
  documentId: doc.id,
  revision: 1,
  operations: [{ op: "add", nodes }, ...operations],
})
await writeFile(
  output,
  JSON.stringify({
    workspace,
    key,
    id: doc.id,
    reviewUrl: doc.reviewUrl,
    base,
  }),
  { mode: 0o600 },
)
console.log(
  "Three-direction demo created. Private connection details written to the requested file.",
)
