import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { GatewayError, InteropGateway } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";
import { formatCda } from "@interop-gateway/format-cda";

const translateInputSchema = {
  format: z.enum(["hl7v2", "cda"]).describe("The input message's format"),
  payload: z.string().describe("The raw HL7v2 message text or C-CDA XML document"),
} satisfies ZodRawShape;

const validateInputSchema = {
  payload: z.string().describe("The raw HL7v2 message text or C-CDA XML document"),
} satisfies ZodRawShape;

/** Builds an MCP server exposing `translate` and `validate` over
 * `@interop-gateway/core`'s `InteropGateway`, with both `hl7v2` and `cda` format
 * plugins registered. Connect it to any MCP `Transport` (stdio for a real client,
 * `InMemoryTransport` for tests) via `server.connect(transport)`. */
export function createInteropGatewayMcpServer(): McpServer {
  const gateway = new InteropGateway({ formats: [formatHl7v2, formatCda] });
  const server = new McpServer({ name: "interop-gateway", version: "0.1.0" });

  server.registerTool(
    "translate",
    {
      title: "Translate a message to FHIR",
      description:
        "Translates a raw HL7v2 message or C-CDA XML document into a FHIR R4 Bundle (JSON).",
      inputSchema: translateInputSchema,
    },
    async ({ format, payload }) => {
      try {
        const fhir = gateway.translate(payload, { from: format, to: "fhir" });
        return { content: [{ type: "text" as const, text: JSON.stringify(fhir, null, 2) }] };
      } catch (error) {
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
      const result = gateway.validate(payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
