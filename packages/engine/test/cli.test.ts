import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@interop-gateway/core/node";
import { main } from "../src/cli.js";
import type { RunningPipeline } from "../src/pipeline.js";

const SAMPLE_ADT_A01 =
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260101120000\r" +
  "PID|1||123456^^^MRN||Doe^Jane||19800101|F\r" +
  "PV1|1|I";

let activeDir: string | undefined;
let activePipeline: RunningPipeline | undefined;

afterEach(async () => {
  await activePipeline?.stop();
  activePipeline = undefined;
  if (activeDir) await rm(activeDir, { recursive: true, force: true });
  activeDir = undefined;
  vi.restoreAllMocks();
});

describe("engine CLI", () => {
  it("validate prints a success message for a valid config", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(
      configPath,
      "name: my-pipeline\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: file\n  directory: /y",
    );

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await main(["validate", configPath]);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"my-pipeline" is valid'));
    expect(process.exitCode).not.toBe(1);
  });

  it("validate exits with code 1 and prints the error for an invalid config", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(configPath, "format: hl7v2");

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await main(["validate", configPath]);

    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('"name"'));
    process.exitCode = 0;
  });

  it("prints usage and exits with code 2 for an unrecognized command", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await main(["fly-to-the-moon", "config.yaml"]);

    expect(process.exitCode).toBe(2);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    process.exitCode = 0;
  });

  it("prints usage and exits with code 2 when no file path is given", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await main(["run"]);

    expect(process.exitCode).toBe(2);
    expect(stderr).toHaveBeenCalled();
    process.exitCode = 0;
  });

  it("run starts the pipeline and prints a running message", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const inboundDir = join(activeDir, "in");
    const outboundDir = join(activeDir, "out");
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(
      configPath,
      `name: cli-run-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: file\n  directory: ${outboundDir}`,
    );

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    activePipeline = await main(["run", configPath, "--allow-unencrypted"]);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"cli-run-test" running'));
  });

  it("run persists the audit log and dead-letter queue to disk by default, next to the config file", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const inboundDir = join(activeDir, "in");
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(
      configPath,
      `name: cli-persist-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: http\n  url: https://127.0.0.1:1`,
    );

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    activePipeline = await main(["run", configPath, "--allow-unencrypted"]);
    await writeFile(join(inboundDir, "adt.hl7"), "not an hl7v2 message");
    const start = Date.now();
    while ((await activePipeline!.deadLetterQueue!.list()).length === 0) {
      if (Date.now() - start > 3000) throw new Error("timed out waiting for dead letter");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const auditDir = join(activeDir, "cli-persist-test-audit");
    const dlqDir = join(activeDir, "cli-persist-test-dead-letters");
    await expect(readdir(auditDir)).resolves.toHaveLength(1);
    await expect(readdir(dlqDir)).resolves.toHaveLength(1);

    const dlqStore = new FileStore(dlqDir);
    const raw = JSON.parse(new TextDecoder().decode(await dlqStore.get("dead-letters")));
    expect(raw).toHaveLength(1);
    expect(raw[0].raw).toBe("not an hl7v2 message");
  });

  it("replay re-runs dead-lettered messages persisted by a previous run", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const inboundDir = join(activeDir, "in");
    const outboundDir = join(activeDir, "out");
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(
      configPath,
      `name: cli-replay-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: http\n  url: https://127.0.0.1:1`,
    );

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    activePipeline = await main(["run", configPath, "--allow-unencrypted"]);
    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    const start = Date.now();
    while ((await activePipeline!.deadLetterQueue!.list()).length === 0) {
      if (Date.now() - start > 3000) throw new Error("timed out waiting for dead letter");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await activePipeline!.stop();
    activePipeline = undefined;

    // Simulate the operator fixing the destination, then replaying without restarting
    // the live pipeline — replay reads the persisted queue directly.
    await writeFile(
      configPath,
      `name: cli-replay-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: file\n  directory: ${outboundDir}`,
    );

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await main(["replay", configPath, "--allow-unencrypted"]);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("Replayed 1 dead-lettered message(s)"),
    );
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("1 succeeded, 0 failed again"));
    await expect(readdir(outboundDir)).resolves.toHaveLength(1);

    const dlqDir = join(activeDir, "cli-replay-test-dead-letters");
    const dlqStore = new FileStore(dlqDir);
    const raw = JSON.parse(new TextDecoder().decode(await dlqStore.get("dead-letters")));
    expect(raw).toHaveLength(0);
  });

  it("run refuses to persist unencrypted without --allow-unencrypted or a configured passphrase", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const inboundDir = join(activeDir, "in");
    const outboundDir = join(activeDir, "out");
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(
      configPath,
      `name: cli-refuse-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: file\n  directory: ${outboundDir}`,
    );

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    activePipeline = await main(["run", configPath]);

    expect(activePipeline).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Refusing to persist"));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--allow-unencrypted"));
    process.exitCode = 0;
  });

  it("run persists encrypted (no --allow-unencrypted needed) when persistence.audit.encryptPassphrase is set", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "engine-cli-"));
    const inboundDir = join(activeDir, "in");
    const outboundDir = join(activeDir, "out");
    const configPath = join(activeDir, "pipeline.yaml");
    await writeFile(
      configPath,
      `name: cli-encrypted-test\nformat: hl7v2\nsource:\n  protocol: file\n  directory: ${inboundDir}\ndestination:\n  protocol: file\n  directory: ${outboundDir}\npersistence:\n  audit:\n    directory: ${join(activeDir, "custom-audit")}\n    encryptPassphrase: test-passphrase\n  deadLetter:\n    directory: ${join(activeDir, "custom-dlq")}\n    encryptPassphrase: test-passphrase`,
    );

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    activePipeline = await main(["run", configPath]);

    expect(activePipeline).toBeDefined();
    const auditDir = join(activeDir, "custom-audit");
    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    const start = Date.now();
    while ((await readdir(auditDir).catch(() => [])).length === 0) {
      if (Date.now() - start > 3000) throw new Error("timed out waiting for audit write");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // The file on disk is encrypted — never contains the plaintext pipeline name.
    const rawFile = await readdir(auditDir);
    const rawContent = await new FileStore(auditDir).get("audit-log");
    const asText = new TextDecoder("utf8", { fatal: false }).decode(rawContent);
    expect(rawFile.length).toBeGreaterThan(0);
    expect(asText).not.toContain("cli-encrypted-test");
  });
});
