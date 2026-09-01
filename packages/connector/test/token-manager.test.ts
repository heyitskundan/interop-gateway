import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenManager } from "../src/token-manager.js";
import type { AccessToken, AuthorizationCodeAuth, SymmetricAuth } from "../src/token.js";
import { GatewayError, type SecretsProvider } from "@interop-gateway/core";

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
      await secrets.getSecret({ name: "interop-gateway:connector:access-token" }),
    );
    expect(stored.accessToken).toBe("token-1");
  });

  it("reuses a still-valid token found in the SecretsProvider instead of fetching", async () => {
    const secrets = fakeSecretsProvider();
    await secrets.setSecret(
      { name: "interop-gateway:connector:access-token" },
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

function mockRefreshResponse(accessToken: string, expiresIn = 300): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        scope: "patient/Patient.read offline_access",
        refresh_token: "refresh-2",
      }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("TokenManager — authorization_code", () => {
  function authWith(initialToken: AccessToken): AuthorizationCodeAuth {
    return {
      method: "authorization_code",
      tokenUrl: "https://sandbox.example.org/auth/token",
      clientId: "test-client",
      redirectUri: "https://app.example.org/callback",
      initialToken,
    };
  }

  it("returns the initial token without any fetch while it's still valid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const manager = new TokenManager(
      authWith({
        accessToken: "initial-token",
        tokenType: "Bearer",
        expiresAt: Date.now() + 60_000,
        scope: "patient/Patient.read",
        refreshToken: "refresh-1",
      }),
    );

    const token = await manager.getToken();

    expect(token.accessToken).toBe("initial-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes via grant_type=refresh_token once the initial token is near expiry", async () => {
    const fetchMock = mockRefreshResponse("refreshed-token");
    const manager = new TokenManager(
      authWith({
        accessToken: "initial-token",
        tokenType: "Bearer",
        expiresAt: Date.now() + 10_000, // within the 30s refresh margin
        scope: "patient/Patient.read",
        refreshToken: "refresh-1",
      }),
    );

    const token = await manager.getToken();

    expect(token.accessToken).toBe("refreshed-token");
    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    expect(sentBody.get("grant_type")).toBe("refresh_token");
    expect(sentBody.get("refresh_token")).toBe("refresh-1");
  });

  it("uses the rotated refresh_token from a prior refresh on the next refresh", async () => {
    mockRefreshResponse("refreshed-token", 10); // itself near-expiry, forcing a second refresh
    const manager = new TokenManager(
      authWith({
        accessToken: "initial-token",
        tokenType: "Bearer",
        expiresAt: Date.now() + 10_000,
        scope: "patient/Patient.read",
        refreshToken: "refresh-1",
      }),
    );
    await manager.getToken();

    const fetchMock = mockRefreshResponse("refreshed-token-2");
    await manager.getToken();

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    // "refresh-2" is what mockRefreshResponse's body always returns as the new
    // refresh_token — proves the manager tracked the rotated token, not the original.
    expect(sentBody.get("refresh_token")).toBe("refresh-2");
  });

  it("throws REFRESH_TOKEN_UNAVAILABLE instead of calling fetch when there is no refresh token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const manager = new TokenManager(
      authWith({
        accessToken: "initial-token",
        tokenType: "Bearer",
        expiresAt: Date.now() + 10_000,
        scope: "patient/Patient.read",
        // no refreshToken — e.g. offline_access wasn't granted
      }),
    );

    await expect(manager.getToken()).rejects.toThrow(GatewayError);
    await expect(manager.getToken()).rejects.toMatchObject({ code: "REFRESH_TOKEN_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
