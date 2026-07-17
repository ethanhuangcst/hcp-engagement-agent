import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@hca/domain",
    "@hca/db",
    "@hca/mcp-client",
    "@hca/hcp-engagement-agent",
  ],
  serverExternalPackages: ["pg", "openai", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
