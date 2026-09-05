import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AgentShell } from "@/components/agent/shell"
import { pages } from "@/lib/agent/docs"
import { tools } from "@/lib/agent/schema"
export const dynamicParams = false
export function generateStaticParams() {
  return pages.map((p) => ({ slug: p.slug }))
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const p = pages.find((p) => p.slug === slug)
  return {
    title: `${p?.title ?? "Documentation"} · Squig`,
    description: p?.description,
    alternates: { canonical: `/docs/${slug}` },
    openGraph: {
      title: p?.title,
      description: p?.description,
      url: `/docs/${slug}`,
    },
  }
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const p = pages.find((p) => p.slug === slug)
  if (!p) notFound()
  return (
    <AgentShell>
      <div className="agent-content docs-layout">
        <nav className="docs-sidebar" aria-label="Documentation">
          <Link href="/docs">Documentation</Link>
          {pages.map((p) => (
            <Link
              key={p.slug}
              href={`/docs/${p.slug}`}
              aria-current={p.slug === slug ? "page" : undefined}
            >
              {p.title}
            </Link>
          ))}
          <a href="/openapi.json">OpenAPI schema</a>
          <a href="/llms-full.txt">Plain text docs</a>
        </nav>
        <article className="docs-article">
          <h1>{p.title}</h1>
          <p className="agent-lead">{p.description}</p>
          {p.sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              {s.code && (
                <pre className="agent-code">
                  <code>{s.code}</code>
                </pre>
              )}
            </section>
          ))}
          {slug === "api" && (
            <section>
              <h2>Command reference</h2>
              {Object.entries(tools).map(([name, t]) => (
                <section key={name}>
                  <h3>
                    <code>{name}</code>
                  </h3>
                  <p>{t.description}</p>
                  <p className="agent-muted">
                    <code>POST /api/v1/tools/{name}</code>
                    <br />
                    <code>squig_{name}</code>
                  </p>
                </section>
              ))}
            </section>
          )}
          <p style={{ marginTop: 48 }}>
            <Link href="/connect">Connect your agent and start sketching</Link>
          </p>
        </article>
      </div>
    </AgentShell>
  )
}
