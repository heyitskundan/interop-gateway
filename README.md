# interop-gateway

A TypeScript SDK for two problems healthtech integrations always hit separately:
connecting to a live hospital system over SMART on FHIR, and translating between
old-style HL7v2/CDA messages and modern FHIR — `InteropGateway`'s `translate()`/
`validate()` for the format side, `SmartClient`'s `read()`/`write()`/`search()` for live
connectivity, instead of ten different libraries for auth, format parsing, and delivery.

Six packages, each independently installable, with real npm `dependencies` declared
between them wherever one genuinely needs another — install only what you need.
Installing `@interop-gateway/core` alone never pulls in the MCP SDK, Vault client, or
AWS SDK:

| Package                                                        | What it does                                                                                                                               | Depends on                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| [`@interop-gateway/core`](./packages/core/README.md)           | HL7v2/CDA ↔ FHIR translation, US Core validation, and shared primitives (audit log, encrypted storage, scope enforcement, TLS enforcement) | —                                         |
| [`@interop-gateway/protocol`](./packages/protocol/README.md)   | MLLP, HTTP, and file/SFTP ingest/delivery adapters                                                                                         | `core`                                    |
| [`@interop-gateway/secrets`](./packages/secrets/README.md)     | `SecretsProvider` implementations — OS keychain, HashiCorp Vault, AWS Secrets Manager                                                      | `core`                                    |
| [`@interop-gateway/connector`](./packages/connector/README.md) | Vendor-agnostic SMART on FHIR connector — backend-services and `authorization_code`+PKCE auth, read/write/search, Bulk Data `$export`      | `core`                                    |
| [`@interop-gateway/engine`](./packages/engine/README.md)       | Deployable pipeline runtime — YAML config, persistence, audit log, CLI                                                                     | `core`, `protocol`                        |
| [`@interop-gateway/mcp`](./packages/mcp/README.md)             | MCP tool surface over the same scope-checked, audit-logged API                                                                             | `core`, `protocol`, `connector`, `engine` |

## PHI handling and compliance — read before you deploy this

This package supports building a HIPAA/SOC 2-compliant system. **It is not itself a HIPAA
or SOC 2 certification.** Those are properties of an organization's overall practices —
risk assessments, signed Business Associate Agreements with every vendor/hospital it
connects to, employee policies, and (for SOC 2) a third-party audit over time. Using this
library does not by itself make your deployment compliant.

What the library does concretely: enforces TLS everywhere; writes a tamper-evident audit
entry for every `engine`/`mcp` call, persisted to disk by default and refusing to
persist unencrypted unless you explicitly set `allowUnencryptedPersistence: true` (opt
into `ephemeral: true` instead for tests/quick demos, where in-memory-only is the point)
— the same rule applies to a dead-letter queue once you configure one; checks SMART
scopes before every read/write; never logs a PHI value (structural/shape info and
FHIR/HL7 paths only); and never stores a plaintext secret — see `SECURITY.md` for the
full model, including what's a real default versus what's a pluggable interface you
still have to wire up yourself.

## Vendor access — this package is plumbing, not a permission broker

Connecting to a real hospital's live system is a two-tier process between **you** (the
deploying organization) and the EHR vendor/hospital — this package is never a party to
that relationship. You register your own app with each vendor (Epic, Cerner, etc.) and get
your own client ID; each hospital independently activates it, runs its own security
review, and signs its own BAA with you. For development and demos, this package targets
the free, open sandboxes (SMART Health IT reference sandbox, Epic's open.epic) that don't
require any of that.

## Install

**Not yet published to npm** — the `@interop-gateway` scope 404s on the registry today.
The commands below will work once publishing happens; until then, build from source:

```bash
git clone https://github.com/heyitskundan/interop-gateway.git
cd interop-gateway
npm install
npm run build   # every package, in dependency order, + client
```

Then `npm link` the package(s) you need into your own project. Once published:

```bash
npm install @interop-gateway/core          # translation + validation only
npm install @interop-gateway/core @interop-gateway/connector   # + live FHIR connectivity
npm install @interop-gateway/mcp           # the MCP server, transitively pulls core/protocol/connector/engine
```

## Quick start

```js
// JavaScript
import { InteropGateway, formatHl7v2 } from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const bundle = gateway.translate(hl7v2Message, { from: "hl7v2", to: "fhir" });
```

```ts
// TypeScript
import { InteropGateway, formatHl7v2, type TranslateOptions } from "@interop-gateway/core";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const options: TranslateOptions = { from: "hl7v2", to: "fhir" };
const bundle = gateway.translate(hl7v2Message, options);
```

```ts
// Live SMART on FHIR connectivity — separate package, only installed if needed
import { SmartClient } from "@interop-gateway/connector";

const client = new SmartClient({ baseUrl, auth });
const patient = await client.read("Patient", patientId);
```

## Working on this repo

```bash
git clone https://github.com/heyitskundan/interop-gateway.git
cd interop-gateway
npm install
npm test
npm run build
npm run dev   # browser demo at http://localhost:5173
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) — read the PHI/credentials section first.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
