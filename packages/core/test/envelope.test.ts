import { describe, expect, it } from "vitest";
import { createEnvelope, withPayload } from "../src/envelope.js";

describe("createEnvelope", () => {
  it("assigns a correlation ID, a timestamp, and the given source/payload", () => {
    const envelope = createEnvelope({ hello: "world" }, "test-source");
    expect(envelope.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(envelope.source).toBe("test-source");
    expect(envelope.payload).toEqual({ hello: "world" });
    expect(() => new Date(envelope.receivedAt).toISOString()).not.toThrow();
  });

  it("gives two envelopes distinct correlation IDs", () => {
    const a = createEnvelope("a", "source");
    const b = createEnvelope("b", "source");
    expect(a.correlationId).not.toBe(b.correlationId);
  });
});

describe("withPayload", () => {
  it("swaps the payload while preserving the correlation ID and source", () => {
    const original = createEnvelope("raw", "source");
    const translated = withPayload(original, { translated: true });
    expect(translated.correlationId).toBe(original.correlationId);
    expect(translated.source).toBe(original.source);
    expect(translated.payload).toEqual({ translated: true });
  });
});
