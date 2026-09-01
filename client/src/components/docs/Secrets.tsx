import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Secrets() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        @interop-gateway/secrets
      </h1>
      <p style={muted}>
        Three <code>SecretsProvider</code> (from <code>@interop-gateway/core</code>) implementations
        — pick per environment.
      </p>

      <h2 id="install" className="mt-8">
        Install
      </h2>
      <CodeBlock lang="bash" code="npm install @interop-gateway/secrets" />

      <h2 id="keychain" className="mt-8">
        Keychain — development default
      </h2>
      <p style={muted}>
        Backed by the local OS keychain — macOS Keychain via the <code>security</code> CLI, Linux
        Secret Service via <code>secret-tool</code>. Production deployments should use Vault or AWS
        below instead.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { KeychainSecretsProvider } from "@interop-gateway/secrets";

const secrets = new KeychainSecretsProvider({ service: "interop-gateway" });
await secrets.setSecret({ name: "epic-sandbox-client-secret" }, "the-real-value");
const value = await secrets.getSecret({ name: "epic-sandbox-client-secret" });`,
          },
          {
            lang: "ts",
            code: `import { KeychainSecretsProvider } from "@interop-gateway/secrets";

const secrets = new KeychainSecretsProvider({ service: "interop-gateway" });
await secrets.setSecret({ name: "epic-sandbox-client-secret" }, "the-real-value");
const value = await secrets.getSecret({ name: "epic-sandbox-client-secret" });`,
          },
        ]}
      />
      <table className="table mb-4">
        <thead>
          <tr>
            <th>Platform</th>
            <th>Backend</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>macOS</td>
            <td className="text-muted">
              <code>security</code> (Keychain Access)
            </td>
          </tr>
          <tr>
            <td>Linux</td>
            <td className="text-muted">
              <code>secret-tool</code> (Secret Service / GNOME Keyring)
            </td>
          </tr>
          <tr>
            <td>Windows</td>
            <td className="text-muted">
              not yet implemented — throws a clear error naming Vault/AWS as the alternative
            </td>
          </tr>
        </tbody>
      </table>
      <p style={muted} className="text-sm">
        <strong>Known limitation:</strong> on macOS, the secret value is passed to{" "}
        <code>security add-generic-password -w &lt;value&gt;</code> as a process argument, which is
        briefly visible to other processes on the same machine via <code>ps</code>. That's an
        acceptable trade-off for a local development credential store — it is not an acceptable one
        for production secrets, which is why this provider is documented as the dev-only default.
      </p>

      <h2 id="vault" className="mt-8">
        Vault
      </h2>
      <p style={muted}>
        Backed by a{" "}
        <a href="https://www.vaultproject.io/" target="_blank" rel="noreferrer">
          HashiCorp Vault
        </a>{" "}
        KV v2 secrets engine.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { VaultSecretsProvider } from "@interop-gateway/secrets";

const secrets = new VaultSecretsProvider({
  vaultAddr: "https://vault.internal:8200",
  token: process.env.VAULT_TOKEN,
  mount: "secret", // KV v2 mount point, defaults to Vault's own default "secret"
});

await secrets.setSecret({ name: "epic-client-secret" }, "the-actual-value");
const value = await secrets.getSecret({ name: "epic-client-secret" });
await secrets.deleteSecret({ name: "epic-client-secret" });`,
          },
          {
            lang: "ts",
            code: `import { VaultSecretsProvider } from "@interop-gateway/secrets";

const secrets = new VaultSecretsProvider({
  vaultAddr: "https://vault.internal:8200",
  token: process.env.VAULT_TOKEN!,
  mount: "secret", // KV v2 mount point, defaults to Vault's own default "secret"
});

await secrets.setSecret({ name: "epic-client-secret" }, "the-actual-value");
const value = await secrets.getSecret({ name: "epic-client-secret" });
await secrets.deleteSecret({ name: "epic-client-secret" });`,
          },
        ]}
      />
      <p style={muted}>
        Each <code>SecretRef.name</code> maps to one KV v2 path, storing the value under a fixed{" "}
        <code>value</code> key. <code>vaultAddr</code> must be <code>https://</code> — the
        constructor throws <code>GatewayError</code> immediately for any other scheme.{" "}
        <code>deleteSecret</code> soft-deletes the latest version through the KV v2{" "}
        <code>data</code> endpoint, which Vault's own <code>vault kv undelete</code> can reverse.
      </p>

      <h2 id="aws" className="mt-8">
        AWS Secrets Manager
      </h2>
      <p style={muted}>
        Talks to the service's JSON 1.1 API directly via SigV4-signed requests from{" "}
        <a href="https://github.com/mhart/aws4fetch" target="_blank" rel="noreferrer">
          aws4fetch
        </a>{" "}
        rather than pulling in the full AWS SDK, to keep this package's dependency footprint small.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { AwsSecretsManagerProvider } from "@interop-gateway/secrets";

const secrets = new AwsSecretsManagerProvider({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN, // optional, for temporary credentials
  },
});

await secrets.setSecret({ name: "epic-client-secret" }, "the-actual-value");
const value = await secrets.getSecret({ name: "epic-client-secret" });
await secrets.deleteSecret({ name: "epic-client-secret" });`,
          },
          {
            lang: "ts",
            code: `import { AwsSecretsManagerProvider } from "@interop-gateway/secrets";

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
await secrets.deleteSecret({ name: "epic-client-secret" });`,
          },
        ]}
      />
      <p style={muted}>
        <code>setSecret</code> calls <code>PutSecretValue</code> first — the common case, where the
        secret already exists — and only falls back to <code>CreateSecret</code> on a{" "}
        <code>ResourceNotFoundException</code>. <code>deleteSecret</code> uses AWS's default 30-day
        recovery window rather than <code>ForceDeleteWithoutRecovery</code>, so a delete is
        reversible through the AWS Console/CLI unless your IAM policy is configured to force
        immediate deletion. Binary secrets (<code>SecretBinary</code>) aren't supported —{" "}
        <code>getSecret</code> throws <code>GatewayError</code> if the stored secret has no{" "}
        <code>SecretString</code>.
      </p>
    </div>
  );
}
