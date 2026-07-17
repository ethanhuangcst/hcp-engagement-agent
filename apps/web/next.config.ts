import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hca/domain", "@hca/db", "@hca/mcp-client"],
  serverExternalPackages: ["pg", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
