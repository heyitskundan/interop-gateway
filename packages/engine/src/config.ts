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

/** One routing rule: `when` matches fields on the translated FHIR resource by dot-path
 * equality (e.g. `resourceType: "Patient"`, or `subject.reference: "Patient/1"`) —
 * omit `when` for a catch-all/default rule. Rules are tried in order; the first match
 * delivers to every destination in `to` (fan-out — all of them, not just one). */
export interface RouteRule {
  readonly when?: Readonly<Record<string, string>>;
  readonly to: readonly DestinationConfig[];
}

export interface PipelineConfig {
  readonly name: string;
  readonly format: "hl7v2" | "cda";
  readonly source: SourceConfig;
  /** Exactly one of `destination`/`routes` must be set. `destination` is the simple
   * case — deliver every translated message to this one place. */
  readonly destination?: DestinationConfig;
  /** The routing/fan-out case — deliver to different destination(s) depending on the
   * translated resource, tried in order, first match wins. A message matching no rule
   * is a delivery failure (routed to the same failure channel as any other delivery
   * failure), so include a catch-all rule (no `when`) last if you want one. */
  readonly routes?: readonly RouteRule[];
  /** When `true`, every translated FHIR Bundle is checked against
   * `@interop-gateway/core`'s `validateUsCoreBundle` before delivery — a resource that fails
   * US Core's required-element checks is routed to the same failure channel a
   * translation failure already uses (an `AE` ACK, a 422, the `error/` subdirectory),
   * and delivery never runs. Defaults to `false`: structural validation (well-formed
   * HL7v2/C-CDA) always runs inside `translate()` regardless of this flag; profile
   * validation is opt-in since not every deployment targets US Core. */
  readonly validateProfile?: boolean;
  /** Where the dead-letter queue and the hash-chained audit log persist to disk.
   * Optional — the CLI's `run` command fills in a default (`<name>-dead-letters/` and
   * `<name>-audit/` next to the config file) when this is omitted, so persistence is
   * the default for a deployed pipeline without requiring config for it; a pipeline
   * started programmatically via `runPipeline()` still defaults to in-memory-only
   * (`RunPipelineOptions` are the caller's to set) since a library call can't assume a
   * writable directory. `encryptPassphrase`, if set, wraps the on-disk store in
   * `EncryptedStore` (AES-256-GCM, PBKDF2-derived key) — strongly recommended for
   * `deadLetter`, which persists raw (unredacted) source messages. */
  readonly persistence?: PersistenceConfig;
}

export interface PersistenceConfig {
  readonly deadLetter?: { readonly directory: string; readonly encryptPassphrase?: string };
  readonly audit?: { readonly directory: string; readonly encryptPassphrase?: string };
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

function parseDestination(raw: unknown, field: string): DestinationConfig {
  if (typeof raw !== "object" || raw === null) fail(`"${field}" must be an object`);
  const destination = raw as Record<string, unknown>;

  if (destination.protocol === "http") {
    return { protocol: "http", url: requireString(destination.url, `${field}.url`) };
  }
  if (destination.protocol === "file") {
    return {
      protocol: "file",
      directory: requireString(destination.directory, `${field}.directory`),
    };
  }
  fail(
    `"${field}.protocol" must be one of "http", "file" (got ${JSON.stringify(destination.protocol)})`,
  );
}

function parseWhen(raw: unknown, field: string): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(`"${field}" must be an object of field-path -> expected-value pairs`);
  }
  const when: Record<string, string> = {};
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    when[path] = requireString(value, `${field}.${path}`);
  }
  return when;
}

function parseRoutes(raw: unknown): readonly RouteRule[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail('"routes" must be a non-empty array');
  }
  return raw.map((rawRule, index) => {
    if (typeof rawRule !== "object" || rawRule === null) {
      fail(`"routes[${index}]" must be an object`);
    }
    const rule = rawRule as Record<string, unknown>;
    const to = Array.isArray(rule.to) ? rule.to : fail(`"routes[${index}].to" must be an array`);
    if (to.length === 0) fail(`"routes[${index}].to" must have at least one destination`);
    const when = parseWhen(rule.when, `routes[${index}].when`);
    return {
      ...(when !== undefined ? { when } : {}),
      to: to.map((destination, i) => parseDestination(destination, `routes[${index}].to[${i}]`)),
    };
  });
}

function parseStoreConfig(
  raw: unknown,
  field: string,
): { readonly directory: string; readonly encryptPassphrase?: string } | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) fail(`"${field}" must be an object`);
  const store = raw as Record<string, unknown>;
  return {
    directory: requireString(store.directory, `${field}.directory`),
    ...(typeof store.encryptPassphrase === "string"
      ? { encryptPassphrase: store.encryptPassphrase }
      : {}),
  };
}

function parsePersistence(raw: unknown): PersistenceConfig | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) fail('"persistence" must be an object');
  const persistence = raw as Record<string, unknown>;
  const deadLetter = parseStoreConfig(persistence.deadLetter, "persistence.deadLetter");
  const audit = parseStoreConfig(persistence.audit, "persistence.audit");
  return {
    ...(deadLetter !== undefined ? { deadLetter } : {}),
    ...(audit !== undefined ? { audit } : {}),
  };
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

  if (doc.destination !== undefined && doc.routes !== undefined) {
    fail('exactly one of "destination"/"routes" may be set, not both');
  }
  if (doc.destination === undefined && doc.routes === undefined) {
    fail('exactly one of "destination"/"routes" must be set');
  }

  const persistence = parsePersistence(doc.persistence);

  return {
    name,
    format: doc.format,
    source: parseSource(doc.source),
    ...(doc.destination !== undefined
      ? { destination: parseDestination(doc.destination, "destination") }
      : { routes: parseRoutes(doc.routes) }),
    ...(typeof doc.validateProfile === "boolean" ? { validateProfile: doc.validateProfile } : {}),
    ...(persistence !== undefined ? { persistence } : {}),
  };
}
