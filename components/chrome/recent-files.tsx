"use client"

// ---------------------------------------------------------------------------
// The recent files submenu. Everything squig has saved in this browser, newest
// first — click one to open it, or arm the trash twice to let it go. Deleting
// takes two clicks on purpose: this list is the only copy.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react"
import { useSquig } from "@/lib/store"
import { relativeTime, type FileMeta } from "@/lib/files"
import { CheckIcon, TrashIcon } from "@phosphor-icons/react"
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

/** past this the menu would be a scroll, and old files are the drawer's job */
const SHOWN = 12
/** how long the trash stays armed before it forgets you meant it */
const ARM_MS = 3000

export function RecentFiles() {
  const files = useSquig((s) => s.files)
  const docId = useSquig((s) => s.docId)
  const full = useSquig((s) => s.drawerFull)

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Open recent</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        {files.length === 0 ? (
          <p className="px-2.5 py-1.5 text-row text-muted-foreground">nothing saved yet</p>
        ) : (
          files.slice(0, SHOWN).map((f) => <FileRow key={f.id} file={f} current={f.id === docId} />)
        )}
        {/* The whole explanation lands here rather than under the file name,
            because this is the list you're looking at when you go to make
            room — and the trash to do it with is on the row above. */}
        {full && (
          <p className="mt-1 border-t px-2.5 pt-2 pb-1 text-label leading-relaxed text-muted-foreground">
            this browser is out of room, so nothing new is being saved. pictures fill it fastest, and a cropped one
            still carries the parts it hides. export what you want to keep, then let a drawing go here.
          </p>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function FileRow({ file, current }: { file: FileMeta; current: boolean }) {
  const st = useSquig.getState
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const arm = () => {
    setArmed(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmed(false), ARM_MS)
  }

  // The trash lives beside the item rather than inside it: a button nested in
  // a menu item still selects the item, whatever it does with the event.
  return (
    <div className="group/row relative flex items-center">
      <DropdownMenuItem className="flex-1 gap-2 pr-8" onClick={() => st().openFile(file.id)}>
        {current && <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" weight="bold" />}
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        <span className={`shrink-0 text-label ${armed ? "text-destructive" : "text-muted-foreground"}`}>
          {armed ? "click again" : relativeTime(file.updatedAt)}
        </span>
      </DropdownMenuItem>
      {/* the file you're in stays put — open another one first */}
      {!current && (
        <button
          type="button"
          aria-label={armed ? `delete ${file.name} for good` : `delete ${file.name}`}
          title={armed ? "click again to delete" : "delete"}
          onClick={() => (armed ? st().deleteFile(file.id) : arm())}
          className={`absolute right-1.5 flex size-6 items-center justify-center rounded-chrome-sm transition-opacity ${
            armed
              ? "text-destructive opacity-100"
              : "text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          }`}
        >
          <TrashIcon className="size-3.5" weight={armed ? "fill" : "regular"} />
        </button>
      )}
    </div>
  )
}
