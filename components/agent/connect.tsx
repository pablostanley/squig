"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { AgentShell } from "./shell"
import { agentRequest, KEY_STORAGE } from "@/lib/agent/client"
import { workspaceKey } from "@/lib/agent/credentials"

export function Connect() {
  const [input, setInput] = useState("")
  const [key, setKey] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [docs, setDocs] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- recover a key already held by this browser
      setInput(workspaceKey(localStorage) || "")
    } catch { /* Recovery also works by entering the original key. */ }
  }, [])
  async function recover() {
    setBusy(true)
    setError("")
    try {
      const result = await agentRequest("documents", input.trim())
      setDocs(result.documents)
      setKey(input.trim())
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function download(id: string) {
    setError("")
    try {
      const row = await agentRequest(`documents/${id}`, key)
      const file = { app: "squig", version: 1, ...row.document, comments: row.comments || [] }
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `${file.fileName.replace(/[^a-z0-9 _-]/gi, "_") || "canvas"}.squig.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) { setError((error as Error).message) }
  }
  return <AgentShell><div className="agent-content">
    <h1>Bring your agent to the canvas.</h1>
    <p className="agent-lead">Squig works on your computer. No account, hosted workspace, or Squig API key.</p>
    <div className="agent-split">
      <section>
        <h2>Work in the canvas you already have</h2>
        <p>Open Connect agent in the editor and copy the invitation to your agent. It joins your existing browser tab. Changes appear live, support undo, and save automatically in this browser.</p>
        <p>Your agent needs access to that browser tab through its browser tools or WebMCP. An agent in a separate browser or on another computer cannot access this drawing from a website link alone.</p>
        <div className="agent-row"><Link className="agent-button" href="/">Open Squig</Link><Link href="/docs/webmcp">Browser agent guide</Link></div>
        <details><summary>Working with a file on disk?</summary>
          <p>The local companion opens a <code>.squig.json</code> file with the full editor and MCP tools. Changes save automatically to that file.</p>
          <p>In a checkout of the <a href="https://github.com/pablostanley/squig">Squig repository</a>, install and build once:</p>
          <pre className="agent-code">{"pnpm install\npnpm build:local\npnpm squig serve /absolute/path/canvas.squig.json"}</pre>
          <p>Keep the command running. Open the local editor URL it prints. Your agent can use its local MCP endpoint, or configure a stdio server using the setup guide.</p>
          <Link href="/docs/mcp">Local MCP setup</Link>
        </details>
      </section>
      <section>
        <h2>Recover an online canvas</h2>
        <p>Hosted editing has retired. Your existing canvases can still be downloaded with their original key. An old canvas invitation also opens a local copy in the editor.</p>
        <form onSubmit={(e) => { e.preventDefault(); void recover() }}>
          <label htmlFor="recovery-key">Original canvas or workspace key</label>
          <input id="recovery-key" type="password" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} required />
          <button className="agent-button secondary" disabled={busy}>{busy ? "Finding canvases…" : "Find my canvases"}</button>
        </form>
        {error && <p role="alert" className="agent-error">{error}</p>}
        {key && (docs.length ? <ul className="agent-list">{docs.map((doc) => <li key={doc.id} className="agent-row"><span>{doc.name}</span><button className="agent-button secondary" onClick={() => void download(doc.id)}>Download file</button></li>)}</ul> : <p>No canvases were found for this key.</p>)}
        {key && <button onClick={() => { localStorage.removeItem(KEY_STORAGE); setInput(""); setKey(""); setDocs([]) }}>Forget key in this browser</button>}
      </section>
    </div>
  </div></AgentShell>
}
