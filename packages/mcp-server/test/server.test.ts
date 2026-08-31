import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HashChainedAuditLog } from "@interop-gateway/core";
import {
  createInteropGatewayMcpServer,
  type CreateInteropGatewayMcpServerOptions,
} from "../src/server.js";

const SAMPLE_ADT_A01 =
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260101120000\r" +
  "PID|1||123456^^^MRN||Doe^Jane||19800101|F";

// Same message with PID-8 (gender) blanked — translates fine, but the resulting
// Patient fails US Core's required "gender" element check.
const SAMPLE_ADT_A01_MISSING_GENDER =
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260101120000\r" +
  "PID|1||123456^^^MRN||Doe^Jane||19800101|";

let activeServer: McpServer | undefined;
let activeClient: Client | undefined;

async function connectedClient(options?: CreateInteropGatewayMcpServerOptions): Promise<Client> {
  const server = createInteropGatewayMcpServer(options);
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

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "translate",
      "validate",
      "validateUsCore",
    ]);
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

  it("validateUsCore reports a translated Bundle that passes US Core", async () => {
    const client = await connectedClient();

    const translated = await client.callTool({
      name: "translate",
      arguments: { format: "hl7v2", payload: SAMPLE_ADT_A01 },
    });
    const bundleText = (translated.content as { type: string; text: string }[])[0]!.text;

    const result = await client.callTool({
      name: "validateUsCore",
      arguments: { payload: bundleText },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as { type: string; text: string }[])[0]!.text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.every((entry: { valid: boolean }) => entry.valid)).toBe(true);
  });

  it("validateUsCore flags a Patient resource missing a required US Core element", async () => {
    const client = await connectedClient();

    const translated = await client.callTool({
      name: "translate",
      arguments: { format: "hl7v2", payload: SAMPLE_ADT_A01_MISSING_GENDER },
    });
    const bundleText = (translated.content as { type: string; text: string }[])[0]!.text;

    const result = await client.callTool({
      name: "validateUsCore",
      arguments: { payload: bundleText },
    });

    const parsed = JSON.parse((result.content as { type: string; text: string }[])[0]!.text);
    const patientResult = parsed.find(
      (entry: { resourceType: string }) => entry.resourceType === "Patient",
    );
    expect(patientResult.valid).toBe(false);
    expect(patientResult.issues.join(" ")).toMatch(/gender/i);
  });

  it("validateUsCore returns isError:true for non-JSON input, without throwing", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "validateUsCore",
      arguments: { payload: "not json" },
    });

    expect(result.isError).toBe(true);
  });

  it("writes a correlated audit entry for translate, validate, and validateUsCore calls", async () => {
    const auditSink = new HashChainedAuditLog();
    const client = await connectedClient({ auditSink });

    await client.callTool({ name: "validate", arguments: { payload: SAMPLE_ADT_A01 } });
    await client.callTool({
      name: "translate",
      arguments: { format: "hl7v2", payload: "not an hl7v2 message" },
    });

    const entries = auditSink.list().map((record) => record.entry);
    expect(entries.map((entry) => entry.what)).toEqual(["validate", "translate:rejected"]);
    expect(entries.every((entry) => entry.who === "mcp-server")).toBe(true);
    expect(new Set(entries.map((entry) => entry.correlationId)).size).toBe(2);
    expect(await auditSink.verify()).toBe(true);
  });
});
