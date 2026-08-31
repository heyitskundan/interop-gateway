import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

const VALID_HL7V2 = "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260101120000||ADT^A01|1|P|2.5";

describe("main (CLI entrypoint)", () => {
  const dir = mkdtempSync(join(tmpdir(), "interop-gateway-cli-test-"));

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("prints usage and sets a non-zero exit code with no arguments", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    main([]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(process.exitCode).toBe(2);
  });

  it("prints usage for an unknown command", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    main(["translate", "file.hl7"]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(process.exitCode).toBe(2);
  });

  it("exits 2 with a clean message instead of throwing when the file doesn't exist", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => main(["validate", join(dir, "does-not-exist.hl7")])).not.toThrow();

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Could not read"));
    expect(process.exitCode).toBe(2);
  });

  it("validates a well-formed file and exits 0", () => {
    const inPath = join(dir, "valid.hl7");
    writeFileSync(inPath, VALID_HL7V2);

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    main(["validate", inPath]);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"valid": true'));
    expect(process.exitCode).toBe(0);
  });

  it("validates a malformed file and exits 1", () => {
    const inPath = join(dir, "invalid.hl7");
    writeFileSync(inPath, "not a real message");

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    main(["validate", inPath]);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"valid": false'));
    expect(process.exitCode).toBe(1);
  });
});
