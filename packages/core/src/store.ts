export interface Store {
  get(key: string): Promise<Uint8Array | undefined>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Backend used by tests and by any package that hasn't wired a real store yet. */
export class InMemoryStore implements Store {
  private readonly data = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.data.get(key);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const IV_LENGTH = 12;

/** Wraps a `Store` and encrypts every value with AES-256-GCM before writing it,
 * decrypting on read. Uses the Web Crypto API. */
export class EncryptedStore implements Store {
  constructor(
    private readonly backend: Store,
    private readonly key: CryptoKey,
  ) {}

  async set(key: string, value: Uint8Array): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, value as BufferSource),
    );
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);
    await this.backend.set(key, combined);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const raw = await this.backend.get(key);
    if (!raw) return undefined;
    const iv = raw.subarray(0, IV_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      this.key,
      ciphertext as BufferSource,
    );
    return new Uint8Array(plaintext);
  }

  async delete(key: string): Promise<void> {
    await this.backend.delete(key);
  }
}

/** Derives an AES-256-GCM `CryptoKey` from a passphrase and salt using PBKDF2 (100,000
 * iterations, SHA-256). */
export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt) as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
