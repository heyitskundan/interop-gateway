# interop-gateway

A single TypeScript SDK for two problems healthtech integrations always hit separately:
connecting to a live hospital system over SMART on FHIR, and translating between
old-style HL7v2/CDA messages and modern FHIR. One `connect()`/`read()`/`write()`/
`send()`/`translate()`/`validate()` API instead of ten different libraries for auth,
format parsing, and delivery.

See [`docs/architecture.md`](./docs/architecture.md) for the package graph, data flow,
and security model as actually built.

## Packages

| Package                                    | What it does                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `@interop-gateway/core`                    | Pipeline engine — stage interfaces, correlation IDs, audit hook, secrets-provider interface, scope enforcement |
| `@interop-gateway/connector-smart-generic` | Vendor-agnostic SMART on FHIR connector (OAuth2, read/write/search/$export)                                    |
| `@interop-gateway/protocol-mllp`           | MLLP receive + send with ACK/NACK                                                                              |
| `@interop-gateway/protocol-http`           | HTTP ingest/delivery adapter                                                                                   |
| `@interop-gateway/protocol-file`           | File/SFTP ingest/delivery adapter                                                                              |
| `@interop-gateway/format-hl7v2`            | HL7v2 ↔ FHIR, wrapping [`hl7-fhir-translator`](https://github.com/heyitskundan/hl7-fhir-translator)            |
| `@interop-gateway/format-cda`              | C-CDA ↔ FHIR, wrapping [`cda-fhir-translator`](https://github.com/heyitskundan/cda-fhir-translator)            |
| `@interop-gateway/validate-us-core`        | US Core conformance profile validation                                                                         |
| `@interop-gateway/secrets-keychain`        | `SecretsProvider` backed by the OS keychain (dev default)                                                      |
| `@interop-gateway/secrets-vault`           | `SecretsProvider` backed by HashiCorp Vault                                                                    |
| `@interop-gateway/secrets-aws`             | `SecretsProvider` backed by AWS Secrets Manager                                                                |
| `@interop-gateway/engine`                  | Deployable runtime — Docker, YAML pipeline config, CLI                                                         |
| `@interop-gateway/mcp-server`              | MCP tool surface over the same scope-checked, audit-logged API                                                 |

## PHI handling and compliance — read before you deploy this

This package supports building a HIPAA/SOC 2-compliant system. **It is not itself a HIPAA
or SOC 2 certification.** Those are properties of an organization's overall practices —
risk assessments, signed Business Associate Agreements with every vendor/hospital it
connects to, employee policies, and (for SOC 2) a third-party audit over time. Using this
library does not by itself make your deployment compliant.

What the library does concretely: enforces TLS everywhere, encrypts anything it persists
(audit log, dead-letter queue, cached tokens), checks SMART scopes before every
read/write, never logs a PHI value (structural/shape info and FHIR/HL7 paths only), and
never stores a plaintext secret — see `SECURITY.md` for the full model.

## Vendor access — this package is plumbing, not a permission broker

Connecting to a real hospital's live system is a two-tier process between **you** (the
deploying organization) and the EHR vendor/hospital — this package is never a party to
that relationship. You register your own app with each vendor (Epic, Cerner, etc.) and get
your own client ID; each hospital independently activates it, runs its own security
review, and signs its own BAA with you. See `docs/vendor-onboarding.md` for the concrete
steps. For development and demos, this package targets the free, open sandboxes (SMART
Health IT reference sandbox, Epic's open.epic) that don't require any of that.

## Install

```bash
npm install @interop-gateway/core @interop-gateway/format-hl7v2
```

## Quick start

```js
// JavaScript
import { InteropGateway } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const bundle = await gateway.translate(hl7v2Message, { from: "hl7v2", to: "fhir" });
```

```ts
// TypeScript
import { InteropGateway, type TranslateOptions } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const options: TranslateOptions = { from: "hl7v2", to: "fhir" };
const bundle = await gateway.translate(hl7v2Message, options);
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
