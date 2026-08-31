#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createInteropGatewayMcpServer } from "./server.js";

/** Exported so tests can construct the server without going through stdio. */
export async function main(): Promise<void> {
  const server = await createInteropGatewayMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMainModule = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
if (isMainModule) {
  void main();
}
