export const KEY_STORAGE = "squig:agent-key"
export async function agentRequest(path: string, key: string, data?: unknown) {
  const response = await fetch(`/api/v1/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: "no-store",
  })
  const result = await response.json()
  if (!response.ok)
    throw Object.assign(new Error(result.error ?? "Request failed"), {
      status: response.status,
    })
  return result
}
