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
// this is how engine's handler threads one envelope through translate -> deliver.
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

      <h2 id="storage" className="mt-8">
        Encrypted storage
      </h2>
      <p style={muted}>
        <code>EncryptedStore</code> wraps any key/value <code>Store</code> (AES-256-GCM via Web
        Crypto) — the primitive to reach for if you're persisting anything yourself (a custom{" "}
        <code>AuditSink</code>, a cache). <code>engine</code>'s CLI wraps its own default on-disk
        audit log and dead-letter queue in this when a <code>persistence.*.encryptPassphrase</code>{" "}
        is set in a pipeline config — see the{" "}
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
        section below. Encryption itself is still opt-in (no passphrase, no encryption) — see{" "}
        <code>SECURITY.md</code> for the exact default.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { EncryptedStore, InMemoryStore, deriveKey } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node"; // Node-only — browser bundles never pull this in

const key = await deriveKey(passphrase, salt); // PBKDF2, 100k iterations, SHA-256
const store = new EncryptedStore(new FileStore("/var/interop-gateway/tokens"), key); // or InMemoryStore for tests

await store.set("token", new TextEncoder().encode(accessToken));
const raw = await store.get("token"); // Uint8Array | undefined, decrypted on read`}
      />
      <p style={muted}>
        <code>InMemoryStore</code> is the in-memory <code>Store</code> implementation (used by
        tests, and the default for anything that hasn't wired a real backend).{" "}
        <code>FileStore</code> (<code>@interop-gateway/core/node</code>) is the on-disk one — one
        file per key under a directory, key names base64url-encoded so no key can escape it — which
        <code>engine</code>'s <code>FileAuditLog</code>/<code>FileDeadLetterQueue</code> use by
        default. Implement <code>Store</code>'s three methods (<code>get</code>/<code>set</code>/
        <code>delete</code>) against Redis or a database to persist somewhere else instead.
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
        <code>HashChainedAuditLog</code> is the default <code>AuditSink</code> passed to{" "}
        <code>runPipeline()</code>/<code>createInteropGatewayMcpServer()</code> when called directly
        — append-only, in-memory, each entry's hash covers the previous entry's,{" "}
        <code>verify()</code> recomputes the chain to detect tampering. Refuses to accept an entry
        whose <code>correlationId</code>/<code>who</code>/<code>what</code>/
        <code>resourceType</code> matches an SSN, MRN-labeled identifier, email address, phone
        number, or bare 9-11 digit identifier shape — a backstop on top of those fields never
        carrying full message content, not a general PHI scrubber. <code>append()</code> clones the
        entry before storing it, so mutating the object you passed in afterward can't rewrite stored
        history.
      </p>
      <p style={muted}>
        <code>FileAuditLog</code> is the same log, persisted through a <code>Store</code> instead —{" "}
        <code>engine</code>'s CLI uses this by default (see the Packages page's <code>engine</code>{" "}
        entry). Wrap the backing <code>Store</code> in <code>EncryptedStore</code> above for
        encryption at rest.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { HashChainedAuditLog, FileAuditLog, type AuditEntry } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node";

const inMemory = new HashChainedAuditLog();
const persisted = new FileAuditLog(new FileStore("/var/interop-gateway/audit")); // survives a restart

const entry: AuditEntry = {
  correlationId: "…",
  who: "engine",
  what: "translate",
  when: new Date().toISOString(),
  resourceType: "Bundle", // never the resource content itself
};
await persisted.append(entry);

await persisted.list();          // Promise<ReadonlyArray<{ entry, hash }>> — async, unlike HashChainedAuditLog.list()
await persisted.verify();        // true — false if any entry/hash was tampered with, including between restarts`}
      />

      <h2 id="dead-letter" className="mt-8">
        Dead-letter queue and replay
      </h2>
      <p style={muted}>
        <code>DeadLetterQueue</code>/<code>FileDeadLetterQueue</code> live in{" "}
        <code>@interop-gateway/engine</code>, not <code>core</code> — a message that fails
        translation, US Core validation, routing, or delivery is retained (raw content, which stage
        failed, the error, an attempt count) in addition to being reported through the source's own
        failure channel as before. <code>engine</code>'s CLI wires one in by default;{" "}
        <code>runPipeline()</code> called directly leaves it <code>undefined</code> (nothing
        retained) unless you pass one in. This queue retains raw message content — unlike the audit
        log above, it is <strong>not</strong> PHI-redaction-checked; wrap its backing{" "}
        <code>Store</code> in <code>EncryptedStore</code> for at-rest protection instead.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { runPipeline, replayDeadLetters, FileDeadLetterQueue, loadPipelineConfig } from "@interop-gateway/engine";
import { FileStore } from "@interop-gateway/core/node";

const deadLetterQueue = new FileDeadLetterQueue(new FileStore("/var/interop-gateway/dead-letters"));
const config = loadPipelineConfig(yamlText);
const running = await runPipeline(config, { deadLetterQueue });

// later, after fixing whatever caused the failures:
const result = await replayDeadLetters(config, deadLetterQueue);
result; // { replayed, succeeded, failed } — a message that fails again stays queued with attempts incremented`}
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
        <code>SmartClient</code> is built from pieces also exported directly, for a custom connector
        variant instead of <code>SmartClient</code> as-is.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { fetchAccessToken, TokenManager, classifyWriteFailureStatus } from "@interop-gateway/connector-smart-generic";

// Run the backend-services token exchange standalone, without a SmartClient instance
const token = await fetchAccessToken(authConfig); // { accessToken, expiresAt, ... }

// The caching/auto-refresh wrapper SmartClient uses internally — re-runs client-credentials
// for backend-services auth, grant_type=refresh_token for authorization_code
const tokenManager = new TokenManager(authConfig, secretsProvider);
const cached = await tokenManager.getToken(); // reuses if >30s from expiry, else refreshes

// The same HTTP-status classification create/update/delete use internally
classifyWriteFailureStatus(409); // "CONFLICT"
classifyWriteFailureStatus(422); // "VALIDATION_FAILED"
classifyWriteFailureStatus(500); // "REQUEST_FAILED"`}
      />

      <h2 id="connector-authorize" className="mt-8">
        connector-smart-generic: interactive authorization_code + PKCE
      </h2>
      <p style={muted}>
        The pieces of the patient/clinician-facing SMART App Launch flow — this package builds the
        authorization URL and exchanges the returned code; the actual browser redirect and
        login/consent screen are inherently the caller's to drive, no server-side package can
        automate that step.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { generatePkce, buildAuthorizationUrl, exchangeAuthorizationCode, refreshAccessToken } from "@interop-gateway/connector-smart-generic";

// generatePkce() alone, if you want the raw verifier/challenge instead of a full request:
const { codeVerifier, codeChallenge } = await generatePkce(); // S256 — SHA-256 digest, base64url

// buildAuthorizationUrl() does this plus the rest of the redirect URL:
const { url, codeVerifier: cv, state } = await buildAuthorizationUrl({
  authorizeUrl, clientId, redirectUri, scope, aud, launch, // aud/launch: EHR-launch only
});

// After the redirect back with ?code=...&state=...:
const token = await exchangeAuthorizationCode({ tokenUrl, code, redirectUri, clientId, codeVerifier: cv });

// Refreshing later without repeating the redirect (needs offline_access in scope):
const refreshed = await refreshAccessToken({ tokenUrl, refreshToken: token.refreshToken!, clientId });`}
      />

      <h2 id="connector-bulk-export" className="mt-8">
        connector-smart-generic: Bulk Data ($export)
      </h2>
      <p style={muted}>
        System-, patient-, and group-level export per the{" "}
        <a href="https://hl7.org/fhir/uv/bulkdata/" target="_blank" rel="noreferrer">
          FHIR Bulk Data Access IG
        </a>{" "}
        — kick-off, async status polling (honoring <code>Retry-After</code>), and NDJSON output
        download, all as methods on <code>SmartClient</code>.
      </p>
      <CodeBlock
        lang="ts"
        code={`import { parseNdjson } from "@interop-gateway/connector-smart-generic";

const job = await client.startBulkExport({ level: "group", groupId: "cohort-1", types: ["Patient"] });
// job.statusUrl — the Content-Location the server returned

const completed = await client.pollBulkExportUntilComplete(job); // or poll checkBulkExportStatus() yourself
completed.output; // [{ type, url, count? }, ...]

for (const file of completed.output) {
  const ndjsonText = await client.downloadBulkExportFile(file, {
    requiresAccessToken: completed.requiresAccessToken, // per the IG — not every server needs a token on the file URL
  });
  const resources = parseNdjson(ndjsonText); // one parsed resource per line
}

await client.cancelBulkExport(job); // DELETE the job before it completes, if needed`}
      />
    </div>
  );
}
