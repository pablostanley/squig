import type { Metadata } from "next"
import Link from "next/link"
import { AgentShell } from "@/components/agent/shell"
import { pages } from "@/lib/agent/docs"
export const metadata: Metadata = {
  title: "Squig developer docs · MCP, API and agent wireframing",
  description:
    "Connect an AI agent to Squig. Install the MCP server, edit wireframes through the API, compare variations and turn approved layouts into production code.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Squig for humans and agents",
    description: "A shared canvas, from first sketch to a chosen direction.",
    url: "/docs",
  },
}
export default function Page() {
  return (
    <AgentShell>
      <div className="agent-content">
        <h1>
          Good ideas start
          <br />
          as rough sketches.
        </h1>
        <p className="agent-lead">
          A shared canvas for you and your agent. Everything you need to
          connect, sketch, revise, and decide what to build.
        </p>
        <div className="agent-row" style={{ marginTop: 28 }}>
          <Link className="agent-button" href="/docs/getting-started">
            Make your first wireframe
          </Link>
          <Link className="agent-button secondary" href="/">
            Connect an agent
          </Link>
        </div>
        <ul className="agent-list" style={{ marginTop: 48 }}>
          {pages.map((p) => (
            <li key={p.slug}>
              <Link href={`/docs/${p.slug}`}>
                <div>
                  <h2 style={{ margin: "0 0 8px" }}>{p.title}</h2>
                  <p className="agent-muted">{p.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="agent-muted">
          For agents: <a href="/llms.txt">llms.txt</a>,{" "}
          <a href="/llms-full.txt">complete Markdown docs</a>, and{" "}
          <a href="/openapi.json">OpenAPI schema</a>.
        </p>
      </div>
    </AgentShell>
  )
}
