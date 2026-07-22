import { createMcpClient, type HcpMcpClient } from "@hca/mcp-client";
import { getMcpUrl, loadRootEnv } from "./env";

let client: HcpMcpClient | null = null;

export function getMcp(): HcpMcpClient {
  loadRootEnv();
  if (!client) client = createMcpClient(getMcpUrl());
  return client;
}
