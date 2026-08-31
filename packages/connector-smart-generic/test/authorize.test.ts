import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  generatePkce,
  refreshAccessToken,
} from "../src/token.js";
import { GatewayError, TlsError } from "@interop-gateway/core";

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
  scope: "patient/Patient.read offline_access",
  refresh_token: "refresh-1",
  patient: "patient-123",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generatePkce", () => {
  it("produces a code_verifier and a matching S256 code_challenge", async () => {
    const { codeVerifier, codeChallenge } = await generatePkce();

    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    // Recompute the challenge independently and confirm it matches — proves this is a
    // real SHA-256 digest of codeVerifier, not just a random second string.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const expected = Buffer.from(digest).toString("base64url");
    expect(codeChallenge).toBe(expected);
  });

  it("generates a different verifier/challenge pair every call", async () => {
    const first = await generatePkce();
    const second = await generatePkce();

    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).not.toBe(second.codeChallenge);
  });
});

describe("buildAuthorizationUrl", () => {
  it("includes response_type, client_id, redirect_uri, scope, state, and S256 PKCE params", async () => {
    const request = await buildAuthorizationUrl({
      authorizeUrl: "https://sandbox.example.org/auth/authorize",
      clientId: "test-client",
      redirectUri: "https://app.example.org/callback",
      scope: "launch/patient patient/Patient.read offline_access",
    });

    expect(request.url.searchParams.get("response_type")).toBe("code");
    expect(request.url.searchParams.get("client_id")).toBe("test-client");
    expect(request.url.searchParams.get("redirect_uri")).toBe("https://app.example.org/callback");
    expect(request.url.searchParams.get("scope")).toBe(
      "launch/patient patient/Patient.read offline_access",
    );
    expect(request.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(request.url.searchParams.get("code_challenge")).toBeTruthy();
    expect(request.url.searchParams.get("state")).toBe(request.state);
    expect(request.codeVerifier).toBeTruthy();
  });

  it("includes aud and launch when given (EHR launch context)", async () => {
    const request = await buildAuthorizationUrl({
      authorizeUrl: "https://sandbox.example.org/auth/authorize",
      clientId: "test-client",
      redirectUri: "https://app.example.org/callback",
      scope: "launch patient/Patient.read",
      aud: "https://sandbox.example.org/fhir",
      launch: "launch-context-token",
    });

    expect(request.url.searchParams.get("aud")).toBe("https://sandbox.example.org/fhir");
    expect(request.url.searchParams.get("launch")).toBe("launch-context-token");
  });

  it("omits aud/launch for a standalone launch when not given", async () => {
    const request = await buildAuthorizationUrl({
      authorizeUrl: "https://sandbox.example.org/auth/authorize",
      clientId: "test-client",
      redirectUri: "https://app.example.org/callback",
      scope: "patient/Patient.read",
    });

    expect(request.url.searchParams.has("aud")).toBe(false);
    expect(request.url.searchParams.has("launch")).toBe(false);
  });

  it("uses the given state instead of generating one when provided", async () => {
    const request = await buildAuthorizationUrl({
      authorizeUrl: "https://sandbox.example.org/auth/authorize",
      clientId: "test-client",
      redirectUri: "https://app.example.org/callback",
      scope: "patient/Patient.read",
      state: "caller-supplied-state",
    });

    expect(request.state).toBe("caller-supplied-state");
    expect(request.url.searchParams.get("state")).toBe("caller-supplied-state");
  });

  it("rejects a non-https authorizeUrl", async () => {
    await expect(
      buildAuthorizationUrl({
        authorizeUrl: "http://sandbox.example.org/auth/authorize",
        clientId: "test-client",
        redirectUri: "https://app.example.org/callback",
        scope: "patient/Patient.read",
      }),
    ).rejects.toThrow(TlsError);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts grant_type=authorization_code with the code and code_verifier, and returns launch context", async () => {
    const fetchMock = mockFetchJson(TOKEN_RESPONSE);

    const token = await exchangeAuthorizationCode({
      tokenUrl: "https://sandbox.example.org/auth/token",
      code: "auth-code-1",
      redirectUri: "https://app.example.org/callback",
      clientId: "test-client",
      codeVerifier: "verifier-1",
    });

    expect(token.accessToken).toBe("abc123");
    expect(token.refreshToken).toBe("refresh-1");
    expect(token.patient).toBe("patient-123");

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    expect(sentBody.get("grant_type")).toBe("authorization_code");
    expect(sentBody.get("code")).toBe("auth-code-1");
    expect(sentBody.get("code_verifier")).toBe("verifier-1");
    expect(sentBody.has("client_secret")).toBe(false); // public client — PKCE only
  });

  it("includes client_secret when given (confidential client)", async () => {
    const fetchMock = mockFetchJson(TOKEN_RESPONSE);

    await exchangeAuthorizationCode({
      tokenUrl: "https://sandbox.example.org/auth/token",
      code: "auth-code-1",
      redirectUri: "https://app.example.org/callback",
      clientId: "test-client",
      codeVerifier: "verifier-1",
      clientSecret: "confidential-secret",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    expect(sentBody.get("client_secret")).toBe("confidential-secret");
  });

  it("throws GatewayError on a rejected code exchange", async () => {
    mockFetchJson({ error: "invalid_grant" }, false, 400);

    await expect(
      exchangeAuthorizationCode({
        tokenUrl: "https://sandbox.example.org/auth/token",
        code: "expired-code",
        redirectUri: "https://app.example.org/callback",
        clientId: "test-client",
        codeVerifier: "verifier-1",
      }),
    ).rejects.toThrow(GatewayError);
  });
});

describe("refreshAccessToken", () => {
  it("posts grant_type=refresh_token and returns the new token", async () => {
    const fetchMock = mockFetchJson({ ...TOKEN_RESPONSE, access_token: "refreshed-abc" });

    const token = await refreshAccessToken({
      tokenUrl: "https://sandbox.example.org/auth/token",
      refreshToken: "refresh-1",
      clientId: "test-client",
    });

    expect(token.accessToken).toBe("refreshed-abc");
    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const sentBody = new URLSearchParams(requestInit.body as string);
    expect(sentBody.get("grant_type")).toBe("refresh_token");
    expect(sentBody.get("refresh_token")).toBe("refresh-1");
  });

  it("throws GatewayError when the refresh token is rejected", async () => {
    mockFetchJson({ error: "invalid_grant" }, false, 400);

    await expect(
      refreshAccessToken({
        tokenUrl: "https://sandbox.example.org/auth/token",
        refreshToken: "revoked-token",
        clientId: "test-client",
      }),
    ).rejects.toThrow(GatewayError);
  });
});
