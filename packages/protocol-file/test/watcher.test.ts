import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileIngestWatcher, type FileHandlerResult } from "../src/watcher.js";

let activeWatcher: FileIngestWatcher | undefined;
let activeDir: string | undefined;

afterEach(async () => {
  activeWatcher?.stop();
  activeWatcher = undefined;
  if (activeDir) await rm(activeDir, { recursive: true, force: true });
  activeDir = undefined;
});

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timed out");
}

async function exists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
}

describe("FileIngestWatcher (real filesystem, temp directory)", () => {
  it("moves a processed file into the processed subdirectory", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-"));
    let received: string | undefined;

    const watcher = new FileIngestWatcher({
      directory: activeDir,
      pollIntervalMs: 30,
      handler: async (content): Promise<FileHandlerResult> => {
        received = content;
        return { status: "processed" };
      },
    });
    activeWatcher = watcher;
    await watcher.start();

    await writeFile(join(activeDir, "msg1.hl7"), "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5");

    await waitFor(() => exists(join(activeDir!, "processed", "msg1.hl7")));
    expect(received).toContain("ADT^A01");
    expect(await exists(join(activeDir, "msg1.hl7"))).toBe(false);
  });

  it("moves a failed file into the error subdirectory with an error sidecar", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-"));

    const watcher = new FileIngestWatcher({
      directory: activeDir,
      pollIntervalMs: 30,
      handler: async (): Promise<FileHandlerResult> => ({ status: "error", message: "bad format" }),
    });
    activeWatcher = watcher;
    await watcher.start();

    await writeFile(join(activeDir, "bad.hl7"), "not a real message");

    await waitFor(() => exists(join(activeDir!, "error", "bad.hl7")));
    const sidecar = await readFile(join(activeDir, "error", "bad.hl7.error.txt"), "utf8");
    expect(sidecar).toBe("bad format");
  });

  it("moves a file to error with the thrown message when the handler throws", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-"));

    const watcher = new FileIngestWatcher({
      directory: activeDir,
      pollIntervalMs: 30,
      handler: async () => {
        throw new Error("parser exploded");
      },
    });
    activeWatcher = watcher;
    await watcher.start();

    await writeFile(join(activeDir, "throws.hl7"), "x");

    await waitFor(() => exists(join(activeDir!, "error", "throws.hl7")));
    const sidecar = await readFile(join(activeDir, "error", "throws.hl7.error.txt"), "utf8");
    expect(sidecar).toBe("parser exploded");
  });

  it("processes multiple files dropped concurrently, each exactly once", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-"));
    const processedNames: string[] = [];

    const watcher = new FileIngestWatcher({
      directory: activeDir,
      pollIntervalMs: 30,
      handler: async (_content, name): Promise<FileHandlerResult> => {
        processedNames.push(name);
        return { status: "processed" };
      },
    });
    activeWatcher = watcher;
    await watcher.start();

    await Promise.all([
      writeFile(join(activeDir, "a.hl7"), "a"),
      writeFile(join(activeDir, "b.hl7"), "b"),
      writeFile(join(activeDir, "c.hl7"), "c"),
    ]);

    await waitFor(() => processedNames.length === 3);
    expect(processedNames.sort()).toEqual(["a.hl7", "b.hl7", "c.hl7"]);
  });

  it("never picks files back up from its own processed/error subdirectories", async () => {
    activeDir = await mkdtemp(join(tmpdir(), "protocol-file-"));
    let handlerCalls = 0;

    const watcher = new FileIngestWatcher({
      directory: activeDir,
      pollIntervalMs: 30,
      handler: async (): Promise<FileHandlerResult> => {
        handlerCalls++;
        return { status: "processed" };
      },
    });
    activeWatcher = watcher;
    await watcher.start();

    await writeFile(join(activeDir, "once.hl7"), "x");
    await waitFor(() => exists(join(activeDir!, "processed", "once.hl7")));

    // Give a few more poll cycles a chance to (incorrectly) re-ingest it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(handlerCalls).toBe(1);
  });
});
