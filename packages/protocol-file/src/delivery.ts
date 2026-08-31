import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { GatewayError } from "@interop-gateway/core";

export interface FileDeliveryOptions {
  readonly directory: string;
  readonly fileName?: string;
}

/** Writes `content` to a file under `options.directory`, generating a name
 * (`<timestamp>-<uuid>.txt`) when `options.fileName` isn't given. Writes to a temp
 * file in the same directory first, then renames it into place, so a reader polling
 * the directory (e.g. `FileIngestWatcher` pointed at the same path elsewhere) never
 * sees a partially-written file. Throws `GatewayError` if the write or rename fails. */
export async function writeFileMessage(
  content: string,
  options: FileDeliveryOptions,
): Promise<string> {
  const fileName = options.fileName ?? `${Date.now()}-${randomUUID()}.txt`;
  const finalPath = join(options.directory, fileName);
  const tempPath = join(options.directory, `.${fileName}.tmp`);

  try {
    await mkdir(options.directory, { recursive: true });
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, finalPath);
    return finalPath;
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw new GatewayError(
      `Failed to write delivery file to ${finalPath}`,
      "FILE_WRITE_FAILED",
      finalPath,
      error,
    );
  }
}
