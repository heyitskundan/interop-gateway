import { describe, expect, it, vi } from "vitest";

const connect = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/server.js", () => ({
  createInteropGatewayMcpServer: () => ({ connect }),
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class FakeStdioServerTransport {},
}));

describe("mcp-server CLI", () => {
  it("connects the server to a StdioServerTransport", async () => {
    const { main } = await import("../src/cli.js");

    await main();

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
