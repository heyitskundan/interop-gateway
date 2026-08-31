import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Mcp() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        MCP server
      </h1>
      <p style={muted}>
        <code>@interop-gateway/mcp-server</code> exposes interop-gateway as MCP tools, so an MCP
        client — an AI assistant, an agent framework — can translate HL7v2/C-CDA, check structural
        and US Core conformance, connect (backend-services or an interactive SMART App Launch) to
        and read/write a live FHIR R4 server, run a Bulk Data <code>$export</code>, send an HL7v2
        message over MLLP, and start/stop an <code>engine</code> pipeline, without needing to know
        anything about the underlying formats or protocols.
      </p>

      <h2 id="install" className="mt-8">
        1. Install
      </h2>

      <p className="text-sm font-medium mt-4 mb-1">Standalone (stdio)</p>
      <CodeBlock lang="bash" code="npx @interop-gateway/mcp-server" />

      <p className="text-sm font-medium mt-4 mb-1">Claude Code</p>
      <CodeBlock
        lang="bash"
        code="claude mcp add interop-gateway -- npx -y @interop-gateway/mcp-server"
      />

      <p className="text-sm font-medium mt-4 mb-1">Claude Desktop</p>
      <p style={muted} className="text-sm mb-2">
        Edit the config file (macOS:{" "}
        <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>) and restart
        the app:
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "mcpServers": {
    "interop-gateway": {
      "command": "npx",
      "args": ["-y", "@interop-gateway/mcp-server"]
    }
  }
}`}
      />

      <p style={muted} className="text-sm mt-4">
        Any other MCP client works the same way — run <code>npx @interop-gateway/mcp-server</code>{" "}
        over stdio as the command. Either client sees the same tools below once connected.
      </p>

      <h2 id="local" className="mt-8">
        2. Building from source (for contributing, or running an unreleased change)
      </h2>
      <p style={muted}>
        To run against a change that hasn't shipped to npm yet, clone the repo and build the package
        directly:
      </p>
      <CodeBlock
        lang="bash"
        code={`git clone https://github.com/heyitskundan/interop-gateway.git
cd interop-gateway
npm install
npm run build -w packages/mcp-server`}
      />
      <p style={muted}>
        This produces <code>packages/mcp-server/dist/cli.js</code>. Point a client at it the same
        way as above, swapping the command for the built file directly:
      </p>
      <CodeBlock
        lang="bash"
        code="claude mcp add interop-gateway -- node /absolute/path/to/interop-gateway/packages/mcp-server/dist/cli.js"
      />
      <p style={muted} className="text-sm">
        (Or <code>{'{ "command": "node", "args": ["/absolute/path/to/.../dist/cli.js"] }'}</code> in
        Claude Desktop's config, replacing the absolute path with wherever you cloned the repo.)
      </p>

      <h2 id="tools" className="mt-8">
        3. Tools
      </h2>
      <p style={muted}>
        <code>translate</code> — <code>{'{ format: "hl7v2" | "cda", payload: string }'}</code> → the
        translated FHIR R4 Bundle as JSON text. On a translation failure, returns{" "}
        <code>isError: true</code> with the failure message as content instead of throwing.
      </p>
      <p style={muted}>
        <code>validate</code> — <code>{"{ payload: string }"}</code> → a{" "}
        <code>StructuralValidationResult</code> as JSON text: whether the input is a structurally
        well-formed HL7v2 message or C-CDA document, and why not if it isn't.
      </p>
      <p style={muted}>
        <code>validateUsCore</code> — <code>{"{ payload: string }"}</code> (a FHIR resource or
        Bundle as a JSON string, typically <code>translate</code>'s own output) → a{" "}
        <code>UsCoreValidationResult</code> (single resource) or{" "}
        <code>UsCoreValidationResult[]</code> (Bundle) as JSON text. Structural required-element
        checks only, not a terminology-binding validator. Returns <code>isError: true</code> for
        non-JSON input instead of throwing.
      </p>
      <p style={muted} className="text-sm font-medium mt-6 mb-1">
        The tools above never leave the process. The ones below read/write a real FHIR server, send
        a real network message, or run a listening pipeline — a different trust boundary.
      </p>
      <p style={muted}>
        <code>connect_ehr</code> — <code>{"{ baseUrl, auth, scopes }"}</code> →{" "}
        <code>{"{ connectionId }"}</code>. Opens a scope-checked <code>SmartClient</code>{" "}
        (backend-services auth — <code>client_secret_post</code>/<code>private_key_jwt</code>) for{" "}
        <code>read_resource</code>/<code>write_resource</code>/<code>start_bulk_export</code> to
        reference. For the interactive, patient/clinician-facing SMART launch instead, use{" "}
        <code>start_smart_launch</code>/<code>complete_smart_launch</code> below. Makes no network
        call itself; <code>auth</code> travels as a tool argument, which most MCP clients
        display/log as part of showing what the tool was called with — only use this with a client
        you trust to handle that appropriately.
      </p>
      <p style={muted}>
        <code>start_smart_launch</code> —{" "}
        <code>
          {"{ authorizeUrl, tokenUrl, clientId, clientSecret?, redirectUri, scope, aud?, launch? }"}
        </code>{" "}
        → <code>{"{ url, state }"}</code>. Builds the SMART App Launch authorization URL (PKCE,{" "}
        <code>S256</code>). This tool cannot perform the browser redirect and login/consent itself —
        that's inherently outside any server-side tool call. The caller sends the user to{" "}
        <code>url</code> and captures the <code>code</code>/<code>state</code> the authorization
        server redirects back with, then calls <code>complete_smart_launch</code>. The PKCE{" "}
        <code>code_verifier</code> is held server-side (keyed by <code>state</code>), never returned
        here.
      </p>
      <p style={muted}>
        <code>complete_smart_launch</code> — <code>{"{ state, code, baseUrl, scopes }"}</code> →{" "}
        <code>{"{ connectionId, patient?, encounter? }"}</code>. Exchanges the code for a token and
        opens a connection with it — same shape <code>connect_ehr</code> returns. <code>state</code>{" "}
        is single-use.
      </p>
      <p style={muted}>
        <code>read_resource</code> —{" "}
        <code>{"{ connectionId, resourceType, id?, searchParams? }"}</code> → the resource (by{" "}
        <code>id</code>) or a search Bundle, as JSON. Scope-checked before any network call; the
        response contains real resource content.
      </p>
      <p style={muted}>
        <code>write_resource</code> —{" "}
        <code>
          {'{ connectionId, operation: "create"|"update"|"delete", resourceType, id?, resource? }'}
        </code>{" "}
        → a <code>WriteResult</code> as JSON. Never throws for a server-side rejection.
      </p>
      <p style={muted}>
        <code>start_bulk_export</code> —{" "}
        <code>
          {
            '{ connectionId, level: "system"|"patient"|"group", groupId?, types?, since?, typeFilter?, outputFormat? }'
          }
        </code>{" "}
        → <code>{"{ exportId }"}</code>. Kicks off a Bulk Data <code>$export</code>.
      </p>
      <p style={muted}>
        <code>check_bulk_export_status</code> — <code>{"{ connectionId, exportId }"}</code> → a{" "}
        <code>BulkExportStatus</code> as JSON — <code>"in-progress"</code>, <code>"completed"</code>{" "}
        (with the output file list), or <code>"error"</code>. One-shot; call again yourself until{" "}
        <code>"completed"</code>.
      </p>
      <p style={muted}>
        <code>download_bulk_export_file</code> —{" "}
        <code>{"{ connectionId, type, url, requiresAccessToken? }"}</code> → the raw NDJSON text of
        one output file. Files can be large — the full text comes back as the result.
      </p>
      <p style={muted}>
        <code>cancel_bulk_export</code> — <code>{"{ connectionId, exportId }"}</code> →{" "}
        <code>{"{ cancelled: true }"}</code>.
      </p>
      <p style={muted}>
        <code>send_message</code> —{" "}
        <code>{"{ host, port, message, timeoutMs?, maxAttempts? }"}</code> → an{" "}
        <code>MllpSendResult</code> as JSON. Plain, unencrypted MLLP — only send to a host reachable
        over a trusted network.
      </p>
      <p style={muted}>
        <code>run_pipeline</code> — <code>{"{ yamlConfig }"}</code> →{" "}
        <code>{"{ pipelineId, name, address }"}</code>. Starts an <code>engine</code> pipeline that
        keeps running after the call returns — call <code>stop_pipeline</code> or it leaks a
        listening port/watcher for the life of the process.
      </p>
      <p style={muted}>
        <code>stop_pipeline</code> — <code>{"{ pipelineId }"}</code> →{" "}
        <code>{"{ stopped: true }"}</code>.
      </p>
      <p style={muted} className="text-sm">
        Connections, running pipelines, running bulk exports, and in-flight SMART launches all live
        in memory, per server instance — not restored across a restart, and any id from one server
        instance is meaningless to another.
      </p>

      <h2 id="audit" className="mt-8">
        4. Correlation IDs and audit logging
      </h2>
      <p style={muted}>
        Every tool call gets a correlation ID (<code>@interop-gateway/core</code>'s{" "}
        <code>createEnvelope</code>) and writes an audit entry — <code>who</code>:{" "}
        <code>"mcp-server"</code>, <code>what</code> the tool name (suffixed <code>:rejected</code>{" "}
        on failure), <code>resourceType</code> when known — to a resolved <code>AuditSink</code>{" "}
        that{" "}
        <strong>
          defaults to a persisted, encrypted <code>FileAuditLog</code>
        </strong>{" "}
        (at <code>./mcp-server-audit</code>) — not an in-memory one. Persisting without a{" "}
        <code>persistence.audit.encryptPassphrase</code> throws unless you explicitly pass{" "}
        <code>allowUnencryptedPersistence: true</code>; pass <code>ephemeral: true</code> instead
        for tests/quick demos where in-memory-only is genuinely the point. See the package README's
        "Persistence" section for the full option set.
      </p>

      <h2 id="programmatic" className="mt-8">
        5. Embed it programmatically
      </h2>
      <p style={muted}>
        Skip the CLI and construct the server directly — useful for a custom transport or a shared,
        durable <code>AuditSink</code>:
      </p>
      <CodeBlock
        lang="ts"
        code={`import { createInteropGatewayMcpServer } from "@interop-gateway/mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Defaults to a FileAuditLog persisted at ./mcp-server-audit — set
// persistence.audit.encryptPassphrase or this throws (see section 4 above).
const server = await createInteropGatewayMcpServer({
  persistence: { audit: { encryptPassphrase: process.env.MCP_AUDIT_PASSPHRASE! } },
});
await server.connect(new StdioServerTransport());`}
      />
      <p style={muted}>
        <code>createInteropGatewayMcpServer()</code> returns a <code>Promise</code> of a plain{" "}
        <code>McpServer</code> from the official SDK (resolving the default audit sink is async) —
        connect it to any <code>Transport</code> (stdio, an <code>InMemoryTransport</code> in tests,
        or a custom one).
      </p>
    </div>
  );
}
