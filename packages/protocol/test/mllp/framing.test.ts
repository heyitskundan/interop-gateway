import { describe, expect, it } from "vitest";
import { frameMllp, tryUnframeMllp } from "../../src/mllp/framing.js";

describe("frameMllp / tryUnframeMllp", () => {
  it("round-trips a message through framing and unframing", () => {
    const message = "MSH|^~\\&|A|B|C|D|20260101120000||ADT^A01|1|P|2.5";
    const framed = frameMllp(message);
    const result = tryUnframeMllp(framed);

    expect(result?.message).toBe(message);
    expect(result?.rest).toHaveLength(0);
  });

  it("returns undefined when the buffer has no start byte yet", () => {
    expect(tryUnframeMllp(Buffer.from("partial data"))).toBeUndefined();
  });

  it("returns undefined when the end marker hasn't arrived yet (message split across chunks)", () => {
    const framed = frameMllp("MSH|^~\\&|A|B|C|D|20260101120000||ADT^A01|1|P|2.5");
    const truncated = framed.subarray(0, framed.length - 2);
    expect(tryUnframeMllp(truncated)).toBeUndefined();
  });

  it("extracts the first complete frame and leaves subsequent bytes in rest", () => {
    const first = frameMllp("MSH|first");
    const second = frameMllp("MSH|second");
    const combined = Buffer.concat([first, second]);

    const firstResult = tryUnframeMllp(combined);
    expect(firstResult?.message).toBe("MSH|first");

    const secondResult = tryUnframeMllp(firstResult!.rest);
    expect(secondResult?.message).toBe("MSH|second");
    expect(secondResult?.rest).toHaveLength(0);
  });
});
