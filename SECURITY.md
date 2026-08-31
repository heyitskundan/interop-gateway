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
- **No plaintext secrets, ever.** Client secrets, private keys, and refresh tokens are
  never stored, logged, or included in error output by `packages/core` or any connector —
  they're handled exclusively through the pluggable `SecretsProvider` interface (OS
  keychain for dev, Vault/AWS Secrets Manager for production).
- **Encryption in transit, always.** TLS is enforced (and downgrades rejected) on every
  outbound connection — the SMART connector, `sendHttpMessage`, and every `secrets-*`
  provider's network calls all route through the same `enforceTls()` check.
- **Encryption at rest is a primitive the package ships, not a default it enforces for
  you.** `core` exports `EncryptedStore` (AES-256-GCM over any key/value `Store`) for
  anything a deployment chooses to persist. Concretely today: `engine` and `mcp-server`
  write per-message/per-call audit entries (tamper-evident, hash-chained, PHI-shaped
  values rejected — see `HashChainedAuditLog`) to an injectable `AuditSink`, which
  defaults to an **in-memory** instance that is lost on restart and not encrypted at
  rest, because there's nothing on disk to encrypt. If your deployment needs a durable
  audit trail, implement `AuditSink` (one method, `append()`) backed by `EncryptedStore`
  or your own encrypted store, and pass it to `runPipeline()`/
  `createInteropGatewayMcpServer()`. **There is no built-in dead-letter queue.** The
  closest thing that exists is `protocol-file`'s `FileIngestWatcher`, which moves a
  failed message to a plain (unencrypted by the package) `error/` subdirectory with an
  error sidecar — encrypting that at rest is the deploying organization's
  responsibility (e.g. an encrypted volume), same as any other file the OS writes.
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
