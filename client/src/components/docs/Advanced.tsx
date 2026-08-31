import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Advanced() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        Advanced
      </h1>
      <p style={muted}>
        Lower-level building blocks from <code>@interop-gateway/core</code> and{" "}
        <code>connector-smart-generic</code> — used internally by <code>engine</code>,{" "}
        <code>mcp-server</code>, and <code>SmartClient</code>, and exported directly for anyone
        composing a custom pipeline or connector instead of using those as-is.
      </p>

      <h2 id="envelope" className="mt-8">
        Envelopes and correlation IDs
      </h2>
      <p style={muted}>
        <code>createEnvelope()</code> wraps a payload with a correlation ID the moment it's
        ingested, so every downstream step — translation, delivery, an audit entry, a failure — can
        be tied back to the same originating message.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { createEnvelope, withPayload, type Envelope } from "@interop-gateway/core";

const envelope: Envelope<string> = createEnvelope(rawMessage, "mllp");
envelope.correlationId; // crypto.randomUUID()
envelope.receivedAt;    // ISO timestamp
envelope.source;        // "mllp" — whatever label you passed
envelope.payload;       // rawMessage

// Swap the payload while keeping the same correlationId/receivedAt/source —
// this is how a Stage thread the same envelope through translate -> deliver.
const translated: Envelope<unknown> = withPayload(envelope, fhirBundle);`}
      />
      <p style={muted}>
        This is how <code>engine</code> and <code>mcp-server</code> get a correlation ID for every
        message/call — see the{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById("audit")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          audit log
        </a>{" "}
        below for where it ends up.
      </p>

      <h2 id="pipeline" className="mt-8">
        Composable pipelines
      </h2>
      <p style={muted}>
        <code>Pipeline</code>/<code>Stage</code> are the composable abstraction for chaining
        envelope-in, envelope-out steps.{" "}
        <strong>Not currently used by any of the 13 packages</strong> — <code>engine</code>'s
        pipeline is hand-rolled sequential logic that predates this, not built out of{" "}
        <code>Stage</code>s. Exported and tested in <code>core</code>'s own suite; genuinely usable
        today if you want the composition pattern for your own pipeline.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { Pipeline, createEnvelope, type Stage } from "@interop-gateway/core";

const translateStage: Stage<string, unknown> = {
  name: "translate",
  async run(envelope) {
    return { ...envelope, payload: gateway.translate(envelope.payload, { from: "hl7v2", to: "fhir" }) };
  },
};

const pipeline = new Pipeline([translateStage /* , deliverStage, ... */]);
const result = await pipeline.run(createEnvelope(rawMessage, "custom-source"));`}
      />

      <h2 id="storage" className="mt-8">
        Encrypted storage
      </h2>
      <p style={muted}>
        <code>EncryptedStore</code> wraps any key/value <code>Store</code> (AES-256-GCM via Web
        Crypto) — the primitive to reach for if you're persisting anything yourself (a custom{" "}
        <code>AuditSink</code>, a cache). Not applied automatically to anything — see{" "}
        <code>SECURITY.md</code> for exactly what is and isn't encrypted by default today.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { EncryptedStore, InMemoryStore, deriveKey } from "@interop-gateway/core";

const key = await deriveKey(passphrase, salt); // PBKDF2, 100k iterations, SHA-256
const store = new EncryptedStore(new InMemoryStore(), key); // swap in your own Store backend

await store.set("token", new TextEncoder().encode(accessToken));
const raw = await store.get("token"); // Uint8Array | undefined, decrypted on read`}
      />
      <p style={muted}>
        <code>InMemoryStore</code> is the reference <code>Store</code> implementation (used by
        tests, and by anything that hasn't wired a real backend yet) — implement <code>Store</code>
        's three methods (<code>get</code>/<code>set</code>/<code>delete</code>) against a real
        backend (Redis, a database, disk) to persist for real.
      </p>

      <h2 id="scope" className="mt-8">
        Scope enforcement
      </h2>
      <p style={muted}>
        <code>ScopeSet</code> is what <code>SmartClient</code> checks before every read/write/search
        — reusable standalone if you're enforcing SMART scopes outside the connector.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { ScopeSet, type GrantedScope } from "@interop-gateway/core";

const scopes: GrantedScope[] = [{ resourceType: "Patient", operations: ["read", "search"] }];
const scopeSet = new ScopeSet(scopes);

scopeSet.permits("read", "Patient");   // true
scopeSet.permits("write", "Patient");  // false
scopeSet.assert("write", "Patient");   // throws ScopeError`}
      />

      <h2 id="tls" className="mt-8">
        TLS enforcement
      </h2>
      <p style={muted}>
        <code>enforceTls()</code> is the single check every outbound connection in this SDK routes
        through — <code>SmartClient</code>, <code>sendHttpMessage</code>, every{" "}
        <code>secrets-*</code> provider's network calls (except <code>secrets-aws</code>, which
        hardcodes an <code>https://</code> endpoint by construction instead).
      </p>
      <CodeBlock
        lang="ts"
        code={`import { enforceTls } from "@interop-gateway/core";

enforceTls("https://ehr.example.org/fhir"); // returns a parsed URL
enforceTls("http://ehr.example.org/fhir");  // throws TlsError immediately, no request sent`}
      />

      <h2 id="audit" className="mt-8">
        Tamper-evident audit log
      </h2>
      <p style={muted}>
        <code>HashChainedAuditLog</code> is the default <code>AuditSink</code> for{" "}
        <code>engine</code> and <code>mcp-server</code> — append-only, each entry's hash covers the
        previous entry's, <code>verify()</code> recomputes the chain to detect tampering. Refuses to
        accept an entry whose serialized form matches an SSN- or MRN-shaped pattern. In-memory by
        default — implement <code>AuditSink</code> (one method, <code>append()</code>) backed by{" "}
        <code>EncryptedStore</code> above for durable, encrypted storage.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { HashChainedAuditLog, type AuditEntry } from "@interop-gateway/core";

const auditLog = new HashChainedAuditLog();

const entry: AuditEntry = {
  correlationId: "…",
  who: "engine",
  what: "translate",
  when: new Date().toISOString(),
  resourceType: "Bundle", // never the resource content itself
};
await auditLog.append(entry);

auditLog.list();          // ReadonlyArray<{ entry, hash }>
await auditLog.verify();  // true — false if any entry/hash was tampered with`}
      />

      <h2 id="secrets-guard" className="mt-8">
        Raw-credential guard
      </h2>
      <p style={muted}>
        <code>assertNotRawCredential()</code> throws if a value looks like a PEM private key or an
        AWS access key ID — a guard against accidentally passing a real secret somewhere only a{" "}
        <code>SecretsProvider</code> reference belongs (the same check{" "}
        <code>connector-smart-generic</code>'s docs reference for backend-services auth).
      </p>
      <CodeBlock
        lang="ts"
        code={`import { assertNotRawCredential } from "@interop-gateway/core";

assertNotRawCredential(privateKeyJwk.d, "auth.privateKey"); // throws if it looks like a raw PEM/AWS key`}
      />

      <h2 id="connector-internals" className="mt-8">
        connector-smart-generic internals
      </h2>
      <p style={muted}>
        <code>SmartClient</code> is built from three pieces also exported directly, for a custom
        connector variant instead of <code>SmartClient</code> as-is.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { fetchAccessToken, TokenManager, classifyWriteFailureStatus } from "@interop-gateway/connector-smart-generic";

// Run the token exchange standalone, without a SmartClient instance
const token = await fetchAccessToken(authConfig); // { accessToken, expiresAt, ... }

// The caching/auto-refresh wrapper SmartClient uses internally
const tokenManager = new TokenManager(authConfig, secretsProvider);
const cached = await tokenManager.getToken(); // reuses if >30s from expiry, else refreshes

// The same HTTP-status classification create/update/delete use internally
classifyWriteFailureStatus(409); // "CONFLICT"
classifyWriteFailureStatus(422); // "VALIDATION_FAILED"
classifyWriteFailureStatus(500); // "REQUEST_FAILED"`}
      />
    </div>
  );
}
