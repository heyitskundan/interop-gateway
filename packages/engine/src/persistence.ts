import { join } from "node:path";
import {
  deriveKey,
  EncryptedStore,
  FileAuditLog,
  GatewayError,
  HashChainedAuditLog,
  type AuditSink,
  type Store,
} from "@interop-gateway/core";
import { FileStore } from "@interop-gateway/core/node";
import { FileDeadLetterQueue, type DeadLetterQueue } from "./dead-letter.js";
import type { PersistenceConfig } from "./config.js";

export interface PersistenceOptions {
  /** Skips persistence entirely — a fresh in-memory `HashChainedAuditLog()` and no
   * dead-letter queue, the previous default for a direct `runPipeline()` call. Use for
   * tests and quick demos where a real on-disk audit trail isn't the point; real usage
   * should not set this, since it silently loses the audit log on every restart. */
  readonly ephemeral?: boolean;
  /** Required to persist without `persistence.audit.encryptPassphrase`/
   * `persistence.deadLetter.encryptPassphrase` set — an explicit, typed-out
   * acknowledgment that the audit log / dead-letter queue will be plaintext on disk.
   * Without either this or a passphrase, persisting throws rather than silently
   * writing PHI-adjacent data unencrypted. */
  readonly allowUnencryptedPersistence?: boolean;
  /** Where the default (unconfigured) audit/dead-letter directories are created,
   * relative to — `<baseDir>/<name>-audit`, `<baseDir>/<name>-dead-letters`. Defaults
   * to `process.cwd()`; the CLI passes the config file's own directory instead. */
  readonly baseDir?: string;
}

async function buildStore(
  directory: string,
  encryptPassphrase: string | undefined,
  salt: string,
  allowUnencryptedPersistence: boolean | undefined,
): Promise<Store> {
  const fileStore = new FileStore(directory);
  if (encryptPassphrase !== undefined) {
    return new EncryptedStore(fileStore, await deriveKey(encryptPassphrase, salt));
  }
  if (!allowUnencryptedPersistence) {
    throw new GatewayError(
      `Refusing to persist to "${directory}" without encryption — set ` +
        `persistence.encryptPassphrase in the pipeline config, or pass ` +
        `allowUnencryptedPersistence: true to explicitly accept plaintext-on-disk storage.`,
      "UNENCRYPTED_PERSISTENCE_REFUSED",
      directory,
    );
  }
  return fileStore;
}

/** Resolves the `AuditSink` a pipeline (or an MCP server) should use: the caller's own
 * `explicit` value if given, an in-memory `HashChainedAuditLog()` if `ephemeral` is
 * set, otherwise a `FileAuditLog` persisted to `persistence.audit.directory` (or a
 * `<name>-audit` default under `baseDir`) — encrypted if a passphrase is configured,
 * throwing `GatewayError`/`UNENCRYPTED_PERSISTENCE_REFUSED` otherwise unless
 * `allowUnencryptedPersistence` is set. Persistence is the default now; ephemeral is
 * the opt-out, not the other way around. */
export async function resolveAuditSink(
  name: string,
  persistence: PersistenceConfig | undefined,
  explicit: AuditSink | undefined,
  options: PersistenceOptions,
): Promise<AuditSink> {
  if (explicit) return explicit;
  if (options.ephemeral) return new HashChainedAuditLog();

  const configured = persistence?.audit;
  const directory =
    configured?.directory ?? join(options.baseDir ?? process.cwd(), `${name}-audit`);
  const store = await buildStore(
    directory,
    configured?.encryptPassphrase,
    name,
    options.allowUnencryptedPersistence,
  );
  return new FileAuditLog(store);
}

/** Resolves the `DeadLetterQueue` a pipeline should use: the caller's own `explicit`
 * value if given, otherwise `undefined` unless `persistence.deadLetter` is configured
 * (a dead-letter queue's existence stays opt-in for a direct `runPipeline()` call —
 * only its encryption is no-longer-silently-plaintext by default; see
 * `resolveAuditSink` for the same encryption rule). */
export async function resolveDeadLetterQueue(
  name: string,
  persistence: PersistenceConfig | undefined,
  explicit: DeadLetterQueue | undefined,
  options: PersistenceOptions,
): Promise<DeadLetterQueue | undefined> {
  if (explicit) return explicit;
  if (options.ephemeral) return undefined;
  const configured = persistence?.deadLetter;
  if (!configured) return undefined;

  const store = await buildStore(
    configured.directory,
    configured.encryptPassphrase,
    name,
    options.allowUnencryptedPersistence,
  );
  return new FileDeadLetterQueue(store);
}

/** Same as `resolveAuditSink`/`resolveDeadLetterQueue`, but always persists the
 * dead-letter queue (falling back to a `<name>-dead-letters` default under `baseDir`,
 * same convention as the audit log) — this is what the CLI's `run` command uses, since
 * a deployed pipeline should always retain its dead letters, not just when a config
 * happens to set `persistence.deadLetter`. */
export async function resolveDeadLetterQueueWithDefault(
  name: string,
  persistence: PersistenceConfig | undefined,
  explicit: DeadLetterQueue | undefined,
  options: PersistenceOptions,
): Promise<DeadLetterQueue> {
  if (explicit) return explicit;
  const configured = persistence?.deadLetter;
  const directory =
    configured?.directory ?? join(options.baseDir ?? process.cwd(), `${name}-dead-letters`);
  const store = await buildStore(
    directory,
    configured?.encryptPassphrase,
    name,
    options.allowUnencryptedPersistence,
  );
  return new FileDeadLetterQueue(store);
}
