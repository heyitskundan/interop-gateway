import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Core() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        @interop-gateway/core
      </h1>
      <p style={muted}>
        All conversion functionality in one install: HL7v2 ↔ FHIR and C-CDA ↔ FHIR translation, US
        Core profile validation, and the shared primitives (envelope/ correlation-ID handling, TLS
        enforcement, an encrypted-storage wrapper, SMART-scope enforcement, a hash-chained audit
        log, structural HL7v2/CDA validation) that <code>protocol</code>/<code>secrets</code>/
        <code>connector</code>/<code>engine</code>/<code>mcp</code> build on. Nothing here requires
        the MCP SDK, AWS/Vault clients, or any other package — installing{" "}
        <code>@interop-gateway/core</code> alone never pulls those in.
      </p>

      <h2 id="install" className="mt-8">
        Install
      </h2>
      <CodeBlock lang="bash" code="npm install @interop-gateway/core" />

      <h2 id="translate" className="mt-8">
        Translate/validate through InteropGateway
      </h2>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { InteropGateway, formatHl7v2 } from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const result = gateway.translate(hl7v2Message, { from: "hl7v2", to: "fhir" });
result.value;     // the FHIR Bundle
result.mappings;  // field-level mapping trail
result.warnings;  // segments/fields with no mapping`,
          },
          {
            lang: "ts",
            code: `import {
  InteropGateway,
  formatHl7v2,
  type TranslateOptions,
  type TranslationOutcome,
} from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const options: TranslateOptions = { from: "hl7v2", to: "fhir" };
const result: TranslationOutcome = gateway.translate(hl7v2Message, options);
result.value;     // the FHIR Bundle
result.mappings;  // field-level mapping trail
result.warnings;  // segments/fields with no mapping`,
          },
        ]}
      />
      <p style={muted}>
        Swap in <code>formatCda</code> and <code>from: "cda"</code> for C-CDA XML — same call shape,
        same gateway instance can hold both. <code>InteropGateway.translate()</code> runs a
        structural check first (well-formed HL7v2/C-CDA) and throws <code>GatewayError</code> before
        ever touching a format plugin if that check fails. <code>result.mappings</code>/
        <code>result.warnings</code> keep whatever shape the registered format plugin produces
        (HL7v2 and C-CDA mapping trails carry different fields) — only the outer{" "}
        <code>{"{ value, mappings, warnings }"}</code> envelope is uniform across formats.
      </p>

      <h2 id="translators" className="mt-8">
        Translators directly
      </h2>
      <p style={muted}>
        Both translators export their own functions too, for the properly-typed per-format result (
        <code>TranslationResult</code>'s <code>Mapping[]</code>, <code>TranslateResult</code>'s{" "}
        <code>MappingTraceEntry[]</code>) instead of <code>InteropGateway.translate()</code>'s
        format-agnostic <code>readonly unknown[]</code>. Aliased here since both wrap packages that
        otherwise export the same names (<code>translateToFhir</code>/<code>translateFromFhir</code>
        ):
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { translateHl7v2ToFhir, translateFhirToHl7v2 } from "@interop-gateway/core";

const result = translateHl7v2ToFhir(rawHl7v2Message);
result.translated;  // FHIR Bundle, JSON string
result.mappings;     // [{ source, target, value, note? }, ...]
result.warnings;     // string[] — segments/fields with no mapping`,
          },
          {
            lang: "ts",
            code: `import {
  translateHl7v2ToFhir,
  type TranslationResult,
} from "@interop-gateway/core";

const result: TranslationResult = translateHl7v2ToFhir(rawHl7v2Message);
result.translated;  // FHIR Bundle, JSON string
result.mappings;     // [{ source, target, value, note? }, ...]
result.warnings;     // string[] — segments/fields with no mapping`,
          },
        ]}
      />
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { translateCdaToFhir, translateFhirToCda } from "@interop-gateway/core";

const result = translateCdaToFhir(rawCdaXml);
result.bundle;    // FHIR Bundle (JSON object, not a string)
result.mappings;  // [{ cdaPath, fhirPath, resourceType }, ...]
result.warnings;  // [{ path, message }, ...]`,
          },
          {
            lang: "ts",
            code: `import {
  translateCdaToFhir,
  type TranslateResult,
} from "@interop-gateway/core";

const result: TranslateResult = translateCdaToFhir(rawCdaXml);
result.bundle;    // FHIR Bundle (JSON object, not a string)
result.mappings;  // [{ cdaPath, fhirPath, resourceType }, ...]
result.warnings;  // [{ path, message }, ...]`,
          },
        ]}
      />

      <h2 id="validate" className="mt-8">
        US Core validation
      </h2>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { validateUsCore } from "@interop-gateway/core";

const result = validateUsCore(patientResource);
result.supported; // false if there's no rule table for the resourceType
result.valid;
result.issues;    // string[]`,
          },
          {
            lang: "ts",
            code: `import { validateUsCore, type UsCoreValidationResult } from "@interop-gateway/core";

const result: UsCoreValidationResult = validateUsCore(patientResource);
result.supported; // false if there's no rule table for the resourceType
result.valid;
result.issues;    // string[]`,
          },
        ]}
      />
      <p style={muted}>
        Required-element presence, max-cardinality shape, and fixed-code-value binding checks for 15
        built-in US Core profiles, plus whatever a caller registers via{" "}
        <code>registerProfile()</code>/<code>unregisterProfile()</code> — the rule table isn't a
        closed hardcoded set. Not a terminology-binding validator for external code systems
        (LOINC/SNOMED/RxNorm) — a resource can pass every check here and still fail a real
        conformance validator (like the official FHIR validator with the US Core IG loaded) on
        terminology grounds. Wired into <code>engine</code> as the opt-in{" "}
        <code>validateProfile: true</code> pipeline config flag, and into <code>mcp</code> as its
        own <code>validateUsCore</code> tool.
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
        variants={[
          {
            lang: "js",
            code: `import { createEnvelope, withPayload } from "@interop-gateway/core";

const envelope = createEnvelope(rawMessage, "mllp");
envelope.correlationId; // crypto.randomUUID()
envelope.receivedAt;    // ISO timestamp
envelope.source;        // "mllp" — whatever label you passed
envelope.payload;       // rawMessage

// Swap the payload while keeping the same correlationId/receivedAt/source —
// this is how engine's handler threads one envelope through translate -> deliver.
const translated = withPayload(envelope, fhirBundle);`,
          },
          {
            lang: "ts",
            code: `import { createEnvelope, withPayload, type Envelope } from "@interop-gateway/core";

const envelope: Envelope<string> = createEnvelope(rawMessage, "mllp");
envelope.correlationId; // crypto.randomUUID()
envelope.receivedAt;    // ISO timestamp
envelope.source;        // "mllp" — whatever label you passed
envelope.payload;       // rawMessage

// Swap the payload while keeping the same correlationId/receivedAt/source —
// this is how engine's handler threads one envelope through translate -> deliver.
const translated: Envelope<unknown> = withPayload(envelope, fhirBundle);`,
          },
        ]}
      />
      <p style={muted}>
        This is how <code>engine</code> and <code>mcp</code> get a correlation ID for every
        message/call — see the audit log section below for where it ends up.
      </p>

      <h2 id="storage" className="mt-8">
        Encrypted storage
      </h2>
      <p style={muted}>
        <code>EncryptedStore</code> wraps any key/value <code>Store</code> (AES-256-GCM via Web
        Crypto) — the primitive to reach for if you're persisting anything yourself (a custom{" "}
        <code>AuditSink</code>, a cache). <code>engine</code>'s CLI wraps its own default on-disk
        audit log and dead-letter queue in this when a <code>persistence.*.encryptPassphrase</code>{" "}
        is set — encryption itself is opt-in (no passphrase, no encryption) unless the caller
        explicitly accepts plaintext via <code>allowUnencryptedPersistence: true</code> — see{" "}
        <code>SECURITY.md</code> for the exact default.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { EncryptedStore, InMemoryStore, deriveKey } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node"; // Node-only — browser bundles never pull this in

const key = await deriveKey(passphrase, salt); // PBKDF2, 100k iterations, SHA-256
const store = new EncryptedStore(new FileStore("/var/interop-gateway/tokens"), key); // or InMemoryStore for tests

await store.set("token", new TextEncoder().encode(accessToken));
const raw = await store.get("token"); // Uint8Array | undefined, decrypted on read`,
          },
          {
            lang: "ts",
            code: `import { EncryptedStore, InMemoryStore, deriveKey, type Store } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node"; // Node-only — browser bundles never pull this in

const key = await deriveKey(passphrase, salt); // PBKDF2, 100k iterations, SHA-256
const store: Store = new EncryptedStore(new FileStore("/var/interop-gateway/tokens"), key); // or InMemoryStore for tests

await store.set("token", new TextEncoder().encode(accessToken));
const raw = await store.get("token"); // Uint8Array | undefined, decrypted on read`,
          },
        ]}
      />
      <p style={muted}>
        <code>InMemoryStore</code> is the in-memory <code>Store</code> implementation (used by
        tests, and the default for anything that hasn't wired a real backend).{" "}
        <code>FileStore</code> (<code>@interop-gateway/core/node</code>) is the on-disk one — one
        file per key under a directory, key names base64url-encoded so no key can escape it — which{" "}
        <code>engine</code>'s <code>FileAuditLog</code>/<code>FileDeadLetterQueue</code> use by
        default.
      </p>

      <h2 id="scope" className="mt-8">
        Scope enforcement
      </h2>
      <p style={muted}>
        <code>ScopeSet</code> is what <code>SmartClient</code> checks before every read/write/search
        — reusable standalone if you're enforcing SMART scopes outside the connector.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { ScopeSet } from "@interop-gateway/core";

const scopes = [{ resourceType: "Patient", operations: ["read", "search"] }];
const scopeSet = new ScopeSet(scopes);

scopeSet.permits("read", "Patient");   // true
scopeSet.permits("write", "Patient");  // false
scopeSet.assert("write", "Patient");   // throws ScopeError`,
          },
          {
            lang: "ts",
            code: `import { ScopeSet, type GrantedScope } from "@interop-gateway/core";

const scopes: GrantedScope[] = [{ resourceType: "Patient", operations: ["read", "search"] }];
const scopeSet = new ScopeSet(scopes);

scopeSet.permits("read", "Patient");   // true
scopeSet.permits("write", "Patient");  // false
scopeSet.assert("write", "Patient");   // throws ScopeError`,
          },
        ]}
      />

      <h2 id="tls" className="mt-8">
        TLS enforcement
      </h2>
      <p style={muted}>
        <code>enforceTls()</code> is the single check every outbound connection in this SDK routes
        through — <code>SmartClient</code>, <code>sendHttpMessage</code>, every <code>secrets</code>{" "}
        provider's network calls (except <code>AwsSecretsManagerProvider</code>, which hardcodes an{" "}
        <code>https://</code> endpoint by construction instead).
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { enforceTls } from "@interop-gateway/core";

enforceTls("https://ehr.example.org/fhir"); // returns a parsed URL
enforceTls("http://ehr.example.org/fhir");  // throws TlsError immediately, no request sent`,
          },
          {
            lang: "ts",
            code: `import { enforceTls } from "@interop-gateway/core";

enforceTls("https://ehr.example.org/fhir"); // returns a parsed URL
enforceTls("http://ehr.example.org/fhir");  // throws TlsError immediately, no request sent`,
          },
        ]}
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
        <code>engine</code>'s CLI uses this by default. Wrap the backing <code>Store</code> in{" "}
        <code>EncryptedStore</code> above for encryption at rest.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { HashChainedAuditLog, FileAuditLog } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node";

const inMemory = new HashChainedAuditLog();
const persisted = new FileAuditLog(new FileStore("/var/interop-gateway/audit")); // survives a restart

const entry = {
  correlationId: "…",
  who: "engine",
  what: "translate",
  when: new Date().toISOString(),
  resourceType: "Bundle", // never the resource content itself
};
await persisted.append(entry);

await persisted.list();          // Promise<ReadonlyArray<{ entry, hash }>> — async, unlike HashChainedAuditLog.list()
await persisted.verify();        // true — false if any entry/hash was tampered with, including between restarts`,
          },
          {
            lang: "ts",
            code: `import { HashChainedAuditLog, FileAuditLog, type AuditEntry } from "@interop-gateway/core";
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
await persisted.verify();        // true — false if any entry/hash was tampered with, including between restarts`,
          },
        ]}
      />

      <h2 id="secrets-guard" className="mt-8">
        Raw-credential guard
      </h2>
      <p style={muted}>
        <code>assertNotRawCredential()</code> throws if a value looks like a PEM private key or an
        AWS access key ID — a guard against accidentally passing a real secret somewhere only a{" "}
        <code>SecretsProvider</code> reference belongs.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { assertNotRawCredential } from "@interop-gateway/core";

assertNotRawCredential(privateKeyJwk.d, "auth.privateKey"); // throws if it looks like a raw PEM/AWS key`,
          },
          {
            lang: "ts",
            code: `import { assertNotRawCredential } from "@interop-gateway/core";

assertNotRawCredential(privateKeyJwk.d, "auth.privateKey"); // throws if it looks like a raw PEM/AWS key`,
          },
        ]}
      />

      <h2 id="cli" className="mt-8">
        CLI
      </h2>
      <CodeBlock lang="bash" code="npx interop-gateway validate <file>" />
      <p style={muted}>
        Exits <code>0</code> if the input is a structurally valid HL7v2 message or C-CDA document,{" "}
        <code>1</code> if it parses as one of those formats but fails a structural check,{" "}
        <code>2</code> on bad CLI usage.
      </p>
    </div>
  );
}
