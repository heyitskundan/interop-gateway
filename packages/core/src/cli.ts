#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateStructural } from "./validate.js";

function printUsage(): void {
  process.stderr.write("Usage: interop-gateway validate <file>\n");
}

/** Exported so tests can drive the CLI directly instead of spawning a subprocess. */
export function main(argv: string[]): void {
  const [command, filePath] = argv;

  if (command !== "validate" || !filePath) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  let input: string;
  try {
    input = readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not read "${filePath}": ${message}\n`);
    process.exitCode = 2;
    return;
  }

  const result = validateStructural(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.valid ? 0 : 1;
}

const isMainModule = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
if (isMainModule) {
  main(process.argv.slice(2));
}
