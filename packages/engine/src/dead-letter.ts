import type { Store } from "@interop-gateway/core";

/** One failed message, kept for inspection/replay. `raw` is the original source
 * message verbatim (HL7v2/CDA) — unlike an `AuditSink` entry, this necessarily carries
 * real message content, so a production deployment should back the queue with an
 * `EncryptedStore` (see `deadLetter.encryptPassphrase` in the pipeline config). */
export interface DeadLetterEntry {
  readonly id: string;
  readonly raw: string;
  readonly stage: "translate" | "validateProfile" | "route" | "deliver";
  readonly error: string;
  readonly when: string;
  readonly attempts: number;
}

export interface DeadLetterQueue {
  enqueue(entry: Omit<DeadLetterEntry, "attempts">): Promise<void>;
  list(): Promise<readonly DeadLetterEntry[]>;
  remove(id: string): Promise<void>;
  /** Bumps `attempts` on an existing entry (used by replay after a retry still fails,
   * so repeated-failure count is visible for triage) and updates `error`/`when` to the
   * latest failure. No-op if `id` isn't in the queue. */
  recordFailedAttempt(id: string, error: string): Promise<void>;
}

const DEAD_LETTER_KEY = "dead-letters";

/** `Store`-backed dead-letter queue — the whole list is re-serialized on every
 * mutation, same tradeoff as `FileAuditLog` (an interrupted write must never leave a
 * partial entry; not meant for a queue depth in the millions). */
export class FileDeadLetterQueue implements DeadLetterQueue {
  private entries: DeadLetterEntry[] = [];
  private loaded = false;

  constructor(private readonly store: Store) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const raw = await this.store.get(DEAD_LETTER_KEY);
    this.entries = raw ? (JSON.parse(new TextDecoder().decode(raw)) as DeadLetterEntry[]) : [];
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await this.store.set(DEAD_LETTER_KEY, new TextEncoder().encode(JSON.stringify(this.entries)));
  }

  async enqueue(entry: Omit<DeadLetterEntry, "attempts">): Promise<void> {
    await this.ensureLoaded();
    this.entries.push({ ...entry, attempts: 0 });
    await this.persist();
  }

  async list(): Promise<readonly DeadLetterEntry[]> {
    await this.ensureLoaded();
    return this.entries;
  }

  async remove(id: string): Promise<void> {
    await this.ensureLoaded();
    this.entries = this.entries.filter((entry) => entry.id !== id);
    await this.persist();
  }

  async recordFailedAttempt(id: string, error: string): Promise<void> {
    await this.ensureLoaded();
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const existing = this.entries[index]!;
    this.entries[index] = {
      ...existing,
      error,
      when: new Date().toISOString(),
      attempts: existing.attempts + 1,
    };
    await this.persist();
  }
}
