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

## Testing against a sandbox

Development and demos target the free, open sandboxes that don't require a vendor
partnership: the SMART Health IT reference sandbox (`r4.smarthealthit.org` for open
reads, `launch.smarthealthit.org` for the full OAuth backend-services flow) and Epic's
`open.epic` sandbox.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
