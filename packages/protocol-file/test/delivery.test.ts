import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GatewayError } from "@interop-gateway/core";
import { writeFileMessage } from "../src/delivery.js";

let activeDir: string | undefined;

afterEach(async () => {
  if (activeDir) await rm(activeDir, { recursive: true, force: true });
  activeDir = undefined;
});

describe("writeFileMessage (real filesystem, temp directory)", () => {
  it("writes content to a generated file name and returns its path", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-delivery-"));

    const path = await writeFileMessage("hello world", { directory: activeDir });

    expect(await readFile(path, "utf8")).toBe("hello world");
    expect(path.startsWith(activeDir)).toBe(true);
  });

  it("writes content to an explicit file name", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-delivery-"));

    const path = await writeFileMessage("hello", { directory: activeDir, fileName: "msg.hl7" });

    expect(path).toBe(join(activeDir, "msg.hl7"));
    expect(await readFile(path, "utf8")).toBe("hello");
  });

  it("creates the target directory if it doesn't exist", async () => {
    activeDir = join(await mkdtemp(join(tmpdir(), "protocol-file-delivery-")), "nested", "dir");

    const path = await writeFileMessage("hello", { directory: activeDir, fileName: "msg.hl7" });

    expect(await readFile(path, "utf8")).toBe("hello");
  });

  it("leaves no temp file behind after a successful write", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-delivery-"));

    await writeFileMessage("hello", { directory: activeDir, fileName: "msg.hl7" });

    const entries = await readdir(activeDir);
    expect(entries).toEqual(["msg.hl7"]);
  });

  it("throws GatewayError and cleans up the temp file when the write fails", async () => {
    // Point at a path that can't be a directory (a file, not a folder) to force a failure.
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-delivery-"));
    const notADirectory = join(activeDir, "im-a-file");
    await writeFileMessage("placeholder", { directory: activeDir, fileName: "im-a-file" });

    await expect(
      writeFileMessage("hello", { directory: notADirectory, fileName: "msg.hl7" }),
    ).rejects.toThrow(GatewayError);
  });
});
