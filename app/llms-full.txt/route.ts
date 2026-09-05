import { pages, markdown } from "@/lib/agent/docs"
import { workflow } from "@/lib/agent/workflow"
export const dynamic = "force-static"
export function GET() {
  return new Response(
    `# Squig agent documentation\n\n${workflow}\n\n${pages.map(markdown).join("\n---\n\n")}`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  )
}
