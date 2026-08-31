# @interop-gateway/secrets-aws

`SecretsProvider` backed by AWS Secrets Manager, for
[interop-gateway](https://github.com/heyitskundan/interop-gateway). Talks to the
service's JSON 1.1 API directly via SigV4-signed requests from
[`aws4fetch`](https://github.com/mhart/aws4fetch) rather than pulling in the full AWS
SDK, to keep this package's dependency footprint small.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source until then.

```bash
npm install @interop-gateway/secrets-aws
```

## Use

```ts
import { AwsSecretsManagerProvider } from "@interop-gateway/secrets-aws";

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
