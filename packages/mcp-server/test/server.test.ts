import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createInteropGatewayMcpServer } from "../src/server.js";

const SAMPLE_ADT_A01 =
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260101120000\r" +
  "PID|1||123456^^^MRN||Doe^Jane||19800101|F";

let activeServer: McpServer | undefined;
let activeClient: Client | undefined;

async function connectedClient(): Promise<Client> {
  const server = createInteropGatewayMcpServer();
  activeServer = server;
  const client = new Client({ name: "test-client", version: "1.0.0" });
  activeClient = client;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

afterEach(async () => {
  await activeClient?.close();
  await activeServer?.close();
  activeClient = undefined;
  activeServer = undefined;
});

describe("interop-gateway MCP server (real MCP client/server over InMemoryTransport)", () => {
  it("lists translate and validate as available tools", async () => {
    const client = await connectedClient();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(["translate", "validate"]);
  });

  it("translate converts a valid HL7v2 message into a FHIR Bundle", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "translate",
      arguments: { format: "hl7v2", payload: SAMPLE_ADT_A01 },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const bundle = JSON.parse(content[0]!.text);
    expect(bundle.resourceType).toBe("Bundle");
  });

  it("translate returns isError:true for a malformed message, without throwing", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "translate",
      arguments: { format: "hl7v2", payload: "not an hl7v2 message" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toMatch(/Structural validation failed/);
  });

  it("translate returns a schema validation error for an unrecognized format, without calling the handler", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "translate",
      arguments: { format: "dicom", payload: "x" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toMatch(/Invalid arguments for tool translate/);
  });

  it("validate reports a structurally valid HL7v2 message", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "validate",
      arguments: { payload: SAMPLE_ADT_A01 },
    });

    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.valid).toBe(true);
    expect(parsed.format).toBe("hl7v2");
  });

  it("validate reports an invalid input without throwing", async () => {
    const client = await connectedClient();

    const result = await client.callTool({ name: "validate", arguments: { payload: "garbage" } });

    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.valid).toBe(false);
  });
});
