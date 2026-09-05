"use client"
import { useEffect, useState, useRef } from "react"
import { useSquig } from "@/lib/store"
import { agentRequest, KEY_STORAGE } from "@/lib/agent/client"
import { unionBox } from "@/lib/types"
import { nodeVisualBounds } from "@/lib/canvas/line-routing"
import { fitViewport } from "@/lib/canvas/navigate"
import { Popover } from "@base-ui/react/popover"
import {
  CopyIcon,
  CheckIcon,
  ShareNetworkIcon,
  PlugsConnectedIcon,
} from "@phosphor-icons/react"
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
  const [panel, setPanel] = useState<"share" | "agent" | null>(null)
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
          setPanel(null)
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

  const connecting = useRef(false)
  async function connect() {
    if (credentials.key || connecting.current) return
    connecting.current = true
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
    } finally {
      connecting.current = false
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
  return (
    <div className="agent-sync">
      <span className="agent-sync-status" role="status">
        {status}
      </span>
      {conflict && (
        <>
          <button onClick={preserve}>Download my draft</button>
          <button onClick={() => setReload((v) => v + 1)}>
            Load latest canvas
          </button>
        </>
      )}
      {(["agent", "share"] as const).map((kind) => (
        <Popover.Root
          key={kind}
          open={panel === kind}
          onOpenChange={(open) => {
            setPanel(open ? kind : null)
            if (open) void connect()
          }}
        >
          <Popover.Trigger
            className="canvas-action"
            aria-label={kind === "share" ? "Share" : "Connect agent"}
          >
            {kind === "share" ? (
              <ShareNetworkIcon size={16} />
            ) : (
              <PlugsConnectedIcon size={16} />
            )}
            {kind === "share" ? "Share" : "Connect agent"}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              side="bottom"
              align="end"
              sideOffset={8}
              className="z-50"
            >
              <Popover.Popup className="agent-connect-panel">
                <Popover.Title className="font-medium">
                  {kind === "share" ? "Share canvas" : "Connect an agent"}
                </Popover.Title>
                <Popover.Description>
                  {kind === "share"
                    ? "Anyone with this link can view and edit this canvas."
                    : "Let your agent draw alongside you using MCP or the API."}
                </Popover.Description>
                {credentials.key ? (
                  kind === "share" ? (
                    <CopyField
                      label="Editable canvas link"
                      value={credentials.url}
                    />
                  ) : (
                    <>
                      <CopyField
                        label="MCP connection"
                        value={`${location.origin}/mcp`}
                      />
                      <CopyField
                        label="Canvas key"
                        value={credentials.key}
                        secret
                      />
                      <CopyField
                        label="MCP config"
                        value={JSON.stringify(
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
                        )}
                        secret
                      />
                      <p>
                        This key gives your agent editing access to this
                        canvas only.
                      </p>
                      <a href="/docs/mcp" target="_blank" rel="noreferrer">
                        Setup instructions ↗
                      </a>
                    </>
                  )
                ) : (
                  <p role="status">{status || "Preparing canvas…"}</p>
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ))}
    </div>
  )
}

function CopyField({
  label,
  value,
  secret = false,
}: {
  label: string
  value: string
  secret?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setError(false)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      setError(true)
    }
  }
  return (
    <div className="agent-copy-field">
      <label>
        <span>{label}</span>
        <input
          readOnly
          type={secret ? "password" : "text"}
          value={value}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <button
        type="button"
        className="agent-copy-button"
        aria-label={`${copied ? "Copied" : "Copy"} ${label.toLowerCase()}`}
        onClick={() => void copy()}
      >
        {copied ? (
          <CheckIcon
            key="check"
            className="copy-check"
            size={16}
            weight="bold"
          />
        ) : (
          <CopyIcon size={16} />
        )}
      </button>
      <span className="sr-only" role="status">
        {copied
          ? `${label} copied`
          : error
            ? "Copy failed. Select and copy the field manually."
            : ""}
      </span>
    </div>
  )
}
