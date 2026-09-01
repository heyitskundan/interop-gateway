import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import {
  GatewayError,
  InteropGateway,
  createEnvelope,
  formatHl7v2,
  formatCda,
  validateUsCore,
  validateUsCoreBundle,
  type AuditSink,
} from "@interop-gateway/core";
import {
  SmartClient,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  type AuthConfig,
  type BulkExportJob,
} from "@interop-gateway/connector";
import { sendMllpMessage } from "@interop-gateway/protocol";
import {
  loadPipelineConfig,
  runPipeline,
  resolveAuditSink,
  resolveDeadLetterQueue,
  type RunningPipeline,
  type DeadLetterQueue,
  type PersistenceConfig,
  type PersistenceOptions,
} from "@interop-gateway/engine";

const translateInputSchema = {
  format: z.enum(["hl7v2", "cda"]).describe("The input message's format"),
  payload: z.string().describe("The raw HL7v2 message text or C-CDA XML document"),
} satisfies ZodRawShape;

const validateInputSchema = {
  payload: z.string().describe("The raw HL7v2 message text or C-CDA XML document"),
} satisfies ZodRawShape;

const validateUsCoreInputSchema = {
  payload: z
    .string()
    .describe(
      "A FHIR resource or Bundle, serialized as a JSON string (typically the output of the translate tool)",
    ),
} satisfies ZodRawShape;

const authConfigSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("client_secret_post"),
    tokenUrl: z.string(),
    clientId: z.string(),
    clientSecret: z.string(),
    scope: z.string(),
  }),
  z.object({
    method: z.literal("private_key_jwt"),
    tokenUrl: z.string(),
    clientId: z.string(),
    privateKey: z.record(z.string(), z.unknown()).describe("A JWK, never a raw PEM string"),
    kid: z.string(),
    alg: z.string(),
    scope: z.string(),
  }),
]);

const connectEhrInputSchema = {
  baseUrl: z.string().describe("The FHIR R4 base URL, e.g. https://sandbox.example.org/fhir"),
  auth: authConfigSchema.describe(
    "Backend-services auth — client_secret_post or private_key_jwt. This is passed through the MCP protocol as a tool argument, which most MCP clients display/log as part of showing what the tool was called with — a materially different exposure than using SmartClient directly in your own process. Only use this tool with a client you trust to handle the resulting call log appropriately.",
  ),
  scopes: z
    .array(
      z.object({
        resourceType: z.string().describe('A FHIR resource type, or "*" for all types'),
        operations: z.array(z.enum(["read", "write", "search"])),
      }),
    )
    .describe("Enforced client-side before every call, independent of what the server grants"),
} satisfies ZodRawShape;

const startSmartLaunchInputSchema = {
  authorizeUrl: z.string().describe("The SMART authorization endpoint URL"),
  tokenUrl: z
    .string()
    .describe("The SMART token endpoint URL — used later by complete_smart_launch"),
  clientId: z.string(),
  clientSecret: z
    .string()
    .optional()
    .describe("Confidential client only — omit for a public client (PKCE alone authenticates it)"),
  redirectUri: z.string().describe("Must match what's registered with the authorization server"),
  scope: z
    .string()
    .describe(
      'Space-separated SMART scopes, e.g. "launch/patient patient/Patient.read offline_access" — include offline_access for TokenManager to refresh later without repeating this launch',
    ),
  aud: z
    .string()
    .optional()
    .describe("The FHIR server base URL — required for an EHR launch, recommended otherwise"),
  launch: z
    .string()
    .optional()
    .describe(
      "The opaque launch context token from an EHR launch redirect — omit for a standalone launch",
    ),
} satisfies ZodRawShape;

const completeSmartLaunchInputSchema = {
  state: z.string().describe("The state value start_smart_launch returned"),
  code: z
    .string()
    .describe(
      "The authorization code from the redirect back to redirectUri (its `code` query param)",
    ),
  baseUrl: z.string().describe("The FHIR R4 base URL to connect to with the resulting token"),
  scopes: z
    .array(
      z.object({
        resourceType: z.string().describe('A FHIR resource type, or "*" for all types'),
        operations: z.array(z.enum(["read", "write", "search"])),
      }),
    )
    .describe("Enforced client-side before every call, independent of what the server grants"),
} satisfies ZodRawShape;

const readResourceInputSchema = {
  connectionId: z
    .string()
    .describe("A connectionId returned by connect_ehr or complete_smart_launch"),
  resourceType: z.string(),
  id: z.string().optional().describe("Read a single resource by id — omit to search instead"),
  searchParams: z
    .record(z.string(), z.string())
    .optional()
    .describe("FHIR search parameters — ignored if id is given"),
} satisfies ZodRawShape;

const writeResourceInputSchema = {
  connectionId: z
    .string()
    .describe("A connectionId returned by connect_ehr or complete_smart_launch"),
  operation: z.enum(["create", "update", "delete"]),
  resourceType: z.string(),
  id: z.string().optional().describe("Required for update/delete"),
  resource: z.unknown().optional().describe("Required for create/update"),
} satisfies ZodRawShape;

const startBulkExportInputSchema = {
  connectionId: z
    .string()
    .describe("A connectionId returned by connect_ehr or complete_smart_launch"),
  level: z.enum(["system", "patient", "group"]),
  groupId: z.string().optional().describe('Required when level is "group"'),
  types: z.array(z.string()).optional().describe('_type — e.g. ["Patient", "Observation"]'),
  since: z.string().optional().describe("_since — an FHIR instant"),
  typeFilter: z
    .array(z.string())
    .optional()
    .describe('_typeFilter — e.g. ["Patient?status=active"]'),
  outputFormat: z
    .string()
    .optional()
    .describe("_outputFormat — defaults to application/fhir+ndjson"),
} satisfies ZodRawShape;

const checkBulkExportStatusInputSchema = {
  connectionId: z.string().describe("The same connectionId used to start the export"),
  exportId: z.string().describe("An exportId returned by start_bulk_export"),
} satisfies ZodRawShape;

const downloadBulkExportFileInputSchema = {
  connectionId: z.string().describe("The same connectionId used to start the export"),
  type: z.string().describe("From an output entry in check_bulk_export_status's completed result"),
  url: z.string().describe("From an output entry in check_bulk_export_status's completed result"),
  requiresAccessToken: z
    .boolean()
    .optional()
    .describe(
      "From the completed status's own requiresAccessToken field — sends this connection's bearer token with the download request when true",
    ),
} satisfies ZodRawShape;

const cancelBulkExportInputSchema = {
  connectionId: z.string().describe("The same connectionId used to start the export"),
  exportId: z.string().describe("An exportId returned by start_bulk_export"),
} satisfies ZodRawShape;

const sendMessageInputSchema = {
  host: z.string(),
  port: z.number(),
  message: z.string().describe("Raw HL7v2 message text — MLLP framing is added automatically"),
  timeoutMs: z.number().optional(),
  maxAttempts: z.number().optional(),
} satisfies ZodRawShape;

const runPipelineInputSchema = {
  yamlConfig: z
    .string()
    .describe("A pipeline YAML config — the same shape @interop-gateway/engine's CLI accepts"),
} satisfies ZodRawShape;

const stopPipelineInputSchema = {
  pipelineId: z.string().describe("A pipelineId returned by run_pipeline"),
} satisfies ZodRawShape;

export interface CreateInteropGatewayMcpServerOptions extends PersistenceOptions {
  /** Where per-call audit entries are written — `who` is `"mcp"`, `what` is the
   * tool name (optionally suffixed `:rejected`), `resourceType` is the translated
   * resource's `resourceType` when known. Defaults to a `FileAuditLog` persisted to
   * `persistence.audit.directory` (or a `./mcp-audit` default under `baseDir`)
   * — set `ephemeral: true` for the old in-memory-only default instead. Persisting
   * without `persistence.audit.encryptPassphrase` throws unless
   * `allowUnencryptedPersistence: true` is also set — same rule as
   * `@interop-gateway/engine`'s `runPipeline()`. Pass your own `AuditSink` to bypass
   * all of the above. */
  readonly auditSink?: AuditSink;
  /** Passed straight through to every pipeline `run_pipeline` starts, so a message that
   * fails translation/validation/routing/delivery inside one of those pipelines is
   * retained for inspection/replay instead of only being reported back through its own
   * source's failure channel. Stays opt-in — resolved from `persistence.deadLetter` if
   * set, otherwise `undefined` (no dead-letter queue), matching `runPipeline()`'s own
   * behavior when called directly. The encryption requirement above still applies to
   * it once configured. */
  readonly deadLetterQueue?: DeadLetterQueue;
  /** Directory-based persistence config for the audit log / dead-letter queue, same
   * shape as an `engine` pipeline's `persistence` config block. */
  readonly persistence?: PersistenceConfig;
}

/** Builds an MCP server exposing `translate`, `validate`, `validateUsCore`, `connect_ehr`,
 * `start_smart_launch`, `complete_smart_launch`, `read_resource`, `write_resource`,
 * `send_message`, `start_bulk_export`, `check_bulk_export_status`,
 * `download_bulk_export_file`, `run_pipeline`, and `stop_pipeline` over
 * `@interop-gateway/core`'s `InteropGateway`, with both `hl7v2` and `cda` format
 * plugins registered. Connect it to any MCP `Transport` (stdio for a real client,
 * `InMemoryTransport` for tests) via `server.connect(transport)`.
 *
 * `connect_ehr` only supports backend-services (system-to-system) auth —
 * `start_smart_launch`/`complete_smart_launch` cover the interactive,
 * patient/clinician-facing `authorization_code`+PKCE flow instead (the underlying
 * `@interop-gateway/connector` package supports both; this server exposes them as
 * separate tools since an authorization-code exchange needs a redirect/callback step
 * that doesn't fit a single synchronous tool call). Credentials/tokens travel as tool
 * arguments, which most MCP clients display/log when showing what a tool was called
 * with; see each tool's description for the full disclosure. Connections and running
 * pipelines are held in memory, per server instance, and are not restored across a
 * process restart — the audit log and any configured dead-letter queue persist to disk
 * independently of that, per `auditSink`/`persistence` above. */
export async function createInteropGatewayMcpServer(
  options: CreateInteropGatewayMcpServerOptions = {},
): Promise<McpServer> {
  const gateway = new InteropGateway({ formats: [formatHl7v2, formatCda] });
  const auditSink = await resolveAuditSink(
    "mcp",
    options.persistence,
    options.auditSink,
    options,
  );
  const defaultDeadLetterQueue = await resolveDeadLetterQueue(
    "mcp",
    options.persistence,
    options.deadLetterQueue,
    options,
  );
  const server = new McpServer({ name: "interop-gateway", version: "1.0.0" });
  const connections = new Map<string, SmartClient>();
  const pipelines = new Map<string, RunningPipeline>();
  const bulkExports = new Map<
    string,
    { readonly connectionId: string; readonly job: BulkExportJob }
  >();
  const pendingLaunches = new Map<
    string,
    {
      readonly tokenUrl: string;
      readonly clientId: string;
      readonly clientSecret: string | undefined;
      readonly redirectUri: string;
      readonly codeVerifier: string;
    }
  >();

  const audit = (correlationId: string, what: string, resourceType?: string): Promise<void> =>
    auditSink.append({
      correlationId,
      who: "mcp",
      what,
      when: new Date().toISOString(),
      ...(resourceType !== undefined ? { resourceType } : {}),
    });

  const errorText = (error: unknown, fallback: string): string =>
    error instanceof GatewayError ? error.message : fallback;

  server.registerTool(
    "translate",
    {
      title: "Translate a message to FHIR",
      description:
        "Translates a raw HL7v2 message or C-CDA XML document into a FHIR R4 Bundle (JSON).",
      inputSchema: translateInputSchema,
    },
    async ({ format, payload }) => {
      const { correlationId } = createEnvelope(payload, "mcp:translate");
      try {
        const fhir = gateway.translate(payload, { from: format, to: "fhir" });
        const resourceType = (fhir as { resourceType?: string } | null)?.resourceType;
        await audit(correlationId, "translate", resourceType);
        return { content: [{ type: "text" as const, text: JSON.stringify(fhir, null, 2) }] };
      } catch (error) {
        await audit(correlationId, "translate:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Translation failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "validate",
    {
      title: "Check structural well-formedness",
      description:
        "Checks whether a string is a structurally well-formed HL7v2 message or C-CDA XML document, without translating it.",
      inputSchema: validateInputSchema,
    },
    async ({ payload }) => {
      const { correlationId } = createEnvelope(payload, "mcp:validate");
      const result = gateway.validate(payload);
      await audit(correlationId, result.valid ? "validate" : "validate:rejected");
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "validateUsCore",
    {
      title: "Check US Core profile conformance",
      description:
        "Checks a FHIR resource or Bundle (JSON) against US Core's required-element rules for the resource types translate can produce. Structural only, not a terminology-binding validator — call this on the output of translate, it does not translate anything itself.",
      inputSchema: validateUsCoreInputSchema,
    },
    async ({ payload }) => {
      const { correlationId } = createEnvelope(payload, "mcp:validateUsCore");

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        await audit(correlationId, "validateUsCore:rejected");
        return {
          content: [{ type: "text" as const, text: "Input is not valid JSON" }],
          isError: true,
        };
      }

      const isBundle = (parsed as { resourceType?: string } | null)?.resourceType === "Bundle";
      const result = isBundle ? validateUsCoreBundle(parsed) : [validateUsCore(parsed)];
      const allValid = result.every((entry) => entry.valid);
      await audit(correlationId, allValid ? "validateUsCore" : "validateUsCore:rejected");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(isBundle ? result : result[0], null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "connect_ehr",
    {
      title: "Connect to a SMART on FHIR server",
      description:
        "Opens a backend-services (system-to-system) connection to a FHIR R4 server and returns a connectionId for read_resource/write_resource to use. For the interactive, patient- or clinician-facing SMART launch instead, use start_smart_launch/complete_smart_launch. The `auth` argument carries client credentials or a private key and is passed through the MCP protocol as a tool call argument — most MCP clients display/log tool-call arguments as part of showing what was called, which is a materially different exposure than using SmartClient directly in your own process. Only call this tool from a client whose call log you trust.",
      inputSchema: connectEhrInputSchema,
    },
    async ({ baseUrl, auth, scopes }) => {
      const { correlationId } = createEnvelope(baseUrl, "mcp:connect_ehr");
      try {
        const client = new SmartClient({ baseUrl, auth: auth as AuthConfig, scopes });
        const connectionId = randomUUID();
        connections.set(connectionId, client);
        await audit(correlationId, "connect_ehr");
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ connectionId }, null, 2) }],
        };
      } catch (error) {
        await audit(correlationId, "connect_ehr:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Connection failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "start_smart_launch",
    {
      title: "Start an interactive SMART App Launch (authorization_code + PKCE)",
      description:
        "First half of the patient/clinician-facing SMART launch: builds the authorization-endpoint URL (PKCE, S256) and returns it plus a state token. This tool cannot perform the actual browser redirect and user login/consent — that's inherently outside what any server-side tool call can automate. The caller is responsible for sending the user to the returned url and capturing the code/state the authorization server redirects back with, then calling complete_smart_launch. The PKCE code_verifier is held server-side (keyed by state), not returned here.",
      inputSchema: startSmartLaunchInputSchema,
    },
    async ({ authorizeUrl, tokenUrl, clientId, clientSecret, redirectUri, scope, aud, launch }) => {
      const { correlationId } = createEnvelope(authorizeUrl, "mcp:start_smart_launch");
      try {
        const request = await buildAuthorizationUrl({
          authorizeUrl,
          clientId,
          redirectUri,
          scope,
          ...(aud !== undefined ? { aud } : {}),
          ...(launch !== undefined ? { launch } : {}),
        });
        pendingLaunches.set(request.state, {
          tokenUrl,
          clientId,
          clientSecret,
          redirectUri,
          codeVerifier: request.codeVerifier,
        });
        await audit(correlationId, "start_smart_launch");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ url: request.url.toString(), state: request.state }, null, 2),
            },
          ],
        };
      } catch (error) {
        await audit(correlationId, "start_smart_launch:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Failed to start launch") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "complete_smart_launch",
    {
      title: "Complete an interactive SMART App Launch",
      description:
        "Second half of start_smart_launch: exchanges the authorization code from the redirect for an access token (using the code_verifier held server-side against state) and opens a scope-checked connection with it, same as connect_ehr returns. state is single-use — removed from server memory once this call succeeds or fails.",
      inputSchema: completeSmartLaunchInputSchema,
    },
    async ({ state, code, baseUrl, scopes }) => {
      const { correlationId } = createEnvelope(state, "mcp:complete_smart_launch");
      const pending = pendingLaunches.get(state);
      if (!pending) {
        await audit(correlationId, "complete_smart_launch:rejected");
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown or already-used state: ${state} (call start_smart_launch first)`,
            },
          ],
          isError: true,
        };
      }
      pendingLaunches.delete(state);
      try {
        const token = await exchangeAuthorizationCode({
          tokenUrl: pending.tokenUrl,
          code,
          redirectUri: pending.redirectUri,
          clientId: pending.clientId,
          codeVerifier: pending.codeVerifier,
          ...(pending.clientSecret !== undefined ? { clientSecret: pending.clientSecret } : {}),
        });
        const client = new SmartClient({
          baseUrl,
          auth: {
            method: "authorization_code",
            tokenUrl: pending.tokenUrl,
            clientId: pending.clientId,
            redirectUri: pending.redirectUri,
            ...(pending.clientSecret !== undefined ? { clientSecret: pending.clientSecret } : {}),
            initialToken: token,
          },
          scopes,
        });
        const connectionId = randomUUID();
        connections.set(connectionId, client);
        await audit(correlationId, "complete_smart_launch");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { connectionId, patient: token.patient, encounter: token.encounter },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        await audit(correlationId, "complete_smart_launch:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Launch completion failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "read_resource",
    {
      title: "Read or search a FHIR resource",
      description:
        "Reads a single resource by id, or searches a resource type, over a connection opened by connect_ehr. Scope-checked client-side before the request is sent.",
      inputSchema: readResourceInputSchema,
    },
    async ({ connectionId, resourceType, id, searchParams }) => {
      const { correlationId } = createEnvelope(resourceType, "mcp:read_resource");
      const client = connections.get(connectionId);
      if (!client) {
        await audit(correlationId, "read_resource:rejected", resourceType);
        return {
          content: [{ type: "text" as const, text: `Unknown connectionId: ${connectionId}` }],
          isError: true,
        };
      }
      try {
        const result = id
          ? await client.read(resourceType, id)
          : await client.search(resourceType, searchParams ?? {});
        await audit(correlationId, "read_resource", resourceType);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        await audit(correlationId, "read_resource:rejected", resourceType);
        return {
          content: [{ type: "text" as const, text: errorText(error, "Read failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "write_resource",
    {
      title: "Create, update, or delete a FHIR resource",
      description:
        "Performs a scope-checked write over a connection opened by connect_ehr. Does not throw on a server-side rejection (409/412/422/etc.) — check the returned result's `ok` field.",
      inputSchema: writeResourceInputSchema,
    },
    async ({ connectionId, operation, resourceType, id, resource }) => {
      const { correlationId } = createEnvelope(resourceType, "mcp:write_resource");
      const client = connections.get(connectionId);
      if (!client) {
        await audit(correlationId, "write_resource:rejected", resourceType);
        return {
          content: [{ type: "text" as const, text: `Unknown connectionId: ${connectionId}` }],
          isError: true,
        };
      }
      if (operation !== "create" && !id) {
        await audit(correlationId, "write_resource:rejected", resourceType);
        return {
          content: [{ type: "text" as const, text: `"id" is required for "${operation}"` }],
          isError: true,
        };
      }
      if (operation !== "delete" && resource === undefined) {
        await audit(correlationId, "write_resource:rejected", resourceType);
        return {
          content: [{ type: "text" as const, text: `"resource" is required for "${operation}"` }],
          isError: true,
        };
      }
      try {
        const result =
          operation === "create"
            ? await client.create(resourceType, resource)
            : operation === "update"
              ? await client.update(resourceType, id as string, resource)
              : await client.delete(resourceType, id as string);
        await audit(
          correlationId,
          result.ok ? "write_resource" : "write_resource:rejected",
          resourceType,
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        await audit(correlationId, "write_resource:rejected", resourceType);
        return {
          content: [{ type: "text" as const, text: errorText(error, "Write failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "start_bulk_export",
    {
      title: "Start a Bulk Data $export",
      description:
        "Kicks off a system-, patient-, or group-level Bulk Data export over a connection opened by connect_ehr/complete_smart_launch, per the FHIR Bulk Data Access IG. Returns an exportId — poll it with check_bulk_export_status.",
      inputSchema: startBulkExportInputSchema,
    },
    async ({ connectionId, level, groupId, types, since, typeFilter, outputFormat }) => {
      const { correlationId } = createEnvelope(connectionId, "mcp:start_bulk_export");
      const client = connections.get(connectionId);
      if (!client) {
        await audit(correlationId, "start_bulk_export:rejected");
        return {
          content: [{ type: "text" as const, text: `Unknown connectionId: ${connectionId}` }],
          isError: true,
        };
      }
      try {
        const job = await client.startBulkExport({
          level,
          ...(groupId !== undefined ? { groupId } : {}),
          ...(types !== undefined ? { types } : {}),
          ...(since !== undefined ? { since } : {}),
          ...(typeFilter !== undefined ? { typeFilter } : {}),
          ...(outputFormat !== undefined ? { outputFormat } : {}),
        });
        const exportId = randomUUID();
        bulkExports.set(exportId, { connectionId, job });
        await audit(correlationId, "start_bulk_export");
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ exportId }, null, 2) }],
        };
      } catch (error) {
        await audit(correlationId, "start_bulk_export:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Failed to start export") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "check_bulk_export_status",
    {
      title: "Check a Bulk Data export's status",
      description:
        'One-shot status check (no polling loop) — returns {status:"in-progress",progress?,retryAfterSeconds?}, {status:"completed",transactionTime,output,requiresAccessToken,...}, or {status:"error",issues}. Call again yourself until "completed", waiting retryAfterSeconds between calls when given.',
      inputSchema: checkBulkExportStatusInputSchema,
    },
    async ({ connectionId, exportId }) => {
      const { correlationId } = createEnvelope(exportId, "mcp:check_bulk_export_status");
      const client = connections.get(connectionId);
      const entry = bulkExports.get(exportId);
      if (!client || !entry || entry.connectionId !== connectionId) {
        await audit(correlationId, "check_bulk_export_status:rejected");
        return {
          content: [
            { type: "text" as const, text: `Unknown exportId for this connectionId: ${exportId}` },
          ],
          isError: true,
        };
      }
      try {
        const status = await client.checkBulkExportStatus(entry.job);
        await audit(correlationId, "check_bulk_export_status");
        return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
      } catch (error) {
        await audit(correlationId, "check_bulk_export_status:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Status check failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "download_bulk_export_file",
    {
      title: "Download one Bulk Data export output file",
      description:
        "Downloads one NDJSON output file from a completed export's output list — pass requiresAccessToken from that same completed status. Returns raw NDJSON text (one FHIR resource per line); the caller parses it. Files can be large — expect the full text back as this tool's result.",
      inputSchema: downloadBulkExportFileInputSchema,
    },
    async ({ connectionId, type, url, requiresAccessToken }) => {
      const { correlationId } = createEnvelope(url, "mcp:download_bulk_export_file");
      const client = connections.get(connectionId);
      if (!client) {
        await audit(correlationId, "download_bulk_export_file:rejected");
        return {
          content: [{ type: "text" as const, text: `Unknown connectionId: ${connectionId}` }],
          isError: true,
        };
      }
      try {
        const text = await client.downloadBulkExportFile(
          { type, url },
          { requiresAccessToken: requiresAccessToken ?? false },
        );
        await audit(correlationId, "download_bulk_export_file");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        await audit(correlationId, "download_bulk_export_file:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Download failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "cancel_bulk_export",
    {
      title: "Cancel a Bulk Data export",
      description: "Cancels an export the server hasn't finished yet, releasing its exportId.",
      inputSchema: cancelBulkExportInputSchema,
    },
    async ({ connectionId, exportId }) => {
      const { correlationId } = createEnvelope(exportId, "mcp:cancel_bulk_export");
      const client = connections.get(connectionId);
      const entry = bulkExports.get(exportId);
      if (!client || !entry || entry.connectionId !== connectionId) {
        await audit(correlationId, "cancel_bulk_export:rejected");
        return {
          content: [
            { type: "text" as const, text: `Unknown exportId for this connectionId: ${exportId}` },
          ],
          isError: true,
        };
      }
      try {
        await client.cancelBulkExport(entry.job);
        bulkExports.delete(exportId);
        await audit(correlationId, "cancel_bulk_export");
        return { content: [{ type: "text" as const, text: JSON.stringify({ cancelled: true }) }] };
      } catch (error) {
        await audit(correlationId, "cancel_bulk_export:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Cancel failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "send_message",
    {
      title: "Send an HL7v2 message over MLLP",
      description:
        "Sends a raw HL7v2 message over MLLP and waits for the receiving system's ACK/NACK. Retries on connection failure or timeout (default 3 attempts); does not retry on a received NACK — check the returned result's `acknowledged`/`code` fields.",
      inputSchema: sendMessageInputSchema,
    },
    async ({ host, port, message, timeoutMs, maxAttempts }) => {
      const { correlationId } = createEnvelope(message, "mcp:send_message");
      try {
        const result = await sendMllpMessage(message, {
          host,
          port,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          ...(maxAttempts !== undefined ? { maxAttempts } : {}),
        });
        await audit(correlationId, result.acknowledged ? "send_message" : "send_message:nacked");
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        await audit(correlationId, "send_message:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Send failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "run_pipeline",
    {
      title: "Start a pipeline from a YAML config",
      description:
        "Parses and starts a pipeline (ingest -> translate -> optional US Core validate -> deliver) from the same YAML shape the engine CLI accepts. Returns a pipelineId; the pipeline keeps running in this process after the call returns — call stop_pipeline to shut it down.",
      inputSchema: runPipelineInputSchema,
    },
    async ({ yamlConfig }) => {
      const { correlationId } = createEnvelope("run_pipeline", "mcp:run_pipeline");
      try {
        const config = loadPipelineConfig(yamlConfig);
        const running = await runPipeline(config, {
          auditSink,
          ...(defaultDeadLetterQueue !== undefined
            ? { deadLetterQueue: defaultDeadLetterQueue }
            : {}),
        });
        const pipelineId = randomUUID();
        pipelines.set(pipelineId, running);
        await audit(correlationId, "run_pipeline");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ pipelineId, address: running.address }, null, 2),
            },
          ],
        };
      } catch (error) {
        await audit(correlationId, "run_pipeline:rejected");
        return {
          content: [{ type: "text" as const, text: errorText(error, "Failed to start pipeline") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "stop_pipeline",
    {
      title: "Stop a running pipeline",
      description: "Stops a pipeline started by run_pipeline and releases its listener/watcher.",
      inputSchema: stopPipelineInputSchema,
    },
    async ({ pipelineId }) => {
      const { correlationId } = createEnvelope(pipelineId, "mcp:stop_pipeline");
      const running = pipelines.get(pipelineId);
      if (!running) {
        await audit(correlationId, "stop_pipeline:rejected");
        return {
          content: [{ type: "text" as const, text: `Unknown pipelineId: ${pipelineId}` }],
          isError: true,
        };
      }
      await running.stop();
      pipelines.delete(pipelineId);
      await audit(correlationId, "stop_pipeline");
      return { content: [{ type: "text" as const, text: JSON.stringify({ stopped: true }) }] };
    },
  );

  return server;
}
