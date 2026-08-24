// ---------------------------------------------------------------------------
// The keyboard, written down once.
//
// Specs are platform-neutral ("mod+shift+g"); kbd() prints them the way the
// machine you're on expects. Everything that shows a shortcut — the palette,
// the menus, the cheat sheet — reads from here, so the label and the handler
// can't drift apart.
// ---------------------------------------------------------------------------

export function isMac(): boolean {
  if (typeof navigator === "undefined") return true
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: "⌘",
  alt: "⌥",
  shift: "⇧",
  ctrl: "⌃",
  del: "⌫",
  enter: "↵",
  esc: "esc",
  plus: "+",
}

const PC_SYMBOLS: Record<string, string> = {
  mod: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  ctrl: "Ctrl",
  del: "Del",
  enter: "Enter",
  esc: "Esc",
  plus: "+",
}

/** Modifiers print in the order the platform expects, whatever order you wrote. */
const MAC_ORDER = ["ctrl", "alt", "shift", "mod"]
const PC_ORDER = ["mod", "alt", "shift", "ctrl"]

/**
 * "mod+shift+g" → "⇧⌘G" on a Mac, "Ctrl+Shift+G" elsewhere.
 *
 * The pseudo-modifier "far" is the all-the-way version of a one-step
 * shortcut — Figma spells that ⌥⌘ on a Mac and Ctrl+Shift on Windows.
 */
export function kbd(spec: string): string {
  const mac = isMac()
  const symbols = mac ? MAC_SYMBOLS : PC_SYMBOLS
  const order = mac ? MAC_ORDER : PC_ORDER
  const parts = spec.split("+").flatMap((p) => (p === "far" ? (mac ? ["alt", "mod"] : ["mod", "shift"]) : [p]))
  const mods = parts.filter((p) => order.includes(p)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const rest = parts.filter((p) => !order.includes(p))
  const printed = [
    ...mods.map((m) => symbols[m]),
    ...rest.map((r) => symbols[r] ?? (r.length === 1 ? r.toUpperCase() : r)),
  ]
  // "⇧⌘G" packs tight, but "⌥drag" doesn't — words need air around them
  const wordy = rest.some((r) => !symbols[r] && r.length > 1)
  return mac ? printed.join(wordy ? " " : "") : printed.join("+")
}

export interface ShortcutRow {
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    rows: [
      { keys: ["v"], label: "Select" },
      { keys: ["r"], label: "Rectangle" },
      { keys: ["o"], label: "Ellipse" },
      { keys: ["p"], label: "Draw" },
      { keys: ["t"], label: "Text" },
      { keys: ["l", "a"], label: "Arrow" },
      { keys: ["c"], label: "Components panel" },
      { keys: ["b"], label: "Blocks panel" },
    ],
  },
  {
    title: "Edit",
    rows: [
      { keys: ["mod+z"], label: "Undo" },
      { keys: ["mod+shift+z"], label: "Redo" },
      { keys: ["mod+d", "alt+drag"], label: "Duplicate" },
      { keys: ["mod+d"], label: "Duplicate again, same gap" },
      { keys: ["mod+c"], label: "Copy" },
      { keys: ["mod+shift+c"], label: "Copy as PNG" },
      { keys: ["mod+x"], label: "Cut" },
      { keys: ["mod+v"], label: "Paste at cursor" },
      { keys: ["mod+shift+v"], label: "Paste in place" },
      { keys: ["mod+a"], label: "Select all" },
      { keys: ["shift+click"], label: "Add or drop a layer" },
      { keys: ["tab"], label: "Step to the next layer" },
      { keys: ["shift+tab"], label: "Step to the one before" },
      { keys: ["mod+shift+l"], label: "Lock a layer down" },
      { keys: ["right-click"], label: "Unlock a locked layer" },
      { keys: ["del"], label: "Delete" },
      { keys: ["esc"], label: "Deselect" },
    ],
  },
  {
    // Every one of these is a key you hold down with the pointer already
    // moving, so they gather better than they scatter: a user asking "what
    // does shift do while I drag?" has one place to look.
    title: "While you drag",
    rows: [
      { keys: ["shift+drag"], label: "Move in 45° directions" },
      { keys: ["alt+drag"], label: "Drag off a copy" },
      { keys: ["mod+drag"], label: "Ignore the snapping" },
      { keys: ["shift+drag"], label: "Resize in proportion" },
      { keys: ["alt+drag"], label: "Resize from the middle" },
      { keys: ["shift+drag"], label: "Draw a square or a circle" },
    ],
  },
  {
    title: "Group",
    rows: [
      { keys: ["mod+g"], label: "Group" },
      { keys: ["mod+shift+g"], label: "Ungroup / detach" },
      { keys: ["alt+mod+b"], label: "Detach instance" },
      { keys: ["mod+click"], label: "Select inside a group" },
      { keys: ["double-click"], label: "Step into a group" },
    ],
  },
  {
    title: "Arrange",
    rows: [
      { keys: ["mod+]"], label: "Bring forward" },
      { keys: ["mod+["], label: "Send backward" },
      { keys: ["far+]", "]"], label: "Bring to front" },
      { keys: ["far+[", "["], label: "Send to back" },
      { keys: ["shift+h"], label: "Flip horizontal" },
      { keys: ["shift+v"], label: "Flip vertical" },
      { keys: ["←↑→↓"], label: "Nudge" },
      { keys: ["shift+←↑→↓"], label: "Nudge further" },
      { keys: ["mod+←↑→↓"], label: "Resize by 1 px" },
      { keys: ["mod+shift+←↑→↓"], label: "Resize by the big nudge" },
    ],
  },
  {
    title: "Text",
    rows: [
      { keys: ["mod+b"], label: "Bold" },
      { keys: ["mod+i"], label: "Italic" },
      { keys: ["mod+u"], label: "Underline" },
      { keys: ["mod+k"], label: "Link selected text" },
      { keys: ["enter", "double-click"], label: "Edit text" },
      { keys: ["drag"], label: "Side handle sets the width" },
      { keys: ["drag"], label: "Corner scales the type" },
      { keys: ["double-click"], label: "Side handle, hug again" },
    ],
  },
  {
    title: "Pictures",
    rows: [
      { keys: ["double-click"], label: "Corner — true shape" },
      { keys: ["enter", "double-click"], label: "Crop a picture" },
      { keys: ["drag"], label: "Slide the picture" },
      { keys: ["shift+drag"], label: "Crop to the same shape" },
      { keys: ["alt+drag"], label: "Crop both sides at once" },
      { keys: ["enter", "esc"], label: "Done cropping" },
    ],
  },
  {
    title: "View",
    rows: [
      { keys: ["mod+plus"], label: "Zoom in" },
      { keys: ["mod+-"], label: "Zoom out" },
      { keys: ["mod+scroll"], label: "Zoom at the pointer" },
      { keys: ["shift+0"], label: "Zoom to 100%" },
      { keys: ["shift+1"], label: "Zoom to fit" },
      { keys: ["shift+2"], label: "Zoom to selection" },
      { keys: ["mod+0"], label: "Reset view" },
      { keys: ["space drag"], label: "Pan" },
      { keys: ["mod+\\"], label: "Hide the interface" },
    ],
  },
  {
    title: "Files",
    rows: [
      { keys: ["mod+s"], label: "Save to this browser" },
      { keys: ["mod+shift+s"], label: "Export a copy" },
    ],
  },
  {
    title: "Everything else",
    rows: [
      { keys: ["mod+k", "mod+/"], label: "Search everything" },
      { keys: ["shift+/"], label: "This list" },
      // The pair that makes the canvas reachable without a mouse. They read as
      // one thing on purpose: Tab is the way in, Escape is the way back out,
      // and a keyboard user who only learns the first half is stuck.
      { keys: ["tab"], label: "Put the keyboard on the canvas" },
      { keys: ["esc"], label: "Hand the keyboard back" },
    ],
  },
]
