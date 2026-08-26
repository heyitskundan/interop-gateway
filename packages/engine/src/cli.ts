#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadPipelineConfig } from "./config.js";
import { runPipeline, type RunningPipeline } from "./pipeline.js";

function printUsage(): void {
  process.stderr.write("Usage: interop-gateway-engine <run|validate> <pipeline.yaml>\n");
}

/** Exported so tests can drive the CLI directly instead of spawning a subprocess. Returns
 * the `RunningPipeline` for a successful `run` (so a test can `.stop()` it), or
 * `undefined` for `validate` and error cases. */
export async function main(argv: string[]): Promise<RunningPipeline | undefined> {
  const [command, filePath] = argv;

  if ((command !== "run" && command !== "validate") || !filePath) {
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

  const running = await runPipeline(config);
  process.stdout.write(
    `Pipeline "${config.name}" running (${config.source.protocol} source -> ${config.destination.protocol} destination).\n`,
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
