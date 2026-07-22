import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(appDir, "../..");

const nextConfig: NextConfig = {
  // Docker / production image (see docker/Dockerfile.web)
  output: "standalone",
  // Parent ~/package-lock.json otherwise becomes Turbopack root and breaks
  // resolution of hoisted `next` under the monorepo. Pin to this repo.
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  // Browser may open http://127.0.0.1:3001 while the server prints localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: [
    "@hca/domain",
    "@hca/db",
    "@hca/mcp-client",
    "@hca/hcp-engagement-agent",
  ],
  serverExternalPackages: ["mysql2", "openai", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
