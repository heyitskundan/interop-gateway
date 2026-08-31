import { GatewayError } from "@interop-gateway/core";

/** `"system"` — `$export` at the server root, everything the token's scope allows.
 * `"patient"` — `Patient/$export`, everything for every patient the token can see.
 * `"group"` — `Group/[groupId]/$export`, one named cohort. Per the
 * [FHIR Bulk Data Access IG](https://hl7.org/fhir/uv/bulkdata/). */
export type BulkExportLevel = "system" | "patient" | "group";

export interface StartBulkExportOptions {
  readonly level: BulkExportLevel;
  /** Required when `level` is `"group"` — the `Group` resource id to export. Ignored
   * for `"system"`/`"patient"`. */
  readonly groupId?: string;
  /** `_type` — resource types to include (e.g. `["Patient", "Observation"]`). Omit for
   * every type the server is willing to export. */
  readonly types?: readonly string[];
  /** `_since` — an FHIR instant; only resources updated at or after this are included. */
  readonly since?: string;
  /** `_typeFilter` — FHIR search-parameter-based sub-filters, one per entry, exactly as
   * the IG defines them (e.g. `"Patient?status=active"`). Passed through verbatim. */
  readonly typeFilter?: readonly string[];
  /** `_outputFormat` — defaults to `application/fhir+ndjson`, the format every
   * Bulk Data server is required to support. */
  readonly outputFormat?: string;
}

export interface BulkExportJob {
  /** The `Content-Location` the server returned from the kick-off request — poll this
   * with `SmartClient.checkBulkExportStatus()`. */
  readonly statusUrl: string;
}

export interface BulkExportOutputFile {
  readonly type: string;
  readonly url: string;
  readonly count?: number;
}

export type BulkExportStatus =
  | {
      readonly status: "in-progress";
      /** From the `X-Progress` response header, if the server sent one — its content is
       * server-defined free text, not a percentage the spec standardizes. */
      readonly progress?: string;
      /** From the `Retry-After` response header, if the server sent one, in seconds. */
      readonly retryAfterSeconds?: number;
    }
  | {
      readonly status: "completed";
      readonly transactionTime: string;
      readonly output: readonly BulkExportOutputFile[];
      readonly deleted?: readonly BulkExportOutputFile[];
      readonly error?: readonly BulkExportOutputFile[];
      /** When `true`, each `output[].url` must be fetched with the same bearer token
       * used for the export itself — when `false`, the files are unauthenticated
       * (e.g. served from short-lived signed URLs). */
      readonly requiresAccessToken: boolean;
    }
  | { readonly status: "error"; readonly issues: unknown };

function buildExportPath(options: StartBulkExportOptions): string {
  if (options.level === "system") return "$export";
  if (options.level === "patient") return "Patient/$export";
  if (!options.groupId) {
    throw new GatewayError(
      '"groupId" is required for a group-level bulk export',
      "BULK_EXPORT_GROUP_ID_REQUIRED",
    );
  }
  return `Group/${options.groupId}/$export`;
}

/** Builds the kick-off request URL, including every `_type`/`_since`/`_typeFilter`
 * query parameter the IG defines. Pure — no network call, easy to unit test directly. */
export function buildExportUrl(baseUrl: URL, options: StartBulkExportOptions): URL {
  const url = new URL(buildExportPath(options), `${baseUrl.toString()}/`);
  url.searchParams.set("_outputFormat", options.outputFormat ?? "application/fhir+ndjson");
  if (options.types && options.types.length > 0) {
    url.searchParams.set("_type", options.types.join(","));
  }
  if (options.since) url.searchParams.set("_since", options.since);
  if (options.typeFilter && options.typeFilter.length > 0) {
    url.searchParams.set("_typeFilter", options.typeFilter.join(","));
  }
  return url;
}

interface RawCompletedExportBody {
  transactionTime: string;
  output: BulkExportOutputFile[];
  requiresAccessToken: boolean;
  deleted?: BulkExportOutputFile[];
  error?: BulkExportOutputFile[];
}

function isRawCompletedExportBody(value: unknown): value is RawCompletedExportBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).transactionTime === "string" &&
    Array.isArray((value as Record<string, unknown>).output) &&
    typeof (value as Record<string, unknown>).requiresAccessToken === "boolean"
  );
}

/** Parses a completed (HTTP 200) status-check response body into a `BulkExportStatus`.
 * Throws `GatewayError`/`BULK_EXPORT_RESPONSE_INVALID` if the body is missing the
 * fields the IG requires. Pure — no network call. */
export function parseCompletedExportBody(body: unknown, origin: string): BulkExportStatus {
  if (!isRawCompletedExportBody(body)) {
    throw new GatewayError(
      "Bulk export status response is missing required fields",
      "BULK_EXPORT_RESPONSE_INVALID",
      origin,
    );
  }
  return {
    status: "completed",
    transactionTime: body.transactionTime,
    output: body.output,
    requiresAccessToken: body.requiresAccessToken,
    ...(body.deleted !== undefined ? { deleted: body.deleted } : {}),
    ...(body.error !== undefined ? { error: body.error } : {}),
  };
}

/** Splits NDJSON text into parsed JSON values, one per non-blank line — the format
 * every `output[].url` file from a completed bulk export is served in. */
export function parseNdjson(text: string): readonly unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}
