import { connect } from "node:net";
import { GatewayError } from "@interop-gateway/core";
import { frameMllp, tryUnframeMllp } from "./framing.js";
import { extractAckCode, type AckCode } from "./ack.js";

export interface MllpSendOptions {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

export interface MllpSendResult {
  readonly acknowledged: boolean;
  readonly code: AckCode | undefined;
  readonly rawAck: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 3;

function sendOnce(message: string, options: MllpSendOptions): Promise<MllpSendResult> {
  return new Promise((resolve, reject) => {
    const socket = connect(options.port, options.host);
    let buffer: Buffer = Buffer.alloc(0);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("MLLP send timed out waiting for an ACK"));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(frameMllp(message));
    });

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const unframed = tryUnframeMllp(buffer);
      if (unframed && !settled) {
        settled = true;
        clearTimeout(timeout);
        const code = extractAckCode(unframed.message);
        socket.end();
        resolve({ acknowledged: code === "AA", code, rawAck: unframed.message });
      }
    });

    socket.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/** Sends `message` over MLLP to `options.host`/`options.port` and waits for an
 * ACK/NACK. Retries up to `options.maxAttempts` (default 3) on connection failure or
 * timeout; throws `GatewayError` if every attempt fails. Does not retry on a received
 * NACK (`AE`/`AR`) — returns it in `MllpSendResult` instead. */
export async function sendMllpMessage(
  message: string,
  options: MllpSendOptions,
): Promise<MllpSendResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendOnce(message, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw new GatewayError(
    `MLLP send to ${options.host}:${options.port} failed after ${maxAttempts} attempt(s)`,
    "MLLP_SEND_FAILED",
    undefined,
    lastError,
  );
}
