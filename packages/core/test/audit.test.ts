import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileAuditLog, HashChainedAuditLog } from "../src/audit.js";
import { GatewayError } from "../src/errors.js";
import { InMemoryStore } from "../src/store.js";
import { FileStore } from "../src/file-store.js";

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
    ["an email address", "Patient contact jane.doe@example.com read"], // synthetic-pattern-for-detection-test
    ["a phone number", "Patient contact (555) 123-4567 read"], // synthetic-pattern-for-detection-test
    ["a bare digit-run identifier", "Patient identifier 123456789 read"], // synthetic-pattern-for-detection-test
  ])("rejects an audit entry containing %s", async (_label, what) => {
    const log = new HashChainedAuditLog();
    await expect(log.append({ ...baseEntry, what })).rejects.toThrow(GatewayError);
  });

  it("never scans the `when` timestamp field, so a normal ISO date never false-positives", async () => {
    const log = new HashChainedAuditLog();
    // baseEntry.when is an ISO timestamp shaped like other digit-heavy strings the
    // patterns above would otherwise catch — confirms it's excluded from scanning.
    await expect(log.append(baseEntry)).resolves.toBeUndefined();
  });

  it("mutating the caller's entry object after append() does not corrupt stored history", async () => {
    const log = new HashChainedAuditLog();
    const mutableEntry = { ...baseEntry };
    await log.append(mutableEntry);

    // A caller reusing/mutating the object they passed in (a real pattern: building one
    // entry object and tweaking a field per call) must never reach into stored history.
    mutableEntry.what = "read Condition";

    expect(log.list()[0]!.entry.what).toBe("read Patient");
    await expect(log.verify()).resolves.toBe(true);
  });
});

describe("FileAuditLog", () => {
  const dirs: string[] = [];
  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "interop-gateway-fileaudit-"));
    dirs.push(dir);
    return dir;
  }
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("appends entries and verifies the chain, same as HashChainedAuditLog", async () => {
    const log = new FileAuditLog(new InMemoryStore());
    await log.append(baseEntry);
    await log.append({ ...baseEntry, what: "write Observation", resourceType: "Observation" });

    await expect(log.list()).resolves.toHaveLength(2);
    await expect(log.verify()).resolves.toBe(true);
  });

  it("rejects PHI-shaped entries, same patterns as HashChainedAuditLog", async () => {
    const log = new FileAuditLog(new InMemoryStore());
    await expect(
      log.append({ ...baseEntry, what: "Patient SSN 123-45-6789 read" }), // synthetic-pattern-for-detection-test
    ).rejects.toThrow(GatewayError);
  });

  it("survives a process restart: a fresh instance over the same directory sees prior entries", async () => {
    const dir = await tempDir();
    const first = new FileAuditLog(new FileStore(dir));
    await first.append(baseEntry);
    await first.append({ ...baseEntry, what: "write Observation" });

    const reopened = new FileAuditLog(new FileStore(dir));
    await expect(reopened.list()).resolves.toHaveLength(2);
    await expect(reopened.verify()).resolves.toBe(true);

    await reopened.append({ ...baseEntry, what: "delete Observation" });
    await expect(reopened.list()).resolves.toHaveLength(3);
  });

  it("detects tampering with the persisted file between restarts", async () => {
    const dir = await tempDir();
    const first = new FileAuditLog(new FileStore(dir));
    await first.append(baseEntry);

    const store = new FileStore(dir);
    const raw = JSON.parse(new TextDecoder().decode(await store.get("audit-log"))) as Array<{
      entry: { what: string };
      hash: string;
    }>;
    raw[0]!.entry.what = "read Condition";
    await store.set("audit-log", new TextEncoder().encode(JSON.stringify(raw)));

    const reopened = new FileAuditLog(store);
    await expect(reopened.verify()).resolves.toBe(false);
  });
});
