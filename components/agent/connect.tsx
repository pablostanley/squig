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
    <h1>Bring your agent. Keep your files.</h1>
    <p className="agent-lead">Squig works on your computer. No account, hosted workspace, or Squig API key.</p>
    <div className="agent-split">
      <section>
        <h2>Open a local file together</h2>
        <p>Use Connect agent in the editor to download your drawing and copy setup instructions for your agent. It starts a local companion and gives you a link to the live editor.</p>
        <p>You and your agent edit the same <code>.squig.json</code> file. Saving, history, rendering, and measurement run on your computer.</p>
        <div className="agent-row"><Link className="agent-button" href="/">Open Squig</Link><Link href="/docs/mcp">Local MCP setup</Link></div>
        <details><summary>Set it up yourself</summary>
          <p>In a checkout of the <a href="https://github.com/pablostanley/squig">Squig repository</a>, install and build once:</p>
          <pre className="agent-code">{"pnpm install\npnpm build:local\npnpm squig serve /absolute/path/canvas.squig.json"}</pre>
          <p>Keep the command running. Open the local editor URL it prints. Your agent can use its local MCP endpoint, or configure a stdio server using the setup guide.</p>
        </details>
        <h2>Agent in your browser</h2>
        <p>A browser agent can also edit the open tab with <code>window.squig</code> or WebMCP. These drawings stay in browser storage until you download a file.</p>
        <Link href="/docs/webmcp">Browser agent guide</Link>
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
