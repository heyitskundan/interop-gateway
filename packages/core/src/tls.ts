import { TlsError } from "./errors.js";

/** Parses a URL and throws `TlsError` if its scheme is not https. */
export function enforceTls(url: string | URL): URL {
  const parsed = typeof url === "string" ? new URL(url) : url;
  if (parsed.protocol !== "https:") {
    throw new TlsError(parsed.origin || parsed.protocol);
  }
  return parsed;
}
