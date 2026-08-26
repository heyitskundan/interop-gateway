export function Changelog() {
  return (
    <div>
      <h1 className="mb-2">Changelog</h1>
      <p className="mb-8" style={{ opacity: 0.85 }}>
        See <code>CHANGELOG.md</code> in the repo for the source of this page.
      </p>

      <div className="flex flex-col gap-6">
        <div id="v0-4-0" className="border-t pt-3" style={{ borderColor: "var(--color-divider)" }}>
          <div className="mb-2 flex items-baseline gap-3">
            <h3 className="m-0">v0.4.0</h3>
            <span className="text-muted text-sm">current</span>
          </div>
          <div className="mb-2 flex gap-2">
            <span className="tag tag-accent">Added</span>
          </div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5" style={{ opacity: 0.85 }}>
            <li>
              Full plumbing coverage — every package named in the README's table now exists
              and passes: <code>protocol-http</code>, <code>protocol-file</code>,{" "}
              <code>secrets-vault</code>, <code>secrets-aws</code>,{" "}
              <code>validate-us-core</code>, <code>engine</code>, <code>mcp-server</code>
            </li>
            <li>
              <code>protocol-http</code>: <code>HttpIngestServer</code> + TLS-enforced{" "}
              <code>sendHttpMessage</code>, retries on network failure only
            </li>
            <li>
              <code>protocol-file</code>: <code>FileIngestWatcher</code> (processed/error
              routing) + atomic <code>writeFileMessage</code>
            </li>
            <li>
              <code>secrets-vault</code> (Vault KV v2 over plain <code>fetch</code>) and{" "}
              <code>secrets-aws</code> (AWS Secrets Manager via <code>aws4fetch</code>)
            </li>
            <li>
              <code>validate-us-core</code>: required-element checks for 15 US Core
              profiles, explicitly scoped and documented
            </li>
            <li>
              <code>engine</code>: YAML pipeline runtime (mllp/http/file → hl7v2/cda →
              http/file), CLI, Dockerfile
            </li>
            <li>
              <code>mcp-server</code>: MCP tool surface (<code>translate</code>,{" "}
              <code>validate</code>) over <code>InteropGateway</code>
            </li>
            <li>
              <code>client</code>: the browser demo now covers both formats, both
              directions, a field-mapping trail, and a full docs site
            </li>
          </ul>
        </div>

        <div id="v0-3-0" className="border-t pt-3" style={{ borderColor: "var(--color-divider)" }}>
          <div className="mb-2 flex items-baseline gap-3">
            <h3 className="m-0">v0.3.0</h3>
          </div>
          <div className="mb-2 flex gap-2">
            <span className="tag tag-accent">Added</span>
          </div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5" style={{ opacity: 0.85 }}>
            <li>
              <code>connector-smart-generic</code>: full CRUD write support —{" "}
              <code>create()</code>/<code>update()</code>/<code>delete()</code>, each
              returning a <code>WriteResult</code> instead of throwing on a server-side
              rejection; <code>writeBatch()</code> for running several operations
            </li>
            <li>
              <code>protocol-mllp</code>: MLLP receive and send, with ACK/NACK and
              retry-on-timeout — tested against real TCP connections, no mocking
            </li>
          </ul>
        </div>

        <div id="v0-2-0" className="border-t pt-3" style={{ borderColor: "var(--color-divider)" }}>
          <div className="mb-2 flex items-baseline gap-3">
            <h3 className="m-0">v0.2.0</h3>
          </div>
          <div className="mb-2 flex gap-2">
            <span className="tag tag-accent">Added</span>
          </div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5" style={{ opacity: 0.85 }}>
            <li>
              <code>connector-smart-generic</code>: vendor-agnostic SMART on FHIR
              connector — OAuth2 client-credentials or backend-services{" "}
              <code>private_key_jwt</code>, token caching with automatic refresh,
              scope-checked <code>read()</code>/<code>search()</code>
            </li>
            <li>
              The browser demo intentionally does not wire up this connector — the
              backend-services flow needs a private key or client secret, a
              server-side-only credential type with no safe place in client-side JS
            </li>
          </ul>
        </div>

        <div id="v0-1-0" className="border-t pt-3" style={{ borderColor: "var(--color-divider)" }}>
          <div className="mb-2 flex items-baseline gap-3">
            <h3 className="m-0">v0.1.0</h3>
          </div>
          <div className="mb-2 flex gap-2">
            <span className="tag tag-accent">Added</span>
          </div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5" style={{ opacity: 0.85 }}>
            <li>
              Repo scaffolding: npm workspace monorepo, CI (lint/build/typecheck/test/audit),
              weekly security-audit workflow, GitHub Pages demo deploy, PHI-hardened
              CONTRIBUTING/SECURITY docs, pre-commit secret/PHI scanner, Apache-2.0 license
            </li>
            <li>
              <code>core</code>: pipeline envelope/correlation-ID, TLS enforcement,{" "}
              <code>EncryptedStore</code> (AES-256-GCM), <code>ScopeSet</code>,{" "}
              <code>HashChainedAuditLog</code>, the <code>SecretsProvider</code> interface,
              structural HL7v2/CDA validation, <code>InteropGateway</code>
            </li>
            <li>
              <code>secrets-keychain</code>: <code>SecretsProvider</code> backed by the OS
              keychain — the dev-only default
            </li>
            <li>
              <code>format-hl7v2</code> and <code>format-cda</code>: <code>FormatPlugin</code>{" "}
              wrapping the published translator packages, both directions
            </li>
            <li>
              <code>client</code>: minimal browser demo — paste an HL7v2 message, translate
              it locally in-browser
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
