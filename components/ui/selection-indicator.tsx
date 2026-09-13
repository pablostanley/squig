import type { ComponentProps } from "react"
import { CheckIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

/** Selection never moves a label: list rows reserve pr-8 for this trailing slot. */
export function SelectionIndicator({
  selected = true,
  className,
  ...props
}: ComponentProps<"span"> & { selected?: boolean }) {
  return (
    <span
      {...props}
      data-slot="selection-indicator"
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground",
        !selected && "invisible",
        className
      )}
    >
      <CheckIcon className="size-3.5" weight="bold" />
    </span>
  )
}
