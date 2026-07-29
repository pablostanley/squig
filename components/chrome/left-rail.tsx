"use client"

// ---------------------------------------------------------------------------
// Left rail — narrow strip of tool icons. Components/Blocks open the panel.
// ---------------------------------------------------------------------------

import {
  CursorIcon,
  BlueprintIcon,
  StackIcon,
  SquareIcon,
  CircleIcon,
  PencilSimpleIcon,
  TextTIcon,
  ArrowUpRightIcon,
  LineSegmentIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { useSquig } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function RailButton({
  active,
  label,
  hotkey,
  onClick,
  icon: Icon,
}: {
  active: boolean
  label: string
  hotkey: string
  onClick: () => void
  icon: PhosphorIcon
}) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            active && "bg-foreground text-background hover:bg-foreground hover:text-background"
          )}
        >
          <Icon className="size-[18px]" weight={active ? "fill" : "regular"} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        <kbd className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{hotkey}</kbd>
      </TooltipContent>
    </Tooltip>
  )
}

export function LeftRail() {
  const tool = useSquig((s) => s.tool)
  const panel = useSquig((s) => s.panel)
  const shapeKind = useSquig((s) => s.shapeKind)
  const arrowHead = useSquig((s) => s.arrowHead)
  const st = useSquig.getState

  return (
    <TooltipProvider>
      <div className="absolute top-1/2 left-3 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-xl border bg-background p-1.5 shadow-md">
        <RailButton
          active={tool === "select" && !panel}
          label="Select"
          hotkey="V"
          icon={CursorIcon}
          onClick={() => st().setTool("select")}
        />
        <RailButton
          active={panel === "components"}
          label="Components"
          hotkey="C"
          icon={BlueprintIcon}
          onClick={() => st().setPanel("components")}
        />
        <RailButton
          active={panel === "blocks"}
          label="Blocks & templates"
          hotkey="B"
          icon={StackIcon}
          onClick={() => st().setPanel("blocks")}
        />
        <div className="mx-1 my-0.5 h-px bg-border" />
        <RailButton
          active={tool === "shape" && shapeKind === "rect"}
          label="Rectangle"
          hotkey="R"
          icon={SquareIcon}
          onClick={() => {
            st().setShapeKind("rect")
            st().setTool("shape")
          }}
        />
        <RailButton
          active={tool === "shape" && shapeKind === "ellipse"}
          label="Ellipse"
          hotkey="O"
          icon={CircleIcon}
          onClick={() => {
            st().setShapeKind("ellipse")
            st().setTool("shape")
          }}
        />
        <RailButton
          active={tool === "draw"}
          label="Draw"
          hotkey="P"
          icon={PencilSimpleIcon}
          onClick={() => st().setTool("draw")}
        />
        <RailButton active={tool === "text"} label="Text" hotkey="T" icon={TextTIcon} onClick={() => st().setTool("text")} />
        <RailButton
          active={tool === "arrow" && !arrowHead}
          label="Line"
          hotkey="L"
          icon={LineSegmentIcon}
          onClick={() => {
            st().setArrowHead(false)
            st().setTool("arrow")
          }}
        />
        <RailButton
          active={tool === "arrow" && arrowHead}
          label="Arrow"
          hotkey="⇧L"
          icon={ArrowUpRightIcon}
          onClick={() => {
            st().setArrowHead(true)
            st().setTool("arrow")
          }}
        />
      </div>
    </TooltipProvider>
  )
}
