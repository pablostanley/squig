"use client"
import { useEffect, useState, useRef } from "react"
import { useSquig } from "@/lib/store"
import { agentRequest, KEY_STORAGE } from "@/lib/agent/client"
import { unionBox } from "@/lib/types"
import { nodeVisualBounds } from "@/lib/canvas/line-routing"
import { fitViewport } from "@/lib/canvas/navigate"
import { applyLook } from "@/lib/theme"
import { mergeCanvas, canvasEqual } from "@/lib/agent/merge"
import "./agent.css"

const snapshot = () => {
  const s = useSquig.getState()
  return {
    fileName: s.fileName,
    nodes: s.nodes,
    order: s.order,
    look: { theme: s.theme, font: s.font, paper: s.paper, grid: s.grid },
  }
}
type Snapshot = ReturnType<typeof snapshot>
const editable = (doc: Snapshot): Snapshot => ({
  fileName: doc.fileName,
  nodes: doc.nodes,
  order: doc.order,
  look: doc.look,
})
const equal = canvasEqual
const canvasStorage = (id: string) => `squig:canvas-key:${id}`

export function AgentBridge() {
  const attaching = useRef<string | null>(null)
  const [status, setStatus] = useState("")
  const [connected, setConnected] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [panel, setPanel] = useState(false)
  const [credentials, setCredentials] = useState({
    key: "",
    url: "",
    id: "",
  })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("agent")
    if (!id) return
    const fragment = location.hash.slice(1)
    if (fragment.startsWith("sq_canvas_")) {
      localStorage.setItem(canvasStorage(id), fragment)
      history.replaceState(null, "", location.pathname + location.search)
    }
    const canvasKey = localStorage.getItem(canvasStorage(id))
    const key = canvasKey || localStorage.getItem(KEY_STORAGE)
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only connection hydration
      setStatus("Open the full canvas invitation link to connect.")
      return
    }
    if (canvasKey)
      setCredentials({
        key: canvasKey,
        url: `${location.origin}/?agent=${id}#${canvasKey}`,
        id,
      })
    let active = true,
      busy = false,
      initialized = false,
      stopped = false
    let baseline: Snapshot,
      localId = "",
      revision = 0
    function apply(doc: Snapshot) {
      const s = useSquig.getState()
      const rebaseHistory = (frames: typeof s.past) =>
        frames.flatMap((frame) => {
          const merged = mergeCanvas(
            { nodes: s.nodes, order: s.order },
            { nodes: frame.nodes, order: frame.order },
            { nodes: doc.nodes, order: doc.order },
          )
          if (merged.conflicts.length) return []
          return [
            {
              ...frame,
              ...merged.value,
              selection: frame.selection.filter(
                (id) => !!merged.value.nodes[id],
              ),
              displacedFuture: undefined,
            },
          ]
        })
      useSquig.setState({
        ...doc.look,
        nodes: doc.nodes,
        order: doc.order,
        fileName: doc.fileName,
        selection: s.selection.filter((nodeId) => !!doc.nodes[nodeId]),
        selectionGroupId: s.selectionGroupId,
        // Rebase independent undo steps; discard those that would undo a remote edit.
        past: rebaseHistory(s.past),
        future: rebaseHistory(s.future),
      })
      applyLook(doc.look)
    }
    async function tick() {
      if (busy || stopped || !active) return
      busy = true
      try {
        if (!initialized) {
          setStatus("Opening shared canvas…")
          const row = await agentRequest(`documents/${id}`, key!)
          if (!active) return
          const keepCurrent = attaching.current === id
          if (!keepCurrent)
            useSquig.getState().loadDoc(JSON.stringify(row.document))
          if (!keepCurrent && window.innerWidth > 800) {
            const nodes = Object.values(useSquig.getState().nodes)
            if (nodes.length) {
              const bounds = unionBox(nodes.map(nodeVisualBounds))
              if (bounds)
                useSquig
                  .getState()
                  .setViewport(
                    fitViewport(
                      bounds,
                      window.innerWidth - 300,
                      window.innerHeight - 80,
                      1,
                    ).viewport,
                  )
            }
          }
          attaching.current = null
          useSquig.setState({ docId: `agent_${id}` })
          localId = useSquig.getState().docId
          baseline = keepCurrent ? editable(row.document) : snapshot()
          revision = row.revision
          initialized = true
          setConnected(true)
          setConflict(false)
          setStatus("Live canvas")
          return
        }
        const s = useSquig.getState()
        if (s.docId !== localId) {
          stopped = true
          setConnected(false)
          setCredentials({ key: "", url: "", id: "" })
          setPanel(false)
          history.replaceState(null, "", "/")
          setStatus("Opened a local canvas")
          return
        }
        if (s.transforming || s.editingId) return
        const row = await agentRequest(`documents/${id}`, key!)
        if (!active) return
        const latest = useSquig.getState()
        if (
          latest.transforming ||
          latest.editingId ||
          latest.docId !== localId
        )
          return
        const current = snapshot(),
          remote = editable(row.document)
        const merged = mergeCanvas(baseline, current, remote)
        if (merged.conflicts.length) {
          stopped = true
          setConflict(true)
          setStatus(
            "You and another editor changed the same field. Your draft is preserved.",
          )
          return
        }
        const remoteChanged = row.revision !== revision
        revision = row.revision
        if (!equal(merged.value, remote)) {
          setStatus("Saving…")
          const saved = await agentRequest("tools/replace_document", key!, {
            documentId: id,
            revision,
            document: merged.value,
          })
          if (!active) return
          if (useSquig.getState().docId !== localId) return
          // Edits can continue while the request is in flight. Rebase those too.
          const duringSave = snapshot()
          const next = mergeCanvas(current, duringSave, merged.value)
          baseline = editable(saved.document)
          revision = saved.revision
          if (next.conflicts.length) {
            stopped = true
            setConflict(true)
            setStatus(
              "Concurrent edit needs review; your draft is preserved.",
            )
            return
          }
          if (
            !equal(duringSave, next.value) &&
            !useSquig.getState().transforming &&
            !useSquig.getState().editingId
          )
            apply(next.value)
          else if (!equal(duringSave, next.value)) baseline = current
          setStatus("Live canvas · saved")
        } else {
          if (!equal(current, remote)) apply(remote)
          baseline = remote
          setStatus(
            remoteChanged ? "Live canvas · new changes" : "Live canvas",
          )
        }
      } catch (e) {
        if (!active) return
        const error = e as Error & { status?: number }
        // A racing commit is retried against the fresh revision next tick.
        if (error.status !== 409) setStatus(error.message)
      } finally {
        busy = false
      }
    }
    void tick()
    const timer = setInterval(tick, 1000)
    const prevent = (e: BeforeUnloadEvent) => {
      if (initialized && !equal(snapshot(), baseline)) {
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

  async function connect() {
    setPanel(true)
    if (credentials.key) return
    try {
      let key = localStorage.getItem(KEY_STORAGE)
      if (!key) {
        const workspace = await agentRequest("workspaces", "", {
          name: "My Squig canvases",
        })
        key = workspace.key
        localStorage.setItem(KEY_STORAGE, key!)
      }
      const existing = connected
        ? new URLSearchParams(location.search).get("agent")
        : null
      if (existing) {
        const result = await agentRequest(
          "tools/rotate_canvas_link",
          key!,
          { documentId: existing },
        )
        localStorage.setItem(canvasStorage(existing), result.canvasKey)
        setCredentials({
          key: result.canvasKey,
          url: `${location.origin}/?agent=${existing}#${result.canvasKey}`,
          id: existing,
        })
        return
      }
      setStatus("Connecting this canvas…")
      const doc = JSON.parse(useSquig.getState().serialize())
      const created = await agentRequest("documents", key!, {
        name: doc.fileName,
      })
      await agentRequest("tools/replace_document", key!, {
        documentId: created.id,
        revision: created.revision,
        document: doc,
      })
      localStorage.setItem(canvasStorage(created.id), created.canvasKey)
      attaching.current = created.id
      history.pushState(null, "", `/?agent=${created.id}`)
      setCredentials({
        key: created.canvasKey,
        url: `${location.origin}/?agent=${created.id}#${created.canvasKey}`,
        id: created.id,
      })
      setReload((v) => v + 1)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }
  function preserve() {
    const url = URL.createObjectURL(
      new Blob([useSquig.getState().serialize()], {
        type: "application/json",
      }),
    )
    const a = document.createElement("a")
    a.href = url
    a.download = "squig-local-draft.json"
    a.click()
    URL.revokeObjectURL(url)
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setStatus("Copied")
    } catch {
      setStatus("Select and copy the text below")
    }
  }
  return (
    <div className="agent-sync">
      <span role="status">{status || ""}</span>
      {conflict ? (
        <>
          <button onClick={preserve}>Download my draft</button>
          <button onClick={() => setReload((v) => v + 1)}>
            Load latest canvas
          </button>
        </>
      ) : (
        <button onClick={() => (panel ? setPanel(false) : void connect())}>
          {connected ? "Connect agent / Share" : "Connect agent"}
        </button>
      )}
      {panel && (
        <div className="agent-connect-panel">
          <strong>Work together on this canvas</strong>
          <p>
            Connect any MCP client or use the API. Changes appear here as
            you and the agent draw.
          </p>
          {credentials.key && (
            <>
              <label>
                Editable canvas link
                <input
                  readOnly
                  value={credentials.url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button onClick={() => void copy(credentials.url)}>
                Copy canvas link
              </button>
              <label>
                MCP connection
                <input
                  readOnly
                  value={`${location.origin}/mcp`}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <label>
                Canvas key
                <input
                  readOnly
                  type="password"
                  value={credentials.key}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button onClick={() => void copy(credentials.key)}>
                Copy canvas key
              </button>
              <button
                onClick={() =>
                  void copy(
                    JSON.stringify(
                      {
                        mcpServers: {
                          squig: {
                            url: `${location.origin}/mcp`,
                            headers: {
                              Authorization: `Bearer ${credentials.key}`,
                            },
                          },
                        },
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Copy MCP config
              </button>
              <p>
                This key grants editing access to this canvas only. Share it
                with people and agents you trust.
              </p>
            </>
          )}
          <a href="/docs/mcp" target="_blank" rel="noreferrer">
            Setup instructions
          </a>
          <button onClick={() => setPanel(false)}>Close</button>
        </div>
      )}
    </div>
  )
}
