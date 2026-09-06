// ---------------------------------------------------------------------------
// Measuring the canvas face.
//
// The inline editor has to put a textarea's first baseline exactly where the
// renderer drew one, and a textarea's baseline depends on the font's own
// ascent and descent — numbers only the browser knows. So we ask it, through a
// 2D context set to the same face the drawing letters in.
//
// Everything falls back to the same rough em-ratios the sketch kit uses, so a
// server render (or a browser without the metrics) still produces a sane box.
// ---------------------------------------------------------------------------

export interface TypeStyle {
  /** in whatever units you want the answer in — px on screen, canvas units off it */
  size: number
  bold?: boolean
  italic?: boolean
}

export type TextMeasurer = (text: string, style: TypeStyle) => number

const FALLBACK_ASCENT = 0.8
const FALLBACK_DESCENT = 0.2
/** Patrick Hand averages about this; see textWidth in the sketch kit. */
const FALLBACK_WIDTH = 0.46

let probe: HTMLSpanElement | null = null
let ctx: CanvasRenderingContext2D | null = null

/**
 * The face `--sq-font` currently resolves to.
 *
 * It's a var pointing at another var, so the value has to be read off an
 * element that has already been styled with it. The probe is one hidden span,
 * created once and left in place — it keeps resolving as the document's look
 * changes, which is exactly what we want.
 */
function resolvedFamily(): string | null {
  if (typeof document === "undefined") return null
  if (!probe) {
    probe = document.createElement("span")
    probe.setAttribute("aria-hidden", "true")
    probe.style.cssText =
      "position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;font-family:var(--sq-font)"
    document.body.appendChild(probe)
  }
  return getComputedStyle(probe).fontFamily || null
}

function context(style: TypeStyle): CanvasRenderingContext2D | null {
  const family = resolvedFamily()
  if (!family) return null
  if (!ctx) ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  ctx.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${style.size}px ${family}`
  return ctx
}

/** Width of one line, in the same units as `style.size`. */
export function measureTextWidth(text: string, style: TypeStyle): number {
  if (!text) return 0
  const c = context(style)
  if (!c) return text.length * style.size * FALLBACK_WIDTH
  return c.measureText(text).width
}

/** Widest of a run's lines. */
export function measureLinesWidth(lines: string[], style: TypeStyle): number {
  return lines.reduce((max, line) => Math.max(max, measureTextWidth(line, style)), 0)
}

/**
 * Break one paragraph to a width, the way a browser does: greedily at spaces,
 * and through the middle of a word only when the word alone is too wide for
 * the line (`overflow-wrap: break-word`, which is what the inline editor sets,
 * behaves the same way — so the canvas and the textarea break in the same
 * places).
 */
function wrapParagraph(text: string, maxW: number, style: TypeStyle, measure: TextMeasurer): string[] {
  if (measure(text, style) <= maxW) return [text]
  const out: string[] = []
  let line = ""

  const breakLongWord = (word: string): string => {
    let rest = word
    while (rest.length > 1) {
      // Probe short prefixes instead of repeatedly shaping the entire suffix.
      // This bounds work for long unbroken agent text and narrow text boxes.
      let low = 1, high = 2
      while (high < rest.length && measure(rest.slice(0, high), style) <= maxW) {
        low = high
        high *= 2
      }
      high = Math.min(high, rest.length)
      if (high === rest.length && measure(rest, style) <= maxW) return rest
      while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2)
        if (measure(rest.slice(0, mid), style) <= maxW) low = mid
        else high = mid
      }
      out.push(rest.slice(0, low))
      rest = rest.slice(low)
    }
    return rest
  }

  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word
    if (measure(test, style) <= maxW) {
      line = test
      continue
    }
    if (line) out.push(line)
    line = measure(word, style) > maxW ? breakLongWord(word) : word
  }
  out.push(line)
  return out
}

/**
 * A text run's lines at a fixed box width. Hard returns always break; soft
 * breaks are recomputed from the width, which is the whole point of a
 * fixed-width text layer.
 */
export function wrapText(text: string, maxW: number, style: TypeStyle, measure: TextMeasurer = measureTextWidth): string[] {
  return (text || " ").split("\n").flatMap((p) => wrapParagraph(p, maxW, style, measure))
}

/**
 * The face's own ascent and descent at this size — the em box a browser
 * centres inside a line box before it puts the baseline down.
 */
export function fontMetrics(style: TypeStyle): { ascent: number; descent: number } {
  const c = context(style)
  const m = c?.measureText("Hxg")
  const ascent = m?.fontBoundingBoxAscent
  const descent = m?.fontBoundingBoxDescent
  if (typeof ascent !== "number" || typeof descent !== "number" || !(ascent + descent > 0)) {
    return { ascent: style.size * FALLBACK_ASCENT, descent: style.size * FALLBACK_DESCENT }
  }
  return { ascent, descent }
}
