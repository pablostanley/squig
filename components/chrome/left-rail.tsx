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
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { useSquig } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/ui/panel"
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
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex size-ctl-lg items-center justify-center rounded-chrome-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sq-ink)]/40",
          active
            ? "bg-[var(--sq-ink)] text-[var(--sq-paper)]"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Icon className="size-[18px]" weight={active ? "fill" : "regular"} />
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        <kbd className="rounded-chrome-xs bg-muted px-1 font-mono text-micro text-muted-foreground">{hotkey}</kbd>
      </TooltipContent>
    </Tooltip>
  )
}

export function LeftRail() {
  const tool = useSquig((s) => s.tool)
  const panel = useSquig((s) => s.panel)
  const shapeKind = useSquig((s) => s.shapeKind)
  const st = useSquig.getState

  return (
    // one shared delay for the whole rail: skimming across the tools after the
    // first tooltip shows the rest instantly, which is the point of grouping
    <TooltipProvider delay={400} closeDelay={80}>
      <Panel className="absolute top-1/2 left-3 z-30 -translate-y-1/2 gap-1 p-1.5">
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
          active={tool === "arrow"}
          label="Arrow"
          hotkey="L"
          icon={ArrowUpRightIcon}
          onClick={() => st().setTool("arrow")}
        />
      </Panel>
    </TooltipProvider>
  )
}
