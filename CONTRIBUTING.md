# Contributing

## PHI and credentials — read this first

This project's test fixtures, issues, and PRs must **never** contain real patient data or
real credentials (client secrets, private keys, access/refresh tokens). Use synthetic data
only (hand-crafted or [Synthea](https://github.com/synthetichealth/synthea)-generated) and
a real sandbox environment (SMART Health IT reference sandbox, open.epic) for anything that
talks to a live system — those sandboxes only ever return synthetic patients by design.
Every fixture file must start with `SYNTHETIC DATA ONLY — NOT REAL PHI`. A pre-commit hook
scans staged files for SSN/MRN-shaped patterns and private-key/AWS-key-shaped strings and
blocks the commit if found — it's a safety net, not a substitute for checking your own diff.

This package differs from a pure format translator: it also holds live OAuth tokens and
talks to real (sandbox) hospital systems. See `SECURITY.md` for the full PHI/secrets
handling model before touching `packages/core`, any `connector-*` package, or any
`secrets-*` package.

## Reporting a bug

Open an issue on this repository's Issues tab. Include:

- **The input** — synthetic HL7v2/CDA/FHIR payload or sandbox config — and the
  operation/direction.
- **What you expected** vs. **what you got** — the output, or the exact error and its
  `.path` (never paste the value at that path if it's a PHI field, and never paste a
  token or key).
- **How you're running it** — package version, Node.js version, library API, CLI, or MCP
  server.

## Requesting a feature

- **A new connector, protocol, or format** — open an issue naming the target system/spec
  before starting work.
- **A field, operation, or validation rule within an existing package** — name the
  spec reference (SMART on FHIR, HL7v2, C-CDA, US Core) it should map to.

## Development setup

```bash
git clone https://github.com/heyitskundan/interop-gateway.git
cd interop-gateway
npm install
npm test               # every package + client
npm run build           # every package (dual ESM+CJS via tsup) + client
npm run dev              # browser demo at http://localhost:5173
```

```
packages/core/               pipeline engine, stage interfaces, secrets provider interface
packages/connector-*/        SMART on FHIR connectors
packages/protocol-*/         MLLP/HTTP/file ingest & delivery
packages/format-*/           HL7v2/CDA <-> FHIR translation wrappers
packages/validate-*/         conformance profile engines
packages/secrets-*/          SecretsProvider implementations
packages/engine/             Docker + YAML + CLI runtime wrapper
packages/mcp-server/         MCP tool surface
client/                      browser demo, imports packages/core directly
docs/                        architecture, security posture, vendor onboarding guide
```

## Making a pull request

1. Fork the repo and branch from `main`.
2. Match the existing pattern for the package you're touching — see that package's own
   README for its internal conventions.
3. Add tests in the package's `test/` directory — an untested change won't be merged,
   and any change touching a Security & Compliance item (see `SECURITY.md`) needs a test
   proving the guarantee still holds (scope enforcement, TLS rejection, no-PHI-in-errors,
   secret redaction).
4. Never log a PHI value or a secret/token — structural/shape info only (see
   `SECURITY.md`). If your change adds a log or error message, check it against this
   before opening the PR.
5. Run `npm run lint`, `npm run format:check`, `npm test`, `npm run typecheck`, and
   `npm run build` before opening the PR.
6. Describe the _why_ in the PR description — what real-world case motivated the change.

## Code of conduct

Be direct and be kind. Disagreements about a design decision are welcome and should be
resolved with a spec citation or a reproducible case, not opinion.
