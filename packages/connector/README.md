# @interop-gateway/connector

Vendor-agnostic SMART on FHIR connector for [interop-gateway](https://github.com/heyitskundan/interop-gateway):
backend-services token exchange (`client_secret_post`, `private_key_jwt`) and the
interactive, patient/clinician-facing `authorization_code` flow with PKCE, scope-checked
`read()`/`search()`/`write()` against a FHIR R4 server, and Bulk Data `$export`.

## Bring your own credentials

This package never ships with, brokers, or manages a shared credential. Whoever deploys
it registers their own app with each vendor (Epic, Cerner, etc.) and supplies their own
client ID, secret/key, and token endpoint — a two-tier vendor/hospital access process
this package does not change.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source until then.

```bash
npm install @interop-gateway/core @interop-gateway/connector
```

## Use — backend-services (private_key_jwt), the preferred flow

```js
// JavaScript
import { SmartClient } from "@interop-gateway/connector";

const client = new SmartClient({
  baseUrl: "https://your-sandbox-or-hospital-fhir-server.example.org/fhir",
  auth: {
    method: "private_key_jwt",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    privateKey: yourPrivateKeyJwk, // never a raw PEM string — see @interop-gateway/core's assertNotRawCredential
    kid: "your-key-id",
    alg: "RS384",
    scope: "system/Patient.read",
  },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
});

const patient = await client.read("Patient", "123");
```

```ts
// TypeScript
import { SmartClient, type SmartClientOptions } from "@interop-gateway/connector";

const options: SmartClientOptions = {
  baseUrl: "https://your-sandbox-or-hospital-fhir-server.example.org/fhir",
  auth: {
    method: "private_key_jwt",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    privateKey: yourPrivateKeyJwk,
    kid: "your-key-id",
    alg: "RS384",
    scope: "system/Patient.read",
  },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
};
const client = new SmartClient(options);
```

## Use — authorization_code (SMART App Launch, patient/clinician-facing)

The interactive flow, for a patient portal or a clinician-facing embedded app. This
package cannot perform the redirect and login/consent screen itself — that's a browser
step, inherent to the flow, not something any server-side library can automate — but
provides every other piece: building the authorization URL with PKCE, exchanging the
returned `code`, and refreshing afterward.

```ts
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  SmartClient,
} from "@interop-gateway/connector";

// 1. Start the launch — redirect the user's browser to `url`. Persist `codeVerifier`
//    (session storage, a signed cookie) — you need it back in step 2.
const { url, codeVerifier, state } = await buildAuthorizationUrl({
  authorizeUrl: "https://your-sandbox.example.org/auth/authorize",
  clientId: "your-client-id",
  redirectUri: "https://your-app.example.org/callback",
  scope: "launch/patient patient/Patient.read offline_access",
  aud: "https://your-sandbox.example.org/fhir", // the FHIR server this launch is for
  launch: launchParamFromEhrRedirect, // omit for a standalone (non-EHR) launch
});
// redirect(url); persistSession({ codeVerifier, state });

// 2. The authorization server redirects back to redirectUri with `?code=...&state=...`.
//    Verify `state` matches what you persisted, then exchange the code:
const token = await exchangeAuthorizationCode({
  tokenUrl: "https://your-sandbox.example.org/auth/token",
  code: codeFromRedirectQueryParam,
  redirectUri: "https://your-app.example.org/callback",
  clientId: "your-client-id",
  codeVerifier, // from step 1's session
});
// token.patient / token.encounter carry the launch context, when the server sends it.

// 3. Use it — SmartClient refreshes via token.refreshToken automatically once it's
//    within 30 seconds of expiry, no further redirect needed until the refresh token
//    itself is revoked/expires.
const client = new SmartClient({
  baseUrl: "https://your-sandbox.example.org/fhir",
  auth: {
    method: "authorization_code",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    redirectUri: "https://your-app.example.org/callback",
    initialToken: token,
  },
  scopes: [{ resourceType: "Patient", operations: ["read"] }],
});
const patient = await client.read("Patient", token.patient!);
```

If the refresh token is ever rejected (revoked, expired) or was never granted
(`offline_access` wasn't in `scope`), the next call throws `GatewayError`/
`REFRESH_TOKEN_UNAVAILABLE` instead of silently failing at the FHIR request — the user
needs to go through step 1 again.

## Bulk Data ($export)

System-, patient-, and group-level export per the
[FHIR Bulk Data Access IG](https://hl7.org/fhir/uv/bulkdata/) — kick-off, async status
polling, and NDJSON output download, all on `SmartClient`:

```ts
const job = await client.startBulkExport({
  level: "group",
  groupId: "cohort-1",
  types: ["Patient", "Observation"],
  since: "2026-01-01T00:00:00Z",
});

// Poll until done — waits the server's Retry-After between attempts when given.
const completed = await client.pollBulkExportUntilComplete(job);
// Or poll it yourself: `await client.checkBulkExportStatus(job)` returns
// { status: "in-progress", progress?, retryAfterSeconds? } | { status: "completed", output, ... } | { status: "error", issues }

for (const file of completed.output) {
  const ndjsonText = await client.downloadBulkExportFile(file, {
    requiresAccessToken: completed.requiresAccessToken,
  });
  const resources = parseNdjson(ndjsonText); // one parsed resource per line
}

await client.cancelBulkExport(job); // DELETE the job if you need to stop it early
```

`buildExportUrl()`/`parseCompletedExportBody()`/`parseNdjson()` are exported standalone
too, for building the request/parsing the response yourself outside `SmartClient`.

## Write support

```js
const created = await client.create("Patient", patientResource);
// { ok: true, status: 201, resource: {...} }

const conflict = await client.update("Patient", "123", patientResource);
// { ok: false, status: 409, code: "CONFLICT", path: "Patient/123", issues: {...} }

const results = await client.writeBatch([
  { kind: "create", resourceType: "Patient", resource: patientResource },
  { kind: "update", resourceType: "Observation", id: "obs-1", resource: observationResource },
  { kind: "delete", resourceType: "Encounter", id: "enc-1" },
]);
// One WriteResult per operation, in order. One operation failing (a scope violation, a
// 409/412 conflict, a 422 validation error, a network failure) does not stop the rest
// of the batch from running.
```

`create`/`update`/`delete` never throw for a server-side rejection — they return a
`WriteResult` (`{ ok: true, status, resource }` or `{ ok: false, status, code, path,
issues }`) so a caller can inspect the outcome without a try/catch per call. They do
throw `ScopeError` if the resource type/operation isn't in `scopes`, before any network
call.

## Scope enforcement

`SmartClient` checks the `scopes` you configured before making any request — a
`read("Observation", id)` call throws `ScopeError` immediately, without a network call,
if `Observation` read wasn't granted. This is independent of the SMART scopes the
authorization server itself grants; both layers have to agree.

## Token persistence

Pass a `secrets` option (any `@interop-gateway/core` `SecretsProvider`, e.g.
`@interop-gateway/secrets`) to persist the fetched access token across
`SmartClient` instances/process restarts, refreshed automatically once it's within 30
seconds of expiry.

## Lower-level exports

`SmartClient` is built from pieces also exported directly, for a consumer building a
custom connector variant instead of using `SmartClient` as-is:

- `fetchAccessToken(auth)` — runs the backend-services token exchange
  (`client_secret_post` or `private_key_jwt`) standalone, without a `SmartClient`
  instance.
- `generatePkce()` / `buildAuthorizationUrl()` / `exchangeAuthorizationCode()` /
  `refreshAccessToken()` — the pieces of the interactive `authorization_code` flow, see
  "Use — authorization_code" above.
- `TokenManager` — the caching/auto-refresh wrapper `SmartClient` uses internally;
  reusable if you need token caching without the rest of `SmartClient`'s scope-checked
  request surface. Handles both refresh strategies (re-run client-credentials for
  backend-services auth, `grant_type=refresh_token` for `authorization_code`).
- `classifyWriteFailureStatus(status)` — the same HTTP-status-to-`WriteFailureCode`
  mapping (`CONFLICT` for 409/412, `VALIDATION_FAILED` for 422, `REQUEST_FAILED`
  otherwise) `create`/`update`/`delete` use internally, exposed for a caller writing
  their own write path against a FHIR server.
- `buildExportUrl()` / `parseCompletedExportBody()` / `parseNdjson()` — the pieces
  `startBulkExport()`/`checkBulkExportStatus()` use internally, see "Bulk Data
  ($export)" above.

## Testing against a sandbox

Development and demos target the free, open sandboxes that don't require a vendor
partnership: the SMART Health IT reference sandbox (`r4.smarthealthit.org` for open
reads, `launch.smarthealthit.org` for the full OAuth backend-services flow) and Epic's
`open.epic` sandbox.

`test/integration.test.ts` has two tests against the live `r4.smarthealthit.org`
sandbox, opt-in only:

```bash
RUN_LIVE_SANDBOX_TESTS=1 npm run test -w packages/connector
```

Skipped by default (including in CI/`npm test` at the repo root) — an external network
dependency this far outside the repo's control has no place gating an automated
pipeline.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
