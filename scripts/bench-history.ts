// ---------------------------------------------------------------------------
// What a checkpoint costs on a board with screenshots on it.
//
//   node --expose-gc --experimental-strip-types \
//        --import ./scripts/register-loader.mjs scripts/bench-history.ts \
//        [pictures] [chars per picture]
//
// Not a test — nothing here passes or fails, and it isn't in `npm test`. It is
// the thing that decided how `snapshot` should work, kept so the next person
// to touch history can put a number on it rather than reasoning about it.
//
// Two numbers, because they are different problems wearing the same clothes:
// how long one checkpoint takes (the hitch you feel at the start of a drag)
// and how much a full hundred-entry stack holds onto (the session that slowly
// goes sticky). Both are driven through the real store rather than against
// `snapshot` directly, so what's measured is what the app actually does.
//
// --expose-gc matters for the second one; without it the heap reading is noise.
// ---------------------------------------------------------------------------

;(globalThis as { window?: unknown }).window = {
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
}
const held = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => held.get(k) ?? null,
  setItem: () => {},
  removeItem: (k: string) => void held.delete(k),
}

const { useSquig } = await import("../lib/store.ts")
import type { SquigNode } from "../lib/types.ts"

const s = () => useSquig.getState()

/** a data URL of roughly `chars` characters — the shape lib/clipboard writes */
function fakeSrc(chars: number, salt: string): string {
  const head = "data:image/jpeg;base64,"
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let body = salt
  while (body.length < chars - head.length) body += alphabet[(body.length * 7 + salt.length) % 62]
  return head + body.slice(0, chars - head.length)
}

const IMAGES = Number(process.argv[2] ?? 6)
const SRC_CHARS = Number(process.argv[3] ?? 300_000)

useSquig.setState({ nodes: {}, order: [], selection: [], past: [], future: [] })
for (let i = 0; i < IMAGES; i++) {
  s().addNode(
    {
      type: "image",
      src: fakeSrc(SRC_CHARS, `pic${i}`),
      naturalW: 1280,
      naturalH: 800,
      x: i * 40,
      y: i * 40,
      w: 640,
      h: 400,
    } as Omit<SquigNode, "id" | "seed">,
    { checkpoint: false }
  )
}
// plus a plausible amount of wireframe around them
for (let i = 0; i < 120; i++) {
  s().addNode(
    { type: "shape", shape: "rect", fill: "none", x: i * 7, y: i * 5, w: 80, h: 40 } as Omit<SquigNode, "id" | "seed">,
    { checkpoint: false }
  )
}
useSquig.setState({ past: [], future: [] })

const docChars = JSON.stringify({ nodes: s().nodes, order: s().order }).length
console.log(
  `document: ${IMAGES} pictures x ~${(SRC_CHARS / 1000) | 0}KB + 120 shapes = ${(docChars / 1e6).toFixed(2)}MB of JSON`
)

// -- one checkpoint, timed --------------------------------------------------
const RUNS = 40
for (let i = 0; i < 5; i++) s().checkpoint()
useSquig.setState({ past: [], future: [] })
const times: number[] = []
for (let i = 0; i < RUNS; i++) {
  const t0 = performance.now()
  s().checkpoint()
  times.push(performance.now() - t0)
}
times.sort((a, b) => a - b)
console.log(
  `checkpoint(): median ${times[RUNS >> 1].toFixed(2)}ms  min ${times[0].toFixed(2)}ms  max ${times[RUNS - 1].toFixed(2)}ms`
)

// -- a full 100-entry history, retained -------------------------------------
const gc = (globalThis as { gc?: () => void }).gc
useSquig.setState({ past: [], future: [] })
gc?.()
gc?.()
const before = process.memoryUsage().heapUsed
// 100 checkpoints, each with a small real edit between them so the entries are
// genuinely distinct — which is what a session of dragging looks like
const ids = [...s().order]
for (let i = 0; i < 100; i++) {
  s().checkpoint()
  const id = ids[i % ids.length]
  s().updateNode(id, { x: s().nodes[id].x + 1 }, { checkpoint: false })
}
gc?.()
gc?.()
const after = process.memoryUsage().heapUsed
console.log(`history of ${s().past.length}: retains ${((after - before) / 1e6).toFixed(1)}MB`)
