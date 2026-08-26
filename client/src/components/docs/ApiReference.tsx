import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function ApiReference() {
  return (
    <div>
      <h1 className="mb-2">API Reference</h1>
      <p style={muted}>
        The surface below is spread across the 13 packages — see{" "}
        <code>@interop-gateway/&lt;package&gt;</code> in each import. Full signatures ship
        as <code>.d.ts</code> for both ESM and CJS builds.
      </p>

      <h2 id="core" className="mt-8">
        InteropGateway
      </h2>
      <p style={muted}>
        <code>@interop-gateway/core</code> — registers format plugins and exposes{" "}
        <code>translate()</code>/<code>validate()</code>. <code>translate()</code> runs a
        structural check first (well-formed HL7v2/C-CDA) and throws{" "}
        <code>GatewayError</code> before ever touching a format plugin if that check fails.
      </p>
      <CodeBlock
        lang="ts"
        code={`class InteropGateway {
  constructor(options: { formats?: FormatPlugin[] });
  validate(input: string): StructuralValidationResult;
  translate(input: string, options: { from: FormatName; to: "fhir" }): unknown;
}

interface FormatPlugin {
  name: "hl7v2" | "cda";
  toFhir(input: string): unknown;
  fromFhir(bundle: unknown): string;
}`}
      />

      <h2 id="formats" className="mt-8">
        Format plugins
      </h2>
      <p style={muted}>
        <code>@interop-gateway/format-hl7v2</code> and <code>@interop-gateway/format-cda</code>{" "}
        each wrap a separately-published translator (<code>hl7-fhir-translator</code>,{" "}
        <code>cda-fhir-translator</code>) and normalize its errors to <code>GatewayError</code>.
        Both also export their own richer <code>translateToFhir</code>/<code>translateFromFhir</code>{" "}
        functions directly, returning the underlying package's field-level mapping trail —{" "}
        <code>InteropGateway.translate()</code> discards that trail for a uniform return
        type; call these directly if you need it (this demo's own Translator tab does).
      </p>
      <CodeBlock
        lang="js"
        code={`import { translateToFhir } from "@interop-gateway/format-hl7v2";

const result = translateToFhir(rawHl7v2Message);
result.translated;  // FHIR Bundle, JSON string
result.mappings;     // [{ source, target, value, note? }, ...]
result.warnings;     // string[] — segments/fields with no mapping`}
      />

      <h2 id="protocols" className="mt-8">
        Protocol adapters
      </h2>
      <p style={muted}>
        Three transports, each with a receive side and a send side. None of them know
        what format is travelling over them.
      </p>
      <CodeBlock
        lang="ts"
        code={`// protocol-mllp
class MllpServer { listen(port, host?); close(); address(); }
function sendMllpMessage(message, { host, port, timeoutMs?, maxAttempts? }): Promise<MllpSendResult>;

// protocol-http
class HttpIngestServer { listen(port, host?); close(); address(); }
function sendHttpMessage(message, { url, headers?, timeoutMs?, maxAttempts? }): Promise<HttpSendResult>;
// sendHttpMessage requires an https:// url — throws GatewayError immediately otherwise.

// protocol-file
class FileIngestWatcher { start(); stop(); }
function writeFileMessage(content, { directory, fileName? }): Promise<string>; // returns the written path`}
      />

      <h2 id="connector" className="mt-8">
        SMART on FHIR connector
      </h2>
      <p style={muted}>
        <code>@interop-gateway/connector-smart-generic</code> — OAuth2 client-credentials
        (<code>client_secret_post</code>) or backend-services (<code>private_key_jwt</code>,
        JWT assertion signed with <code>jose</code>), scope-checked read/search/write against
        a FHIR R4 server. TLS-enforced on every call.
      </p>
      <CodeBlock
        lang="js"
        code={`import { SmartClient } from "@interop-gateway/connector-smart-generic";

const client = new SmartClient({
  baseUrl: "https://r4.smarthealthit.org",
  auth: { method: "client_secret_post", tokenUrl, clientId, clientSecret, scope: "system/*.read" },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
});

const patient = await client.read("Patient", "123");
const result = await client.create("Observation", newObservation); // { ok, status, resource } — never throws on a 4xx/5xx`}
      />

      <h2 id="secrets" className="mt-8">
        Secrets providers
      </h2>
      <p style={muted}>
        One interface, three backends — pick per environment. All three implement{" "}
        <code>SecretsProvider</code> from <code>@interop-gateway/core</code>.
      </p>
      <CodeBlock
        lang="ts"
        code={`interface SecretsProvider {
  getSecret(ref: { name: string }): Promise<string>;
  setSecret(ref: { name: string }, value: string): Promise<void>;
  deleteSecret(ref: { name: string }): Promise<void>;
}

new KeychainSecretsProvider({ service? })        // from secrets-keychain — dev default, OS keychain
new VaultSecretsProvider({ vaultAddr, token, mount? })  // from secrets-vault — KV v2, https:// enforced
new AwsSecretsManagerProvider({ region, credentials })  // from secrets-aws — Secrets Manager, via aws4fetch`}
      />

      <h2 id="validate" className="mt-8">
        US Core validation
      </h2>
      <p style={muted}>
        <code>@interop-gateway/validate-us-core</code> — required-element checks for 15
        resource types. Structural only, not a terminology-binding validator — see the
        package's own README for exactly what's covered.
      </p>
      <CodeBlock
        lang="js"
        code={`import { validateUsCore } from "@interop-gateway/validate-us-core";

const result = validateUsCore(patientResource);
result.supported; // false if this package has no rule table for the resourceType
result.valid;
result.issues;    // string[]`}
      />

      <h2 id="errors" className="mt-8">
        Errors
      </h2>
      <table className="table mb-4">
        <thead>
          <tr>
            <th>Export</th>
            <th>Extends</th>
            <th>Thrown when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GatewayError</code>
            </td>
            <td className="text-muted">Error</td>
            <td className="text-muted">Base class — every other error extends this</td>
          </tr>
          <tr>
            <td>
              <code>ScopeError</code>
            </td>
            <td className="text-muted">GatewayError</td>
            <td className="text-muted">A SMART scope doesn't permit the attempted operation</td>
          </tr>
          <tr>
            <td>
              <code>TlsError</code>
            </td>
            <td className="text-muted">GatewayError</td>
            <td className="text-muted">A non-https URL is passed anywhere TLS is enforced</td>
          </tr>
          <tr>
            <td>
              <code>ValidationError</code>
            </td>
            <td className="text-muted">GatewayError</td>
            <td className="text-muted">Structural validation or engine config parsing fails</td>
          </tr>
        </tbody>
      </table>

      <h2 id="cli" className="mt-8">
        CLI reference
      </h2>
      <p style={muted}>Three separate binaries, one per concern:</p>
      <CodeBlock
        lang="bash"
        code={`interop-gateway validate <file>            # from @interop-gateway/core — structural check only
interop-gateway-engine run <pipeline.yaml>      # from @interop-gateway/engine — starts a pipeline
interop-gateway-engine validate <pipeline.yaml> # checks a pipeline config without running it
interop-gateway-mcp                             # from @interop-gateway/mcp-server — stdio MCP server`}
      />
    </div>
  );
}
