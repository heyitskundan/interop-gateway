import { afterEach, describe, expect, it, vi } from "vitest";
import { SmartClient } from "../src/client.js";
import { GatewayError, ScopeError, TlsError } from "@interop-gateway/core";
import type { SymmetricAuth } from "../src/token.js";

const auth: SymmetricAuth = {
  method: "client_secret_post",
  tokenUrl: "https://sandbox.example.org/auth/token",
  clientId: "test-client",
  clientSecret: "shh",
  scope: "system/Patient.read",
};

function mockFetch(
  sequence: Array<{ ok: boolean; status?: number; body: unknown }>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of sequence) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: () => Promise.resolve(response.body),
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const TOKEN_BODY = {
  access_token: "abc123",
  token_type: "Bearer",
  expires_in: 300,
  scope: "system/Patient.read",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SmartClient", () => {
  it("rejects a non-https baseUrl at construction time", () => {
    expect(
      () =>
        new SmartClient({
          baseUrl: "http://sandbox.example.org/fhir",
          auth,
          scopes: [{ resourceType: "Patient", operations: ["read"] }],
        }),
    ).toThrow(TlsError);
  });

  it("read() fetches a token then the resource, and returns the parsed JSON", async () => {
    const patient = { resourceType: "Patient", id: "123" };
    mockFetch([
      { ok: true, body: TOKEN_BODY },
      { ok: true, body: patient },
    ]);

    const client = new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Patient", operations: ["read"] }],
    });

    const result = await client.read("Patient", "123");
    expect(result).toEqual(patient);
  });

  it("read() sends the access token as a Bearer Authorization header", async () => {
    const fetchMock = mockFetch([
      { ok: true, body: TOKEN_BODY },
      { ok: true, body: { resourceType: "Patient", id: "123" } },
    ]);

    const client = new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Patient", operations: ["read"] }],
    });
    await client.read("Patient", "123");

    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect((requestInit.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });

  it("read() throws ScopeError and never calls fetch when the resource type isn't granted", async () => {
    const fetchMock = mockFetch([]);
    const client = new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Observation", operations: ["read"] }],
    });

    await expect(client.read("Patient", "123")).rejects.toThrow(ScopeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("search() appends query params and requires the search operation to be granted", async () => {
    const bundle = { resourceType: "Bundle", entry: [] };
    const fetchMock = mockFetch([
      { ok: true, body: TOKEN_BODY },
      { ok: true, body: bundle },
    ]);

    const client = new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Patient", operations: ["search"] }],
    });
    const result = await client.search("Patient", { family: "Doe" });

    expect(result).toEqual(bundle);
    const [requestedUrl] = fetchMock.mock.calls[1] as [URL];
    expect(requestedUrl.toString()).toContain("family=Doe");
  });

  it("search() throws ScopeError when only read (not search) is granted", async () => {
    const fetchMock = mockFetch([]);
    const client = new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Patient", operations: ["read"] }],
    });

    await expect(client.search("Patient", {})).rejects.toThrow(ScopeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws GatewayError with the resource path (never a value) when the server errors", async () => {
    mockFetch([
      { ok: true, body: TOKEN_BODY },
      { ok: false, status: 404, body: { resourceType: "OperationOutcome" } },
    ]);

    const client = new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Patient", operations: ["read"] }],
    });

    await expect(client.read("Patient", "does-not-exist")).rejects.toThrow(GatewayError);
  });
});
