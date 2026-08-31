# @interop-gateway/core

The pipeline engine behind [interop-gateway](https://github.com/heyitskundan/interop-gateway):
envelope/correlation-ID handling, stage interfaces, TLS enforcement, an encrypted-storage
wrapper, SMART-scope enforcement, a hash-chained audit log, structural HL7v2/CDA
validation, and the top-level `InteropGateway` API that connector/format packages plug
into.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source, or the CLI section below for running the compiled CLI directly.

```bash
npm install @interop-gateway/core
```

## Use

```js
// JavaScript
import { InteropGateway } from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [/* a format-* plugin */] });
const result = gateway.validate(hl7v2Message);
```

```ts
// TypeScript
import { InteropGateway, type StructuralValidationResult } from "@interop-gateway/core";

const gateway = new InteropGateway();
const result: StructuralValidationResult = gateway.validate(hl7v2Message);
```

## What's in this package

- `InteropGateway` — `translate()` (both directions: `{ from: FormatName, to: "fhir" }`
  and `{ from: "fhir", to: FormatName }`) and `validate()`. Connector read/write/search
  live in `connector-smart-generic`'s own `SmartClient` class instead — `InteropGateway`
  never grew `connect()`/`read()`/`write()`/`search()`/`send()` methods of its own.
- `enforceTls()` — every outbound connection in every connector/protocol package must
  route its target URL through this first.
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
- `SecretsProvider` — the interface every `secrets-*` package implements; `core` never
  stores a plaintext secret itself.
- `createEnvelope()`/`withPayload()`/`Envelope` — wraps a payload with a correlation ID,
  timestamp, and source label the moment it's ingested. `engine`/`mcp-server` use
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

Not yet published to npm — the `npx` command above will 404 until it is. Until then,
build it from the repo and run the compiled CLI directly:

```bash
npm run build -w packages/core
node packages/core/dist/cli.js validate <file>
```

Exits `0` if the input is a structurally valid HL7v2 message or C-CDA document, `1` if
it parses as one of those formats but fails a structural check, `2` on bad CLI usage.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
