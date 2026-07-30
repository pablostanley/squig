// ---------------------------------------------------------------------------
// Who the keyboard belongs to right now.
//
// Shared by the canvas's own shortcuts and by the clipboard, which have to
// agree: a ⌘V while you're typing in the file name is that field's paste, not
// the canvas's, and a hotkey that fires in both places at once is worse than
// one that doesn't fire at all.
// ---------------------------------------------------------------------------

/**
 * Does the canvas get to act on this keystroke?
 *
 * Only two things take the keyboard away: somewhere you're typing, and an open
 * menu/listbox/dialog whose own typeahead would otherwise fire alongside the
 * tool hotkeys. Radix portals those outside the panel's DOM subtree, so this
 * looks for their roles document-wide rather than walking up from the target.
 *
 * Deliberately NOT here: chrome buttons, which keep DOM focus after a click —
 * gating on those meant one tap on the rail silently killed every shortcut.
 * Tooltips are excluded too: they're `role="tooltip"`, and hovering the button
 * that advertises a hotkey must not be what stops the hotkey working.
 */
// NOT `[role=combobox]`: that is Radix's Select *trigger*, which sits in the
// inspector permanently and keeps focus after use — matching it would kill the
// keyboard for good. The open listbox it portals in is what matters.
const KEYBOARD_OWNERS = "[role=dialog],[role=menu],[role=listbox]"

export function canvasOwnsKeyboard(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el && el !== document.body) {
    const tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false
    if (el.isContentEditable) return false
    if (el.closest?.(KEYBOARD_OWNERS)) return false
  }
  return !document.querySelector(KEYBOARD_OWNERS)
}
