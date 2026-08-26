import { enforceTls, GatewayError, type SecretRef, type SecretsProvider } from "@interop-gateway/core";

export type Fetcher = typeof fetch;

export interface VaultSecretsProviderOptions {
  readonly vaultAddr: string;
  readonly token: string;
  /** KV v2 mount point. Defaults to "secret", Vault's own default mount name. */
  readonly mount?: string;
  readonly fetcher?: Fetcher;
}

interface VaultErrorBody {
  readonly errors?: readonly string[];
}

function vaultError(action: string, status: number, body: VaultErrorBody): GatewayError {
  const detail = body.errors?.join("; ") || `HTTP ${status}`;
  return new GatewayError(`Vault ${action} failed: ${detail}`, "VAULT_REQUEST_FAILED");
}

/**
 * `SecretsProvider` backed by a HashiCorp Vault KV v2 secrets engine. Each `SecretRef`
 * maps to one KV v2 path, storing the value under a fixed `value` key so the provider's
 * single-string-in/single-string-out interface has a stable shape to read and write.
 *
 * `deleteSecret` soft-deletes the latest version via the KV v2 `data` endpoint
 * (recoverable with Vault's own `vault kv undelete`), not the `metadata` endpoint,
 * which would permanently destroy every version.
 */
export class VaultSecretsProvider implements SecretsProvider {
  private readonly vaultAddr: string;
  private readonly mount: string;
  private readonly fetcher: Fetcher;

  constructor(private readonly options: VaultSecretsProviderOptions) {
    this.vaultAddr = enforceTls(options.vaultAddr).toString().replace(/\/$/, "");
    this.mount = options.mount ?? "secret";
    this.fetcher = options.fetcher ?? fetch;
  }

  private dataUrl(name: string): string {
    return `${this.vaultAddr}/v1/${this.mount}/data/${name}`;
  }

  private headers(): Record<string, string> {
    return { "X-Vault-Token": this.options.token, "Content-Type": "application/json" };
  }

  async getSecret(ref: SecretRef): Promise<string> {
    const response = await this.fetcher(this.dataUrl(ref.name), {
      method: "GET",
      headers: this.headers(),
    });
    const body: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw vaultError("read", response.status, body as VaultErrorBody);
    }

    const value = (body as { data?: { data?: { value?: unknown } } }).data?.data?.value;
    if (typeof value !== "string") {
      throw new GatewayError(
        `Vault secret "${ref.name}" has no string "value" key at ${this.mount}/data/${ref.name}`,
        "VAULT_SECRET_SHAPE_INVALID",
      );
    }
    return value;
  }

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    const response = await this.fetcher(this.dataUrl(ref.name), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ data: { value } }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({}));
      throw vaultError("write", response.status, body as VaultErrorBody);
    }
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    const response = await this.fetcher(this.dataUrl(ref.name), {
      method: "DELETE",
      headers: this.headers(),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({}));
      throw vaultError("delete", response.status, body as VaultErrorBody);
    }
  }
}
