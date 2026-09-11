"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { AgentShell } from "./shell"
import { agentRequest, KEY_STORAGE } from "@/lib/agent/client"
import { keyKind, workspaceKey } from "@/lib/agent/credentials"
export function Connect() {
  const [key, setKey] = useState(""),
    [input, setInput] = useState(""),
    [name, setName] = useState("My sketches"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reveal, setReveal] = useState(false),
    [copied, setCopied] = useState(false)
  const [endpoint, setEndpoint] = useState("https://squig.sh/mcp")
  const [docs, setDocs] = useState<
    { id: string; name: string; revision: number }[]
  >([])
  // The workspace key exists only in this browser, never in server-rendered HTML.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the private browser credential after SSR
    setKey(workspaceKey(localStorage) ?? "")
    setEndpoint(`${location.origin}/mcp`)
  }, [])
  useEffect(() => {
    if (key)
      agentRequest("documents", key)
        .then((r) => setDocs(r.documents))
        .catch((e) => setError(e.message))
  }, [key])
  async function connect(existing?: string) {
    setBusy(true)
    setError("")
    try {
      let next = existing
      if (next) {
        if (keyKind(next) !== "workspace")
          throw new Error(
            "Use a workspace key here. Open canvas invitations in the editor.",
          )
        await agentRequest("documents", next)
      } else {
        const r = await fetch("/api/v1/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        next = data.key
      }
      localStorage.setItem(KEY_STORAGE, next!)
      setKey(next!)
      setInput("")
      setReveal(!existing)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function rotate() {
    setBusy(true)
    try {
      const result = await agentRequest("workspace/rotate-key", key, {})
      localStorage.setItem(KEY_STORAGE, result.key)
      setKey(result.key)
      setReveal(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AgentShell>
      <div className="agent-content">
        <h1>Connect your agent</h1>
        {error && (
          <p role="alert" className="agent-error">
            {error}
          </p>
        )}
        <div className="agent-split">
          <section>
            {!key ? (
              <>
                <h2>Create a workspace</h2>
                <p>
                  Agent canvases are saved online. Local drawings stay in this browser.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void connect()
                  }}
                >
                  <label htmlFor="workspace-name">Workspace name</label>
                  <input
                    id="workspace-name"
                    value={name}
                    maxLength={100}
                    required
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button className="agent-button" disabled={busy}>
                    {busy ? "Connecting…" : "Create workspace key"}
                  </button>
                </form>
                <h3>Already have a key?</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void connect(input)
                  }}
                >
                  <label htmlFor="existing-key">Workspace key</label>
                  <input
                    id="existing-key"
                    type="password"
                    autoComplete="off"
                    value={input}
                    required
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <button className="agent-button secondary" disabled={busy}>
                    Connect
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2>Connected</h2>
                <p>
                  This key can read and edit every canvas in the workspace.
                  Save it privately; there is no account recovery.
                </p>
                <div className="agent-panel">
                  <label htmlFor="workspace-key">Workspace key</label>
                  <input
                    id="workspace-key"
                    type={reveal ? "text" : "password"}
                    value={key}
                    readOnly
                    autoComplete="off"
                  />
                  <div className="agent-row">
                    <button
                      className="agent-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(key)
                          setCopied(true)
                        } catch {
                          setReveal(true)
                        }
                      }}
                    >
                      {copied ? "Copied" : "Copy key"}
                    </button>
                    <button
                      className="agent-button secondary"
                      onClick={() => setReveal(!reveal)}
                    >
                      {reveal ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <h3>Canvases</h3>
                {docs.length ? (
                  <ul className="agent-list">
                    {docs.map((d) => (
                      <li key={d.id}>
                        <Link href={`/?agent=${d.id}`}>
                          <span>{d.name}</span>
                          <span className="agent-muted">
                            Revision {d.revision}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="agent-muted">
                    No canvases yet. Ask your agent to create one, or share a local drawing.
                  </p>
                )}
                <details>
                  <summary>Manage connection</summary>
                  <p className="agent-muted">
                    Rotating the key disconnects agents using the old one.
                    Editable canvas links keep working.
                  </p>
                  <button
                    className="agent-button secondary"
                    disabled={busy}
                    onClick={rotate}
                  >
                    Rotate workspace key
                  </button>
                  <p>
                    <button
                      onClick={() => {
                        localStorage.removeItem(KEY_STORAGE)
                        setKey("")
                        setDocs([])
                      }}
                    >
                      Disconnect this browser
                    </button>
                  </p>
                </details>
              </>
            )}
          </section>
          <section>
            <h2>MCP setup</h2>
            <p>
              Set <code>SQUIG_API_KEY</code> in your agent’s environment, then run:
            </p>
            <pre className="agent-code">{`codex mcp add squig \\\n  --url ${endpoint} \\\n  --bearer-token-env-var SQUIG_API_KEY`}</pre>
            <details>
              <summary>Manual Codex config</summary>
              <pre className="agent-code">{`[mcp_servers.squig]\nurl = "${endpoint}"\nbearer_token_env_var = "SQUIG_API_KEY"`}</pre>
            </details>
            <p>
              <Link href="/docs/mcp">
                MCP setup for Codex, Claude and Cursor
              </Link>
            </p>
            <details>
              <summary>Example prompt</summary>
              <div className="agent-panel">
                <p
                  style={{
                    fontFamily: "var(--font-sketch)",
                    fontSize: 25,
                    margin: 0,
                  }}
                >
                  “I’m making a little site for my book club. Sketch three ways it
                  could work in Squig before we build it.”
                </p>
              </div>
            </details>
            <p>
              <Link href="/docs/plugin">Install the wireframing plugin</Link>
            </p>
          </section>
        </div>
      </div>
    </AgentShell>
  )
}
