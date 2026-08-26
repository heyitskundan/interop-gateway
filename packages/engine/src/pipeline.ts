import { GatewayError, InteropGateway } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";
import { formatCda } from "@interop-gateway/format-cda";
import { MllpServer } from "@interop-gateway/protocol-mllp";
import { HttpIngestServer, sendHttpMessage } from "@interop-gateway/protocol-http";
import { FileIngestWatcher, writeFileMessage } from "@interop-gateway/protocol-file";
import type { DestinationConfig, PipelineConfig } from "./config.js";

export interface RunningPipeline {
  readonly config: PipelineConfig;
  /** The bound host/port for a network-based source (mllp/http) — useful for reading
   * back the actual port when `source.port` was `0`. `undefined` for a file source. */
  readonly address: { readonly port: number; readonly address: string } | undefined;
  stop(): Promise<void>;
}

type HandleResult = { readonly ok: true; readonly fhirJson: string } | { readonly ok: false; readonly error: string };

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

function makeHandler(config: PipelineConfig): (raw: string) => Promise<HandleResult> {
  const gateway = new InteropGateway({
    formats: [config.format === "hl7v2" ? formatHl7v2 : formatCda],
  });

  return async (raw: string): Promise<HandleResult> => {
    try {
      const fhir = gateway.translate(raw, { from: config.format, to: "fhir" });
      const fhirJson = JSON.stringify(fhir);
      await deliver(fhirJson, config.destination);
      return { ok: true, fhirJson };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** Wires up the source listener/watcher named in `config.source`, translates each
 * message through `config.format`, and delivers the resulting FHIR JSON to
 * `config.destination`. A translation or delivery failure is reported back through the
 * source's own failure channel (an `AE` ACK for MLLP, a non-2xx response for HTTP, the
 * `error` subdirectory for file) rather than thrown — one bad message never stops the
 * pipeline from processing the next one. Call `.stop()` on the returned handle to shut
 * the source down. */
export async function runPipeline(config: PipelineConfig): Promise<RunningPipeline> {
  const handle = makeHandler(config);

  if (config.source.protocol === "mllp") {
    const server = new MllpServer({
      handler: async (message) => {
        const result = await handle(message);
        return result.ok ? { code: "AA" as const } : { code: "AE" as const, textMessage: result.error };
      },
    });
    await server.listen(config.source.port, config.source.host);
    return { config, address: server.address(), stop: () => server.close() };
  }

  if (config.source.protocol === "http") {
    const server = new HttpIngestServer({
      ...(config.source.path !== undefined ? { path: config.source.path } : {}),
      handler: async (body) => {
        const result = await handle(body);
        return result.ok
          ? { status: 200, body: result.fhirJson, contentType: "application/fhir+json" }
          : { status: 422, body: result.error };
      },
    });
    await server.listen(config.source.port);
    return { config, address: server.address(), stop: () => server.close() };
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
        : { status: "error" as const, message: result.error };
    },
  });
  await watcher.start();
  return { config, address: undefined, stop: () => Promise.resolve(watcher.stop()) };
}
