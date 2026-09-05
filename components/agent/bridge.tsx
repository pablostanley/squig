"use client"
import { useEffect, useState } from "react"
import { useSquig } from "@/lib/store"
import { agentRequest, KEY_STORAGE } from "@/lib/agent/client"
import { applyLook } from "@/lib/theme"
import "./agent.css"

export function AgentBridge() {
  const [status, setStatus] = useState(""),
    [connected, setConnected] = useState(false),
    [conflict, setConflict] = useState(false),
    [review, setReview] = useState("")
  const [reload, setReload] = useState(0)
  // Hydrate browser-only connection state after the server render.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("agent")
    if (!id) return
    const key = localStorage.getItem(KEY_STORAGE)
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only connection hydration
      setStatus(
        "Connect this browser with your workspace key to edit this canvas.",
      )
      return
    }
    let active = true,
      busy = false,
      stopped = false,
      initialized = false,
      baseline = "",
      localId = "",
      revision = 0
    const snapshot = () => {
      const s = useSquig.getState()
      return JSON.stringify({
        fileName: s.fileName,
        nodes: s.nodes,
        order: s.order,
        look: { theme: s.theme, font: s.font, paper: s.paper, grid: s.grid },
      })
    }
    function loadRemote(
      row: Awaited<ReturnType<typeof agentRequest>>,
      first: boolean,
    ) {
      if (first) {
        useSquig.getState().loadDoc(JSON.stringify(row.document))
        useSquig.setState({ docId: `agent_${id}` })
        localId = useSquig.getState().docId
      } else {
        useSquig.setState({
          nodes: row.document.nodes,
          order: row.document.order,
          fileName: row.document.fileName,
          ...row.document.look,
          past: [],
          future: [],
          selection: [],
          selectionGroupId: null,
        })
        applyLook(row.document.look)
      }
      revision = row.revision
      baseline = snapshot()
      setStatus(`Shared canvas · revision ${revision}`)
    }
    async function tick() {
      if (busy || stopped || !active) return
      busy = true
      try {
        if (!initialized) {
          setStatus("Loading shared canvas…")
          const row = await agentRequest(`documents/${id}`, key!)
          if (!active) return
          loadRemote(row, true)
          initialized = true
          setConnected(true)
          setConflict(false)
          return
        }
        const s = useSquig.getState()
        if (s.docId !== localId) {
          stopped = true
          setConnected(false)
          setStatus("Shared sync paused: you opened another file.")
          return
        }
        if (s.transforming || s.editingId) return
        const current = snapshot()
        if (current !== baseline) {
          setStatus("Saving shared canvas…")
          const row = await agentRequest("tools/replace_document", key!, {
            documentId: id,
            revision,
            document: JSON.parse(current),
          })
          if (!active) return
          revision = row.revision
          baseline = current
          setStatus(`Shared canvas · revision ${revision}`)
        } else {
          const row = await agentRequest(`documents/${id}`, key!)
          if (!active) return
          if (row.revision !== revision) {
            const latest = useSquig.getState()
            if (
              snapshot() !== baseline ||
              latest.transforming ||
              latest.editingId
            )
              return
            loadRemote(row, false)
          } else setStatus(`Shared canvas · revision ${revision}`)
        }
      } catch (e) {
        if (!active) return
        const error = e as Error & { status?: number }
        setStatus(error.message)
        if (error.status === 409) {
          stopped = true
          setConflict(true)
        }
      } finally {
        busy = false
      }
    }
    void tick()
    const timer = setInterval(tick, 2000)
    const prevent = (e: BeforeUnloadEvent) => {
      if (initialized && snapshot() !== baseline) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", prevent)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener("beforeunload", prevent)
    }
  }, [reload])
  async function share() {
    const key = localStorage.getItem(KEY_STORAGE)
    if (!key) {
      location.href = "/connect"
      return
    }
    try {
      const id = new URLSearchParams(location.search).get("agent")
      if (id && connected) {
        const result = await agentRequest("tools/rotate_review_link", key, {
          documentId: id,
        })
        sessionStorage.setItem(`squig:review:${id}`, result.reviewUrl)
        setReview(result.reviewUrl)
        return
      }
      setStatus("Sharing this canvas…")
      const doc = JSON.parse(useSquig.getState().serialize())
      const created = await agentRequest("documents", key, {
        name: doc.fileName,
      })
      await agentRequest("tools/replace_document", key, {
        documentId: created.id,
        revision: created.revision,
        document: doc,
      })
      sessionStorage.setItem(`squig:review:${created.id}`, created.reviewUrl)
      location.href = `/?agent=${created.id}`
    } catch (e) {
      setStatus((e as Error).message)
    }
  }
  function preserve() {
    const blob = new Blob([useSquig.getState().serialize()], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "squig-local-draft.json"
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="agent-sync" role="status">
      <span>{status || "Sketch together"}</span>
      {conflict ? (
        <>
          <button onClick={preserve}>Download my draft</button>
          <button
            onClick={() => {
              setReload((v) => v + 1)
            }}
          >
            Load latest canvas
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              const id = new URLSearchParams(location.search).get("agent")
              const cached = id
                ? sessionStorage.getItem(`squig:review:${id}`)
                : null
              if (cached) setReview(cached)
              else if (connected) setReview("new")
              else void share()
            }}
          >
            {connected ? "Review link…" : "Share with agent"}
          </button>
          <a href="/connect">{connected ? "Workspace" : "Connect"}</a>
        </>
      )}
      {review === "new" ? (
        <div style={{ marginTop: 8 }}>
          A new link revokes the previous review link.
          <button onClick={() => void share()}>Create new review link</button>
          <button onClick={() => setReview("")}>Cancel</button>
        </div>
      ) : (
        review && (
          <div style={{ marginTop: 8 }}>
            <a href={review} target="_blank" rel="noreferrer">
              Open private review
            </a>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(review)
                  setStatus("Review link copied")
                } catch {
                  setStatus("Open the review and copy its URL")
                }
              }}
            >
              Copy link
            </button>
          </div>
        )
      )}
    </div>
  )
}
