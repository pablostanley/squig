import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Webxdc packaging (`make build-xdc`) needs a fully static site at out/.
// Normal `pnpm build` keeps the default Next server output for squig.sh.
const webxdc = process.env.WEBXDC === "1";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SQUIG_OFFLINE: webxdc ? "1" : "0" },
  ...(webxdc ? { pageExtensions: ["tsx"] } : {}),
  // Sharp loads libvips via dlopen, which Next's import tracer cannot see.
  // Include the installed platform's native libraries in both agent functions.
  outputFileTracingIncludes: {
    "/mcp": ["./node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/**/lib/*.so*"],
    "/api/v1/**": ["./node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/**/lib/*.so*"],
  },
  // Pin the workspace root to this repo.
  //
  // Turbopack works out the root by walking up the tree looking for lockfiles,
  // and there is a stray package.json + pnpm-lock.yaml sitting in the home
  // directory. Left to infer, it picked $HOME — which puts ~/node_modules on
  // the resolution path, so a dependency missing from this repo could quietly
  // resolve to a different version of itself two directories up. Saying where
  // the root is means that can't happen, whatever else is lying around.
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  ...(webxdc
    ? {
        output: "export" as const,
        // next/image optimizers need a server; webxdc ships plain files.
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
