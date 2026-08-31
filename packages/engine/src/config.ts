import { parse } from "yaml";
import { ValidationError } from "@interop-gateway/core";

export interface MllpSourceConfig {
  readonly protocol: "mllp";
  readonly port: number;
  readonly host: string | undefined;
}

export interface HttpSourceConfig {
  readonly protocol: "http";
  readonly port: number;
  readonly path: string | undefined;
}

export interface FileSourceConfig {
  readonly protocol: "file";
  readonly directory: string;
  readonly pollIntervalMs: number | undefined;
}

export type SourceConfig = MllpSourceConfig | HttpSourceConfig | FileSourceConfig;

export interface HttpDestinationConfig {
  readonly protocol: "http";
  readonly url: string;
}

export interface FileDestinationConfig {
  readonly protocol: "file";
  readonly directory: string;
}

export type DestinationConfig = HttpDestinationConfig | FileDestinationConfig;

export interface PipelineConfig {
  readonly name: string;
  readonly format: "hl7v2" | "cda";
  readonly source: SourceConfig;
  readonly destination: DestinationConfig;
  /** When `true`, every translated FHIR Bundle is checked against
   * `@interop-gateway/validate-us-core` before delivery — a resource that fails
   * US Core's required-element checks is routed to the same failure channel a
   * translation failure already uses (an `AE` ACK, a 422, the `error/` subdirectory),
   * and delivery never runs. Defaults to `false`: structural validation (well-formed
   * HL7v2/C-CDA) always runs inside `translate()` regardless of this flag; profile
   * validation is opt-in since not every deployment targets US Core. */
  readonly validateProfile?: boolean;
}

function fail(message: string): never {
  throw new ValidationError(`Invalid pipeline config: ${message}`);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    fail(`"${field}" must be a non-empty string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) fail(`"${field}" must be a number`);
  return value;
}

function parseSource(raw: unknown): SourceConfig {
  if (typeof raw !== "object" || raw === null) fail('"source" must be an object');
  const source = raw as Record<string, unknown>;

  if (source.protocol === "mllp") {
    return {
      protocol: "mllp",
      port: requireNumber(source.port, "source.port"),
      host: typeof source.host === "string" ? source.host : undefined,
    };
  }
  if (source.protocol === "http") {
    return {
      protocol: "http",
      port: requireNumber(source.port, "source.port"),
      path: typeof source.path === "string" ? source.path : undefined,
    };
  }
  if (source.protocol === "file") {
    return {
      protocol: "file",
      directory: requireString(source.directory, "source.directory"),
      pollIntervalMs: typeof source.pollIntervalMs === "number" ? source.pollIntervalMs : undefined,
    };
  }
  fail(
    `"source.protocol" must be one of "mllp", "http", "file" (got ${JSON.stringify(source.protocol)})`,
  );
}

function parseDestination(raw: unknown): DestinationConfig {
  if (typeof raw !== "object" || raw === null) fail('"destination" must be an object');
  const destination = raw as Record<string, unknown>;

  if (destination.protocol === "http") {
    return { protocol: "http", url: requireString(destination.url, "destination.url") };
  }
  if (destination.protocol === "file") {
    return {
      protocol: "file",
      directory: requireString(destination.directory, "destination.directory"),
    };
  }
  fail(
    `"destination.protocol" must be one of "http", "file" (got ${JSON.stringify(destination.protocol)})`,
  );
}

/** Parses and validates a pipeline config from YAML text. Throws `ValidationError`
 * (with a message naming the missing/invalid field) on anything malformed — a bad
 * config fails at load time, not partway through wiring up a listening server. */
export function loadPipelineConfig(yamlText: string): PipelineConfig {
  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch (cause) {
    throw new ValidationError(
      `Invalid pipeline config: not valid YAML (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    fail("top-level document must be a YAML mapping");
  }
  const doc = parsed as Record<string, unknown>;

  const name = requireString(doc.name, "name");
  if (doc.format !== "hl7v2" && doc.format !== "cda") {
    fail(`"format" must be "hl7v2" or "cda" (got ${JSON.stringify(doc.format)})`);
  }

  if (doc.validateProfile !== undefined && typeof doc.validateProfile !== "boolean") {
    fail('"validateProfile" must be a boolean');
  }

  return {
    name,
    format: doc.format,
    source: parseSource(doc.source),
    destination: parseDestination(doc.destination),
    ...(typeof doc.validateProfile === "boolean" ? { validateProfile: doc.validateProfile } : {}),
  };
}
