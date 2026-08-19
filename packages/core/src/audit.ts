import { GatewayError } from "./errors.js";

/**
 * One entry per PHI-touching operation. `who`/`what`/`resourceType` describe the access
 * event itself — never the clinical content. This is the shape every audit sink
 * (in-memory here, an encrypted `Store`-backed one in production) must accept.
 */
export interface AuditEntry {
  readonly correlationId: string;
  readonly who: string;
  readonly what: string;
  readonly when: string;
  readonly resourceType?: string;
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
}

const PHI_LIKE_PATTERNS = [/\b\d{3}-\d{2}-\d{4}\b/, /\bMRN[:\s#]*\d{6,10}\b/i];

function assertNoPhi(entry: AuditEntry): void {
  const serialized = JSON.stringify(entry);
  for (const pattern of PHI_LIKE_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new GatewayError(
        "Refusing to write an audit entry containing a PHI-shaped value",
        "AUDIT_PHI_REJECTED",
      );
    }
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input) as BufferSource,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Append-only, hash-chained audit log — each entry's hash covers the previous entry's
 * hash, so editing or deleting a past entry breaks the chain and `verify()` catches it.
 * A production deployment persists this through an `EncryptedStore`; this in-memory
 * version is what `packages/core` ships and what other packages/tests build on. Built on
 * the Web Crypto API so it also runs unmodified in the demo client's browser bundle.
 */
export class HashChainedAuditLog implements AuditSink {
  private readonly chain: Array<{ entry: AuditEntry; hash: string }> = [];

  async append(entry: AuditEntry): Promise<void> {
    assertNoPhi(entry);
    const previousHash = this.chain.at(-1)?.hash ?? "genesis";
    const hash = await sha256Hex(previousHash + JSON.stringify(entry));
    this.chain.push({ entry, hash });
  }

  list(): ReadonlyArray<{ entry: AuditEntry; hash: string }> {
    return this.chain;
  }

  /** Recomputes the chain and compares — false means an entry was altered or removed
   * after being appended. */
  async verify(): Promise<boolean> {
    let previousHash = "genesis";
    for (const { entry, hash } of this.chain) {
      const expected = await sha256Hex(previousHash + JSON.stringify(entry));
      if (expected !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}
