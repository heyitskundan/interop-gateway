import { TlsError } from "./errors.js";

/**
 * Every outbound connection (SMART connector, protocol-http, MLLP-over-TLS) must route
 * its target URL through this guard first. Rejects anything that isn't https — including
 * a downgraded/plaintext redirect target — before a single byte is sent.
 */
export function enforceTls(url: string | URL): URL {
  const parsed = typeof url === "string" ? new URL(url) : url;
  if (parsed.protocol !== "https:") {
    throw new TlsError(parsed.origin || parsed.protocol);
  }
  return parsed;
}
