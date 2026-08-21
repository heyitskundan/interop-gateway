import { afterEach, describe, expect, it } from "vitest";
import { MllpServer, type MllpHandlerResult } from "../src/server.js";
import { sendMllpMessage } from "../src/client.js";
import { GatewayError } from "@interop-gateway/core";

const SAMPLE_MESSAGE =
  "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC2|20260101120000||ADT^A01|MSG001|P|2.5\rEVN|A01";

let activeServer: MllpServer | undefined;

async function startServer(
  handler: (message: string) => Promise<MllpHandlerResult>,
): Promise<number> {
  const server = new MllpServer({ handler });
  activeServer = server;
  await server.listen(0, "127.0.0.1");
  return server.address()!.port;
}

afterEach(async () => {
  await activeServer?.close();
  activeServer = undefined;
});

describe("MllpServer + sendMllpMessage (real TCP, localhost)", () => {
  it("delivers a message and returns the handler's AA acknowledgment", async () => {
    let received: string | undefined;
    const port = await startServer(async (message) => {
      received = message;
      return { code: "AA" };
    });

    const result = await sendMllpMessage(SAMPLE_MESSAGE, { host: "127.0.0.1", port });

    expect(received).toBe(SAMPLE_MESSAGE);
    expect(result.acknowledged).toBe(true);
    expect(result.code).toBe("AA");
  });

  it("returns acknowledged:false when the handler NACKs (AE)", async () => {
    const port = await startServer(async () => ({ code: "AE", textMessage: "Unsupported" }));

    const result = await sendMllpMessage(SAMPLE_MESSAGE, { host: "127.0.0.1", port });

    expect(result.acknowledged).toBe(false);
    expect(result.code).toBe("AE");
    expect(result.rawAck).toContain("MSA|AE|MSG001|Unsupported");
  });

  it("returns acknowledged:false when the handler NACKs (AR)", async () => {
    const port = await startServer(async () => ({ code: "AR" }));
    const result = await sendMllpMessage(SAMPLE_MESSAGE, { host: "127.0.0.1", port });
    expect(result.code).toBe("AR");
  });

  it("acknowledges AE (not a thrown error) when the handler throws", async () => {
    const port = await startServer(async () => {
      throw new Error("boom");
    });

    const result = await sendMllpMessage(SAMPLE_MESSAGE, { host: "127.0.0.1", port });
    expect(result.code).toBe("AE");
  });

  it("handles multiple messages sent over the same connection lifecycle sequentially", async () => {
    const received: string[] = [];
    const port = await startServer(async (message) => {
      received.push(message);
      return { code: "AA" };
    });

    const first = await sendMllpMessage(`${SAMPLE_MESSAGE}1`, { host: "127.0.0.1", port });
    const second = await sendMllpMessage(`${SAMPLE_MESSAGE}2`, { host: "127.0.0.1", port });

    expect(first.acknowledged).toBe(true);
    expect(second.acknowledged).toBe(true);
    expect(received).toHaveLength(2);
  });

  it("throws GatewayError after exhausting retries against a closed port", async () => {
    await expect(
      sendMllpMessage(SAMPLE_MESSAGE, {
        host: "127.0.0.1",
        port: 1,
        maxAttempts: 2,
        timeoutMs: 200,
      }),
    ).rejects.toThrow(GatewayError);
  }, 10000);

  it("times out and retries if no ACK arrives within timeoutMs", async () => {
    const port = await startServer(async () => new Promise(() => {})); // never resolves

    await expect(
      sendMllpMessage(SAMPLE_MESSAGE, { host: "127.0.0.1", port, maxAttempts: 1, timeoutMs: 100 }),
    ).rejects.toThrow(GatewayError);
  }, 10000);
});
