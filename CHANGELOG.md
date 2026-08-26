# Changelog

## v0.4.0

Full plumbing coverage: every package named in the README's package table now exists
and passes.

- `@interop-gateway/protocol-http` — `HttpIngestServer` (plain HTTP listener; expects a
  TLS-terminating proxy in front in production, matching `protocol-mllp`'s posture) and
  `sendHttpMessage` (TLS-enforced delivery, retries on network failure/timeout, never on
  a non-2xx response, which is returned to the caller instead).
- `@interop-gateway/protocol-file` — `FileIngestWatcher` (polls a directory, routes each
  file to `processed/` or `error/` with an error sidecar on failure, never re-ingests
  its own output) and `writeFileMessage` (atomic write via temp-file-then-rename).
  Deliberately scoped to local filesystem only — pairs with an SFTP daemon rather than
  embedding an SFTP client of its own.
- `@interop-gateway/secrets-vault` — `SecretsProvider` over a HashiCorp Vault KV v2
  secrets engine, talking to Vault's HTTP API directly (no new dependency beyond
  `fetch`). `deleteSecret` soft-deletes via the `data` endpoint, not `metadata`, so a
  delete stays recoverable through `vault kv undelete`.
- `@interop-gateway/secrets-aws` — `SecretsProvider` over AWS Secrets Manager's JSON API,
  signed via `aws4fetch` rather than the full AWS SDK. `setSecret` calls
  `PutSecretValue` first and falls back to `CreateSecret` only on a
  `ResourceNotFoundException`.
- `@interop-gateway/validate-us-core` — required-element structural checks for 15 US
  Core profiles matching the resource types `hl7-fhir-translator`/`cda-fhir-translator`
  can produce. Documented explicitly as this package's own reading of each profile's
  Must Support elements, not independently re-verified against fetched
  StructureDefinition JSON, with terminology binding entirely out of scope.
- `@interop-gateway/engine` — YAML-configured pipeline runtime: wires a protocol source
  (`mllp`/`http`/`file`), a format (`hl7v2`/`cda`), and a destination (`http`/`file`)
  together, with a `run`/`validate` CLI and a Dockerfile. A translation or delivery
  failure for one message reports through the source's own failure channel (an `AE`
  ACK, a 422 response, the `error/` subdirectory) rather than stopping the pipeline.
- `@interop-gateway/mcp-server` — MCP tool surface (`translate`, `validate`) over
  `InteropGateway`, tested against a real MCP client/server pair over
  `InMemoryTransport`.
- `client` — rebuilt on the same pattern as `hl7-fhir-translator`'s and
  `cda-fhir-translator`'s demo sites: a format toggle (HL7v2/C-CDA) crossed with a
  direction toggle (→ FHIR / FHIR →), a field-level mapping trail tab, syntax
  highlighting (HL7v2/XML/JSON), shape-based format+direction auto-detection, dark
  mode, and a four-page docs site (Getting Started, API Reference, Packages, Changelog)
  covering all 13 packages. Bidirectional translation for both formats now goes through
  each format package's own `translateToFhir`/`translateFromFhir` directly (preserving
  the mapping trail) rather than through `InteropGateway.translate()`, which only
  returns the bare result and doesn't yet support the `fhir -> X` direction.

## v0.3.0

- `@interop-gateway/connector-smart-generic` — full CRUD write support: `create()`,
  `update()`, `delete()`, each scope-checked and returning a `WriteResult`
  (`{ ok: true, status, resource }` or `{ ok: false, status, code, path, issues }`)
  instead of throwing on a server-side rejection. `code` classifies the failure
  (`CONFLICT` for 409/412, `VALIDATION_FAILED` for 422, `REQUEST_FAILED` otherwise).
  `writeBatch()` runs a list of create/update/delete operations and collects one
  `WriteResult` per operation — one operation failing does not stop the rest of the
  batch from running.
- `@interop-gateway/protocol-mllp` — MLLP receive and send. `MllpServer` unframes
  incoming MLLP messages, hands each to a handler, and writes back an ACK/NACK built
  from the handler's result (a thrown handler error becomes an `AE`). `sendMllpMessage`
  frames and sends a message, waits for the ACK/NACK, and retries (default 3 attempts)
  on connection failure or timeout — never on a received NACK, which is returned to the
  caller instead. Tested against real TCP connections on localhost (server + client, no
  mocking), including retry-exhaustion and timeout paths.

## v0.2.0

- `@interop-gateway/connector-smart-generic` — vendor-agnostic SMART on FHIR connector.
  OAuth2 client-credentials token exchange via `client_secret_post` or the
  backend-services `private_key_jwt` flow (JWT assertion signed with `jose`); token
  caching with automatic refresh, optionally persisted through a `SecretsProvider`;
  scope-checked `read()`/`search()` against a FHIR R4 server, TLS-enforced throughout.
  Tested against mocked HTTP for unit coverage and against the live SMART Health IT
  reference sandbox (`r4.smarthealthit.org`) for a real integration check.
- Browser demo client intentionally does **not** wire up this connector — the
  backend-services flow requires a private key or client secret, which is a
  server-side-only credential type and has no safe place in client-side JS. Deferred to
  a later, separate public/PKCE browser flow.

## v0.1.0

Repo scaffolding: npm workspace monorepo, CI (lint/build/typecheck/test/audit), weekly
security-audit workflow, GitHub Pages demo deploy, PHI-hardened CONTRIBUTING/SECURITY
docs, pre-commit secret/PHI scanner, Apache-2.0 license.

- `@interop-gateway/core` — pipeline envelope/correlation-ID, stage interfaces, TLS
  enforcement guard, `EncryptedStore` (AES-256-GCM via Web Crypto), `ScopeSet`
  enforcement, `HashChainedAuditLog` with PHI-shaped-value rejection, `SecretsProvider`
  interface, structural HL7v2/CDA validation, the `InteropGateway` `translate()`/
  `validate()` API, and a `validate` CLI command.
- `@interop-gateway/secrets-keychain` — `SecretsProvider` backed by the OS keychain
  (macOS `security`, Linux `secret-tool`) — the dev-only default.
- `@interop-gateway/format-hl7v2` — `FormatPlugin` wrapping the published
  `hl7-fhir-translator` package, both directions.
- `@interop-gateway/format-cda` — `FormatPlugin` wrapping the published
  `cda-fhir-translator` package (currently 5 sections, tracks that package's own
  release cadence), both directions.
- `client` — minimal browser demo: paste an HL7v2 message, translate it to a FHIR
  Bundle locally in-browser via `InteropGateway` + `formatHl7v2`.

All packages: 90%+ line coverage enforced, `npm audit --audit-level=high` clean,
dual ESM+CJS builds with full `.d.ts` declarations, JSDoc on public exports for
plain-JS consumers.
