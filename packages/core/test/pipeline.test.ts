import { describe, expect, it } from "vitest";
import { createEnvelope, withPayload } from "../src/envelope.js";
import { Pipeline, type Stage } from "../src/pipeline.js";

const uppercase: Stage<string, string> = {
  name: "uppercase",
  async run(envelope) {
    return withPayload(envelope, envelope.payload.toUpperCase());
  },
};

const exclaim: Stage<string, string> = {
  name: "exclaim",
  async run(envelope) {
    return withPayload(envelope, `${envelope.payload}!`);
  },
};

describe("Pipeline", () => {
  it("runs stages in order, threading the envelope through each", async () => {
    const pipeline = new Pipeline([uppercase, exclaim]);
    const result = await pipeline.run(createEnvelope("hello", "test"));
    expect(result.payload).toBe("HELLO!");
  });

  it("preserves the correlation ID across every stage", async () => {
    const pipeline = new Pipeline([uppercase, exclaim]);
    const input = createEnvelope("hello", "test");
    const result = await pipeline.run(input);
    expect(result.correlationId).toBe(input.correlationId);
  });

  it("runs an empty stage list as a no-op", async () => {
    const pipeline = new Pipeline([]);
    const input = createEnvelope("hello", "test");
    const result = await pipeline.run(input);
    expect(result).toEqual(input);
  });
});
