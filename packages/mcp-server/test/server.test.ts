import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HashChainedAuditLog, InMemoryStore } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node";
import { MllpServer } from "@interop-gateway/protocol-mllp";
import { FileDeadLetterQueue } from "@interop-gateway/engine";
import {
  createInteropGatewayMcpServer,
  type CreateInteropGatewayMcpServerOptions,
} from "../src/server.js";

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timed out");
}

async function fileExists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
}

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
let activeMllpServer: MllpServer | undefined;
let activeDirs: string[] = [];

async function connectedClient(options?: CreateInteropGatewayMcpServerOptions): Promise<Client> {
  // ephemeral: true — tests want an in-memory audit log by default, same as this
  // server's own pre-persistence-default behavior; a test that wants to exercise real
  // persistence passes its own auditSink/persistence, which still wins (explicit beats
  // ephemeral in resolveAuditSink's resolution order).
  const server = await createInteropGatewayMcpServer({ ephemeral: true, ...options });
  activeServer = server;
  const client = new Client({ name: "test-client", version: "1.0.0" });
  activeClient = client;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function toolText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text: string }[])[0]!.text;
}

afterEach(async () => {
  await activeClient?.close();
  await activeServer?.close();
  await activeMllpServer?.close();
  activeClient = undefined;
  activeServer = undefined;
  activeMllpServer = undefined;
  for (const dir of activeDirs) await rm(dir, { recursive: true, force: true });
  activeDirs = [];
  vi.unstubAllGlobals();
});

function mockFetchWithHeaders(
  sequence: Array<{
    ok: boolean;
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
  }>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of sequence) {
    const headers = new Map(Object.entries(response.headers ?? {}));
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: () => Promise.resolve(response.body),
      text: () => Promise.resolve(typeof response.body === "string" ? response.body : ""),
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("interop-gateway MCP server (real MCP client/server over InMemoryTransport)", () => {
  it("lists translate and validate as available tools", async () => {
    const client = await connectedClient();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "cancel_bulk_export",
      "check_bulk_export_status",
      "complete_smart_launch",
      "connect_ehr",
      "download_bulk_export_file",
      "read_resource",
      "run_pipeline",
      "send_message",
      "start_bulk_export",
      "start_smart_launch",
      "stop_pipeline",
      "translate",
      "validate",
      "validateUsCore",
      "write_resource",
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

  const CLIENT_SECRET_AUTH = {
    method: "client_secret_post" as const,
    tokenUrl: "https://auth.example.org/token",
    clientId: "test-client",
    clientSecret: "test-secret",
    scope: "system/Patient.read",
  };

  it("connect_ehr returns a connectionId without making a network call", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "connect_ehr",
      arguments: {
        baseUrl: "https://sandbox.example.org/fhir",
        auth: CLIENT_SECRET_AUTH,
        scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
      },
    });

    expect(result.isError).toBeFalsy();
    const { connectionId } = JSON.parse(toolText(result));
    expect(typeof connectionId).toBe("string");
  });

  it("connect_ehr rejects a non-https baseUrl without throwing", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "connect_ehr",
      arguments: {
        baseUrl: "http://sandbox.example.org/fhir",
        auth: CLIENT_SECRET_AUTH,
        scopes: [],
      },
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/TLS/i);
  });

  it("read_resource returns isError:true for an unknown connectionId", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "read_resource",
      arguments: { connectionId: "does-not-exist", resourceType: "Patient", id: "1" },
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/Unknown connectionId/);
  });

  it("read_resource enforces scope before any network call", async () => {
    const client = await connectedClient();
    const connected = await client.callTool({
      name: "connect_ehr",
      arguments: {
        baseUrl: "https://sandbox.example.org/fhir",
        auth: CLIENT_SECRET_AUTH,
        scopes: [{ resourceType: "Patient", operations: ["read"] }],
      },
    });
    const { connectionId } = JSON.parse(toolText(connected));

    const result = await client.callTool({
      name: "read_resource",
      arguments: { connectionId, resourceType: "Observation", id: "1" },
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/scope/i);
  });

  it("write_resource returns isError:true for an unknown connectionId", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "write_resource",
      arguments: {
        connectionId: "does-not-exist",
        operation: "create",
        resourceType: "Patient",
        resource: {},
      },
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/Unknown connectionId/);
  });

  it("write_resource requires resource for create, without throwing", async () => {
    const client = await connectedClient();
    const connected = await client.callTool({
      name: "connect_ehr",
      arguments: {
        baseUrl: "https://sandbox.example.org/fhir",
        auth: CLIENT_SECRET_AUTH,
        scopes: [{ resourceType: "Patient", operations: ["write"] }],
      },
    });
    const { connectionId } = JSON.parse(toolText(connected));

    const result = await client.callTool({
      name: "write_resource",
      arguments: { connectionId, operation: "create", resourceType: "Patient" },
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/resource.*required/i);
  });

  it("send_message delivers to a real local MLLP server and returns the ACK", async () => {
    const client = await connectedClient();
    const mllpServer = new MllpServer({ handler: async () => ({ code: "AA" }) });
    activeMllpServer = mllpServer;
    await mllpServer.listen(0, "127.0.0.1");
    const { port } = mllpServer.address()!;

    const result = await client.callTool({
      name: "send_message",
      arguments: { host: "127.0.0.1", port, message: SAMPLE_ADT_A01 },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(toolText(result));
    expect(parsed.acknowledged).toBe(true);
    expect(parsed.code).toBe("AA");
  });

  it("send_message returns isError:true instead of throwing when the connection fails", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "send_message",
      arguments: { host: "127.0.0.1", port: 1, message: SAMPLE_ADT_A01, maxAttempts: 1 },
    });

    expect(result.isError).toBe(true);
  });

  it("run_pipeline starts a real file pipeline, and stop_pipeline stops it", async () => {
    const client = await connectedClient();
    const inboundDir = await mkdtemp(join(tmpdir(), "mcp-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "mcp-out-"));
    activeDirs = [inboundDir, outboundDir];

    const started = await client.callTool({
      name: "run_pipeline",
      arguments: {
        yamlConfig: `name: mcp-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\n  pollIntervalMs: 30\ndestination:\n  protocol: file\n  directory: ${outboundDir}\n`,
      },
    });

    expect(started.isError).toBeFalsy();
    const { pipelineId } = JSON.parse(toolText(started));
    expect(typeof pipelineId).toBe("string");

    const stopped = await client.callTool({
      name: "stop_pipeline",
      arguments: { pipelineId },
    });
    expect(stopped.isError).toBeFalsy();
    expect(JSON.parse(toolText(stopped))).toEqual({ stopped: true });

    const secondStop = await client.callTool({
      name: "stop_pipeline",
      arguments: { pipelineId },
    });
    expect(secondStop.isError).toBe(true);
    expect(toolText(secondStop)).toMatch(/Unknown pipelineId/);
  });

  it("run_pipeline returns isError:true for invalid YAML instead of throwing", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "run_pipeline",
      arguments: { yamlConfig: "not: valid: yaml: at: all: :" },
    });

    expect(result.isError).toBe(true);
  });

  it("writes a correlated audit entry for connect_ehr, send_message, and run_pipeline/stop_pipeline", async () => {
    const auditSink = new HashChainedAuditLog();
    const client = await connectedClient({ auditSink });
    const inboundDir = await mkdtemp(join(tmpdir(), "mcp-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "mcp-out-"));
    activeDirs = [inboundDir, outboundDir];

    await client.callTool({
      name: "connect_ehr",
      arguments: {
        baseUrl: "https://sandbox.example.org/fhir",
        auth: CLIENT_SECRET_AUTH,
        scopes: [],
      },
    });
    const started = await client.callTool({
      name: "run_pipeline",
      arguments: {
        yamlConfig: `name: mcp-audit-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: file\n  directory: ${outboundDir}\n`,
      },
    });
    const { pipelineId } = JSON.parse(toolText(started));
    await client.callTool({ name: "stop_pipeline", arguments: { pipelineId } });

    const what = auditSink.list().map((record) => record.entry.what);
    expect(what).toEqual(["connect_ehr", "run_pipeline", "stop_pipeline"]);
    expect(await auditSink.verify()).toBe(true);
  });

  it("run_pipeline passes the server's own auditSink through, so the pipeline's translate/deliver events land in the same log", async () => {
    const auditSink = new HashChainedAuditLog();
    const client = await connectedClient({ auditSink });
    const inboundDir = await mkdtemp(join(tmpdir(), "mcp-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "mcp-out-"));
    activeDirs = [inboundDir, outboundDir];

    const started = await client.callTool({
      name: "run_pipeline",
      arguments: {
        yamlConfig: `name: mcp-shared-audit\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\n  pollIntervalMs: 30\ndestination:\n  protocol: file\n  directory: ${outboundDir}\n`,
      },
    });
    const { pipelineId } = JSON.parse(toolText(started));

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "processed", "adt.hl7")));
    await client.callTool({ name: "stop_pipeline", arguments: { pipelineId } });

    const what = auditSink.list().map((record) => record.entry.what);
    // Not just run_pipeline/stop_pipeline's own entries — the pipeline's internal
    // translate/deliver events too, proving they share one log instead of the pipeline
    // silently keeping its own separate in-memory one.
    expect(what).toEqual(["run_pipeline", "translate", "deliver", "stop_pipeline"]);
    expect(await auditSink.verify()).toBe(true);
  });

  it("run_pipeline passes the server's own deadLetterQueue through to the pipeline it starts", async () => {
    const deadLetterQueue = new FileDeadLetterQueue(new InMemoryStore());
    const client = await connectedClient({ deadLetterQueue });
    const inboundDir = await mkdtemp(join(tmpdir(), "mcp-in-"));
    activeDirs = [inboundDir];

    await client.callTool({
      name: "run_pipeline",
      arguments: {
        yamlConfig: `name: mcp-dlq-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\n  pollIntervalMs: 30\ndestination:\n  protocol: http\n  url: https://127.0.0.1:1\n`,
      },
    });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(async () => (await deadLetterQueue.list()).length === 1);

    const [entry] = await deadLetterQueue.list();
    expect(entry!.raw).toBe(SAMPLE_ADT_A01);
    expect(entry!.stage).toBe("deliver");
  });

  it("createInteropGatewayMcpServer refuses to persist unencrypted by default (no ephemeral, no opt-out)", async () => {
    await expect(createInteropGatewayMcpServer()).rejects.toMatchObject({
      code: "UNENCRYPTED_PERSISTENCE_REFUSED",
    });
  });

  it("createInteropGatewayMcpServer persists encrypted to disk by default when a passphrase is configured", async () => {
    const auditDir = await mkdtemp(join(tmpdir(), "mcp-audit-"));
    activeDirs = [auditDir];

    activeServer = await createInteropGatewayMcpServer({
      persistence: { audit: { directory: auditDir, encryptPassphrase: "test-passphrase" } },
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    activeClient = client;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), activeServer.connect(serverTransport)]);

    await client.callTool({
      name: "translate",
      arguments: { format: "hl7v2", payload: SAMPLE_ADT_A01 },
    });

    const raw = await new FileStore(auditDir).get("audit-log");
    expect(raw).toBeDefined();
    expect(new TextDecoder("utf8", { fatal: false }).decode(raw)).not.toContain("translate");
  });
});

describe("SMART launch tools (start_smart_launch / complete_smart_launch)", () => {
  it("start_smart_launch returns an authorization URL with PKCE params and a state, with no network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = await connectedClient();

    const result = await client.callTool({
      name: "start_smart_launch",
      arguments: {
        authorizeUrl: "https://sandbox.example.org/auth/authorize",
        tokenUrl: "https://sandbox.example.org/auth/token",
        clientId: "test-client",
        redirectUri: "https://app.example.org/callback",
        scope: "launch/patient patient/Patient.read offline_access",
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(toolText(result));
    expect(parsed.state).toBeTruthy();
    const url = new URL(parsed.url);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(parsed.state);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("complete_smart_launch exchanges the code and returns a connectionId usable by read_resource", async () => {
    const client = await connectedClient();

    const started = await client.callTool({
      name: "start_smart_launch",
      arguments: {
        authorizeUrl: "https://sandbox.example.org/auth/authorize",
        tokenUrl: "https://sandbox.example.org/auth/token",
        clientId: "test-client",
        redirectUri: "https://app.example.org/callback",
        scope: "launch/patient patient/Patient.read offline_access",
      },
    });
    const { state } = JSON.parse(toolText(started));

    const fetchMock = mockFetchWithHeaders([
      {
        ok: true,
        body: {
          access_token: "abc123",
          token_type: "Bearer",
          expires_in: 300,
          scope: "patient/Patient.read",
          patient: "patient-123",
        },
      },
      { ok: true, body: { resourceType: "Patient", id: "patient-123" } },
    ]);

    const completed = await client.callTool({
      name: "complete_smart_launch",
      arguments: {
        state,
        code: "auth-code-1",
        baseUrl: "https://sandbox.example.org/fhir",
        scopes: [{ resourceType: "Patient", operations: ["read"] }],
      },
    });

    expect(completed.isError).toBeFalsy();
    const { connectionId, patient } = JSON.parse(toolText(completed));
    expect(patient).toBe("patient-123");

    const read = await client.callTool({
      name: "read_resource",
      arguments: { connectionId, resourceType: "Patient", id: "patient-123" },
    });
    expect(read.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("complete_smart_launch returns isError for an unknown/already-used state", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "complete_smart_launch",
      arguments: {
        state: "never-started",
        code: "x",
        baseUrl: "https://sandbox.example.org/fhir",
        scopes: [],
      },
    });

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/Unknown or already-used state/);
  });

  it("complete_smart_launch consumes state — a second call with the same state fails", async () => {
    const client = await connectedClient();
    const started = await client.callTool({
      name: "start_smart_launch",
      arguments: {
        authorizeUrl: "https://sandbox.example.org/auth/authorize",
        tokenUrl: "https://sandbox.example.org/auth/token",
        clientId: "test-client",
        redirectUri: "https://app.example.org/callback",
        scope: "patient/Patient.read",
      },
    });
    const { state } = JSON.parse(toolText(started));
    mockFetchWithHeaders([
      {
        ok: true,
        body: { access_token: "abc", token_type: "Bearer", expires_in: 300, scope: "x" },
      },
    ]);

    await client.callTool({
      name: "complete_smart_launch",
      arguments: { state, code: "c1", baseUrl: "https://sandbox.example.org/fhir", scopes: [] },
    });
    const second = await client.callTool({
      name: "complete_smart_launch",
      arguments: { state, code: "c2", baseUrl: "https://sandbox.example.org/fhir", scopes: [] },
    });

    expect(second.isError).toBe(true);
  });
});

describe("Bulk export tools (start/check/download/cancel_bulk_export)", () => {
  async function connectedForBulkExport(): Promise<{
    client: Awaited<ReturnType<typeof connectedClient>>;
    connectionId: string;
  }> {
    const client = await connectedClient();
    const connected = await client.callTool({
      name: "connect_ehr",
      arguments: {
        baseUrl: "https://sandbox.example.org/fhir",
        auth: {
          method: "client_secret_post",
          tokenUrl: "https://sandbox.example.org/auth/token",
          clientId: "test-client",
          clientSecret: "shh",
          scope: "system/*.read",
        },
        scopes: [],
      },
    });
    const { connectionId } = JSON.parse(toolText(connected));
    return { client, connectionId };
  }

  it("start_bulk_export returns an exportId from the server's Content-Location", async () => {
    const { client, connectionId } = await connectedForBulkExport();
    mockFetchWithHeaders([
      {
        ok: true,
        body: { access_token: "abc", token_type: "Bearer", expires_in: 300, scope: "x" },
      },
      {
        ok: true,
        status: 202,
        headers: { "content-location": "https://sandbox.example.org/bulk/1" },
      },
    ]);

    const result = await client.callTool({
      name: "start_bulk_export",
      arguments: { connectionId, level: "system" },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(toolText(result)).exportId).toBeTruthy();
  });

  it("check_bulk_export_status reports a completed export's output files", async () => {
    const { client, connectionId } = await connectedForBulkExport();
    mockFetchWithHeaders([
      {
        ok: true,
        body: { access_token: "abc", token_type: "Bearer", expires_in: 300, scope: "x" },
      },
      {
        ok: true,
        status: 202,
        headers: { "content-location": "https://sandbox.example.org/bulk/1" },
      },
    ]);
    const started = await client.callTool({
      name: "start_bulk_export",
      arguments: { connectionId, level: "system" },
    });
    const { exportId } = JSON.parse(toolText(started));

    mockFetchWithHeaders([
      {
        ok: true,
        status: 200,
        body: {
          transactionTime: "2026-01-01T00:00:00Z",
          requiresAccessToken: true,
          output: [{ type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" }],
        },
      },
    ]);

    const status = await client.callTool({
      name: "check_bulk_export_status",
      arguments: { connectionId, exportId },
    });

    const parsed = JSON.parse(toolText(status));
    expect(parsed.status).toBe("completed");
    expect(parsed.output).toEqual([
      { type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" },
    ]);
  });

  it("check_bulk_export_status returns isError for an unknown exportId", async () => {
    const { client, connectionId } = await connectedForBulkExport();
    const result = await client.callTool({
      name: "check_bulk_export_status",
      arguments: { connectionId, exportId: "never-started" },
    });
    expect(result.isError).toBe(true);
  });

  it("download_bulk_export_file returns the raw NDJSON text", async () => {
    const { client, connectionId } = await connectedForBulkExport();
    mockFetchWithHeaders([
      {
        ok: true,
        body: { access_token: "abc", token_type: "Bearer", expires_in: 300, scope: "x" },
      },
      {
        ok: true,
        status: 202,
        headers: { "content-location": "https://sandbox.example.org/bulk/1" },
      },
    ]);
    const started = await client.callTool({
      name: "start_bulk_export",
      arguments: { connectionId, level: "system" },
    });
    JSON.parse(toolText(started));

    mockFetchWithHeaders([{ ok: true, body: '{"resourceType":"Patient","id":"1"}' }]);
    const downloaded = await client.callTool({
      name: "download_bulk_export_file",
      arguments: {
        connectionId,
        type: "Patient",
        url: "https://sandbox.example.org/files/patient.ndjson",
      },
    });

    expect(downloaded.isError).toBeFalsy();
    expect(toolText(downloaded)).toBe('{"resourceType":"Patient","id":"1"}');
  });

  it("cancel_bulk_export sends DELETE and releases the exportId", async () => {
    const { client, connectionId } = await connectedForBulkExport();
    mockFetchWithHeaders([
      {
        ok: true,
        body: { access_token: "abc", token_type: "Bearer", expires_in: 300, scope: "x" },
      },
      {
        ok: true,
        status: 202,
        headers: { "content-location": "https://sandbox.example.org/bulk/1" },
      },
    ]);
    const started = await client.callTool({
      name: "start_bulk_export",
      arguments: { connectionId, level: "system" },
    });
    const { exportId } = JSON.parse(toolText(started));

    const fetchMock = mockFetchWithHeaders([{ ok: true, status: 202 }]);
    const cancelled = await client.callTool({
      name: "cancel_bulk_export",
      arguments: { connectionId, exportId },
    });

    expect(cancelled.isError).toBeFalsy();
    expect(JSON.parse(toolText(cancelled))).toEqual({ cancelled: true });
    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestInit.method).toBe("DELETE");

    const recheck = await client.callTool({
      name: "check_bulk_export_status",
      arguments: { connectionId, exportId },
    });
    expect(recheck.isError).toBe(true);
  });
});
