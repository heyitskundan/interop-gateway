import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function ApiReference() {
  return (
    <div>
      <h1 className="mb-2">API Reference</h1>
      <p style={muted}>
        The surface below is spread across the 13 packages — see{" "}
        <code>@interop-gateway/&lt;package&gt;</code> in each import. Full signatures ship as{" "}
        <code>.d.ts</code> for both ESM and CJS builds.
      </p>

      <h2 id="core" className="mt-8">
        InteropGateway
      </h2>
      <p style={muted}>
        <code>@interop-gateway/core</code> — registers format plugins and exposes{" "}
        <code>translate()</code>/<code>validate()</code>, both directions. For{" "}
        <code>{'{ from: FormatName, to: "fhir" }'}</code>, <code>translate()</code> runs a
        structural check first (well-formed HL7v2/C-CDA) and throws <code>GatewayError</code> before
        ever touching a format plugin if that check fails. For{" "}
        <code>{'{ from: "fhir", to: FormatName }'}</code>, it parses <code>input</code> as JSON
        instead (throwing <code>GatewayError</code> with code <code>FHIR_INPUT_INVALID</code> if it
        isn't valid JSON) — structural validation doesn't apply to FHIR input.
      </p>
      <CodeBlock
        lang="ts"
        code={`class InteropGateway {
  constructor(options: { formats?: FormatPlugin[] });
  validate(input: string): StructuralValidationResult;
  translate(
    input: string,
    options: { from: FormatName; to: "fhir" } | { from: "fhir"; to: FormatName },
  ): unknown;
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
        <code>@interop-gateway/format-hl7v2</code> and <code>@interop-gateway/format-cda</code> each
        wrap a separately-published translator (<code>hl7-fhir-translator</code>,{" "}
        <code>cda-fhir-translator</code>) and normalize its errors to <code>GatewayError</code>.
        Both also export their own richer <code>translateToFhir</code>/
        <code>translateFromFhir</code> functions directly, returning the underlying package's
        field-level mapping trail — <code>InteropGateway.translate()</code> discards that trail for
        a uniform return type; call these directly if you need it (this demo's own Translator tab
        does).
      </p>
      <p className="text-sm font-medium mt-4 mb-1">format-hl7v2</p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { translateToFhir, translateFromFhir } from "@interop-gateway/format-hl7v2";

const result = translateToFhir(rawHl7v2Message);
result.translated;  // FHIR Bundle, JSON string
result.mappings;     // [{ source, target, value, note? }, ...]
result.warnings;     // string[] — segments/fields with no mapping

const back = translateFromFhir(result.translated);
back.translated;     // HL7v2 message string
back.mappings;
back.warnings;`,
          },
          {
            lang: "ts",
            code: `import {
  translateToFhir,
  translateFromFhir,
  type TranslationResult,
} from "@interop-gateway/format-hl7v2";

const result: TranslationResult = translateToFhir(rawHl7v2Message);
result.translated;  // FHIR Bundle, JSON string
result.mappings;     // [{ source, target, value, note? }, ...]
result.warnings;     // string[] — segments/fields with no mapping

const back: TranslationResult = translateFromFhir(result.translated);
back.translated;     // HL7v2 message string
back.mappings;
back.warnings;`,
          },
        ]}
      />

      <p className="text-sm font-medium mt-4 mb-1">format-cda</p>
      <p style={muted} className="text-sm mb-2">
        Different result shape — <code>bundle</code>/<code>xml</code> instead of a unified{" "}
        <code>translated</code> string, and <code>mappings</code>/<code>warnings</code> entries
        carry different fields (<code>cdaPath</code>/<code>fhirPath</code>/<code>resourceType</code>
        , <code>path</code>/<code>message</code>). This demo's own <code>client/src/api.ts</code>{" "}
        normalizes both packages' shapes into one display type — the two packages themselves don't
        share a result type.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { translateToFhir, translateFromFhir } from "@interop-gateway/format-cda";

const result = translateToFhir(rawCdaXml);
result.bundle;    // FHIR Bundle (JSON object, not a string)
result.mappings;  // [{ cdaPath, fhirPath, resourceType }, ...]
result.warnings;  // [{ path, message }, ...]

const back = translateFromFhir(result.bundle);
back.xml;         // C-CDA XML string
back.mappings;
back.warnings;`,
          },
          {
            lang: "ts",
            code: `import {
  translateToFhir,
  translateFromFhir,
  type TranslateResult,
  type TranslateToCdaResult,
} from "@interop-gateway/format-cda";

const result: TranslateResult = translateToFhir(rawCdaXml);
result.bundle;    // FHIR Bundle (JSON object, not a string)
result.mappings;  // [{ cdaPath, fhirPath, resourceType }, ...]
result.warnings;  // [{ path, message }, ...]

const back: TranslateToCdaResult = translateFromFhir(result.bundle);
back.xml;         // C-CDA XML string
back.mappings;
back.warnings;`,
          },
        ]}
      />

      <h2 id="protocols" className="mt-8">
        Protocol adapters
      </h2>
      <p style={muted}>
        Three transports, each with a receive side and a send side. None of them know what format is
        travelling over them.
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
        <code>@interop-gateway/connector-smart-generic</code> — OAuth2 client-credentials (
        <code>client_secret_post</code>) or backend-services (<code>private_key_jwt</code>, JWT
        assertion signed with <code>jose</code>), scope-checked read/search/write against a FHIR R4
        server. TLS-enforced on every call.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { SmartClient } from "@interop-gateway/connector-smart-generic";

const client = new SmartClient({
  baseUrl: "https://r4.smarthealthit.org",
  auth: { method: "client_secret_post", tokenUrl, clientId, clientSecret, scope: "system/*.read" },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
});

const patient = await client.read("Patient", "123");
const result = await client.create("Observation", newObservation); // { ok, status, resource } — never throws on a 4xx/5xx`,
          },
          {
            lang: "ts",
            code: `import { SmartClient, type SmartClientOptions } from "@interop-gateway/connector-smart-generic";

const options: SmartClientOptions = {
  baseUrl: "https://r4.smarthealthit.org",
  auth: { method: "client_secret_post", tokenUrl, clientId, clientSecret, scope: "system/*.read" },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
};
const client = new SmartClient(options);

const patient = await client.read("Patient", "123");
const result = await client.create("Observation", newObservation); // { ok, status, resource } — never throws on a 4xx/5xx`,
          },
        ]}
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
        <code>@interop-gateway/validate-us-core</code> — required-element checks for 15 resource
        types. Structural only, not a terminology-binding validator — see the package's own README
        for exactly what's covered. <code>InteropGateway.translate()</code> itself still doesn't
        call it — call it directly on <code>translate()</code>'s output, same as below — but{" "}
        <code>engine</code>'s pipeline runs it automatically when <code>validateProfile: true</code>{" "}
        is set in <code>PipelineConfig</code>, and <code>mcp-server</code> exposes it as its own{" "}
        <code>validateUsCore</code> tool.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { validateUsCore } from "@interop-gateway/validate-us-core";

const result = validateUsCore(patientResource);
result.supported; // false if this package has no rule table for the resourceType
result.valid;
result.issues;    // string[]`,
          },
          {
            lang: "ts",
            code: `import { validateUsCore, type UsCoreValidationResult } from "@interop-gateway/validate-us-core";

const result: UsCoreValidationResult = validateUsCore(patientResource);
result.supported; // false if this package has no rule table for the resourceType
result.valid;
result.issues;    // string[]`,
          },
        ]}
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
      <p style={muted}>
        Three separate binaries, one per concern. Running against an unreleased change instead of
        the published package? Build it from source (
        <code>npm run build -w packages/&lt;package&gt;</code>) and invoke{" "}
        <code>node packages/&lt;package&gt;/dist/cli.js</code> in place of the bare command below.
      </p>
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
