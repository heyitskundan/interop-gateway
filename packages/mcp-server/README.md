# @interop-gateway/mcp-server

MCP tool surface over [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
lets an MCP client (an AI assistant, an agent framework) translate HL7v2/C-CDA, check
structural and US Core conformance, connect (backend-services or an interactive SMART
App Launch) to and read/write a live FHIR R4 server, run a Bulk Data `$export`, send an
HL7v2 message over MLLP, and start/stop an `engine` pipeline — all through tool calls,
without the client needing to know anything about the underlying formats or protocols.

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

Either way, the client sees the same tools listed below once connected.

## Use programmatically

```ts
import { createInteropGatewayMcpServer } from "@interop-gateway/mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Defaults to a FileAuditLog persisted at ./mcp-server-audit — set
// persistence.audit.encryptPassphrase or this throws (see "Persistence" below).
const server = await createInteropGatewayMcpServer({
  persistence: { audit: { encryptPassphrase: process.env.MCP_AUDIT_PASSPHRASE! } },
});
await server.connect(new StdioServerTransport());
```

`createInteropGatewayMcpServer()` returns a plain `McpServer` from the official SDK
wrapped in a `Promise` (resolving the default audit sink is async) — connect it to any
`Transport` (stdio, an `InMemoryTransport` in tests, or a custom one). Every tool call
gets a correlation ID (`@interop-gateway/core`'s `createEnvelope`) and writes an audit
entry to the resolved `auditSink` — `who: "mcp-server"`, `what` the tool name (suffixed
`:rejected` on failure), `resourceType` when known. `run_pipeline` passes this same
`auditSink` through to every pipeline it starts, so a pipeline's own `translate`/
`deliver` events land in this log too, rather than each pipeline silently keeping its
own separate one.

### Persistence

Same rules as `@interop-gateway/engine`'s `runPipeline()` — persistence is the default,
encryption is required unless you explicitly opt out:

```ts
// Default: FileAuditLog at ./mcp-server-audit, throws without a passphrase
await createInteropGatewayMcpServer({
  persistence: { audit: { encryptPassphrase: "..." } },
});

// A custom directory, and a dead-letter queue for run_pipeline's pipelines
// (deadLetterQueue stays opt-in — omit persistence.deadLetter for none, same as engine)
await createInteropGatewayMcpServer({
  persistence: {
    audit: { directory: "/var/mcp-server/audit", encryptPassphrase: "..." },
    deadLetter: { directory: "/var/mcp-server/dead-letters", encryptPassphrase: "..." },
  },
});

// Explicitly accept plaintext-on-disk instead of encrypting
await createInteropGatewayMcpServer({ allowUnencryptedPersistence: true });

// Tests/quick demos — in-memory only, the old default, no dead-letter queue either
await createInteropGatewayMcpServer({ ephemeral: true });

// Bring your own AuditSink/DeadLetterQueue directly — bypasses all of the above
import { HashChainedAuditLog } from "@interop-gateway/core";
await createInteropGatewayMcpServer({ auditSink: new HashChainedAuditLog() });
```

## Tools

**Static — never leave the process:**

- **`translate`** — `{ format: "hl7v2" | "cda", payload: string }` → the translated FHIR
  R4 Bundle as JSON text. On a translation failure, returns `isError: true` with the
  failure message as content instead of throwing.
- **`validate`** — `{ payload: string }` → a `StructuralValidationResult` (from
  `@interop-gateway/core`) as JSON text: whether the input is a structurally
  well-formed HL7v2 message or C-CDA document, and why not if it isn't.
- **`validateUsCore`** — `{ payload: string }` (a FHIR resource or Bundle as a JSON
  string, typically `translate`'s own output) → a `UsCoreValidationResult` (single
  resource) or `UsCoreValidationResult[]` (Bundle) from `@interop-gateway/validate-us-core`
  as JSON text. Required-element presence, max-cardinality shape, and fixed-code-value
  binding for `status`/`intent`/`lifecycleStatus` fields — not a terminology-binding
  validator for external code systems (LOINC/SNOMED/RxNorm). Returns `isError: true`
  for non-JSON input instead of throwing.

**Live — read/write a real FHIR server, send a real network message, or run a
listening pipeline. A different trust boundary than the tools above.**

- **`connect_ehr`** — `{ baseUrl: string, auth: AuthConfig, scopes: GrantedScope[] }` →
  `{ connectionId }`. Opens a scope-checked `SmartClient` for backend-services auth
  (`client_secret_post` or `private_key_jwt`) for `read_resource`/`write_resource`/
  `start_bulk_export` to reference. For the interactive, patient/clinician-facing SMART
  launch instead, use `start_smart_launch`/`complete_smart_launch` below — the
  underlying `connector-smart-generic` package supports both auth methods;
  `connect_ehr` itself only accepts the backend-services shape. Makes no network call
  itself; `auth` travels as a tool argument, which most MCP clients display/log as part
  of showing what the tool was called with — a materially different exposure than using
  `SmartClient` directly in your own process. Only use this with a client you trust to
  handle the resulting call log appropriately.
- **`start_smart_launch`** — `{ authorizeUrl, tokenUrl, clientId, clientSecret?,
redirectUri, scope, aud?, launch? }` → `{ url, state }`. Builds the SMART App Launch
  authorization URL (PKCE, `S256`) and returns it plus a `state` token. This tool
  cannot perform the browser redirect and login/consent itself — that's inherently
  outside what any server-side tool call can do. The caller is responsible for sending
  the user to `url` and capturing the `code`/`state` the authorization server redirects
  back with, then calling `complete_smart_launch`. The PKCE `code_verifier` is held
  server-side (keyed by `state`, in memory, per server instance), never returned here.
- **`complete_smart_launch`** — `{ state, code, baseUrl, scopes }` → `{ connectionId,
patient?, encounter? }`. Exchanges the authorization `code` for a token (using the
  `code_verifier` held against `state`) and opens a connection with it, same shape
  `connect_ehr` returns — `read_resource`/`write_resource`/`start_bulk_export` work
  unchanged afterward. `state` is single-use, removed from memory on this call whether
  it succeeds or fails.
- **`read_resource`** — `{ connectionId, resourceType, id? , searchParams? }` → the
  resource (by `id`) or a search Bundle (`searchParams`, omit `id`) as JSON. Scope-checked
  before any network call; the response contains real resource content.
- **`write_resource`** — `{ connectionId, operation: "create"|"update"|"delete",
resourceType, id?, resource? }` → a `WriteResult`
  (`{ ok: true, status, resource }` or `{ ok: false, status, code, path, issues }`) as
  JSON. Never throws for a server-side rejection.
- **`start_bulk_export`** — `{ connectionId, level: "system"|"patient"|"group",
groupId?, types?, since?, typeFilter?, outputFormat? }` → `{ exportId }`. Kicks off a
  Bulk Data `$export` per the [Bulk Data Access IG](https://hl7.org/fhir/uv/bulkdata/).
- **`check_bulk_export_status`** — `{ connectionId, exportId }` → a `BulkExportStatus`
  as JSON: `{status:"in-progress",progress?,retryAfterSeconds?}`,
  `{status:"completed",transactionTime,output,requiresAccessToken,...}`, or
  `{status:"error",issues}`. One-shot — call it again yourself until `"completed"`.
- **`download_bulk_export_file`** — `{ connectionId, type, url, requiresAccessToken? }`
  → the raw NDJSON text of one output file from a completed export (pass
  `requiresAccessToken` straight from that same completed status). Files can be
  large — the full text comes back as this tool's result.
- **`cancel_bulk_export`** — `{ connectionId, exportId }` → `{ cancelled: true }`.
  Cancels an export the server hasn't finished yet.
- **`send_message`** — `{ host, port, message, timeoutMs?, maxAttempts? }` → an
  `MllpSendResult` as JSON. Sends raw HL7v2 over plain, unencrypted MLLP — only send to
  a host reachable over a trusted network.
- **`run_pipeline`** — `{ yamlConfig }` → `{ pipelineId, name, address }`. Parses and
  starts an `engine` pipeline (the same YAML shape its CLI accepts), sharing this
  server's resolved `auditSink`/`deadLetterQueue` (see "Persistence" above) — both
  follow the same persisted-and-encrypted-by-default rule the server itself does. The
  pipeline keeps running (a listening MLLP/HTTP server, or a file watcher) after this
  call returns — call `stop_pipeline` explicitly or it leaks a listening port/watcher
  for the life of the process.
- **`stop_pipeline`** — `{ pipelineId }` → `{ stopped: true }`. Stops a pipeline started
  by `run_pipeline` and releases its `pipelineId`.

Connections and running pipelines live in memory, per server instance — not restored
across a process restart, and a `connectionId`/`pipelineId` from one server instance is
meaningless to another.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
