# @interop-gateway/secrets-keychain

A `SecretsProvider` (from `@interop-gateway/core`) backed by the local OS keychain —
macOS Keychain via the `security` CLI, Linux Secret Service via `secret-tool`. This is
the **development default** named in interop-gateway's architecture: production
deployments should use `@interop-gateway/secrets-vault` or `@interop-gateway/secrets-aws`
instead.

## Install

```bash
npm install @interop-gateway/secrets-keychain
```

## Use

```js
// JavaScript
import { KeychainSecretsProvider } from "@interop-gateway/secrets-keychain";

const secrets = new KeychainSecretsProvider({ service: "interop-gateway" });
await secrets.setSecret({ name: "epic-sandbox-client-secret" }, "the-real-value");
const value = await secrets.getSecret({ name: "epic-sandbox-client-secret" });
```

```ts
// TypeScript
import { KeychainSecretsProvider } from "@interop-gateway/secrets-keychain";
import type { SecretsProvider } from "@interop-gateway/core";

const secrets: SecretsProvider = new KeychainSecretsProvider({ service: "interop-gateway" });
```

## Platform support

| Platform | Backend                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------- |
| macOS    | `security` (Keychain Access)                                                                       |
| Linux    | `secret-tool` (Secret Service / GNOME Keyring)                                                     |
| Windows  | not yet implemented — throws a clear error naming `secrets-vault`/`secrets-aws` as the alternative |

## Known limitation

On macOS, the secret value is passed to `security add-generic-password -w <value>` as a
process argument, which is briefly visible to other processes on the same machine via
`ps`. That's an acceptable trade-off for a local development credential store — it is
not an acceptable one for production secrets, which is why this package is documented as
the dev-only default rather than a production `SecretsProvider`.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
