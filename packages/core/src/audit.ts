import { GatewayError } from "./errors.js";
import type { Store } from "./store.js";

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

const PHI_LIKE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\bMRN[:\s#]*\d{6,10}\b/i, // MRN-labeled identifier
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, // email address
  /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, // US-style phone number
  /\b\d{9,11}\b/, // bare 9-11 digit identifier (SSN without dashes, NPI, insurance ID)
];

/** Only `correlationId`/`who`/`what`/`resourceType` are scanned — `when` is always a
 * system-generated ISO timestamp, not caller-supplied content, and would false-positive
 * against the bare-digit-run pattern above on every single entry if included. */
function assertNoPhi(entry: AuditEntry): void {
  const { correlationId, who, what, resourceType } = entry;
  const serialized = JSON.stringify({ correlationId, who, what, resourceType });
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
    // Cloned, not stored by reference: if the caller mutates the object they passed in
    // after append() returns, that must never silently rewrite tamper-evident history.
    const stored: AuditEntry = { ...entry };
    const previousHash = this.chain.at(-1)?.hash ?? "genesis";
    const hash = await sha256Hex(previousHash + JSON.stringify(stored));
    this.chain.push({ entry: stored, hash });
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

const AUDIT_LOG_KEY = "audit-log";

/** Same hash-chained, PHI-rejecting audit log as `HashChainedAuditLog`, but persisted
 * through a `Store` instead of held only in process memory — survives a restart, and
 * (wrapped in `EncryptedStore`) is encrypted at rest. The whole chain is re-serialized
 * on every `append()`; that's the right tradeoff for an audit trail (an interrupted
 * write must never leave a partial, unparseable entry) but means this isn't meant for
 * a pipeline writing millions of entries between restarts — use a real database-backed
 * `AuditSink` at that scale. */
export class FileAuditLog implements AuditSink {
  private chain: Array<{ entry: AuditEntry; hash: string }> = [];
  private loaded = false;

  constructor(private readonly store: Store) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const raw = await this.store.get(AUDIT_LOG_KEY);
    this.chain = raw
      ? (JSON.parse(new TextDecoder().decode(raw)) as Array<{ entry: AuditEntry; hash: string }>)
      : [];
    this.loaded = true;
  }

  async append(entry: AuditEntry): Promise<void> {
    assertNoPhi(entry);
    await this.ensureLoaded();
    // Cloned, not stored by reference — same reasoning as HashChainedAuditLog.append().
    const stored: AuditEntry = { ...entry };
    const previousHash = this.chain.at(-1)?.hash ?? "genesis";
    const hash = await sha256Hex(previousHash + JSON.stringify(stored));
    this.chain.push({ entry: stored, hash });
    await this.store.set(AUDIT_LOG_KEY, new TextEncoder().encode(JSON.stringify(this.chain)));
  }

  async list(): Promise<ReadonlyArray<{ entry: AuditEntry; hash: string }>> {
    await this.ensureLoaded();
    return this.chain;
  }

  /** Recomputes the hash chain from what's persisted and returns whether it matches —
   * detects tampering with the underlying file/store between process runs, not just
   * within one. */
  async verify(): Promise<boolean> {
    await this.ensureLoaded();
    let previousHash = "genesis";
    for (const { entry, hash } of this.chain) {
      const expected = await sha256Hex(previousHash + JSON.stringify(entry));
      if (expected !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}
