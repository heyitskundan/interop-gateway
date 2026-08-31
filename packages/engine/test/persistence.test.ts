import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GatewayError, HashChainedAuditLog } from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node";
import {
  resolveAuditSink,
  resolveDeadLetterQueue,
  resolveDeadLetterQueueWithDefault,
} from "../src/persistence.js";
import { FileDeadLetterQueue } from "../src/dead-letter.js";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "engine-persistence-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveAuditSink", () => {
  it("returns the explicit AuditSink unchanged, ignoring persistence config entirely", async () => {
    const explicit = new HashChainedAuditLog();
    const result = await resolveAuditSink(
      "test",
      { audit: { directory: "/should-not-be-used" } },
      explicit,
      {},
    );
    expect(result).toBe(explicit);
  });

  it("returns an in-memory HashChainedAuditLog when ephemeral is set", async () => {
    const result = await resolveAuditSink("test", undefined, undefined, { ephemeral: true });
    expect(result).toBeInstanceOf(HashChainedAuditLog);
  });

  it("throws GatewayError/UNENCRYPTED_PERSISTENCE_REFUSED by default (no passphrase, no opt-out)", async () => {
    const directory = join(await tempDir(), "audit");
    await expect(
      resolveAuditSink("test", { audit: { directory } }, undefined, {}),
    ).rejects.toMatchObject({ code: "UNENCRYPTED_PERSISTENCE_REFUSED" });
  });

  it("throws even with no persistence config at all — the default directory still requires opt-in", async () => {
    await expect(
      resolveAuditSink("test", undefined, undefined, { baseDir: await tempDir() }),
    ).rejects.toThrow(GatewayError);
  });

  it("persists unencrypted when allowUnencryptedPersistence is set", async () => {
    const directory = join(await tempDir(), "audit");
    const sink = await resolveAuditSink("test", { audit: { directory } }, undefined, {
      allowUnencryptedPersistence: true,
    });
    await sink.append({
      correlationId: "1",
      who: "test",
      what: "translate",
      when: "2026-01-01T00:00:00Z",
    });

    const raw = await new FileStore(directory).get("audit-log");
    expect(new TextDecoder().decode(raw)).toContain("translate");
  });

  it("persists encrypted (unreadable plaintext) when encryptPassphrase is configured, no opt-out needed", async () => {
    const directory = join(await tempDir(), "audit");
    const sink = await resolveAuditSink(
      "test",
      { audit: { directory, encryptPassphrase: "secret" } },
      undefined,
      {},
    );
    await sink.append({
      correlationId: "1",
      who: "test",
      what: "translate",
      when: "2026-01-01T00:00:00Z",
    });

    const raw = await new FileStore(directory).get("audit-log");
    expect(new TextDecoder("utf8", { fatal: false }).decode(raw)).not.toContain("translate");
  });

  it("falls back to <baseDir>/<name>-audit when persistence.audit isn't configured", async () => {
    const baseDir = await tempDir();
    const sink = await resolveAuditSink("my-pipeline", undefined, undefined, {
      baseDir,
      allowUnencryptedPersistence: true,
    });
    await sink.append({
      correlationId: "1",
      who: "my-pipeline",
      what: "translate",
      when: "2026-01-01T00:00:00Z",
    });

    const raw = await new FileStore(join(baseDir, "my-pipeline-audit")).get("audit-log");
    expect(raw).toBeDefined();
  });
});

describe("resolveDeadLetterQueue (opt-in — no default unless configured)", () => {
  it("returns undefined when neither explicit nor persistence.deadLetter is given", async () => {
    const result = await resolveDeadLetterQueue("test", undefined, undefined, {});
    expect(result).toBeUndefined();
  });

  it("returns undefined when ephemeral is set, even if persistence.deadLetter is configured", async () => {
    const directory = join(await tempDir(), "dlq");
    const result = await resolveDeadLetterQueue("test", { deadLetter: { directory } }, undefined, {
      ephemeral: true,
    });
    expect(result).toBeUndefined();
  });

  it("returns the explicit DeadLetterQueue unchanged", async () => {
    const explicit = new FileDeadLetterQueue(new FileStore(await tempDir()));
    const result = await resolveDeadLetterQueue("test", undefined, explicit, {});
    expect(result).toBe(explicit);
  });

  it("throws when persistence.deadLetter is configured without encryption or opt-out", async () => {
    const directory = join(await tempDir(), "dlq");
    await expect(
      resolveDeadLetterQueue("test", { deadLetter: { directory } }, undefined, {}),
    ).rejects.toMatchObject({ code: "UNENCRYPTED_PERSISTENCE_REFUSED" });
  });

  it("builds a FileDeadLetterQueue when persistence.deadLetter is configured with a passphrase", async () => {
    const directory = join(await tempDir(), "dlq");
    const dlq = await resolveDeadLetterQueue(
      "test",
      { deadLetter: { directory, encryptPassphrase: "secret" } },
      undefined,
      {},
    );
    expect(dlq).toBeInstanceOf(FileDeadLetterQueue);
  });
});

describe("resolveDeadLetterQueueWithDefault (CLI — always persists)", () => {
  it("defaults to <baseDir>/<name>-dead-letters even with no persistence config", async () => {
    const baseDir = await tempDir();
    const dlq = await resolveDeadLetterQueueWithDefault("my-pipeline", undefined, undefined, {
      baseDir,
      allowUnencryptedPersistence: true,
    });
    await dlq.enqueue({
      id: "1",
      raw: "raw message",
      stage: "translate",
      error: "boom",
      when: "2026-01-01T00:00:00Z",
    });

    const raw = await new FileStore(join(baseDir, "my-pipeline-dead-letters")).get("dead-letters");
    expect(raw).toBeDefined();
  });

  it("throws by default without an opt-out, same as resolveDeadLetterQueue", async () => {
    await expect(
      resolveDeadLetterQueueWithDefault("test", undefined, undefined, { baseDir: await tempDir() }),
    ).rejects.toMatchObject({ code: "UNENCRYPTED_PERSISTENCE_REFUSED" });
  });
});
