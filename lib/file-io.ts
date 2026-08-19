// ---------------------------------------------------------------------------
// Import / export a .squig.json, plus the blob-and-anchor dance that every
// kind of export goes through. Both entry points (file menu and ⌘K) share
// these, so there's no hidden <input> to keep a ref to.
// ---------------------------------------------------------------------------

import { useSquig } from "./store"

/**
 * Hand a blob to the browser as a download named after the document.
 *
 * `suffix` is everything after the name — ".png", ".squig.json" — because the
 * name itself is never the caller's to pick: a file called download.png tells
 * you nothing a week later, and the doc already knows what it is called. The
 * object URL is revoked right after the click, which is safe because the click
 * hands the URL over synchronously.
 */
export function downloadBlob(blob: Blob, suffix: string) {
  const name = useSquig.getState().fileName.replace(/[^\w -]+/g, "").trim() || "squig"
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}${suffix}`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportDoc() {
  downloadBlob(new Blob([useSquig.getState().serialize()], { type: "application/json" }), ".squig.json")
}

export function importDoc() {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".json,.squig,application/json"
  input.addEventListener("change", async () => {
    const file = input.files?.[0]
    if (!file) return
    const ok = useSquig.getState().loadDoc(await file.text())
    if (!ok) window.alert("that file didn't look like a squig doc")
  })
  input.click()
}
