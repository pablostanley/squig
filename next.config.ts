import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
