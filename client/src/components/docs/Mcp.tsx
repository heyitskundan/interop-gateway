import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Mcp() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        MCP server
      </h1>
      <p style={muted}>
        <code>@interop-gateway/mcp-server</code> exposes <code>InteropGateway</code>'s
        translate/validate API as MCP tools, so an MCP client — an AI assistant, an agent framework
        — can translate HL7v2/C-CDA into FHIR, check structural well-formedness, or check US Core
        profile conformance, without that client needing to know anything about either format.
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
        over stdio as the command. Either client sees the same three tools below once connected.
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

      <h2 id="audit" className="mt-8">
        4. Correlation IDs and audit logging
      </h2>
      <p style={muted}>
        Every tool call gets a correlation ID (<code>@interop-gateway/core</code>'s{" "}
        <code>createEnvelope</code>) and writes an audit entry — <code>who</code>:{" "}
        <code>"mcp-server"</code>, <code>what</code> the tool name (suffixed <code>:rejected</code>{" "}
        on failure), <code>resourceType</code> when known — to an injectable <code>AuditSink</code>{" "}
        that defaults to an in-memory <code>HashChainedAuditLog</code>. Both run paths above use
        that default, which is lost on restart; embed the server programmatically if you need a
        durable, encrypted audit trail.
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
import { HashChainedAuditLog } from "@interop-gateway/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const auditSink = new HashChainedAuditLog(); // optional — omit for a private default
const server = createInteropGatewayMcpServer({ auditSink });
await server.connect(new StdioServerTransport());`}
      />
      <p style={muted}>
        <code>createInteropGatewayMcpServer()</code> returns a plain <code>McpServer</code> from the
        official SDK — connect it to any <code>Transport</code> (stdio, an{" "}
        <code>InMemoryTransport</code> in tests, or a custom one).
      </p>
    </div>
  );
}
