import { startHttp } from "./transport.js";
import { loadRootEnv } from "@hca/db";

async function main(): Promise<void> {
  loadRootEnv();
  const port = Number(process.env.MCP2_PORT ?? 3300);
  await startHttp(port);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
