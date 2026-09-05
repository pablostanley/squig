import { z } from "zod"
import { tools } from "@/lib/agent/schema"
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
        "Command result. Canvas mutations return id, revision, document and editorUrl. Create and rotate_canvas_link also return canvasUrl and canvasKey for the normal editable canvas.",
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
  const nameBody = requestBody({
    type: "object",
    required: ["name"],
    properties: { name: { type: "string", minLength: 1, maxLength: 100 } },
  })
  const paths: Record<string, unknown> = Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [
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
  paths["/workspaces"] = {
    post: {
      operationId: "create_workspace",
      summary: "Create a workspace; returns its bearer key once",
      security: [],
      requestBody: nameBody,
      responses: {
        ...responses,
        "201": {
          description: "Workspace id and key",
          content: jsonContent({
            type: "object",
            required: ["id", "key"],
            properties: {
              id: { type: "string" },
              key: { type: "string" },
              message: { type: "string" },
            },
          }),
        },
      },
    },
  }
  paths["/workspace/rotate-key"] = {
    post: {
      operationId: "rotate_workspace_key",
      summary: "Revoke the current key and return its replacement",
      responses,
    },
  }
  paths["/catalog"] = {
    get: {
      operationId: "search_catalog",
      summary: "Search component metadata",
      parameters: [
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "kind", in: "query", schema: { type: "string" } },
      ],
      responses,
    },
  }
  paths["/documents"] = {
    get: { operationId: "list_documents", responses },
    post: {
      operationId: "create_canvas",
      requestBody: requestBody(
        z.toJSONSchema(tools.create_document.schema, { io: "input" }),
      ),
      responses: { ...responses, "201": responses["200"] },
    },
  }
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
      title: "Squig Agent API",
      version: "1.0.0",
      description:
        "Shared editable canvases for humans and any compatible agent. MCP tools use squig_ plus the command operationId.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ workspaceKey: [] }],
    components: {
      securitySchemes: {
        workspaceKey: {
          type: "http",
          scheme: "bearer",
          description:
            "Canvas key from Connect agent in the editor, or workspace key from /connect to create canvases. Keep it private.",
        },
      },
    },
    paths,
  })
}
