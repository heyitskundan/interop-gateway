import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import type { RunningPipeline } from "../src/pipeline.js";

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
    activePipeline = await main(["run", configPath]);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"cli-run-test" running'));
  });
});
