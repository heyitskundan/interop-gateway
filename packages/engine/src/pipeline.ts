import {
  GatewayError,
  InteropGateway,
  createEnvelope,
  type AuditSink,
} from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";
import { formatCda } from "@interop-gateway/format-cda";
import { MllpServer } from "@interop-gateway/protocol-mllp";
import { HttpIngestServer, sendHttpMessage } from "@interop-gateway/protocol-http";
import { FileIngestWatcher, writeFileMessage } from "@interop-gateway/protocol-file";
import { validateUsCoreBundle } from "@interop-gateway/validate-us-core";
import type { DeadLetterQueue } from "./dead-letter.js";
import type { DestinationConfig, PipelineConfig, RouteRule } from "./config.js";
import {
  resolveAuditSink,
  resolveDeadLetterQueue,
  type PersistenceOptions,
} from "./persistence.js";

export interface RunPipelineOptions extends PersistenceOptions {
  /** Where per-message audit entries are written — `who` is the pipeline's `name`,
   * `what` is `"translate"`, `"validateProfile"`, or `"deliver"`, `resourceType` is the
   * translated Bundle's `resourceType` (never the message content itself). Defaults to
   * a `FileAuditLog` persisted to `persistence.audit.directory` (or a `<name>-audit`
   * default next to `baseDir`) — set `ephemeral: true` for the old in-memory-only
   * default instead. Persisting without `persistence.audit.encryptPassphrase` throws
   * unless `allowUnencryptedPersistence: true` is also set. Pass your own `AuditSink`
   * to share one across multiple pipelines or bypass all of the above. */
  readonly auditSink?: AuditSink;
  /** When set (or resolved from `persistence.deadLetter`), a message that fails
   * translation, US Core validation, routing, or delivery is also written here (raw
   * message + failure stage + error), so it can be inspected and replayed later with
   * `replayDeadLetters()` instead of being lost once its failure is reported back
   * through the source's own failure channel. Unlike the audit log, a dead-letter
   * queue's existence stays opt-in for a direct `runPipeline()` call — only pass this
   * (or set `persistence.deadLetter`) if you want one; the encryption requirement
   * above still applies to it when you do. */
  readonly deadLetterQueue?: DeadLetterQueue;
}

export interface RunningPipeline {
  readonly config: PipelineConfig;
  /** The bound host/port for a network-based source (mllp/http) — useful for reading
   * back the actual port when `source.port` was `0`. `undefined` for a file source. */
  readonly address: { readonly port: number; readonly address: string } | undefined;
  readonly auditLog: AuditSink;
  /** The dead-letter queue passed in via `RunPipelineOptions.deadLetterQueue`, if any —
   * exposed here so a caller that started the pipeline can also inspect/replay it
   * without holding onto a separate reference. `undefined` if none was configured. */
  readonly deadLetterQueue: DeadLetterQueue | undefined;
  stop(): Promise<void>;
}

type HandleResult =
  | { readonly ok: true; readonly fhirJson: string; readonly correlationId: string }
  | { readonly ok: false; readonly error: string; readonly correlationId: string };

async function deliver(fhirJson: string, destination: DestinationConfig): Promise<void> {
  if (destination.protocol === "http") {
    const result = await sendHttpMessage(fhirJson, { url: destination.url });
    if (!result.ok) {
      throw new GatewayError(
        `Destination rejected delivery: HTTP ${result.status}`,
        "DESTINATION_REJECTED",
      );
    }
    return;
  }
  await writeFileMessage(fhirJson, { directory: destination.directory });
}

/** Delivers to every destination in order — a fan-out rule's destinations all receive
 * the message, not just the first. Stops and reports the first failure rather than
 * delivering to a subset and calling it success. */
async function deliverAll(
  fhirJson: string,
  destinations: readonly DestinationConfig[],
): Promise<void> {
  for (const destination of destinations) {
    await deliver(fhirJson, destination);
  }
}

function getPath(resource: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value !== null && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      resource,
    );
}

function matchesRoute(fhir: unknown, when: RouteRule["when"]): boolean {
  if (when === undefined) return true;
  return Object.entries(when).every(([path, expected]) => getPath(fhir, path) === expected);
}

/** Finds the first rule (in order) whose `when` matches `fhir`, or `undefined` if no
 * rule matches. `destination` (the simple, non-routing case) is treated as one
 * unconditional rule. */
function resolveDestinations(
  fhir: unknown,
  config: PipelineConfig,
): readonly DestinationConfig[] | undefined {
  if (config.destination) return [config.destination];
  return config.routes?.find((rule) => matchesRoute(fhir, rule.when))?.to;
}

function makeHandler(
  config: PipelineConfig,
  auditSink: AuditSink,
  deadLetterQueue: DeadLetterQueue | undefined,
): (raw: string) => Promise<HandleResult> {
  const gateway = new InteropGateway({
    formats: [config.format === "hl7v2" ? formatHl7v2 : formatCda],
  });

  return async (raw: string): Promise<HandleResult> => {
    const envelope = createEnvelope(raw, config.source.protocol);
    const { correlationId } = envelope;

    const audit = (what: string, resourceType?: string): Promise<void> =>
      auditSink.append({
        correlationId,
        who: config.name,
        what,
        when: new Date().toISOString(),
        ...(resourceType !== undefined ? { resourceType } : {}),
      });

    const deadLetter = async (
      stage: "translate" | "validateProfile" | "route" | "deliver",
      error: string,
    ): Promise<void> => {
      if (!deadLetterQueue) return;
      await deadLetterQueue.enqueue({
        id: correlationId,
        raw,
        stage,
        error,
        when: new Date().toISOString(),
      });
    };

    let fhir: unknown;
    try {
      fhir = gateway.translate(raw, { from: config.format, to: "fhir" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await audit("translate:rejected");
      await deadLetter("translate", message);
      return { ok: false, error: message, correlationId };
    }

    const resourceType = (fhir as { resourceType?: string } | null)?.resourceType;
    await audit("translate", resourceType);

    if (config.validateProfile) {
      const failures = validateUsCoreBundle(fhir).filter((result) => !result.valid);
      if (failures.length > 0) {
        await audit("validateProfile:rejected", resourceType);
        const summary = failures
          .map((failure) => `${failure.resourceType}: ${failure.issues.join(", ")}`)
          .join("; ");
        const message = `US Core validation failed: ${summary}`;
        await deadLetter("validateProfile", message);
        return { ok: false, error: message, correlationId };
      }
      await audit("validateProfile:passed", resourceType);
    }

    const destinations = resolveDestinations(fhir, config);
    if (!destinations || destinations.length === 0) {
      await audit("route:unmatched", resourceType);
      await deadLetter("route", "No route matched this message");
      return { ok: false, error: "No route matched this message", correlationId };
    }

    try {
      const fhirJson = JSON.stringify(fhir);
      await deliverAll(fhirJson, destinations);
      await audit("deliver", resourceType);
      return { ok: true, fhirJson, correlationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await audit("deliver:rejected", resourceType);
      await deadLetter("deliver", message);
      return { ok: false, error: message, correlationId };
    }
  };
}

/** Wires up the source listener/watcher named in `config.source`, translates each
 * message through `config.format`, and delivers the resulting FHIR JSON to
 * `config.destination` (unconditional) or, for `config.routes`, to the `to` list of
 * the first rule whose `when` matches the translated resource — fanning out to every
 * destination in that list, not just one. A message matching no rule, a translation
 * failure, or a delivery failure is reported back through the source's own failure
 * channel (an `AE` ACK for MLLP, a non-2xx response for HTTP, the `error` subdirectory
 * for file) rather than thrown — one bad message never stops the pipeline from
 * processing the next one. Call `.stop()` on the returned handle to shut the source
 * down. */
export async function runPipeline(
  config: PipelineConfig,
  options: RunPipelineOptions = {},
): Promise<RunningPipeline> {
  const auditLog = await resolveAuditSink(
    config.name,
    config.persistence,
    options.auditSink,
    options,
  );
  const deadLetterQueue = await resolveDeadLetterQueue(
    config.name,
    config.persistence,
    options.deadLetterQueue,
    options,
  );
  const handle = makeHandler(config, auditLog, deadLetterQueue);

  if (config.source.protocol === "mllp") {
    const server = new MllpServer({
      handler: async (message) => {
        const result = await handle(message);
        return result.ok
          ? { code: "AA" as const }
          : { code: "AE" as const, textMessage: `[${result.correlationId}] ${result.error}` };
      },
    });
    await server.listen(config.source.port, config.source.host);
    return {
      config,
      address: server.address(),
      auditLog,
      deadLetterQueue,
      stop: () => server.close(),
    };
  }

  if (config.source.protocol === "http") {
    const server = new HttpIngestServer({
      ...(config.source.path !== undefined ? { path: config.source.path } : {}),
      handler: async (body) => {
        const result = await handle(body);
        return result.ok
          ? { status: 200, body: result.fhirJson, contentType: "application/fhir+json" }
          : { status: 422, body: `[${result.correlationId}] ${result.error}` };
      },
    });
    await server.listen(config.source.port);
    return {
      config,
      address: server.address(),
      auditLog,
      deadLetterQueue,
      stop: () => server.close(),
    };
  }

  const watcher = new FileIngestWatcher({
    directory: config.source.directory,
    ...(config.source.pollIntervalMs !== undefined
      ? { pollIntervalMs: config.source.pollIntervalMs }
      : {}),
    handler: async (content) => {
      const result = await handle(content);
      return result.ok
        ? { status: "processed" as const }
        : { status: "error" as const, message: `[${result.correlationId}] ${result.error}` };
    },
  });
  await watcher.start();
  return {
    config,
    address: undefined,
    auditLog,
    deadLetterQueue,
    stop: () => Promise.resolve(watcher.stop()),
  };
}

export interface ReplayResult {
  readonly replayed: number;
  readonly succeeded: number;
  readonly failed: number;
}

/** Re-runs every entry currently in `deadLetterQueue` through the same
 * translate/validate/route/deliver handler a live pipeline uses. A message that
 * succeeds this time is removed from the queue; one that fails again has its
 * `attempts`/`error`/`when` updated in place rather than being dropped, so repeated
 * failures stay visible. Does not start a source listener — this only re-processes
 * already-ingested raw messages, so it works the same for an `mllp`/`http`/`file`
 * pipeline. */
export async function replayDeadLetters(
  config: PipelineConfig,
  deadLetterQueue: DeadLetterQueue,
  options: Omit<RunPipelineOptions, "deadLetterQueue"> = {},
): Promise<ReplayResult> {
  const auditLog = await resolveAuditSink(
    config.name,
    config.persistence,
    options.auditSink,
    options,
  );
  const handle = makeHandler(config, auditLog, undefined);

  const entries = await deadLetterQueue.list();
  let succeeded = 0;
  let failed = 0;
  for (const entry of entries) {
    const result = await handle(entry.raw);
    if (result.ok) {
      succeeded += 1;
      await deadLetterQueue.remove(entry.id);
    } else {
      failed += 1;
      await deadLetterQueue.recordFailedAttempt(entry.id, result.error);
    }
  }
  return { replayed: entries.length, succeeded, failed };
}
