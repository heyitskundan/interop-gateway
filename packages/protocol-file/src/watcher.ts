import { readdir, readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FileHandlerResult {
  readonly status: "processed" | "error";
  readonly message?: string;
}

export type FileMessageHandler = (content: string, fileName: string) => Promise<FileHandlerResult>;

export interface FileIngestWatcherOptions {
  readonly directory: string;
  readonly handler: FileMessageHandler;
  readonly pollIntervalMs?: number;
  readonly processedSubdir?: string;
  readonly errorSubdir?: string;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_PROCESSED_SUBDIR = "processed";
const DEFAULT_ERROR_SUBDIR = "error";

/** Polls a directory for new files and hands each one's content to `handler`. On
 * `{status: "processed"}` the file moves to `processedSubdir`; on `{status: "error"}` or
 * a thrown handler error it moves to `errorSubdir` alongside a `<name>.error.txt`
 * sidecar carrying the failure message. Never re-reads a file that's already been
 * moved out of `directory`, and never revisits a file mid-flight if a poll tick lands
 * while it's still being handled. */
export class FileIngestWatcher {
  private readonly processedDir: string;
  private readonly errorDir: string;
  private readonly inFlight = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: FileIngestWatcherOptions) {
    this.processedDir = join(options.directory, options.processedSubdir ?? DEFAULT_PROCESSED_SUBDIR);
    this.errorDir = join(options.directory, options.errorSubdir ?? DEFAULT_ERROR_SUBDIR);
  }

  async start(): Promise<void> {
    await mkdir(this.processedDir, { recursive: true });
    await mkdir(this.errorDir, { recursive: true });
    await this.poll();
    this.timer = setInterval(
      () => void this.poll(),
      this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async poll(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.options.directory);
    } catch {
      return;
    }

    for (const name of entries) {
      if (this.inFlight.has(name)) continue;
      const path = join(this.options.directory, name);
      if (path === this.processedDir || path === this.errorDir) continue;

      this.inFlight.add(name);
      void this.processFile(name, path).finally(() => this.inFlight.delete(name));
    }
  }

  private async processFile(name: string, path: string): Promise<void> {
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch {
      return; // file was removed/moved by something else between listing and reading
    }

    let result: FileHandlerResult;
    try {
      result = await this.options.handler(content, name);
    } catch (error) {
      result = { status: "error", message: error instanceof Error ? error.message : String(error) };
    }

    const targetDir = result.status === "processed" ? this.processedDir : this.errorDir;
    await rename(path, join(targetDir, name)).catch(() => undefined);
    if (result.status === "error") {
      await writeFile(
        join(this.errorDir, `${name}.error.txt`),
        result.message ?? "Unknown error",
        "utf8",
      ).catch(() => undefined);
    }
  }
}
