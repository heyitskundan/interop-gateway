# Changelog

## v1.0.0

First tagged release. All 13 packages named in the README (`core`,
`connector-smart-generic`, `protocol-mllp`, `protocol-http`, `protocol-file`,
`format-hl7v2`, `format-cda`, `validate-us-core`, `secrets-keychain`, `secrets-vault`,
`secrets-aws`, `engine`, `mcp-server`) plus the browser demo client build, typecheck,
test, and lint clean. Every package's `version` field synced to `1.0.0`, including
internal `@interop-gateway/*` cross-package dependency ranges.

- **`core`** — `InteropGateway.translate()` supports both directions:
  `{ from: FormatName, to: "fhir" }` (structural validation first, then
  `plugin.toFhir()`) and `{ from: "fhir", to: FormatName }` (parses `input` as JSON,
  throwing `GatewayError`/`FHIR_INPUT_INVALID` if it isn't valid JSON, then
  `plugin.fromFhir()` — structural validation doesn't apply to FHIR input).
  `TranslateOptions` is a discriminated union of the two directions, so an invalid
  combination is a compile error, not a runtime one. `format-hl7v2` and `format-cda`'s
  `FormatPlugin.fromFhir()` implementations needed no changes — `core` just wasn't
  calling them yet.
- **`engine`** — `PipelineConfig` has an opt-in `validateProfile: boolean` flag
  (default `false`). When set, every translated Bundle is checked with
  `validateUsCoreBundle()` before delivery; a failing result is routed to the same
  failure channel a translation failure already uses (`error/` subdirectory, 422, `AE`
  ACK), and delivery never runs. `runPipeline()` also takes an optional second argument,
  `{ auditSink? }` (defaulting to a private `HashChainedAuditLog()`), and every message
  gets a `correlationId` (via `core`'s `createEnvelope`) the moment it's ingested. An
  audit entry is written at each stage (`translate`/`translate:rejected`,
  `validateProfile:passed`/`validateProfile:rejected`, `deliver`/`deliver:rejected`),
  and the same correlation ID is prefixed onto the message returned through the failure
  channel (`[id] <message>`) so a failure surfaced to the sender's own system can be
  matched back to its audit trail. `RunningPipeline` exposes the resolved `auditLog`.
- **`mcp-server`** — new `validateUsCore` tool: takes a FHIR resource or Bundle (JSON
  string, typically `translate`'s own output) and runs `validateUsCore`/
  `validateUsCoreBundle` against it. `createInteropGatewayMcpServer()` takes an optional
  `{ auditSink? }` (same default as `engine`), and `translate`/`validate`/
  `validateUsCore` each write a correlated audit entry per call.
- **`mcp-server`** — 6 new tools, all wrapping existing `connector-smart-generic`/
  `protocol-mllp`/`engine` functionality rather than adding new capability:
  `connect_ehr` (creates a `SmartClient`, no network call), `read_resource`/
  `write_resource` (scope-checked read/search/create/update/delete against the
  connected server), `send_message` (real MLLP send via `protocol-mllp`), and
  `run_pipeline`/`stop_pipeline` (start/stop an `engine` pipeline from a YAML string,
  in-memory per server instance). Every tool follows the existing pattern: a
  `correlationId`, `isError: true` + the underlying `GatewayError`'s message on
  failure instead of throwing, and an audit entry. 9 tools total; see the package
  README's "Static" vs. "Live" split for the trust-boundary disclosure on the 6 new
  ones (`connect_ehr`'s auth argument carries the credential itself as a tool call
  argument, which most MCP clients display/log).
- **`engine`** — `PipelineConfig.destination` is now optional; a `routes: RouteRule[]`
  list is the alternative (exactly one of the two must be set). Each rule optionally
  matches (`when`, dot-path equality against the translated FHIR resource, e.g.
  `entry.0.resource.resourceType: Patient` since `translate()` always produces a
  `Bundle`) and fans out to every destination in its `to` list on match — rules tried
  in order, first match wins, no match is a delivery failure through the same failure
  channel as any other. `core`'s `Pipeline`/`Stage` classes remain unused by both
  `engine` and `mcp-server` — a separate, smaller item (see below).
- **`engine`** — dead-letter queue and persisted audit log, closing the gap the
  `SECURITY.md` correction below used to describe. `FileDeadLetterQueue` (`core`'s new
  `Store`-backed) retains a message that fails translation/validation/routing/delivery
  (raw content, failure stage, error, attempt count) alongside reporting it through the
  source's own failure channel as before; `interop-gateway-engine replay pipeline.yaml`
  re-runs everything currently queued. `FileAuditLog` persists the same hash-chained
  audit trail `HashChainedAuditLog` always wrote, through a `Store` instead of only
  process memory. `core` gained `FileStore` (`@interop-gateway/core/node` — a separate
  Node-only entry point so the browser client bundle never pulls in `node:fs`) so both
  can be wrapped in the existing `EncryptedStore` for encryption at rest. The CLI's
  `run` command persists both to disk by default (`<name>-audit/`,
  `<name>-dead-letters/` next to the config file) unless `persistence.audit`/
  `persistence.deadLetter` in the pipeline YAML say otherwise;
  `encryptPassphrase` in either turns encryption at rest on.
  `createInteropGatewayMcpServer()`'s `run_pipeline` tool now passes the server's own
  `auditSink`/`deadLetterQueue` options through to every pipeline it starts, instead of
  each one silently keeping a separate in-memory audit log. The audit log's PHI-shaped-
  value rejection also grew beyond SSN/MRN to email addresses, US-style phone numbers,
  and bare 9-11 digit identifiers (still a defense-in-depth backstop over a handful of
  narrow fields, not a general scrubber — see `SECURITY.md`). Fixed along the way:
  `HashChainedAuditLog`/`FileAuditLog.append()` now clones the entry it's given instead
  of storing it by reference, so a caller mutating the object it passed in after
  `append()` returns can no longer silently rewrite tamper-evident history.
- **`validate-us-core`** — three real fixes to its self-acknowledged gaps: (1) max
  cardinality is now checked (`FieldRule.max: 1` — a `0..1`/`1..1` element that
  serialized as a JSON array now fails, on top of the existing presence check); (2)
  `status`/`intent`/`lifecycleStatus` fields bound with **required** strength to one of
  FHIR R4's own small fixed enumerations are checked against that enumeration
  (`Observation.status`, `Immunization.status`, `Procedure.status`, `Encounter.status`,
  `DiagnosticReport.status`, `CareTeam.status`, `Coverage.status`,
  `DocumentReference.status`, `Goal.lifecycleStatus`, `ServiceRequest.status`/`intent`,
  `MedicationRequest.status`/`intent`) — terminology bound to an external code system
  (LOINC/SNOMED/RxNorm) stays entirely out of scope, since checking that needs the real
  ValueSet contents this repo doesn't have and won't fabricate; (3) the 15 built-in
  profiles are no longer a closed hardcoded set — `registerProfile()`/
  `unregisterProfile()` mutate a registry seeded from the built-ins at module load, so a
  caller can add a resource type this package has no rule for or override a built-in
  one, without forking the package. `getRegisteredProfile()`/`listRegisteredProfiles()`/
  `resetProfiles()` round out the registry API. Still not independently re-verified
  against fetched US Core StructureDefinition JSON — that caveat stands, see the
  package's own README.
- **`connector-smart-generic`** — two real gaps closed: (1) the interactive, patient/
  clinician-facing SMART App Launch. `buildAuthorizationUrl()` builds the
  authorization-endpoint redirect with PKCE (`S256`), `exchangeAuthorizationCode()`
  finishes the exchange once the authorization server redirects back with a `code`,
  and a new `authorization_code` `AuthConfig` variant lets `SmartClient` use an
  already-obtained token, refreshing via `grant_type=refresh_token` (through
  `refreshAccessToken()`) instead of re-running client-credentials — there's no
  standing credential to re-run it with. `TokenManager` throws `GatewayError`/
  `REFRESH_TOKEN_UNAVAILABLE` rather than silently failing at the next FHIR request
  when no refresh token is available. The redirect and login/consent screen remain
  outside what this (or any server-side) package can automate — that's inherent to the
  flow, not a remaining gap. (2) Bulk Data `$export` — `SmartClient.startBulkExport()`/
  `checkBulkExportStatus()`/`pollBulkExportUntilComplete()`/
  `downloadBulkExportFile()`/`cancelBulkExport()` implement the
  [Bulk Data Access IG](https://hl7.org/fhir/uv/bulkdata/)'s kick-off/async-status/
  download flow for system-, patient-, and group-level export, honoring
  `Retry-After` while polling and the per-job `requiresAccessToken` flag on file
  downloads; `parseNdjson()` parses the output files. 42 new tests (74 total in this
  package), all backward compatible — no existing test needed to change.
- **`core`'s `Pipeline`/`Stage` composable-stage abstraction removed.** It shipped
  exported and tested but no package ever adopted it — `engine`'s and `mcp-server`'s
  actual needs (an optional validation stage, fan-out delivery, per-stage audit/
  dead-letter hooks) don't map cleanly onto a linear envelope-in/envelope-out chain,
  and forcing a refactor onto it would have meant rewriting working, tested, audited
  logic for no functional gain. Dead code left in a public API surface invites someone
  to build against an abstraction nobody uses; removed instead of kept as aspirational.
- **Persistence inverted to safe-by-default across `engine` and `mcp-server`.**
  `runPipeline()` (direct call, CLI, or via `mcp-server`'s `run_pipeline`) and
  `createInteropGatewayMcpServer()` now default to a `FileAuditLog` persisted to disk
  (`<name>-audit/`, or `./mcp-server-audit` for the MCP server) instead of an in-memory
  `HashChainedAuditLog()`. Persisting without `persistence.audit.encryptPassphrase` set
  throws `GatewayError`/`UNENCRYPTED_PERSISTENCE_REFUSED` before anything is written,
  unless `allowUnencryptedPersistence: true` is explicitly passed (the CLI's
  `--allow-unencrypted` flag) — a conscious, typed-out acceptance of plaintext-on-disk,
  not the default outcome of omitting a config line. `ephemeral: true` opts fully back
  into the old in-memory-only behavior for tests/quick demos. The same
  encryption-or-explicit-opt-out rule now applies to the dead-letter queue whenever one
  is configured (its _existence_ stays opt-in for a direct call — only its encryption
  changed); the CLI's `run` command still always creates one by default. `engine`
  gained a new `persistence.ts` module (`resolveAuditSink`/`resolveDeadLetterQueue`/
  `resolveDeadLetterQueueWithDefault`) shared by `pipeline.ts`, `cli.ts`, and
  `mcp-server`, so the encryption gate lives in exactly one place. 20 new tests across
  `engine`/`mcp-server` cover the refuse-unencrypted, persist-with-passphrase, and
  ephemeral-opt-out paths.
- **`mcp-server` gained 6 tools closing the gap between what the SDK can do and what an
  AI agent using it through MCP could reach.** `start_smart_launch`/
  `complete_smart_launch` expose `connector-smart-generic`'s `authorization_code`+PKCE
  flow (`connect_ehr` alone only ever supported backend-services auth) — two tools, not
  one extended `connect_ehr`, since an authorization-code exchange needs a
  redirect/callback step no single synchronous tool call can wait through;
  `start_smart_launch` builds the authorization URL and holds the PKCE `code_verifier`
  server-side keyed by `state`, `complete_smart_launch` exchanges the code and opens a
  connection usable by the existing `read_resource`/`write_resource` tools.
  `start_bulk_export`/`check_bulk_export_status`/`download_bulk_export_file`/
  `cancel_bulk_export` expose the connector's Bulk Data `$export` support. Also fixed:
  `connect_ehr`'s description falsely claimed "there is no interactive/PKCE launch flow
  here or in the connector package it wraps" — the connector has supported PKCE since
  the previous release; the line was just never updated. `createInteropGatewayMcpServer()`
  is now `async` (`Promise<McpServer>`) to resolve the new default persisted audit sink;
  9 new tests cover the SMART launch round-trip and the full bulk-export lifecycle.
- Package READMEs (`core`, `engine`, `mcp-server`, and the 10 others) document running
  each CLI/MCP server from a local build, since none of the `@interop-gateway/*`
  packages are published to npm yet — the same caveat is centralized in the root
  README's Install section.
- Docs site: added a `format-cda` code example to the API Reference (previously only
  `format-hl7v2` had one), and the API Reference/Packages pages describe exactly which
  pieces are wired in (`validate-us-core`, correlation IDs/audit logging) versus still
  standalone. Client's public Changelog page brought current.
- `SECURITY.md`/`README.md` corrected: previously claimed the package encrypts a
  dead-letter queue at rest with a retention/purge policy — no dead-letter queue exists
  in the codebase, and the audit log is in-memory by default, not persisted. Both docs
  now state precisely what's a real default versus what a deployment wires up itself
  (`EncryptedStore` is a shipped primitive, not automatically applied to anything).
  `core/README.md`'s claim that `InteropGateway` would grow `connect()`/`read()`/
  `write()`/`send()` methods was also removed — that functionality lives in
  `connector-smart-generic`'s separate `SmartClient` class instead.
- `core`'s `Pipeline`/`Stage` classes remain unused outside their own test suite — both
  `engine` and `mcp-server` call `createEnvelope`/`AuditSink.append` directly rather
  than composing a `Pipeline`, which was enough to wire in an audit trail without the
  larger `Pipeline`/`Stage`-adoption refactor. See `docs/architecture.md`'s "Known
  architectural debt" for what's still open: `translate()`'s discarded mapping trail,
  no interactive demo for the connector/secrets/engine/mcp-server packages, and no npm
  publish yet.

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
