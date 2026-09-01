import { afterEach, describe, expect, it, vi } from "vitest";
import { SmartClient } from "../src/client.js";
import { ScopeError } from "@interop-gateway/core";
import type { SymmetricAuth } from "../src/token.js";
import type { WriteOperation } from "../src/write.js";

const auth: SymmetricAuth = {
  method: "client_secret_post",
  tokenUrl: "https://sandbox.example.org/auth/token",
  clientId: "test-client",
  clientSecret: "shh",
  scope: "system/Patient.write",
};

const TOKEN_BODY = {
  access_token: "abc123",
  token_type: "Bearer",
  expires_in: 300,
  scope: "system/Patient.write",
};

function mockFetch(
  sequence: Array<{ ok: boolean; status: number; body: unknown }>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const response of sequence) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status,
      json: () => Promise.resolve(response.body),
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function client(
  scopes: Array<{ resourceType: string; operations: readonly ("read" | "write" | "search")[] }>,
) {
  return new SmartClient({ baseUrl: "https://sandbox.example.org/fhir", auth, scopes });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SmartClient.create", () => {
  it("POSTs the resource and returns a WriteSuccess with the server's response body", async () => {
    const created = { resourceType: "Patient", id: "new-1" };
    const fetchMock = mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: true, status: 201, body: created },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).create(
      "Patient",
      {
        resourceType: "Patient",
      },
    );

    expect(result).toEqual({ ok: true, status: 201, resource: created });
    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(requestInit.method).toBe("POST");
  });

  it("throws ScopeError before any network call when write isn't granted", async () => {
    const fetchMock = mockFetch([]);
    await expect(
      client([{ resourceType: "Patient", operations: ["read"] }]).create("Patient", {}),
    ).rejects.toThrow(ScopeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a VALIDATION_FAILED WriteFailure on a 422, without throwing", async () => {
    const outcome = { resourceType: "OperationOutcome", issue: [{ severity: "error" }] };
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: false, status: 422, body: outcome },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).create(
      "Patient",
      {},
    );

    expect(result).toEqual({
      ok: false,
      status: 422,
      code: "VALIDATION_FAILED",
      path: "Patient",
      issues: outcome,
    });
  });
});

describe("SmartClient.update", () => {
  it("PUTs to resourceType/id and returns a WriteSuccess on 200", async () => {
    const updated = { resourceType: "Patient", id: "123" };
    const fetchMock = mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: true, status: 200, body: updated },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).update(
      "Patient",
      "123",
      updated,
    );

    expect(result).toEqual({ ok: true, status: 200, resource: updated });
    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(requestInit.method).toBe("PUT");
  });

  it("returns a CONFLICT WriteFailure on a 409 version conflict", async () => {
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: false, status: 409, body: { resourceType: "OperationOutcome" } },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).update(
      "Patient",
      "123",
      {},
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFLICT");
      expect(result.path).toBe("Patient/123");
    }
  });

  it("returns a CONFLICT WriteFailure on a 412 precondition-failed", async () => {
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: false, status: 412, body: {} },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).update(
      "Patient",
      "123",
      {},
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });
});

describe("SmartClient.delete", () => {
  it("DELETEs resourceType/id and returns a WriteSuccess with no resource on 204", async () => {
    const fetchMock = mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: true, status: 204, body: undefined },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).delete(
      "Patient",
      "123",
    );

    expect(result).toEqual({ ok: true, status: 204, resource: undefined });
    const [, requestInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(requestInit.method).toBe("DELETE");
  });

  it("returns a REQUEST_FAILED WriteFailure on a generic server error", async () => {
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: false, status: 500, body: {} },
    ]);

    const result = await client([{ resourceType: "Patient", operations: ["write"] }]).delete(
      "Patient",
      "123",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REQUEST_FAILED");
  });
});

describe("SmartClient.writeBatch", () => {
  it("returns one result per operation, in order", async () => {
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: true, status: 201, body: { resourceType: "Patient", id: "1" } },
      { ok: true, status: 200, body: { resourceType: "Patient", id: "2" } },
    ]);

    const operations: WriteOperation[] = [
      { kind: "create", resourceType: "Patient", resource: { resourceType: "Patient" } },
      {
        kind: "update",
        resourceType: "Patient",
        id: "2",
        resource: { resourceType: "Patient", id: "2" },
      },
    ];

    const results = await client([{ resourceType: "Patient", operations: ["write"] }]).writeBatch(
      operations,
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.ok).toBe(true);
  });

  it("keeps running remaining operations after one fails (partial success)", async () => {
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: false, status: 422, body: { resourceType: "OperationOutcome" } },
      { ok: true, status: 201, body: { resourceType: "Patient", id: "2" } },
    ]);

    const operations: WriteOperation[] = [
      { kind: "create", resourceType: "Patient", resource: {} },
      { kind: "create", resourceType: "Patient", resource: {} },
    ];

    const results = await client([{ resourceType: "Patient", operations: ["write"] }]).writeBatch(
      operations,
    );

    expect(results[0]!.ok).toBe(false);
    expect(results[1]!.ok).toBe(true);
  });

  it("turns a scope violation on one operation into a WriteFailure instead of aborting the batch", async () => {
    mockFetch([
      { ok: true, status: 200, body: TOKEN_BODY },
      { ok: true, status: 201, body: { resourceType: "Patient", id: "1" } },
    ]);

    const operations: WriteOperation[] = [
      { kind: "create", resourceType: "Observation", resource: {} },
      { kind: "create", resourceType: "Patient", resource: {} },
    ];

    const results = await client([{ resourceType: "Patient", operations: ["write"] }]).writeBatch(
      operations,
    );

    expect(results[0]).toMatchObject({ ok: false, code: "REQUEST_FAILED", path: "Observation" });
    expect(results[1]!.ok).toBe(true);
  });

  it("computes the failure path as resourceType/id for update/delete operations", async () => {
    mockFetch([]);
    const operations: WriteOperation[] = [
      { kind: "delete", resourceType: "Observation", id: "42" },
    ];

    const results = await client([{ resourceType: "Patient", operations: ["write"] }]).writeBatch(
      operations,
    );

    expect(results[0]).toMatchObject({ ok: false, path: "Observation/42" });
  });
});
