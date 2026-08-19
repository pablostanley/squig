// ---------------------------------------------------------------------------
// What a drop is made of, and where the pictures land — pure.
//
// Dragging a picture in off the desktop is the first thing anyone tries, and
// the browser's own answer to it is to navigate away from the drawing. The
// half of the reply that touches the DOM lives in use-file-drop; this is the
// part worth pinning down with tests — which of the dropped files squig can
// actually use, and where several of them go so they don't land in one pile.
// ---------------------------------------------------------------------------

/** The bits of a File these decisions read, so the tests can be plain objects. */
export interface DroppedFile {
  name: string
  type: string
}

/**
 * What a drop turns out to be.
 *
 * Pictures win over documents whenever both arrive at once: opening a document
 * puts the whole canvas away and brings another one back, which is far too big
 * a thing to do to somebody who was plainly dragging in reference art. The
 * skipped count is the rest of the drop — the PDFs and zips that came along
 * with the pictures and have nowhere to go.
 */
export type DropPlan =
  | { kind: "images"; indices: number[]; skipped: number }
  | { kind: "doc"; index: number }
  | { kind: "nothing"; count: number }

/**
 * Names to fall back on when the drag arrives with no type at all — which is
 * what several file managers, and a couple of chat apps, hand over.
 */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i
/** .squig.json ends in .json, so one pattern covers both spellings */
const DOC_EXT = /\.(json|squig)$/i

const isImage = (f: DroppedFile) => f.type.startsWith("image/") || (!f.type && IMAGE_EXT.test(f.name))
const isDoc = (f: DroppedFile) => f.type === "application/json" || DOC_EXT.test(f.name)

/** Sort a dropped file list into the one thing squig is going to do with it. */
export function planDrop(files: readonly DroppedFile[]): DropPlan {
  const indices: number[] = []
  files.forEach((f, i) => {
    if (isImage(f)) indices.push(i)
  })
  if (indices.length) return { kind: "images", indices, skipped: files.length - indices.length }

  // only ever the first one: two documents in a drop is two answers to a
  // question that has room for one
  const doc = files.findIndex(isDoc)
  if (doc >= 0) return { kind: "doc", index: doc }

  return { kind: "nothing", count: files.length }
}

export interface DropSize {
  w: number
  h: number
}

/** breathing room between dropped pictures, in world units */
const GAP = 20
/** how wide a row of them runs before it wraps onto the next one */
const ROW_WIDTH = 1200

/**
 * Where each picture in a drop goes, given the point it was let go over.
 *
 * The pointer is holding the pictures, so the block is centred on it rather
 * than hung off it by its top-left corner the way a paste is — a drop lands
 * where you aimed it, and with one picture that means under the cursor.
 *
 * Several at once go in a row instead of a cascade: dropping a folder of
 * screenshots is usually the start of comparing them, and a row is already the
 * arrangement you were going to drag them into. Rows wrap rather than running
 * off toward the horizon, and the whole block comes back selected, so a layout
 * you don't like is one drag away from being somewhere else.
 */
export function layoutDrop(sizes: readonly DropSize[], at: readonly [number, number]): [number, number][] {
  if (!sizes.length) return []

  const rows: { items: number[]; w: number; h: number }[] = []
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]
    const row = rows[rows.length - 1]
    // a picture wider than the whole row on its own still gets a row — the
    // wrap is a tidiness rule, not a size limit
    if (!row || row.w + GAP + s.w > ROW_WIDTH) {
      rows.push({ items: [i], w: s.w, h: s.h })
      continue
    }
    row.items.push(i)
    row.w += GAP + s.w
    row.h = Math.max(row.h, s.h)
  }

  const blockH = rows.reduce((sum, r) => sum + r.h, 0) + GAP * (rows.length - 1)
  const out: [number, number][] = []
  let y = at[1] - blockH / 2

  for (const row of rows) {
    let x = at[0] - row.w / 2
    for (const i of row.items) {
      const s = sizes[i]
      // shorter pictures sit on the row's middle line rather than its top, so
      // a mixed row reads as one band instead of a ragged edge
      out[i] = [Math.round(x), Math.round(y + (row.h - s.h) / 2)]
      x += s.w + GAP
    }
    y += row.h + GAP
  }

  return out
}
