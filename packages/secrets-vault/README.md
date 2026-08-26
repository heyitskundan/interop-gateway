# @interop-gateway/secrets-vault

`SecretsProvider` backed by a [HashiCorp Vault](https://www.vaultproject.io/) KV v2
secrets engine, for [interop-gateway](https://github.com/heyitskundan/interop-gateway).

## Install

```bash
npm install @interop-gateway/secrets-vault
```

## Use

```ts
import { VaultSecretsProvider } from "@interop-gateway/secrets-vault";

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

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
