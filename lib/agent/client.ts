export { KEY_STORAGE } from "./credentials"
export async function agentRequest(path: string, key: string, data?: unknown) {
  const response = await fetch(`/api/v1/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: "no-store",
    // A credential-bearing request must never follow a redirect to another route.
    redirect: "error",
  })
  const result = await response.json()
  if (!response.ok) {
    const errorId = typeof result.errorId === "string" && /^[0-9a-f-]{36}$/.test(result.errorId) ? result.errorId : undefined
    const message = result.error ?? "Request failed"
    throw Object.assign(new Error(errorId ? `${message} Error ID: ${errorId}` : message), {
      status: response.status,
      code: result.code,
      errorId,
    })
  }
  return result
}
