#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { GatewayError } from "@interop-gateway/core";
import { loadPipelineConfig } from "./config.js";
import { runPipeline, replayDeadLetters, type RunningPipeline } from "./pipeline.js";
import {
  resolveAuditSink,
  resolveDeadLetterQueueWithDefault,
  type PersistenceOptions,
} from "./persistence.js";

function printUsage(): void {
  process.stderr.write(
    "Usage: interop-gateway-engine <run|validate|replay> <pipeline.yaml> [--allow-unencrypted]\n" +
      "  --allow-unencrypted   Persist the audit log/dead-letter queue as plaintext when\n" +
      "                        persistence.*.encryptPassphrase isn't set in the config —\n" +
      "                        otherwise run/replay refuse to persist unencrypted.\n",
  );
}

/** Exported so tests can drive the CLI directly instead of spawning a subprocess. Returns
 * the `RunningPipeline` for a successful `run` (so a test can `.stop()` it), or
 * `undefined` for `validate` and error cases. */
export async function main(argv: string[]): Promise<RunningPipeline | undefined> {
  const allowUnencryptedPersistence = argv.includes("--allow-unencrypted");
  const [command, filePath] = argv.filter((arg) => arg !== "--allow-unencrypted");

  if ((command !== "run" && command !== "validate" && command !== "replay") || !filePath) {
    printUsage();
    process.exitCode = 2;
    return undefined;
  }

  let config;
  try {
    config = loadPipelineConfig(readFileSync(filePath, "utf8"));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return undefined;
  }

  if (command === "validate") {
    process.stdout.write(`Pipeline "${config.name}" is valid.\n`);
    return undefined;
  }

  const persistenceOptions: PersistenceOptions = {
    baseDir: dirname(filePath),
    allowUnencryptedPersistence,
  };

  let auditLog;
  let deadLetterQueue;
  try {
    deadLetterQueue = await resolveDeadLetterQueueWithDefault(
      config.name,
      config.persistence,
      undefined,
      persistenceOptions,
    );
    auditLog = await resolveAuditSink(
      config.name,
      config.persistence,
      undefined,
      persistenceOptions,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof GatewayError ? error.message : String(error)}\n` +
        "Pass --allow-unencrypted to persist as plaintext instead, or set " +
        "persistence.audit.encryptPassphrase / persistence.deadLetter.encryptPassphrase " +
        "in the config.\n",
    );
    process.exitCode = 1;
    return undefined;
  }

  if (command === "replay") {
    const result = await replayDeadLetters(config, deadLetterQueue, { auditSink: auditLog });
    process.stdout.write(
      `Replayed ${result.replayed} dead-lettered message(s) for "${config.name}": ` +
        `${result.succeeded} succeeded, ${result.failed} failed again.\n`,
    );
    return undefined;
  }

  const running = await runPipeline(config, { auditSink: auditLog, deadLetterQueue });
  const destinationSummary = config.routes
    ? `${config.routes.length} route${config.routes.length === 1 ? "" : "s"}`
    : (config.destination?.protocol ?? "unknown");
  process.stdout.write(
    `Pipeline "${config.name}" running (${config.source.protocol} source -> ${destinationSummary} destination). ` +
      `Audit log and dead-letter queue persisting to disk.\n`,
  );

  const shutdown = async (): Promise<void> => {
    await running.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  return running;
}

const isMainModule = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
if (isMainModule) {
  void main(process.argv.slice(2));
}
