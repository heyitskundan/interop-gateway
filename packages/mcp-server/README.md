# @interop-gateway/mcp-server

MCP tool surface over [interop-gateway](https://github.com/heyitskundan/interop-gateway)'s
`InteropGateway` translate/validate API — lets an MCP client (an AI assistant, an agent
framework) translate HL7v2/C-CDA into FHIR or check structural well-formedness, without
that client needing to know anything about either format.

## Install

```bash
npm install @interop-gateway/mcp-server
```

## Run as a standalone MCP server (stdio)

```bash
npx @interop-gateway/mcp-server
```

Point any MCP client at this command over stdio.

## Use programmatically

```ts
import { createInteropGatewayMcpServer } from "@interop-gateway/mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createInteropGatewayMcpServer();
await server.connect(new StdioServerTransport());
```

`createInteropGatewayMcpServer()` returns a plain `McpServer` from the official SDK —
connect it to any `Transport` (stdio, an `InMemoryTransport` in tests, or a custom one).

## Tools

- **`translate`** — `{ format: "hl7v2" | "cda", payload: string }` → the translated FHIR
  R4 Bundle as JSON text. On a translation failure, returns `isError: true` with the
  failure message as content instead of throwing.
- **`validate`** — `{ payload: string }` → a `StructuralValidationResult` (from
  `@interop-gateway/core`) as JSON text: whether the input is a structurally
  well-formed HL7v2 message or C-CDA document, and why not if it isn't.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
