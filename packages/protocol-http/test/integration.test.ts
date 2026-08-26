import { afterEach, describe, expect, it } from "vitest";
import { HttpIngestServer } from "../src/server.js";
import { sendHttpMessage } from "../src/client.js";
import { GatewayError } from "@interop-gateway/core";

const SAMPLE_BODY = "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC2|20260101120000||ADT^A01|MSG001|P|2.5";

let activeServer: HttpIngestServer | undefined;

afterEach(async () => {
  await activeServer?.close();
  activeServer = undefined;
});

describe("HttpIngestServer (real HTTP, localhost)", () => {
  it("passes the request body and headers through to the handler on a matching path", async () => {
    let received: string | undefined;
    let receivedHeader: string | string[] | undefined;
    const server = new HttpIngestServer({
      handler: async (body, headers) => {
        received = body;
        receivedHeader = headers["x-source"];
        return { status: 200, body: "OK" };
      },
      path: "/ingest",
    });
    activeServer = server;
    await server.listen(0, "127.0.0.1");
    const port = server.address()!.port;

    const response = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "x-source": "lab-system" },
      body: SAMPLE_BODY,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(received).toBe(SAMPLE_BODY);
    expect(receivedHeader).toBe("lab-system");
  });

  it("returns 404 when a path filter is set and the request path doesn't match", async () => {
    const server = new HttpIngestServer({ handler: async () => ({ status: 200 }), path: "/ingest" });
    activeServer = server;
    await server.listen(0, "127.0.0.1");
    const port = server.address()!.port;

    const response = await fetch(`http://127.0.0.1:${port}/other`, { method: "POST", body: "x" });
    expect(response.status).toBe(404);
  });

  it("returns 405 for a non-POST request", async () => {
    const server = new HttpIngestServer({ handler: async () => ({ status: 200 }) });
    activeServer = server;
    await server.listen(0, "127.0.0.1");
    const port = server.address()!.port;

    const response = await fetch(`http://127.0.0.1:${port}`, { method: "GET" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("returns 500 with the error message when the handler throws", async () => {
    const server = new HttpIngestServer({
      handler: async () => {
        throw new Error("boom");
      },
    });
    activeServer = server;
    await server.listen(0, "127.0.0.1");
    const port = server.address()!.port;

    const response = await fetch(`http://127.0.0.1:${port}`, { method: "POST", body: "x" });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("boom");
  });

  it("returns 500 when the body exceeds maxBodyBytes", async () => {
    const server = new HttpIngestServer({
      handler: async () => ({ status: 200 }),
      maxBodyBytes: 4,
    });
    activeServer = server;
    await server.listen(0, "127.0.0.1");
    const port = server.address()!.port;

    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      body: "this body is too long",
    });
    expect(response.status).toBe(500);
  });
});

describe("sendHttpMessage", () => {
  it("throws GatewayError immediately for a non-https URL, without attempting a request", async () => {
    let called = false;
    const server = new HttpIngestServer({
      handler: async () => {
        called = true;
        return { status: 200 };
      },
    });
    activeServer = server;
    await server.listen(0, "127.0.0.1");
    const port = server.address()!.port;

    await expect(sendHttpMessage(SAMPLE_BODY, { url: `http://127.0.0.1:${port}` })).rejects.toThrow(
      GatewayError,
    );
    expect(called).toBe(false);
  });

  it("throws GatewayError after exhausting retries against a refused connection", async () => {
    await expect(
      sendHttpMessage(SAMPLE_BODY, {
        url: "https://127.0.0.1:1",
        maxAttempts: 2,
        timeoutMs: 500,
      }),
    ).rejects.toThrow(GatewayError);
  }, 10000);
});
