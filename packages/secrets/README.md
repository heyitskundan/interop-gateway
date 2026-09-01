# @interop-gateway/secrets

Three `SecretsProvider` (from [`@interop-gateway/core`](../core/README.md))
implementations for [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
pick per environment.

## Install

```bash
npm install @interop-gateway/secrets
```

## Keychain — development default

Backed by the local OS keychain — macOS Keychain via the `security` CLI, Linux Secret
Service via `secret-tool`. Production deployments should use Vault or AWS below instead.

```ts
import { KeychainSecretsProvider } from "@interop-gateway/secrets";

const secrets = new KeychainSecretsProvider({ service: "interop-gateway" });
await secrets.setSecret({ name: "epic-sandbox-client-secret" }, "the-real-value");
const value = await secrets.getSecret({ name: "epic-sandbox-client-secret" });
```

| Platform | Backend                                                                        |
| -------- | ------------------------------------------------------------------------------ |
| macOS    | `security` (Keychain Access)                                                   |
| Linux    | `secret-tool` (Secret Service / GNOME Keyring)                                 |
| Windows  | not yet implemented — throws a clear error naming Vault/AWS as the alternative |

**Known limitation**: on macOS, the secret value is passed to
`security add-generic-password -w <value>` as a process argument, which is briefly
visible to other processes on the same machine via `ps`. That's an acceptable trade-off
for a local development credential store — it is not an acceptable one for production
secrets, which is why this provider is documented as the dev-only default.

## Vault

Backed by a [HashiCorp Vault](https://www.vaultproject.io/) KV v2 secrets engine.

```ts
import { VaultSecretsProvider } from "@interop-gateway/secrets";

const secrets = new VaultSecretsProvider({
  vaultAddr: "https://vault.internal:8200",
  token: process.env.VAULT_TOKEN!,
  mount: "secret", // KV v2 mount point, defaults to Vault's own default "secret"
});

await secrets.setSecret({ name: "epic-client-secret" }, "the-actual-value");
const value = await secrets.getSecret({ name: "epic-client-secret" });
await secrets.deleteSecret({ name: "epic-client-secret" });
```

Each `SecretRef.name` maps to one KV v2 path, storing the value under a fixed `value`
key. `vaultAddr` must be `https://` — the constructor throws `GatewayError` immediately
for any other scheme.

`deleteSecret` soft-deletes the latest version through the KV v2 `data` endpoint, which
Vault's own `vault kv undelete` can reverse. It does not call the `metadata` endpoint,
which would permanently destroy every version of the secret.

## AWS Secrets Manager

Talks to the service's JSON 1.1 API directly via SigV4-signed requests from
[`aws4fetch`](https://github.com/mhart/aws4fetch) rather than pulling in the full AWS
SDK, to keep this package's dependency footprint small.

```ts
import { AwsSecretsManagerProvider } from "@interop-gateway/secrets";

const secrets = new AwsSecretsManagerProvider({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN, // optional, for temporary credentials
  },
});

await secrets.setSecret({ name: "epic-client-secret" }, "the-actual-value");
const value = await secrets.getSecret({ name: "epic-client-secret" });
await secrets.deleteSecret({ name: "epic-client-secret" });
```

`setSecret` calls `PutSecretValue` first — the common case, where the secret already
exists — and only falls back to `CreateSecret` on a `ResourceNotFoundException`. Any
other failure from `PutSecretValue` is not retried as a create.

`deleteSecret` uses AWS's default 30-day recovery window rather than
`ForceDeleteWithoutRecovery`, so a delete is reversible through the AWS Console/CLI
unless your Secrets Manager IAM policy is configured to force immediate deletion.

Binary secrets (`SecretBinary`) aren't supported — `getSecret` throws `GatewayError` if
the stored secret has no `SecretString`.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
