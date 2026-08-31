import { describe, expect, it } from "vitest";
import { HashChainedAuditLog } from "../src/audit.js";
import { GatewayError } from "../src/errors.js";

const baseEntry = {
  correlationId: "11111111-1111-1111-1111-111111111111",
  who: "client:demo-app",
  what: "read Patient",
  when: "2026-08-19T00:00:00.000Z",
  resourceType: "Patient",
};

describe("HashChainedAuditLog", () => {
  it("appends an entry and verifies the chain", async () => {
    const log = new HashChainedAuditLog();
    await log.append(baseEntry);
    await log.append({ ...baseEntry, what: "write Observation", resourceType: "Observation" });

    expect(log.list()).toHaveLength(2);
    await expect(log.verify()).resolves.toBe(true);
  });

  it("detects tampering after the fact", async () => {
    const log = new HashChainedAuditLog();
    await log.append(baseEntry);
    await log.append({ ...baseEntry, what: "write Observation" });

    // Simulate an out-of-band edit to a past entry (the class itself has no public
    // mutator — this reaches into the private chain the way a compromised store might).
    (log as unknown as { chain: Array<{ entry: { what: string } }> }).chain[0]!.entry.what =
      "read Condition";

    await expect(log.verify()).resolves.toBe(false);
  });

  it.each([
    ["an SSN-shaped string", "Patient SSN 123-45-6789 read"], // synthetic-pattern-for-detection-test
    ["an MRN-shaped string", "Patient MRN: 1234567 read"], // synthetic-pattern-for-detection-test
  ])("rejects an audit entry containing %s", async (_label, what) => {
    const log = new HashChainedAuditLog();
    await expect(log.append({ ...baseEntry, what })).rejects.toThrow(GatewayError);
  });
});
