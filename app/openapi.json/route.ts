import { z } from "zod"
import { tools } from "@/lib/agent/schema"
export const dynamic = "force-static"
export function GET() {
  const jsonContent = (schema: object) => ({ "application/json": { schema } })
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
        "Command result. Canvas mutations return id, revision, document and editorUrl. Create and rotate_review_link also return a full private reviewUrl.",
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
          requestBody: requestBody(z.toJSONSchema(t.schema, { io: "input" })),
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
    get: { operationId: "read_document", parameters: [idParameter], responses },
  }
  paths["/review/{id}"] = {
    get: {
      operationId: "read_review",
      security: [{ reviewCapability: [] }],
      parameters: [idParameter],
      responses,
    },
    post: {
      operationId: "review_document",
      security: [{ reviewCapability: [] }],
      parameters: [idParameter],
      requestBody: requestBody({
        oneOf: [
          {
            type: "object",
            required: ["action", "text"],
            properties: {
              action: { const: "comment" },
              text: { type: "string", minLength: 1, maxLength: 4000 },
              nodeId: { type: "string" },
              variationId: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["action", "variationId", "revision"],
            properties: {
              action: { const: "approve" },
              variationId: { type: "string" },
              revision: { type: "integer", minimum: 1 },
            },
          },
        ],
      }),
      responses: { ...responses, "201": { description: "Comment created" } },
    },
  }
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Squig Agent API",
      version: "1.0.0",
      description:
        "Persistent wireframes, variations and human review. MCP tools use squig_ plus the command operationId.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ workspaceKey: [] }],
    components: {
      securitySchemes: {
        workspaceKey: {
          type: "http",
          scheme: "bearer",
          description: "Workspace key created at /connect. Keep it private.",
        },
        reviewCapability: {
          type: "http",
          scheme: "bearer",
          description:
            "Document-scoped token from the private review URL fragment. Grants read, comment and approve, never canvas editing.",
        },
      },
    },
    paths,
  })
}
