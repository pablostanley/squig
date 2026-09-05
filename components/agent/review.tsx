"use client"
import { useEffect, useState } from "react"
import { AgentShell } from "./shell"
import { NodeSketch } from "@/components/canvas/sketch"
import { nodeVisualBounds } from "@/lib/canvas/line-routing"
import { unionBox } from "@/lib/types"
import { applyLook } from "@/lib/theme"
import { agentRequest } from "@/lib/agent/client"
import type { CanvasDocument } from "@/lib/agent/engine"
type ReviewData = {
  id: string
  revision: number
  document: CanvasDocument
  approval: { variationId: string; revision: number } | null
  comments: {
    id: string
    text: string
    author: string
    variationId?: string
    resolved: boolean
    createdAt: string
  }[]
}
export function Review() {
  const [data, setData] = useState<ReviewData | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("")
  const [credentials, setCredentials] = useState<{
    id: string
    token: string
  } | null>(null)
  // Review capabilities live in URL fragments, which are unavailable during SSR.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id"),
      token = location.hash.slice(1)
    if (!id || !token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL fragments do not exist during SSR
      setError(
        "This review link is incomplete. Ask for the full link, including the part after #.",
      )
      return
    }
    setCredentials({ id, token })
  }, [])
  useEffect(() => {
    if (!credentials) return
    let active = true
    let pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const row = await agentRequest(
          `review/${credentials!.id}`,
          credentials!.token,
        )
        if (active) {
          setData(row)
          applyLook(row.document.look)
          setError("")
        }
      } catch (e) {
        if (active) setError((e as Error).message)
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(refresh, 4000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [credentials])
  async function act(action: unknown) {
    if (!credentials) return
    setBusy(true)
    setError("")
    try {
      await agentRequest(`review/${credentials.id}`, credentials.token, action)
      setData(await agentRequest(`review/${credentials.id}`, credentials.token))
      setText("")
      setStatus("Saved. Your agent can read this feedback.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const variation = data?.document.variations.find((v) => v.id === selected)
  const ids = variation ? new Set(variation.nodeIds) : null
  const nodes =
    data?.document.order
      .filter((id) => !ids || ids.has(id))
      .map((id) => data.document.nodes[id]) ?? []
  const box = unionBox(nodes.map(nodeVisualBounds))
  const visibleComments =
    data?.comments.filter(
      (c) => !variation || !c.variationId || c.variationId === variation.id,
    ) ?? []
  return (
    <AgentShell>
      <div className="agent-content" style={{ maxWidth: 1600 }}>
        {error && (
          <p className="agent-error" role="alert">
            {error}
          </p>
        )}
        {!data ? (
          <>
            <h1>Let’s look at the idea.</h1>
            {!error && <p role="status">Loading the sketches…</p>}
          </>
        ) : (
          <>
            <div
              className="agent-row"
              style={{ justifyContent: "space-between" }}
            >
              <div>
                <h1 style={{ fontSize: 48, marginBottom: 12 }}>
                  {data.document.fileName}
                </h1>
                <p className="agent-muted">
                  Revision {data.revision}. Updates from your agent appear here
                  automatically.
                </p>
              </div>
              {data.approval && (
                <p className="agent-panel" style={{ padding: 16 }}>
                  Chosen:{" "}
                  {
                    data.document.variations.find(
                      (v) => v.id === data.approval?.variationId,
                    )?.title
                  }{" "}
                  · revision {data.approval.revision}
                </p>
              )}
            </div>
            <div className="review-tabs" aria-label="Choose a variation">
              <button aria-pressed={!selected} onClick={() => setSelected("")}>
                All sketches
              </button>
              {data.document.variations.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={selected === v.id}
                  onClick={() => {
                    setSelected(v.id)
                    setStatus("")
                  }}
                >
                  {v.title}
                </button>
              ))}
            </div>
            <div className="review-layout">
              <section>
                <div className="review-sheet">
                  {box ? (
                    <svg
                      role="img"
                      aria-label={variation?.title ?? data.document.fileName}
                      viewBox={`${box.minX - 32} ${box.minY - 32} ${Math.max(1, box.maxX - box.minX) + 64} ${Math.max(1, box.maxY - box.minY) + 64}`}
                    >
                      <title>
                        {variation?.title ?? data.document.fileName}
                      </title>
                      {nodes.map((n) => (
                        <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
                          <NodeSketch node={n} />
                        </g>
                      ))}
                    </svg>
                  ) : (
                    <p>
                      The canvas is ready. Sketches will appear as your agent
                      adds them.
                    </p>
                  )}
                </div>
                {variation && (
                  <>
                    <h2>{variation.title}</h2>
                    <p>{variation.description}</p>
                  </>
                )}
                <p className="agent-muted">
                  This is a wireframe: focus on the content, order, and how the
                  page works. The visual styling comes later.
                </p>
                <details>
                  <summary>Read canvas content</summary>
                  {nodes.map((n) => (
                    <p key={n.id}>
                      {n.type === "text"
                        ? n.text
                        : n.type === "component"
                          ? `${n.kind}: ${Object.values(n.props)
                              .filter((v) => typeof v === "string")
                              .join(" · ")}`
                          : n.type}
                    </p>
                  ))}
                </details>
              </section>
              <aside>
                <h2 style={{ marginTop: 0 }}>Talk it through</h2>
                <p className="agent-muted">
                  What works? What should change? Notes stay with this canvas.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void act({
                      action: "comment",
                      text,
                      variationId: variation?.id,
                    })
                  }}
                >
                  <label htmlFor="review-note">
                    {variation
                      ? `Note on ${variation.title}`
                      : "Note on the whole canvas"}
                  </label>
                  <textarea
                    id="review-note"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={4000}
                    required
                    placeholder="The opening works. Could we bring the next meeting above the book list?"
                  />
                  <button
                    className="agent-button"
                    disabled={busy || !text.trim()}
                  >
                    Add note
                  </button>
                </form>
                <p role="status" className="agent-muted">
                  {status}
                </p>
                <div className="review-comments">
                  {visibleComments.length ? (
                    visibleComments.map((c) => (
                      <div className="review-comment" key={c.id}>
                        <span className="agent-muted">
                          {c.author === "agent" ? "Agent" : "Reviewer"}
                          {c.resolved ? " · resolved" : ""}
                        </span>
                        <p style={{ whiteSpace: "pre-wrap" }}>{c.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="agent-muted">
                      No notes yet. A specific observation goes a long way.
                    </p>
                  )}
                </div>
                <h3>Ready to pick a direction?</h3>
                <p className="agent-muted">
                  Choose a variation above, then mark it ready to build. Any new
                  canvas edit clears the choice so you can review it again.
                </p>
                <button
                  className="agent-button secondary"
                  disabled={
                    busy ||
                    !variation ||
                    data.approval?.variationId === variation.id
                  }
                  onClick={() =>
                    void act({
                      action: "approve",
                      variationId: variation!.id,
                      revision: data.revision,
                    })
                  }
                >
                  {variation
                    ? `Choose ${variation.title}`
                    : "Select a variation first"}
                </button>
              </aside>
            </div>
          </>
        )}
      </div>
    </AgentShell>
  )
}
