import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticate } from "@/lib/agent/db"
import { tools, type ToolName } from "@/lib/agent/schema"
import { execute } from "@/lib/agent/service"
import { checkOrigin, failure, body } from "@/lib/agent/http"
import { workflow } from "@/lib/agent/workflow"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  try {
    checkOrigin(request)
    const workspace = await authenticate(request)
    const parsedBody = await body(request)
    const server = new McpServer(
      { name: "squig", version: "1.0.0" },
      { instructions: workflow },
    )
    for (const name of Object.keys(tools) as ToolName[]) {
      const tool = tools[name]
      server.registerTool(
        `squig_${name}`,
        {
          description: tool.description,
          inputSchema: tool.schema,
          annotations: {
            readOnlyHint: [
              "catalog",
              "documents",
              "get_document",
              "history",
              "export_document",
              "render_document",
            ].includes(name),
            destructiveHint: [
              "edit_document",
              "replace_document",
              "restore",
              "rotate_review_link",
              "delete_document",
            ].includes(name),
            idempotentHint: [
              "catalog",
              "documents",
              "get_document",
              "history",
              "export_document",
              "render_document",
            ].includes(name),
            openWorldHint: false,
          },
        },
        async (args: unknown) => {
          try {
            const result = await execute(name, args, workspace)
            if (
              result &&
              "base64" in result &&
              typeof result.base64 === "string"
            )
              return {
                content: [
                  {
                    type: "image" as const,
                    data: result.base64,
                    mimeType: "image/png",
                  },
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      revision: result.revision,
                      bounds: result.bounds,
                    }),
                  },
                ],
              }
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(result) },
              ],
            }
          } catch (error) {
            const response = failure(error)
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    status: response.status,
                    ...(await response.json()),
                  }),
                },
              ],
            }
          }
        },
      )
    }
    server.registerResource(
      "wireframing-guide",
      "squig://guides/wireframing",
      {
        description: "How to create, compare, revise and hand off wireframes",
        mimeType: "text/plain",
      },
      async () => ({
        contents: [
          {
            uri: "squig://guides/wireframing",
            text: workflow,
            mimeType: "text/plain",
          },
        ],
      }),
    )
    server.registerPrompt(
      "wireframe-first",
      { description: "Explore three wireframe directions before implementing" },
      async () => ({
        messages: [{ role: "user", content: { type: "text", text: workflow } }],
      }),
    )
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      return await transport.handleRequest(request, { parsedBody })
    } finally {
      await server.close()
    }
  } catch (error) {
    return failure(error)
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
export const DELETE = GET
