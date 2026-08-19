# @interop-gateway/core

The pipeline engine behind [interop-gateway](https://github.com/heyitskundan/interop-gateway):
envelope/correlation-ID handling, stage interfaces, TLS enforcement, an encrypted-storage
wrapper, SMART-scope enforcement, a hash-chained audit log, structural HL7v2/CDA
validation, and the top-level `InteropGateway` API that connector/format packages plug
into.

## Install

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

- `InteropGateway` — the top-level `translate()`/`validate()` entry point; connector
  methods (`connect`/`read`/`write`/`search`/`send`) land here as their packages ship.
- `enforceTls()` — every outbound connection in every connector/protocol package must
  route its target URL through this first.
- `EncryptedStore` — AES-256-GCM wrapper around any key/value `Store`; the DLQ, audit
  log, and cached tokens are required to go through it, not write to a backend directly.
- `ScopeSet` — checks a SMART on FHIR token's granted scopes before a request is made,
  rather than trusting the server to reject an out-of-scope call.
- `HashChainedAuditLog` — append-only, tamper-evident audit log that refuses to accept
  an entry containing a PHI-shaped value.
- `SecretsProvider` — the interface every `secrets-*` package implements; `core` never
  stores a plaintext secret itself.
- `validateStructural()` — the first-pass structural check (well-formed HL7v2/CDA) that
  runs before translation.

## PHI handling and compliance

See the root [SECURITY.md](https://github.com/heyitskundan/interop-gateway/blob/main/SECURITY.md)
for the full model. In short: no PHI in logs/errors (paths only, never values), TLS
enforced everywhere, everything persisted is encrypted at rest, and this package alone
does not make a deployment HIPAA- or SOC 2-compliant.

## CLI

```bash
npx interop-gateway validate <file>
```

Exits `0` if the input is a structurally valid HL7v2 message or C-CDA document, `1` if
it parses as one of those formats but fails a structural check, `2` on bad CLI usage.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
