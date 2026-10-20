import { getTwinMode, startHttp, startStdio } from "./transport.js";
import { loadRootEnv } from "@hca/db";

async function main(): Promise<void> {
  loadRootEnv();
  const transport = (process.env.MCP_TRANSPORT ?? "http").toLowerCase();
  if (transport === "stdio") {
    await startStdio();
    return;
  }
  const port = Number(process.env.MCP_PORT ?? 3200);
  await startHttp(port);
  console.error(`twin_mode=${getTwinMode()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
