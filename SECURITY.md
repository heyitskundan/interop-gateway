# Security Policy

## Supported versions

This package is pre-1.0 (`0.x`). Security fixes land on the latest published version of
each affected package; older `0.x` versions are not separately patched.

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
- **Encryption everywhere PHI could land.** TLS is enforced (and downgrades rejected) on
  every outbound connection; anything the package persists (audit log, dead-letter queue,
  cached tokens) is encrypted at rest.
- **Scope enforcement, not just trust-the-token.** Every `read()`/`write()` call is
  checked against the current token's granted SMART scopes before any network call is
  made.
- **Minimum necessary.** `read()`/`search()` require an explicit scope — there is no
  "fetch everything" default.
- **No silent persistence.** Nothing survives past a single pipeline run except the
  dead-letter queue and audit log, both encrypted at rest with a configurable
  retention/purge policy.
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
app in `client/` (a static, client-side-only page using sandbox credentials only) are
also in scope, though its attack surface is smaller for the same reasons.

Out of scope: vulnerabilities in this repo's own `devDependencies` (build/test tooling)
that don't affect a published package or the built demo — track those via `npm audit`
and normal dependency updates instead of a security report.
