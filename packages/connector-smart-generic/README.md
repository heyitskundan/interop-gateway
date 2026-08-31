# @interop-gateway/connector-smart-generic

Vendor-agnostic SMART on FHIR connector for [interop-gateway](https://github.com/heyitskundan/interop-gateway):
OAuth2 client-credentials token exchange (`client_secret_post` and the backend-services
`private_key_jwt` flow), plus scope-checked `read()`/`search()` against a FHIR R4 server.

## Bring your own credentials

This package never ships with, brokers, or manages a shared credential. Whoever deploys
it registers their own app with each vendor (Epic, Cerner, etc.) and supplies their own
client ID, secret/key, and token endpoint. See
[`docs/vendor-onboarding.md`](https://github.com/heyitskundan/interop-gateway/blob/main/docs/vendor-onboarding.md)
in the main repo for the two-tier vendor/hospital access process this package does not
change.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source until then.

```bash
npm install @interop-gateway/core @interop-gateway/connector-smart-generic
```

## Use — backend-services (private_key_jwt), the preferred flow

```js
// JavaScript
import { SmartClient } from "@interop-gateway/connector-smart-generic";

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
import { SmartClient, type SmartClientOptions } from "@interop-gateway/connector-smart-generic";

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
`@interop-gateway/secrets-keychain`) to persist the fetched access token across
`SmartClient` instances/process restarts, refreshed automatically once it's within 30
seconds of expiry.

## Lower-level exports

`SmartClient` is built from three pieces also exported directly, for a consumer
building a custom connector variant instead of using `SmartClient` as-is:

- `fetchAccessToken(auth)` — runs the token exchange (`client_secret_post` or
  `private_key_jwt`) standalone, without a `SmartClient` instance.
- `TokenManager` — the caching/auto-refresh wrapper around `fetchAccessToken` that
  `SmartClient` uses internally; reusable if you need token caching without the rest of
  `SmartClient`'s scope-checked request surface.
- `classifyWriteFailureStatus(status)` — the same HTTP-status-to-`WriteFailureCode`
  mapping (`CONFLICT` for 409/412, `VALIDATION_FAILED` for 422, `REQUEST_FAILED`
  otherwise) `create`/`update`/`delete` use internally, exposed for a caller writing
  their own write path against a FHIR server.

## Testing against a sandbox

Development and demos target the free, open sandboxes that don't require a vendor
partnership: the SMART Health IT reference sandbox (`r4.smarthealthit.org` for open
reads, `launch.smarthealthit.org` for the full OAuth backend-services flow) and Epic's
`open.epic` sandbox.

`test/integration.test.ts` has two tests against the live `r4.smarthealthit.org`
sandbox, opt-in only:

```bash
RUN_LIVE_SANDBOX_TESTS=1 npm run test -w packages/connector-smart-generic
```

Skipped by default (including in CI/`npm test` at the repo root) — an external network
dependency this far outside the repo's control has no place gating an automated
pipeline.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
