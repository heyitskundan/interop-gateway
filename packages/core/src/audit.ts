import { GatewayError } from "./errors.js";

/** One audit log entry: who did what, when, and on which resource type. */
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

/** Append-only, in-memory, hash-chained audit log. Each entry's hash covers the previous
 * entry's hash. */
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

  /** Recomputes the hash chain and returns whether it matches the stored hashes. */
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
