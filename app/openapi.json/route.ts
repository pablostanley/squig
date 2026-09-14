import { z } from "zod"
import { localTools as tools } from "@/lib/agent/local-service"
export const dynamic = "force-static"
export function GET() {
  const jsonContent = (schema: object) => ({
    "application/json": { schema },
  })
  const requestBody = (schema: object) => ({
    required: true,
    content: jsonContent(schema),
  })
  const error = {
    description: "JSON error with an actionable message",
    content: jsonContent({
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
        details: { type: "array", items: { type: "object" } },
      },
    }),
  }
  const responses = {
    "200": {
      description:
        "Command result. Canvas mutations return id, revision and editorUrl; edit_document returns createdIds, changed nodes and deletedIds instead of the whole document, while reads and replace_document return the full document. The companion exposes only the explicitly selected local file.",
      content: jsonContent({ type: "object", additionalProperties: true }),
    },
    ...Object.fromEntries(
      [400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map((status) => [
        String(status),
        error,
      ]),
    ),
  }
  const idParameter = {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string" },
  }
  const paths: Record<string, unknown> = Object.fromEntries(
    Object.entries(tools).filter(([name]) => !["create_document", "delete_document", "rotate_canvas_link"].includes(name)).map(([name, t]) => [
      `/tools/${name}`,
      {
        post: {
          operationId: name,
          description: t.description,
          requestBody: requestBody(
            z.toJSONSchema(t.schema, { io: "input" }),
          ),
          responses,
        },
      },
    ]),
  )
  paths["/documents"] = { get: { operationId: "list_documents", responses } }
  paths["/documents/{id}"] = {
    get: {
      operationId: "read_document",
      parameters: [idParameter],
      responses,
    },
  }
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Squig Local Agent API",
      version: "2.0.0",
      description:
        "Tools for one local .squig.json file. Start the local companion and use its printed port and session token. Hosted writes at squig.sh are retired. MCP tools use squig_ plus the operationId. Revision numbers are opaque tokens; never increment or infer their ordering.",
    },
    servers: [{ url: "http://127.0.0.1:{port}/api/v1", variables: { port: { default: "49152", description: "Replace with the port printed by your local Squig companion." } } }],
    security: [{ sessionToken: [] }],
    components: {
      securitySchemes: {
        sessionToken: {
          type: "http",
          scheme: "bearer",
          description:
            "Temporary bearer token from your local session. Keep it on this computer.",
        },
      },
    },
    paths,
  })
}
