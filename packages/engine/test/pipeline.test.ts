import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HashChainedAuditLog, InMemoryStore } from "@interop-gateway/core";
import { sendMllpMessage } from "@interop-gateway/protocol-mllp";
import { HttpIngestServer } from "@interop-gateway/protocol-http";
import type { PipelineConfig } from "../src/config.js";
import { runPipeline, replayDeadLetters, type RunningPipeline } from "../src/pipeline.js";
import { FileDeadLetterQueue } from "../src/dead-letter.js";

const SAMPLE_ADT_A01 =
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260101120000\r" +
  "PID|1||123456^^^MRN||Doe^Jane||19800101|F\r" +
  "PV1|1|I";

// Same message with the PID-8 gender field blanked out — translates fine, but the
// resulting Patient resource fails US Core's required "gender" element check.
const SAMPLE_ADT_A01_MISSING_GENDER =
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260101120000\r" +
  "PID|1||123456^^^MRN||Doe^Jane||19800101|\r" +
  "PV1|1|I";

let activePipeline: RunningPipeline | undefined;
let activeDirs: string[] = [];

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timed out");
}

async function fileExists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
}

afterEach(async () => {
  await activePipeline?.stop();
  activePipeline = undefined;
  for (const dir of activeDirs) await rm(dir, { recursive: true, force: true });
  activeDirs = [];
});

describe("runPipeline (real transports, no mocking)", () => {
  it("file -> file: translates a dropped HL7v2 message and writes the FHIR Bundle to the destination", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [inboundDir, outboundDir];

    const config: PipelineConfig = {
      name: "test-file-to-file",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "processed", "adt.hl7")));

    const outFiles = await readdir(outboundDir);
    expect(outFiles).toHaveLength(1);
    const bundle = JSON.parse(await readFile(join(outboundDir, outFiles[0]!), "utf8"));
    expect(bundle.resourceType).toBe("Bundle");
  });

  it("file -> file: a translation failure moves the source file to error/, writes nothing to the destination", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [inboundDir, outboundDir];

    const config: PipelineConfig = {
      name: "test-failure",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "bad.hl7"), "not an hl7v2 message");
    await waitFor(() => fileExists(join(inboundDir, "error", "bad.hl7")));

    expect(await readdir(outboundDir)).toHaveLength(0);
  });

  it("http -> file: POSTing a message to the ingest port delivers the translated Bundle to disk", async () => {
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [outboundDir];

    const config: PipelineConfig = {
      name: "test-http-to-file",
      format: "hl7v2",
      source: { protocol: "http", port: 0, path: "/ingest" },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });
    const { port } = activePipeline.address!;

    const response = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      body: SAMPLE_ADT_A01,
    });

    expect(response.status).toBe(200);
    const bundle = await response.json();
    expect(bundle.resourceType).toBe("Bundle");
    const outFiles = await readdir(outboundDir);
    expect(outFiles).toHaveLength(1);
  });

  it("http -> file: a rejected translation returns a 422 and writes nothing to disk", async () => {
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [outboundDir];

    const config: PipelineConfig = {
      name: "test-http-failure",
      format: "hl7v2",
      source: { protocol: "http", port: 0 },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });
    const { port } = activePipeline.address!;

    const response = await fetch(`http://127.0.0.1:${port}`, { method: "POST", body: "garbage" });

    expect(response.status).toBe(422);
    expect(await readdir(outboundDir)).toHaveLength(0);
  });

  it("mllp -> file: sending a message over MLLP delivers an AA and writes the Bundle to disk", async () => {
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [outboundDir];

    const config: PipelineConfig = {
      name: "test-mllp-to-file",
      format: "hl7v2",
      source: { protocol: "mllp", port: 0, host: "127.0.0.1" },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });
    const { port } = activePipeline.address!;

    const result = await sendMllpMessage(SAMPLE_ADT_A01, { host: "127.0.0.1", port });

    expect(result.acknowledged).toBe(true);
    await waitFor(async () => (await readdir(outboundDir)).length === 1);
  });

  it("file -> http: an http:// (non-TLS) destination fails delivery and routes the source file to error/", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    activeDirs = [inboundDir];

    let receivedBody: string | undefined;
    const destinationServer = new HttpIngestServer({
      handler: async (body) => {
        receivedBody = body;
        return { status: 200, body: "accepted" };
      },
    });
    await destinationServer.listen(0, "127.0.0.1");
    const destPort = destinationServer.address()!.port;

    const config: PipelineConfig = {
      name: "test-file-to-http",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "http", url: `http://127.0.0.1:${destPort}` },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "error", "adt.hl7")));

    expect(receivedBody).toBeUndefined();
    await destinationServer.close();
  });

  it("mllp -> file: a translation failure returns an AE, writes nothing to disk", async () => {
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [outboundDir];

    const config: PipelineConfig = {
      name: "test-mllp-failure",
      format: "hl7v2",
      source: { protocol: "mllp", port: 0, host: "127.0.0.1" },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });
    const { port } = activePipeline.address!;

    const result = await sendMllpMessage("PID|not a real message", { host: "127.0.0.1", port });

    expect(result.acknowledged).toBe(false);
    expect(result.code).toBe("AE");
    expect(await readdir(outboundDir)).toHaveLength(0);
  });

  it("writes a correlated audit entry for every message, success or failure", async () => {
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [outboundDir];
    const auditSink = new HashChainedAuditLog();

    const config: PipelineConfig = {
      name: "test-audit",
      format: "hl7v2",
      source: { protocol: "http", port: 0 },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { auditSink });
    const { port } = activePipeline.address!;

    const okResponse = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      body: SAMPLE_ADT_A01,
    });
    const failResponse = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      body: "garbage",
    });

    expect(okResponse.status).toBe(200);
    expect(failResponse.status).toBe(422);
    expect(await failResponse.text()).toMatch(/^\[.+\] Structural validation failed/);

    const entries = auditSink.list().map((record) => record.entry);
    expect(entries.every((entry) => entry.who === "test-audit")).toBe(true);
    expect(entries.map((entry) => entry.what)).toEqual([
      "translate",
      "deliver",
      "translate:rejected",
    ]);
    // 3 entries, 2 requests: the ok request logs "translate" then "deliver" under the
    // same correlation ID, the failed request logs one "translate:rejected".
    expect(new Set(entries.map((entry) => entry.correlationId)).size).toBe(2);
    expect(await auditSink.verify()).toBe(true);
  });

  it("validateProfile: true rejects a translated resource that fails US Core, routes it to error/ like a translation failure", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [inboundDir, outboundDir];
    const auditSink = new HashChainedAuditLog();

    const config: PipelineConfig = {
      name: "test-validate-profile",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "file", directory: outboundDir },
      validateProfile: true,
    };
    activePipeline = await runPipeline(config, { auditSink });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01_MISSING_GENDER);
    await waitFor(() => fileExists(join(inboundDir, "error", "adt.hl7")));

    expect(await readdir(outboundDir)).toHaveLength(0);
    const errorSidecar = await readFile(join(inboundDir, "error", "adt.hl7.error.txt"), "utf8");
    expect(errorSidecar).toMatch(/US Core validation failed/);
    expect(errorSidecar).toMatch(/Patient/);

    const what = auditSink.list().map((record) => record.entry.what);
    expect(what).toEqual(["translate", "validateProfile:rejected"]);
  });

  it("validateProfile: true delivers a resource that passes US Core", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [inboundDir, outboundDir];

    const config: PipelineConfig = {
      name: "test-validate-profile-pass",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "file", directory: outboundDir },
      validateProfile: true,
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "processed", "adt.hl7")));

    expect(await readdir(outboundDir)).toHaveLength(1);
  });

  it("routes: a rule's to list fans out to every destination in it", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outA = await mkdtemp(join(tmpdir(), "engine-out-a-"));
    const outB = await mkdtemp(join(tmpdir(), "engine-out-b-"));
    activeDirs = [inboundDir, outA, outB];

    const config: PipelineConfig = {
      name: "test-fanout",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      routes: [
        {
          to: [
            { protocol: "file", directory: outA },
            { protocol: "file", directory: outB },
          ],
        },
      ],
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "processed", "adt.hl7")));

    expect(await readdir(outA)).toHaveLength(1);
    expect(await readdir(outB)).toHaveLength(1);
  });

  it("routes: the first matching rule (by when) wins, later rules are not evaluated", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const patientDir = await mkdtemp(join(tmpdir(), "engine-patient-"));
    const catchAllDir = await mkdtemp(join(tmpdir(), "engine-catchall-"));
    activeDirs = [inboundDir, patientDir, catchAllDir];

    const config: PipelineConfig = {
      name: "test-conditional-routing",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      routes: [
        {
          when: { "entry.0.resource.resourceType": "Patient" },
          to: [{ protocol: "file", directory: patientDir }],
        },
        { to: [{ protocol: "file", directory: catchAllDir }] },
      ],
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "processed", "adt.hl7")));

    expect(await readdir(patientDir)).toHaveLength(1);
    expect(await readdir(catchAllDir)).toHaveLength(0);
  });

  it("routes: a message matching no rule is a delivery failure, routed to error/", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const unmatchedDir = await mkdtemp(join(tmpdir(), "engine-unmatched-"));
    activeDirs = [inboundDir, unmatchedDir];
    const auditSink = new HashChainedAuditLog();

    const config: PipelineConfig = {
      name: "test-no-route-matched",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      routes: [
        {
          when: { "entry.0.resource.resourceType": "Observation" },
          to: [{ protocol: "file", directory: unmatchedDir }],
        },
      ],
    };
    activePipeline = await runPipeline(config, { auditSink });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(() => fileExists(join(inboundDir, "error", "adt.hl7")));

    expect(await readdir(unmatchedDir)).toHaveLength(0);
    const errorSidecar = await readFile(join(inboundDir, "error", "adt.hl7.error.txt"), "utf8");
    expect(errorSidecar).toMatch(/No route matched/);
    expect(auditSink.list().map((record) => record.entry.what)).toEqual([
      "translate",
      "route:unmatched",
    ]);
  });

  it("deadLetterQueue: a delivery failure is enqueued with the raw message and failure stage", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    activeDirs = [inboundDir];
    const deadLetterQueue = new FileDeadLetterQueue(new InMemoryStore());

    const config: PipelineConfig = {
      name: "test-dlq-deliver",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      // Nothing is listening on this port — every delivery attempt fails.
      destination: { protocol: "http", url: "https://127.0.0.1:1" },
    };
    activePipeline = await runPipeline(config, { deadLetterQueue, ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(async () => (await deadLetterQueue.list()).length === 1);

    const [entry] = await deadLetterQueue.list();
    expect(entry!.raw).toBe(SAMPLE_ADT_A01);
    expect(entry!.stage).toBe("deliver");
    expect(entry!.attempts).toBe(0);
  });

  it("deadLetterQueue: an unmatched route is enqueued with stage 'route'", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const unmatchedDir = await mkdtemp(join(tmpdir(), "engine-unmatched-"));
    activeDirs = [inboundDir, unmatchedDir];
    const deadLetterQueue = new FileDeadLetterQueue(new InMemoryStore());

    const config: PipelineConfig = {
      name: "test-dlq-route",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      routes: [
        {
          when: { "entry.0.resource.resourceType": "Observation" },
          to: [{ protocol: "file", directory: unmatchedDir }],
        },
      ],
    };
    activePipeline = await runPipeline(config, { deadLetterQueue, ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(async () => (await deadLetterQueue.list()).length === 1);

    expect((await deadLetterQueue.list())[0]!.stage).toBe("route");
  });

  it("deadLetterQueue: not configured (default) means a failure is reported but never retained", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [inboundDir, outboundDir];

    const config: PipelineConfig = {
      name: "test-no-dlq",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "file", directory: outboundDir },
    };
    activePipeline = await runPipeline(config, { ephemeral: true });

    await writeFile(join(inboundDir, "bad.hl7"), "not an hl7v2 message");
    await waitFor(() => fileExists(join(inboundDir, "error", "bad.hl7")));

    expect(activePipeline.deadLetterQueue).toBeUndefined();
  });

  it("replayDeadLetters: a message that now succeeds is removed from the queue and delivered", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    const outboundDir = await mkdtemp(join(tmpdir(), "engine-out-"));
    activeDirs = [inboundDir, outboundDir];
    const deadLetterQueue = new FileDeadLetterQueue(new InMemoryStore());

    // Deliver to a destination directory that doesn't exist yet — file delivery fails,
    // the message is dead-lettered. Then we create the directory and replay.
    const missingDir = join(outboundDir, "does-not-exist-yet", "nested");
    const config: PipelineConfig = {
      name: "test-replay-success",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "http", url: "https://127.0.0.1:1" },
    };
    activePipeline = await runPipeline(config, { deadLetterQueue, ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(async () => (await deadLetterQueue.list()).length === 1);

    // Replay against a corrected config (file delivery instead of the broken https
    // destination) to prove replay actually re-runs the full handler, not a no-op.
    const fixedConfig: PipelineConfig = {
      ...config,
      destination: { protocol: "file", directory: missingDir },
    };
    const result = await replayDeadLetters(fixedConfig, deadLetterQueue, { ephemeral: true });

    expect(result).toEqual({ replayed: 1, succeeded: 1, failed: 0 });
    expect(await deadLetterQueue.list()).toHaveLength(0);
    expect(await readdir(missingDir)).toHaveLength(1);
  });

  it("replayDeadLetters: a message that fails again stays queued with attempts incremented", async () => {
    const inboundDir = await mkdtemp(join(tmpdir(), "engine-in-"));
    activeDirs = [inboundDir];
    const deadLetterQueue = new FileDeadLetterQueue(new InMemoryStore());

    const config: PipelineConfig = {
      name: "test-replay-still-fails",
      format: "hl7v2",
      source: { protocol: "file", directory: inboundDir, pollIntervalMs: 30 },
      destination: { protocol: "http", url: "https://127.0.0.1:1" },
    };
    activePipeline = await runPipeline(config, { deadLetterQueue, ephemeral: true });

    await writeFile(join(inboundDir, "adt.hl7"), SAMPLE_ADT_A01);
    await waitFor(async () => (await deadLetterQueue.list()).length === 1);

    const result = await replayDeadLetters(config, deadLetterQueue, { ephemeral: true });

    expect(result).toEqual({ replayed: 1, succeeded: 0, failed: 1 });
    const [entry] = await deadLetterQueue.list();
    expect(entry!.attempts).toBe(1);
  });
});
