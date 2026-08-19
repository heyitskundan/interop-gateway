# Changelog

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
