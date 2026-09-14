import { checkReadiness } from "../../lib/agent/readiness.ts"
import { errorDiagnostics, storageFailure } from "../../lib/agent/storage.ts"

try {
  console.log(JSON.stringify(await checkReadiness()))
} catch (error) {
  const diagnostic = storageFailure(error)
  console.error(JSON.stringify({
    ready: false,
    ...errorDiagnostics(error),
    code: diagnostic?.code ?? "AGENT_PREFLIGHT_FAILED",
    error: diagnostic?.message ?? "Agent preflight failed. Check the database configuration and run pnpm db:migrate, then pnpm db:check. See /docs/self-hosting.",
  }))
  process.exitCode = 1
}
