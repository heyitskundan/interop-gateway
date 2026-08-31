import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import {
  GatewayError,
  InteropGateway,
  createEnvelope,
  HashChainedAuditLog,
  type AuditSink,
} from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";
import { formatCda } from "@interop-gateway/format-cda";
import { validateUsCore, validateUsCoreBundle } from "@interop-gateway/validate-us-core";

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

export interface CreateInteropGatewayMcpServerOptions {
  /** Where per-call audit entries are written — `who` is `"mcp-server"`, `what` is the
   * tool name (optionally suffixed `:rejected`), `resourceType` is the translated
   * resource's `resourceType` when known. Defaults to a fresh `HashChainedAuditLog()`
   * private to this server instance; pass one in to inspect entries after a call or to
   * share a sink across multiple servers. */
  readonly auditSink?: AuditSink;
}

/** Builds an MCP server exposing `translate`, `validate`, and `validateUsCore` over
 * `@interop-gateway/core`'s `InteropGateway`, with both `hl7v2` and `cda` format
 * plugins registered. Connect it to any MCP `Transport` (stdio for a real client,
 * `InMemoryTransport` for tests) via `server.connect(transport)`. */
export function createInteropGatewayMcpServer(
  options: CreateInteropGatewayMcpServerOptions = {},
): McpServer {
  const gateway = new InteropGateway({ formats: [formatHl7v2, formatCda] });
  const auditSink = options.auditSink ?? new HashChainedAuditLog();
  const server = new McpServer({ name: "interop-gateway", version: "1.0.0" });

  const audit = (correlationId: string, what: string, resourceType?: string): Promise<void> =>
    auditSink.append({
      correlationId,
      who: "mcp-server",
      what,
      when: new Date().toISOString(),
      ...(resourceType !== undefined ? { resourceType } : {}),
    });

  server.registerTool(
    "translate",
    {
      title: "Translate a message to FHIR",
      description:
        "Translates a raw HL7v2 message or C-CDA XML document into a FHIR R4 Bundle (JSON).",
      inputSchema: translateInputSchema,
    },
    async ({ format, payload }) => {
      const { correlationId } = createEnvelope(payload, "mcp-server:translate");
      try {
        const fhir = gateway.translate(payload, { from: format, to: "fhir" });
        const resourceType = (fhir as { resourceType?: string } | null)?.resourceType;
        await audit(correlationId, "translate", resourceType);
        return { content: [{ type: "text" as const, text: JSON.stringify(fhir, null, 2) }] };
      } catch (error) {
        await audit(correlationId, "translate:rejected");
        const message = error instanceof GatewayError ? error.message : "Translation failed";
        return { content: [{ type: "text" as const, text: message }], isError: true };
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
      const { correlationId } = createEnvelope(payload, "mcp-server:validate");
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
      const { correlationId } = createEnvelope(payload, "mcp-server:validateUsCore");

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

  return server;
}
