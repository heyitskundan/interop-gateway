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
  deployment chooses to persist. Not used by any of the 13 packages today — `engine`'s
  and `mcp-server`'s audit entries go to an injectable `AuditSink` that defaults to an
  in-memory instance, and connector token caching goes through `SecretsProvider`
  instead. Wire your own persistence through `EncryptedStore` if you need it.
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
enforced everywhere, `EncryptedStore` as the primitive for anything a deployment
chooses to persist (not enforced automatically — see `SECURITY.md` for what's wired in
by default versus what you still have to plug in), and this package alone does not make
a deployment HIPAA- or SOC 2-compliant.

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
