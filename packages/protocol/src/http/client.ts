import { enforceTls, GatewayError } from "@interop-gateway/core";

export interface HttpSendOptions {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

export interface HttpSendResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_ATTEMPTS = 3;

async function sendOnce(message: string, options: HttpSendOptions): Promise<HttpSendResult> {
  const url = enforceTls(options.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain", ...options.headers },
      body: message,
      signal: controller.signal,
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

/** Sends `message` as an HTTP POST to `options.url` over TLS. Retries up to
 * `options.maxAttempts` (default 3) on a network error or timeout; throws
 * `GatewayError` if every attempt fails. Does not retry on a non-2xx HTTP response —
 * that's a real response from the receiver, returned in `HttpSendResult` instead. */
export async function sendHttpMessage(
  message: string,
  options: HttpSendOptions,
): Promise<HttpSendResult> {
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
    `HTTP send to ${options.url} failed after ${maxAttempts} attempt(s)`,
    "HTTP_SEND_FAILED",
    undefined,
    lastError,
  );
}
