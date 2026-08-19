import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenManager } from "../src/token-manager.js";
import type { SymmetricAuth } from "../src/token.js";
import type { SecretsProvider } from "@interop-gateway/core";

const auth: SymmetricAuth = {
  method: "client_secret_post",
  tokenUrl: "https://sandbox.example.org/auth/token",
  clientId: "test-client",
  clientSecret: "shh",
  scope: "system/Patient.read",
};

function mockTokenResponse(accessToken: string, expiresIn = 300): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        scope: "system/Patient.read",
      }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function fakeSecretsProvider(): SecretsProvider {
  const store = new Map<string, string>();
  return {
    async getSecret(ref) {
      const value = store.get(ref.name);
      if (value === undefined) throw new Error("not found");
      return value;
    },
    async setSecret(ref, value) {
      store.set(ref.name, value);
    },
    async deleteSecret(ref) {
      store.delete(ref.name);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TokenManager", () => {
  it("fetches a token on first call", async () => {
    const fetchMock = mockTokenResponse("token-1");
    const manager = new TokenManager(auth);

    const token = await manager.getToken();

    expect(token.accessToken).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the in-memory cached token without refetching while it's still valid", async () => {
    const fetchMock = mockTokenResponse("token-1");
    const manager = new TokenManager(auth);

    await manager.getToken();
    const second = await manager.getToken();

    expect(second.accessToken).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cached token is within the refresh margin of expiring", async () => {
    mockTokenResponse("token-1", 10);
    const manager = new TokenManager(auth);
    await manager.getToken();

    const fetchMock = mockTokenResponse("token-2");
    const second = await manager.getToken();

    expect(second.accessToken).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persists the fetched token through the given SecretsProvider", async () => {
    mockTokenResponse("token-1");
    const secrets = fakeSecretsProvider();
    const manager = new TokenManager(auth, secrets);

    await manager.getToken();

    const stored = JSON.parse(
      await secrets.getSecret({ name: "interop-gateway:connector-smart-generic:access-token" }),
    );
    expect(stored.accessToken).toBe("token-1");
  });

  it("reuses a still-valid token found in the SecretsProvider instead of fetching", async () => {
    const secrets = fakeSecretsProvider();
    await secrets.setSecret(
      { name: "interop-gateway:connector-smart-generic:access-token" },
      JSON.stringify({
        accessToken: "cached-token",
        tokenType: "Bearer",
        expiresAt: Date.now() + 60_000,
        scope: "system/Patient.read",
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const manager = new TokenManager(auth, secrets);
    const token = await manager.getToken();

    expect(token.accessToken).toBe("cached-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
