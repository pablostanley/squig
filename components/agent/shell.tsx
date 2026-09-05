import Link from "next/link"
import "./agent.css"
export function AgentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="agent-page">
      <nav className="agent-nav" aria-label="Main">
        <Link className="agent-brand" href="/">
          squig
        </Link>
        <div className="agent-nav-links">
          <Link href="/docs">Docs</Link>
          <Link href="/connect">Workspace keys</Link>
          <Link href="/">Open canvas</Link>
        </div>
      </nav>
      {children}
    </main>
  )
}
