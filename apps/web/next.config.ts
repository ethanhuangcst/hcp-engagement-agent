import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker / production image (see docker/Dockerfile.web) needs standalone output
  output: "standalone",
  transpilePackages: [
    "@hca/domain",
    "@hca/db",
    "@hca/mcp-client",
    "@hca/medical-kb",
    "@hca/hcp-engagement-agent",
  ],
  serverExternalPackages: ["pg", "openai", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
