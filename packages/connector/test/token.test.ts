import { decodeJwt, decodeProtectedHeader, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchAccessToken, type AsymmetricAuth, type SymmetricAuth } from "../src/token.js";
import { GatewayError, TlsError } from "@interop-gateway/core";

let asymmetricAuth: AsymmetricAuth;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS384");
  const jwk = await exportJWK(privateKey);
  asymmetricAuth = {
    method: "private_key_jwt",
    tokenUrl: "https://sandbox.example.org/auth/token",
    clientId: "test-client",
    privateKey: jwk,
    kid: "test-key-1",
    alg: "RS384",
    scope: "system/Patient.read",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchJson(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const TOKEN_RESPONSE = {
  access_token: "abc123",
  token_type: "Bearer",
  expires_in: 300,
  scope: "system/Patient.read",
};

describe("fetchAccessToken — client_secret_post", () => {
  it("posts client_id/client_secret and returns the parsed access token", async () => {
    const fetchMock = mockFetchJson(TOKEN_RESPONSE);
    const auth: SymmetricAuth = {
      method: "client_secret_post",
      tokenUrl: "https://sandbox.example.org/auth/token",
      clientId: "test-client",
      clientSecret: "shh",
      scope: "system/Patient.read",
    };

    const token = await fetchAccessToken(auth);

    expect(token.accessToken).toBe("abc123");
    expect(token.tokenType).toBe("Bearer");
    expect(token.scope).toBe("system/Patient.read");
    expect(token.expiresAt).toBeGreaterThan(Date.now());

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    expect(sentBody.get("grant_type")).toBe("client_credentials");
    expect(sentBody.get("client_id")).toBe("test-client");
    expect(sentBody.get("client_secret")).toBe("shh");
  });

  it("rejects a tokenUrl that isn't https", async () => {
    mockFetchJson(TOKEN_RESPONSE);
    const auth: SymmetricAuth = {
      method: "client_secret_post",
      tokenUrl: "http://sandbox.example.org/auth/token",
      clientId: "test-client",
      clientSecret: "shh",
      scope: "system/Patient.read",
    };

    await expect(fetchAccessToken(auth)).rejects.toThrow(TlsError);
  });

  it("throws GatewayError on a non-2xx response", async () => {
    mockFetchJson({ error: "invalid_client" }, false, 401);
    const auth: SymmetricAuth = {
      method: "client_secret_post",
      tokenUrl: "https://sandbox.example.org/auth/token",
      clientId: "test-client",
      clientSecret: "wrong",
      scope: "system/Patient.read",
    };

    await expect(fetchAccessToken(auth)).rejects.toThrow(GatewayError);
  });

  it("throws GatewayError when the response body is missing required fields", async () => {
    mockFetchJson({ access_token: "abc123" });
    const auth: SymmetricAuth = {
      method: "client_secret_post",
      tokenUrl: "https://sandbox.example.org/auth/token",
      clientId: "test-client",
      clientSecret: "shh",
      scope: "system/Patient.read",
    };

    await expect(fetchAccessToken(auth)).rejects.toThrow(GatewayError);
  });
});

describe("fetchAccessToken — private_key_jwt", () => {
  it("signs a client assertion JWT with the configured key/alg/kid and posts it", async () => {
    const fetchMock = mockFetchJson(TOKEN_RESPONSE);

    const token = await fetchAccessToken(asymmetricAuth);

    expect(token.accessToken).toBe("abc123");

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    expect(sentBody.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );

    const assertion = sentBody.get("client_assertion")!;
    const header = decodeProtectedHeader(assertion);
    const claims = decodeJwt(assertion);
    expect(header.alg).toBe("RS384");
    expect(header.kid).toBe("test-key-1");
    expect(claims.iss).toBe("test-client");
    expect(claims.sub).toBe("test-client");
    expect(claims.aud).toBe("https://sandbox.example.org/auth/token");
    expect(claims.jti).toBeTruthy();
  });

  it("never includes the raw private key material in the request body", async () => {
    const fetchMock = mockFetchJson(TOKEN_RESPONSE);
    await fetchAccessToken(asymmetricAuth);

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const bodyText = requestInit.body as string;
    expect(bodyText).not.toContain(asymmetricAuth.privateKey.n as string);
  });
});
