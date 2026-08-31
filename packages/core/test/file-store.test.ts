import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deriveKey, EncryptedStore } from "../src/store.js";
import { FileStore } from "../src/file-store.js";

describe("FileStore", () => {
  const dirs: string[] = [];
  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "interop-gateway-filestore-"));
    dirs.push(dir);
    return dir;
  }
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("round-trips a value to and from real files on disk", async () => {
    const store = new FileStore(await tempDir());
    await store.set("token:1", new TextEncoder().encode("token-material"));

    const readBack = await store.get("token:1");

    expect(new TextDecoder().decode(readBack)).toBe("token-material");
  });

  it("returns undefined for a key that was never set", async () => {
    const store = new FileStore(await tempDir());
    await expect(store.get("never-set")).resolves.toBeUndefined();
  });

  it("survives across separate FileStore instances pointed at the same directory", async () => {
    const dir = await tempDir();
    await new FileStore(dir).set("token:1", new TextEncoder().encode("persisted"));

    const reopened = new FileStore(dir);
    const readBack = await reopened.get("token:1");

    expect(new TextDecoder().decode(readBack)).toBe("persisted");
  });

  it("delete removes the value and is a no-op if the key never existed", async () => {
    const store = new FileStore(await tempDir());
    await store.set("token:1", new TextEncoder().encode("v"));

    await store.delete("token:1");
    await expect(store.get("token:1")).resolves.toBeUndefined();
    await expect(store.delete("token:1")).resolves.toBeUndefined();
  });

  it("keys containing path-traversal characters never escape the store directory", async () => {
    const dir = await tempDir();
    const store = new FileStore(dir);

    await store.set("../../etc/passwd", new TextEncoder().encode("not-actually-passwd"));

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain("..");
    expect(files[0]).not.toContain("/");
  });

  it("composes with EncryptedStore for encryption at rest on disk", async () => {
    const dir = await tempDir();
    const key = await deriveKey("passphrase", "salt");
    const store = new EncryptedStore(new FileStore(dir), key);
    const secret = "super-secret-refresh-token";

    await store.set("token:1", new TextEncoder().encode(secret));

    const files = await readdir(dir);
    const raw = await new FileStore(dir).get("token:1");
    expect(new TextDecoder("utf8", { fatal: false }).decode(raw)).not.toContain(secret);
    expect(files).toHaveLength(1);

    const readBack = await store.get("token:1");
    expect(new TextDecoder().decode(readBack)).toBe(secret);
  });
});
