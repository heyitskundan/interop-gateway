import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "@interop-gateway/core";
import { AwsSecretsManagerProvider, type SignedFetcher } from "../src/aws.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const credentials = { accessKeyId: "AKIAFAKE", secretAccessKey: "fake-secret" };

describe("AwsSecretsManagerProvider", () => {
  it("getSecret sends GetSecretValue and returns SecretString", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () =>
      jsonResponse(200, { SecretString: "value-123" }),
    );
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    const value = await provider.getSecret({ name: "epic-client-secret" });

    expect(value).toBe("value-123");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://secretsmanager.us-east-1.amazonaws.com/");
    expect((init.headers as Record<string, string>)["X-Amz-Target"]).toBe(
      "secretsmanager.GetSecretValue",
    );
    expect(JSON.parse(init.body as string)).toEqual({ SecretId: "epic-client-secret" });
  });

  it("getSecret throws GatewayError with AWS's message on a non-2xx response", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () =>
      jsonResponse(400, { __type: "AccessDeniedException", message: "not authorized" }),
    );
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.getSecret({ name: "foo" })).rejects.toThrow(/not authorized/);
  });

  it("getSecret throws GatewayError when the secret has no SecretString", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () => jsonResponse(200, {}));
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.getSecret({ name: "foo" })).rejects.toThrow(GatewayError);
  });

  it("setSecret calls PutSecretValue when the secret already exists", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () => jsonResponse(200, {}));
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await provider.setSecret({ name: "foo" }, "new-value");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Amz-Target"]).toBe(
      "secretsmanager.PutSecretValue",
    );
    expect(JSON.parse(init.body as string)).toEqual({ SecretId: "foo", SecretString: "new-value" });
  });

  it("setSecret falls back to CreateSecret when PutSecretValue reports ResourceNotFoundException", async () => {
    const fetcher = vi
      .fn<SignedFetcher>()
      .mockResolvedValueOnce(jsonResponse(400, { __type: "ResourceNotFoundException" }))
      .mockResolvedValueOnce(jsonResponse(200, {}));
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await provider.setSecret({ name: "brand-new" }, "initial-value");

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetcher.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = fetcher.mock.calls[1] as [string, RequestInit];
    expect((firstInit.headers as Record<string, string>)["X-Amz-Target"]).toBe(
      "secretsmanager.PutSecretValue",
    );
    expect((secondInit.headers as Record<string, string>)["X-Amz-Target"]).toBe(
      "secretsmanager.CreateSecret",
    );
    expect(JSON.parse(secondInit.body as string)).toEqual({
      Name: "brand-new",
      SecretString: "initial-value",
    });
  });

  it("setSecret throws GatewayError without falling back on a non-ResourceNotFound failure", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () =>
      jsonResponse(400, { __type: "AccessDeniedException", message: "not authorized" }),
    );
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.setSecret({ name: "foo" }, "x")).rejects.toThrow(/not authorized/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("deleteSecret sends DeleteSecret without ForceDeleteWithoutRecovery", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () => jsonResponse(200, {}));
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await provider.deleteSecret({ name: "foo" });

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Amz-Target"]).toBe(
      "secretsmanager.DeleteSecret",
    );
    expect(JSON.parse(init.body as string)).toEqual({ SecretId: "foo" });
  });

  it("deleteSecret throws GatewayError on a non-2xx response", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () =>
      jsonResponse(404, { __type: "ResourceNotFoundException" }),
    );
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.deleteSecret({ name: "foo" })).rejects.toThrow(GatewayError);
  });

  it("setSecret throws GatewayError when the CreateSecret fallback also fails", async () => {
    const fetcher = vi
      .fn<SignedFetcher>()
      .mockResolvedValueOnce(jsonResponse(400, { __type: "ResourceNotFoundException" }))
      .mockResolvedValueOnce(jsonResponse(400, { message: "invalid name" }));
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.setSecret({ name: "bad name" }, "x")).rejects.toThrow(/invalid name/);
  });

  it("getSecret wraps a rejecting fetcher (network failure) as GatewayError instead of crashing", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () => {
      throw new Error("getaddrinfo ENOTFOUND secretsmanager.us-east-1.amazonaws.com");
    });
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.getSecret({ name: "foo" })).rejects.toThrow(GatewayError);
    await expect(provider.getSecret({ name: "foo" })).rejects.toThrow(/ENOTFOUND/);
  });

  it("setSecret wraps a rejecting fetcher as GatewayError without attempting the CreateSecret fallback", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () => {
      throw new Error("network unreachable");
    });
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.setSecret({ name: "foo" }, "x")).rejects.toThrow(GatewayError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("deleteSecret wraps a rejecting fetcher as GatewayError instead of crashing", async () => {
    const fetcher = vi.fn<SignedFetcher>(async () => {
      throw new Error("network unreachable");
    });
    const provider = new AwsSecretsManagerProvider({ region: "us-east-1", credentials, fetcher });

    await expect(provider.deleteSecret({ name: "foo" })).rejects.toThrow(GatewayError);
  });

  it("builds a default aws4fetch-backed client when no fetcher is given", () => {
    expect(() => new AwsSecretsManagerProvider({ region: "us-east-1", credentials })).not.toThrow();
  });
});
