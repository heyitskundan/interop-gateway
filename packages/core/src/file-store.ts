import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "./store.js";

/** `key` is base64url-encoded into the filename, so no key can escape `directory` (no
 * path traversal) regardless of what characters the caller passes. */
function keyToFilename(key: string): string {
  return `${Buffer.from(key, "utf8").toString("base64url")}.bin`;
}

/** Filesystem-backed `Store` — one file per key under `directory`. Wrap it in
 * `EncryptedStore` for encryption at rest; used as-is it's plaintext-on-disk, same
 * posture as any other file the OS writes. Node-only (uses `node:fs`/`node:path`) —
 * imported from `@interop-gateway/core/node`, not the package's main entry, so a
 * browser bundle importing `@interop-gateway/core` never pulls in Node built-ins. */
export class FileStore implements Store {
  constructor(private readonly directory: string) {}

  private path(key: string): string {
    return join(this.directory, keyToFilename(key));
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(key), value);
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
