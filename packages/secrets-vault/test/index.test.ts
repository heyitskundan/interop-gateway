import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "@interop-gateway/core";
import { VaultSecretsProvider, type Fetcher } from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("VaultSecretsProvider", () => {
  it("throws immediately for a non-https vaultAddr, without calling the fetcher", () => {
    const fetcher = vi.fn();
    expect(
      () =>
        new VaultSecretsProvider({ vaultAddr: "http://vault.internal:8200", token: "t", fetcher }),
    ).toThrow(GatewayError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("getSecret reads the KV v2 data endpoint and returns the value key", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse(200, { data: { data: { value: "epic-client-secret-123" }, metadata: {} } }),
    );
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "root-token",
      fetcher,
    });

    const value = await provider.getSecret({ name: "epic-client-secret" });

    expect(value).toBe("epic-client-secret-123");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.internal:8200/v1/secret/data/epic-client-secret");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-Vault-Token"]).toBe("root-token");
  });

  it("uses a custom mount when given", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse(200, { data: { data: { value: "x" } } }),
    );
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "t",
      mount: "kv",
      fetcher,
    });

    await provider.getSecret({ name: "foo" });

    const [url] = fetcher.mock.calls[0] as [string];
    expect(url).toBe("https://vault.internal:8200/v1/kv/data/foo");
  });

  it("getSecret throws GatewayError with Vault's error list on a non-2xx response", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse(403, { errors: ["permission denied"] }),
    );
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "bad-token",
      fetcher,
    });

    await expect(provider.getSecret({ name: "foo" })).rejects.toThrow(/permission denied/);
  });

  it("getSecret throws GatewayError when the secret has no string value key", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { data: { data: {} } }));
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "t",
      fetcher,
    });

    await expect(provider.getSecret({ name: "foo" })).rejects.toThrow(GatewayError);
  });

  it("setSecret writes {data:{value}} to the KV v2 data endpoint", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, {}));
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "t",
      fetcher,
    });

    await provider.setSecret({ name: "foo" }, "new-value");

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.internal:8200/v1/secret/data/foo");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ data: { value: "new-value" } });
  });

  it("setSecret throws GatewayError on a non-2xx response", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(400, { errors: ["invalid path"] }));
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "t",
      fetcher,
    });

    await expect(provider.setSecret({ name: "foo" }, "x")).rejects.toThrow(/invalid path/);
  });

  it("deleteSecret calls DELETE on the data endpoint (soft delete, not metadata)", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, {}));
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "t",
      fetcher,
    });

    await provider.deleteSecret({ name: "foo" });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vault.internal:8200/v1/secret/data/foo");
    expect(init.method).toBe("DELETE");
  });

  it("deleteSecret throws GatewayError on a non-2xx response", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(500, { errors: ["internal error"] }));
    const provider = new VaultSecretsProvider({
      vaultAddr: "https://vault.internal:8200",
      token: "t",
      fetcher,
    });

    await expect(provider.deleteSecret({ name: "foo" })).rejects.toThrow(GatewayError);
  });
});
