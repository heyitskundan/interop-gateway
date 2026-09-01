# @interop-gateway/core

All conversion functionality for [interop-gateway](https://github.com/heyitskundan/interop-gateway)
in one install: HL7v2 ↔ FHIR and C-CDA ↔ FHIR translation, US Core profile validation,
and the shared primitives (envelope/correlation-ID handling, TLS enforcement, an
encrypted-storage wrapper, SMART-scope enforcement, a hash-chained audit log, structural
HL7v2/CDA validation) that `connector`/`protocol`/`secrets`/`engine`/`mcp` build on.
Nothing here requires the MCP SDK, AWS/Vault clients, or any other package — installing
`@interop-gateway/core` alone never pulls those in.

## Install

```bash
npm install @interop-gateway/core
```

## Use — translate/validate through InteropGateway

```js
// JavaScript
import { InteropGateway, formatHl7v2 } from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const result = gateway.translate(hl7v2Message, { from: "hl7v2", to: "fhir" });
result.value; // the FHIR Bundle
result.mappings; // field-level mapping trail
result.warnings; // segments/fields with no mapping
```

```ts
// TypeScript
import { InteropGateway, formatHl7v2, type TranslateOptions } from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const options: TranslateOptions = { from: "hl7v2", to: "fhir" };
const result = gateway.translate(hl7v2Message, options);
result.value; // the FHIR Bundle
result.mappings; // field-level mapping trail
result.warnings; // segments/fields with no mapping
```

Swap in `formatCda` and `from: "cda"` for C-CDA XML — same call shape, same gateway
instance can hold both.

## Use — translators directly

Both translators export their own functions too, for the properly-typed per-format
result (`TranslationResult`'s `Mapping[]`, `TranslateResult`'s `MappingTraceEntry[]`)
instead of `InteropGateway.translate()`'s format-agnostic `readonly unknown[]`. Aliased
here since both wrap packages that otherwise export the same names
(`translateToFhir`/`translateFromFhir`):

```ts
import { translateHl7v2ToFhir, translateFhirToHl7v2 } from "@interop-gateway/core";

const result = translateHl7v2ToFhir(rawHl7v2Message);
result.translated; // FHIR Bundle, JSON string
result.mappings; // [{ source, target, value, note? }, ...]
result.warnings; // string[] — segments/fields with no mapping
```

```ts
import { translateCdaToFhir, translateFhirToCda } from "@interop-gateway/core";

const result = translateCdaToFhir(rawCdaXml);
result.bundle; // FHIR Bundle (JSON object, not a string)
result.mappings; // [{ cdaPath, fhirPath, resourceType }, ...]
result.warnings; // [{ path, message }, ...]
```

## Use — US Core validation

```ts
import { validateUsCore, type UsCoreValidationResult } from "@interop-gateway/core";

const result: UsCoreValidationResult = validateUsCore(patientResource);
result.supported; // false if there's no rule table for the resourceType
result.valid;
result.issues; // string[]
```

Required-element presence, max-cardinality shape, and fixed-code-value binding checks
for 15 built-in US Core profiles, plus whatever a caller registers via
`registerProfile()`/`unregisterProfile()`. Not a terminology-binding validator for
external code systems (LOINC/SNOMED/RxNorm) — a resource can pass every check here and
still fail a real conformance validator (like the official FHIR validator with the US
Core IG loaded) on terminology grounds.

## What's in this package

- `InteropGateway` — `translate()` (both directions: `{ from: FormatName, to: "fhir" }`
  and `{ from: "fhir", to: FormatName }`) and `validate()`. Connector read/write/search
  live in `@interop-gateway/connector`'s own `SmartClient` class instead —
  `InteropGateway` never grew `connect()`/`read()`/`write()`/`search()`/`send()` methods
  of its own.
- `translateHl7v2ToFhir()`/`translateFhirToHl7v2()`/`formatHl7v2` — wraps the published
  [`hl7-fhir-translator`](https://github.com/heyitskundan/hl7-fhir-translator) package.
- `translateCdaToFhir()`/`translateFhirToCda()`/`formatCda` — wraps the published
  [`cda-fhir-translator`](https://github.com/heyitskundan/cda-fhir-translator) package.
- `validateUsCore()`/`validateUsCoreBundle()`/`registerProfile()` — US Core profile
  validation, see above.
- `enforceTls()` — every outbound connection in `connector`/`protocol` routes its target
  URL through this first.
- `EncryptedStore` — AES-256-GCM wrapper around any key/value `Store`, for anything a
  deployment chooses to persist. `engine`'s CLI wraps its default on-disk audit log and
  dead-letter queue in this when `persistence.*.encryptPassphrase` is set in a pipeline
  config; connector token caching still goes through `SecretsProvider` instead, not this.
- `FileStore` (`@interop-gateway/core/node` — a separate, Node-only entry point so a
  browser bundle importing the main `@interop-gateway/core` export never pulls in
  `node:fs`/`node:path`) — the on-disk `Store` implementation `engine`'s `FileAuditLog`
  and `FileDeadLetterQueue` use by default; one file per key under a directory, key
  names base64url-encoded so no key can escape it.
- `ScopeSet` — checks a SMART on FHIR token's granted scopes before a request is made,
  rather than trusting the server to reject an out-of-scope call.
- `HashChainedAuditLog` — append-only, tamper-evident, in-memory audit log that refuses
  to accept an entry whose `correlationId`/`who`/`what`/`resourceType` matches an
  SSN, MRN-labeled identifier, email address, phone number, or bare 9-11 digit
  identifier shape. `append()` clones the entry before storing it, so mutating the
  object you passed in afterward can't rewrite stored history.
- `FileAuditLog` — same hash-chained log and PHI check as `HashChainedAuditLog`, but
  persisted through a `Store` (so it survives a restart, and — wrapped in
  `EncryptedStore` — is encrypted at rest) instead of held only in process memory.
- `SecretsProvider` — the interface `@interop-gateway/secrets`'s providers implement;
  `core` never stores a plaintext secret itself.
- `createEnvelope()`/`withPayload()`/`Envelope` — wraps a payload with a correlation ID,
  timestamp, and source label the moment it's ingested. `engine`/`mcp` use
  `createEnvelope()` directly; `withPayload()` (swap the payload, keep the same
  correlation ID) has no consumer in this monorepo yet.
- `InMemoryStore` — the reference `Store` implementation (used by tests and by anything
  that hasn't wired a real backend), implementing `EncryptedStore`'s three-method
  `Store` interface (`get`/`set`/`delete`) over a `Map`.
- `deriveKey()` — derives the `CryptoKey` `EncryptedStore` needs, from a passphrase and
  salt via PBKDF2 (100,000 iterations, SHA-256).
- `assertNotRawCredential()` — throws if a string looks like a PEM private key or an AWS
  access key ID, as a guard against passing a real secret somewhere only a
  `SecretsProvider` reference belongs.
- `validateStructural()` — the first-pass structural check (well-formed HL7v2/CDA) that
  runs before translation.

## PHI handling and compliance

See the root [SECURITY.md](https://github.com/heyitskundan/interop-gateway/blob/main/SECURITY.md)
for the full model. In short: no PHI in logs/errors (paths only, never values), TLS
enforced everywhere, `EncryptedStore` as the primitive for anything a deployment
chooses to persist — `engine`'s CLI wires it in by default for the audit log and
dead-letter queue when a passphrase is configured, encryption itself stays opt-in — and
this package alone does not make a deployment HIPAA- or SOC 2-compliant.

## CLI

```bash
npx interop-gateway validate <file>
```

Exits `0` if the input is a structurally valid HL7v2 message or C-CDA document, `1` if
it parses as one of those formats but fails a structural check, `2` on bad CLI usage.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
