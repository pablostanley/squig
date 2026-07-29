"use client"

// ---------------------------------------------------------------------------
// /kitchen-sink — every def rendered at its default size, and again squeezed,
// so a bad layout shows up without dragging 100 things onto a canvas.
// Dev aid, not part of the product surface.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react"
import { ALL_DEFS, GROUPS, type ComponentDef, type Category } from "@/lib/library/registry"
import { SketchPrims } from "@/components/canvas/sketch"

function Cell({ def, scale }: { def: ComponentDef; scale: number }) {
  const w = Math.round(def.size.w * scale)
  const h = Math.round(def.size.h * scale)
  const prims = useMemo(() => {
    try {
      return def.render(def.defaults, w, h)
    } catch (err) {
      return { error: String(err) }
    }
  }, [def, w, h])

  const failed = !Array.isArray(prims)

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`relative overflow-hidden rounded-lg border ${failed ? "border-red-400" : ""}`}
        style={{ padding: 16, backgroundColor: "var(--sq-bg)" }}
      >
        <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
          {!failed && <SketchPrims prims={prims} seed={11} />}
        </svg>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium">{def.name}</span>
        <span className="font-mono text-[10px] text-neutral-400">{def.kind}</span>
        <span className="ml-auto font-mono text-[10px] text-neutral-400">
          {w}×{h}
        </span>
      </div>
      {failed && <p className="font-mono text-[10px] text-red-600">{(prims as { error: string }).error}</p>}
    </div>
  )
}

export default function KitchenSink() {
  const [scale, setScale] = useState(1)
  const [category, setCategory] = useState<Category>("components")

  const sections = useMemo(() => {
    const defs = ALL_DEFS.filter((d) => d.category === category)
    return [...GROUPS[category], "Other"]
      .map((group) => ({
        group,
        defs: defs.filter((d) => (d.group && GROUPS[category].includes(d.group) ? d.group : "Other") === group),
      }))
      .filter((s) => s.defs.length)
  }, [category])

  const total = ALL_DEFS.length

  return (
    <div className="min-h-screen bg-white p-8 font-sans">
      <div className="sticky top-0 z-10 -mx-8 mb-6 flex items-center gap-4 border-b bg-white/90 px-8 py-3 backdrop-blur">
        <h1 className="text-lg font-bold tracking-tight">squig kitchen sink</h1>
        <span className="text-sm text-neutral-500">{total} defs</span>
        <div className="ml-4 flex gap-1">
          {(["components", "blocks"] as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1 text-sm capitalize ${
                category === c ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-500">
          scale {Math.round(scale * 100)}%
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
        </label>
      </div>

      {sections.map((section) => (
        <section key={section.group} className="mb-10">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            {section.group} · {section.defs.length}
          </h2>
          <div className="flex flex-wrap items-start gap-6">
            {section.defs.map((def) => (
              <Cell key={def.kind} def={def} scale={scale} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
