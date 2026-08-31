# @interop-gateway/mcp-server

MCP tool surface over [interop-gateway](https://github.com/heyitskundan/interop-gateway)'s
`InteropGateway` translate/validate API — lets an MCP client (an AI assistant, an agent
framework) translate HL7v2/C-CDA into FHIR, check structural well-formedness, or check US
Core profile conformance, without that client needing to know anything about either
format.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source, or "Running from a local build" below for running the compiled server
directly.

```bash
npm install @interop-gateway/mcp-server
```

## Run as a standalone MCP server (stdio)

```bash
npx @interop-gateway/mcp-server
```

Point any MCP client at this command over stdio.

## Running from a local build (not yet published to npm)

`@interop-gateway/mcp-server` isn't on the npm registry yet — the `npx` command above
will 404 until it is. Until then, build it from this repo and point a client at the
built file directly:

```bash
git clone https://github.com/heyitskundan/interop-gateway.git
cd interop-gateway
npm install
npm run build -w packages/mcp-server
```

**Claude Code:**

```bash
claude mcp add interop-gateway -- node /absolute/path/to/interop-gateway/packages/mcp-server/dist/cli.js
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "interop-gateway": {
      "command": "node",
      "args": ["/absolute/path/to/interop-gateway/packages/mcp-server/dist/cli.js"]
    }
  }
}
```

Either way, the client sees the same three tools listed below once connected.

## Use programmatically

```ts
import { createInteropGatewayMcpServer } from "@interop-gateway/mcp-server";
import { HashChainedAuditLog } from "@interop-gateway/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const auditSink = new HashChainedAuditLog(); // optional — omit for a private default
const server = createInteropGatewayMcpServer({ auditSink });
await server.connect(new StdioServerTransport());
```

`createInteropGatewayMcpServer()` returns a plain `McpServer` from the official SDK —
connect it to any `Transport` (stdio, an `InMemoryTransport` in tests, or a custom one).
Every tool call gets a correlation ID (`@interop-gateway/core`'s `createEnvelope`) and
writes an audit entry to `auditSink` — `who: "mcp-server"`, `what` the tool name
(suffixed `:rejected` on failure), `resourceType` when known.

## Tools

- **`translate`** — `{ format: "hl7v2" | "cda", payload: string }` → the translated FHIR
  R4 Bundle as JSON text. On a translation failure, returns `isError: true` with the
  failure message as content instead of throwing.
- **`validate`** — `{ payload: string }` → a `StructuralValidationResult` (from
  `@interop-gateway/core`) as JSON text: whether the input is a structurally
  well-formed HL7v2 message or C-CDA document, and why not if it isn't.
- **`validateUsCore`** — `{ payload: string }` (a FHIR resource or Bundle as a JSON
  string, typically `translate`'s own output) → a `UsCoreValidationResult` (single
  resource) or `UsCoreValidationResult[]` (Bundle) from `@interop-gateway/validate-us-core`
  as JSON text. Structural required-element checks only, not a terminology-binding
  validator. Returns `isError: true` for non-JSON input instead of throwing.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
