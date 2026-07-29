// Resolution hooks so `node --experimental-strip-types` can load this app's
// modules directly: they use the "@/..." tsconfig alias and extensionless
// relative imports, neither of which Node resolves on its own.
import { existsSync } from "node:fs"
import { dirname, resolve as resolvePath } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..")
const EXTS = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]

function withExtension(absPath) {
  if (existsSync(absPath) && !absPath.endsWith("/")) return absPath
  for (const ext of EXTS) {
    if (existsSync(absPath + ext)) return absPath + ext
  }
  return absPath
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(pathToFileURL(withExtension(resolvePath(root, specifier.slice(2)))).href, context)
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const abs = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
    const found = withExtension(abs)
    if (found !== abs || existsSync(abs)) return next(pathToFileURL(found).href, context)
  }
  return next(specifier, context)
}
