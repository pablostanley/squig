import { pages } from "@/lib/agent/docs"
export const dynamic = "force-static"
export function GET() {
  return new Response(
    `# Squig\n\n> An editable wireframing canvas for humans and agents. MCP, REST, variations and review.\n\n## Documentation\n\n${pages.map((p) => `- [${p.title}](https://squig.sh/docs/${p.slug}): ${p.description}`).join("\n")}\n\n- [Complete docs](https://squig.sh/llms-full.txt)\n- [OpenAPI](https://squig.sh/openapi.json)\n- [Create a workspace key](https://squig.sh/connect)\n\nMCP endpoint: https://squig.sh/mcp (Streamable HTTP, bearer key). MCP tool names are prefixed squig_; the REST equivalent is POST https://squig.sh/api/v1/tools/{name} without the prefix, with the same JSON input. A pasted canvas invitation works over REST immediately: send its key as Authorization: Bearer.\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  )
}
