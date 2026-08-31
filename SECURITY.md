# Security Policy

## Supported versions

Security fixes land on the latest tagged version (currently `1.x`); older versions are
not separately patched. This package is not yet published to npm — see the root
[README](./README.md) for building from source.

## Reporting a vulnerability

Do not open a public GitHub issue for a security report — report privately so a fix can
ship before the issue is public.

**Report to:** open a private [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository (Security tab → **Report a vulnerability**).

Include, if you can:

- The vulnerable code path (package, file/function, or the input/config that triggers it).
- Impact — what an attacker could do with it (read/write PHI outside granted scope,
  exfiltrate a token or secret, bypass TLS enforcement, etc.).
- A minimal reproduction using synthetic input and a sandbox connection only — never real
  patient data or a real production credential.

Expect an acknowledgment within a few days. This is a solo-maintained project — there's
no formal SLA, but security reports are treated as highest priority.

## PHI handling

Unlike a pure format translator, this package also holds live OAuth tokens and talks to
real (sandbox, and eventually production) hospital systems on the caller's behalf. It is
still fundamentally a **processing/connectivity tool, not a storage system**, and follows
these rules everywhere:

- **No PHI in logs, errors, or stack traces.** Logging is structural/shape-only (e.g.
  `"Read Patient/1234 (12 fields)"`, `"Validation failed: Patient.birthDate missing"`) —
  never a PHI value. Error paths use the FHIR/HL7 path, never the value at that path.
  The audit log (`HashChainedAuditLog`/`FileAuditLog`) additionally rejects any entry
  whose `correlationId`/`who`/`what`/`resourceType` matches an SSN, MRN-labeled
  identifier, email address, US-style phone number, or bare 9-11 digit identifier
  shape, on top of relying on entries structurally carrying only a handful of narrow
  fields, never full message content — this is a defense-in-depth backstop, not a
  general PHI scrubber; it cannot catch a name, address, or diagnosis embedded in a
  free-text `what` string, so the actual guarantee is still "don't put PHI into an
  audit entry's fields," same as before. The dead-letter queue (see below) is the one
  place that deliberately holds full raw message content, by design — it isn't
  redaction-checked, it's meant for encryption-at-rest instead.
- **No plaintext secrets, ever.** Client secrets, private keys, and refresh tokens are
  never stored, logged, or included in error output by `packages/core` or any connector —
  they're handled exclusively through the pluggable `SecretsProvider` interface (OS
  keychain for dev, Vault/AWS Secrets Manager for production).
- **Encryption in transit, always.** TLS is enforced (and downgrades rejected) on every
  outbound connection — the SMART connector, `sendHttpMessage`, and every `secrets-*`
  provider's network calls all route through the same `enforceTls()` check.
- **Persisted by default, encrypted by default — the unsafe path has to be typed out
  explicitly, not the safe one.** `runPipeline()` (called directly, from the CLI, or via
  `mcp-server`'s `run_pipeline` tool) and `createInteropGatewayMcpServer()` both default
  to a `FileAuditLog` persisted to disk (`<name>-audit/` next to the pipeline config, or
  `./mcp-server-audit` for the MCP server) — not an ephemeral in-memory log. Persisting
  without `persistence.audit.encryptPassphrase` set throws
  `GatewayError`/`UNENCRYPTED_PERSISTENCE_REFUSED` immediately, before anything is
  written, unless the caller explicitly passes `allowUnencryptedPersistence: true` (the
  CLI's equivalent is the `--allow-unencrypted` flag) — a conscious, typed-out decision
  to accept plaintext-on-disk, not something that happens by omitting a config line. Set
  `ephemeral: true` instead for tests and quick demos where an in-memory-only log is
  genuinely the point; real usage shouldn't set it, since the audit trail is lost on
  every restart. `core` exports `EncryptedStore` (AES-256-GCM over any key/value
  `Store`) and a Node-only `FileStore` (`@interop-gateway/core/node`) as the primitives
  underneath this — `persistence.audit.encryptPassphrase` derives the key via PBKDF2
  (the pipeline/server name as salt) and wraps `FileStore` in `EncryptedStore`
  automatically; nothing else needs to touch either primitive directly.
  `mcp-server`'s `run_pipeline` tool passes the server's own resolved `auditSink`
  through to every pipeline it starts (see `CreateInteropGatewayMcpServerOptions`)
  rather than each pipeline silently keeping its own separate log.
- **Dead-letter queue — opt-in to have one, but the same encryption rule once you do.**
  `engine` ships `FileDeadLetterQueue` (`Store`-backed, same `EncryptedStore` wrapping as
  the audit log above). Its _existence_ stays opt-in for a direct `runPipeline()`/
  `createInteropGatewayMcpServer()` call — set `persistence.deadLetter` (or pass one in
  explicitly) if you want one — but the CLI's `run` command always creates one by
  default (`<name>-dead-letters/`), and whenever a dead-letter queue is configured
  anywhere, persisting it unencrypted throws the same
  `UNENCRYPTED_PERSISTENCE_REFUSED` error the audit log does, unless
  `allowUnencryptedPersistence: true` is set. This matters more here than for the audit
  log: **the dead-letter queue retains full raw (unredacted) source message content by
  design** — replay needs the actual message — so it is the one place in this system
  that isn't PHI-redaction-checked at all (see the audit log's redaction note above);
  encryption at rest is its only real protection, which is exactly why the same
  refuse-unless-encrypted-or-explicit-opt-out rule applies to it. A message that fails
  translation, US Core validation, routing, or delivery is retained here (raw message,
  failure stage, error, attempt count) in addition to being reported through the
  source's own failure channel (an `AE` ACK, a 422, the `error/` subdirectory) — nothing
  is silently lost. `interop-gateway-engine replay pipeline.yaml` re-runs every
  currently-queued message through the same translate/validate/route/deliver handler a
  live pipeline uses; a message that succeeds is removed, one that fails again stays
  queued with `attempts` incremented.
- **Scope enforcement, not just trust-the-token.** Every `read()`/`write()` call is
  checked against the current token's granted SMART scopes before any network call is
  made.
- **Minimum necessary.** `read()`/`search()` require an explicit scope — there is no
  "fetch everything" default.
- **No retention/purge policy shipped.** The package doesn't cache PHI beyond a single
  pipeline run by default, but it also doesn't manage retention or purging of anything
  a deployment chooses to persist (a custom `AuditSink`, `FileIngestWatcher`'s
  `error/` directory) — that's a deployment-level policy decision, not something this
  package enforces today.
- **This package alone does not make a system HIPAA- or SOC 2-compliant.** The deploying
  organization is still responsible for its own risk assessment, a signed Business
  Associate Agreement with each hospital/vendor it connects to, and its own access
  policies. See `docs/` for the full compliance-posture disclaimer.

## Scope

The realistic attack surface spans: (1) the HL7v2/CDA/FHIR parsers — a malformed or
adversarial input causing a crash, excessive resource consumption, or (for XML) entity
expansion/external entity resolution; (2) the SMART on FHIR connector — token handling,
scope enforcement, TLS enforcement, and the OAuth2 flows themselves; (3) the secrets
provider implementations — anywhere a real credential could be logged, cached in
plaintext, or transmitted somewhere other than the auth exchange; (4) the MLLP/HTTP/file
protocol adapters — network-facing parsing and delivery code. Reports about the demo
app in `client/` are also in scope — it's a static, client-side-only page that
translates a pasted HL7v2/C-CDA message entirely locally in the browser: the pasted
input, and everything the translator does with it, never leaves the tab, and the page
has no connector/OAuth flow of its own. The one network call the page does make is
loading web fonts from Google Fonts via a CSS `@import` — unrelated to translation, no
pasted content or PHI involved, but worth stating plainly rather than claiming zero
network activity. Its attack surface is limited to the translation code path itself
(same parsers as (1) above) and standard web-app concerns (XSS from rendering arbitrary
pasted input, dependency vulnerabilities in the built bundle, the Google Fonts request
itself as a third-party dependency).

Out of scope: vulnerabilities in this repo's own `devDependencies` (build/test tooling)
that don't affect a published package or the built demo — track those via `npm audit`
and normal dependency updates instead of a security report.
