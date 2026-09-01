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

function mockFetchWithHeaders(
  sequence: Array<{
    ok: boolean;
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
  }>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of sequence) {
    const headers = new Map(Object.entries(response.headers ?? {}));
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: () => Promise.resolve(response.body),
      text: () => Promise.resolve(typeof response.body === "string" ? response.body : ""),
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SmartClient — bulk export ($export)", () => {
  function makeClient(): SmartClient {
    return new SmartClient({
      baseUrl: "https://sandbox.example.org/fhir",
      auth,
      scopes: [{ resourceType: "Patient", operations: ["read"] }],
    });
  }

  it("startBulkExport returns the Content-Location as the job's statusUrl", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      {
        ok: true,
        status: 202,
        headers: { "content-location": "https://sandbox.example.org/fhir/bulk/status/1" },
      },
    ]);

    const job = await makeClient().startBulkExport({ level: "system" });

    expect(job.statusUrl).toBe("https://sandbox.example.org/fhir/bulk/status/1");
  });

  it("startBulkExport sends Prefer: respond-async", async () => {
    const fetchMock = mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      {
        ok: true,
        status: 202,
        headers: { "content-location": "https://sandbox.example.org/fhir/bulk/status/1" },
      },
    ]);

    await makeClient().startBulkExport({ level: "patient" });

    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect((requestInit.headers as Record<string, string>).Prefer).toBe("respond-async");
  });

  it("startBulkExport throws GatewayError when the server doesn't return 202", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: false, status: 400 },
    ]);

    await expect(makeClient().startBulkExport({ level: "system" })).rejects.toThrow(GatewayError);
  });

  it("startBulkExport throws GatewayError when 202 has no Content-Location header", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: true, status: 202 },
    ]);

    await expect(makeClient().startBulkExport({ level: "system" })).rejects.toThrow(GatewayError);
  });

  it("checkBulkExportStatus reports in-progress with progress/retry-after from headers", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      {
        ok: true,
        status: 202,
        headers: { "x-progress": "50% done", "retry-after": "5" },
      },
    ]);

    const status = await makeClient().checkBulkExportStatus({
      statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
    });

    expect(status).toEqual({ status: "in-progress", progress: "50% done", retryAfterSeconds: 5 });
  });

  it("checkBulkExportStatus reports completed with the output file list", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      {
        ok: true,
        status: 200,
        body: {
          transactionTime: "2026-01-01T00:00:00Z",
          requiresAccessToken: true,
          output: [{ type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" }],
        },
      },
    ]);

    const status = await makeClient().checkBulkExportStatus({
      statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
    });

    expect(status.status).toBe("completed");
    if (status.status === "completed") {
      expect(status.output).toEqual([
        { type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" },
      ]);
      expect(status.requiresAccessToken).toBe(true);
    }
  });

  it("checkBulkExportStatus reports error for any other status", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: false, status: 500, body: { resourceType: "OperationOutcome" } },
    ]);

    const status = await makeClient().checkBulkExportStatus({
      statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
    });

    expect(status.status).toBe("error");
  });

  it("pollBulkExportUntilComplete polls until completed, waiting retryAfterSeconds between attempts", async () => {
    vi.useFakeTimers();
    try {
      mockFetchWithHeaders([
        { ok: true, body: TOKEN_BODY },
        { ok: true, status: 202, headers: { "retry-after": "0" } },
        {
          ok: true,
          status: 200,
          body: { transactionTime: "t", requiresAccessToken: false, output: [] },
        },
      ]);

      const resultPromise = makeClient().pollBulkExportUntilComplete({
        statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe("completed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pollBulkExportUntilComplete throws GatewayError/BULK_EXPORT_FAILED on an error status", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: false, status: 500, body: { resourceType: "OperationOutcome" } },
    ]);

    await expect(
      makeClient().pollBulkExportUntilComplete({
        statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
      }),
    ).rejects.toMatchObject({ code: "BULK_EXPORT_FAILED" });
  });

  it("downloadBulkExportFile sends no Authorization header by default", async () => {
    const fetchMock = mockFetchWithHeaders([{ ok: true, body: "line1\nline2" }]);

    const text = await makeClient().downloadBulkExportFile({
      type: "Patient",
      url: "https://sandbox.example.org/files/patient.ndjson",
    });

    expect(text).toBe("line1\nline2");
    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(
      (requestInit.headers as Record<string, string> | undefined)?.Authorization,
    ).toBeUndefined();
  });

  it("downloadBulkExportFile sends the bearer token when requiresAccessToken is true", async () => {
    const fetchMock = mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: true, body: "line1" },
    ]);

    await makeClient().downloadBulkExportFile(
      { type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" },
      { requiresAccessToken: true },
    );

    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect((requestInit.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });

  it("cancelBulkExport sends DELETE to the status URL", async () => {
    const fetchMock = mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: true, status: 202 },
    ]);

    await makeClient().cancelBulkExport({
      statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
    });

    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(requestInit.method).toBe("DELETE");
  });

  it("cancelBulkExport throws GatewayError on a non-2xx response", async () => {
    mockFetchWithHeaders([
      { ok: true, body: TOKEN_BODY },
      { ok: false, status: 404 },
    ]);

    await expect(
      makeClient().cancelBulkExport({
        statusUrl: "https://sandbox.example.org/fhir/bulk/status/1",
      }),
    ).rejects.toThrow(GatewayError);
  });
});
