import { wrapText, type TextMeasurer } from "@/lib/canvas/text-metrics"
import type { Props } from "@/lib/library/registry"
import type { ComponentNode } from "@/lib/types"
import { TEXT_LINE_HEIGHT } from "./text-layout"

const INSET = 12

export function stickyNoteTextBox(props: Props, width: number, height: number) {
  const fontSize = props.size === "sm" ? 12 : props.size === "lg" ? 20 : 14
  const x = Math.min(INSET, width / 4)
  const y = Math.min(INSET, height / 4)
  return {
    x, y, fontSize,
    width: width - 2 * x,
    height: height - 2 * y,
    baseline: y + fontSize,
    lineHeight: fontSize * TEXT_LINE_HEIGHT,
  }
}

export function stickyNoteLines(value: string, box: ReturnType<typeof stickyNoteTextBox>, measure?: TextMeasurer) {
  return wrapText(value.replace(/\r\n?/g, "\n"), box.width, { size: box.fontSize }, measure)
}

export function stickyNoteTextPatch(node: ComponentNode, label: string): Pick<ComponentNode, "props" | "h"> {
  const box = stickyNoteTextBox(node.props, node.w, node.h)
  const neededHeight = label.trim() ? Math.ceil(INSET * 2 + stickyNoteLines(label, box).length * box.lineHeight) : node.h
  // Keep space the author gave the note. A longer edit can grow downwards
  // rather than losing its last paragraph when the textarea closes.
  return {
    props: { ...node.props, label },
    h: Math.max(node.h, neededHeight),
  }
}
