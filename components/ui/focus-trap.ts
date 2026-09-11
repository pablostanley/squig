import type { KeyboardEvent } from "react"

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/** Keep Tab inside a modal surface without changing its ordinary focus order. */
export function trapFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return

  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden"
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  const active = document.activeElement
  if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
