import { describe, expect, it } from "vitest";
import { deriveKey, EncryptedStore, InMemoryStore } from "../src/store.js";

describe("EncryptedStore", () => {
  it("round-trips a value through encryption transparently", async () => {
    const backend = new InMemoryStore();
    const key = await deriveKey("test-passphrase", "test-salt");
    const store = new EncryptedStore(backend, key);
    const value = new TextEncoder().encode("token-material");

    await store.set("token:1", value);
    const readBack = await store.get("token:1");

    expect(new TextDecoder().decode(readBack)).toBe("token-material");
  });

  it("never writes plaintext to the underlying backend", async () => {
    const backend = new InMemoryStore();
    const key = await deriveKey("test-passphrase", "test-salt");
    const store = new EncryptedStore(backend, key);
    const secret = "super-secret-refresh-token";

    await store.set("token:1", new TextEncoder().encode(secret));

    const raw = await backend.get("token:1");
    const rawAsText = new TextDecoder("utf8", { fatal: false }).decode(raw);
    expect(rawAsText).not.toContain(secret);
  });

  it("fails to decrypt with the wrong key (authentication tag mismatch)", async () => {
    const backend = new InMemoryStore();
    const keyA = await deriveKey("passphrase-a", "salt");
    const store = new EncryptedStore(backend, keyA);
    await store.set("token:1", new TextEncoder().encode("value"));

    const keyB = await deriveKey("passphrase-b", "salt");
    const wrongKeyStore = new EncryptedStore(backend, keyB);
    await expect(wrongKeyStore.get("token:1")).rejects.toThrow();
  });

  it("derives the same key from the same passphrase/salt, a different key otherwise", async () => {
    const keyA1 = await deriveKey("same-passphrase", "same-salt");
    const keyA2 = await deriveKey("same-passphrase", "same-salt");
    const keyB = await deriveKey("different-passphrase", "same-salt");

    const backend = new InMemoryStore();
    const storeA1 = new EncryptedStore(backend, keyA1);
    await storeA1.set("k", new TextEncoder().encode("v"));

    const storeA2 = new EncryptedStore(backend, keyA2);
    await expect(storeA2.get("k")).resolves.toBeDefined();

    const storeB = new EncryptedStore(backend, keyB);
    await expect(storeB.get("k")).rejects.toThrow();
  });
});
