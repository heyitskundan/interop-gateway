import { enforceTls, GatewayError, ScopeSet, type GrantedScope } from "@interop-gateway/core";
import { TokenManager } from "./token-manager.js";
import type { AuthConfig } from "./token.js";
import type { SecretsProvider } from "@interop-gateway/core";
import { classifyWriteFailureStatus, type WriteOperation, type WriteResult } from "./write.js";
import {
  buildExportUrl,
  parseCompletedExportBody,
  type BulkExportJob,
  type BulkExportOutputFile,
  type BulkExportStatus,
  type StartBulkExportOptions,
} from "./bulk-export.js";

export interface SmartClientOptions {
  readonly baseUrl: string;
  readonly auth: AuthConfig;
  readonly scopes: readonly GrantedScope[];
  readonly secrets?: SecretsProvider;
}

/** Vendor-agnostic SMART on FHIR connector: obtains an access token via the configured
 * auth method and performs scope-checked read/search/write calls against a FHIR R4
 * server. */
export class SmartClient {
  private readonly baseUrl: URL;
  private readonly scopeSet: ScopeSet;
  private readonly tokens: TokenManager;

  constructor(options: SmartClientOptions) {
    this.baseUrl = enforceTls(options.baseUrl);
    this.scopeSet = new ScopeSet(options.scopes);
    this.tokens = new TokenManager(options.auth, options.secrets);
  }

  async read(resourceType: string, id: string): Promise<unknown> {
    this.scopeSet.assert("read", resourceType);
    const url = new URL(`${resourceType}/${id}`, `${this.baseUrl.toString()}/`);
    return this.request(url);
  }

  async search(resourceType: string, params: Record<string, string> = {}): Promise<unknown> {
    this.scopeSet.assert("search", resourceType);
    const url = new URL(`${resourceType}`, `${this.baseUrl.toString()}/`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return this.request(url);
  }

  /** Creates a resource. Returns a `WriteResult`; does not throw on a server-side
   * rejection (409/412/422/etc.). */
  async create(resourceType: string, resource: unknown): Promise<WriteResult> {
    this.scopeSet.assert("write", resourceType);
    const url = new URL(`${resourceType}`, `${this.baseUrl.toString()}/`);
    return this.writeRequest("POST", url, `${resourceType}`, resource);
  }

  async update(resourceType: string, id: string, resource: unknown): Promise<WriteResult> {
    this.scopeSet.assert("write", resourceType);
    const url = new URL(`${resourceType}/${id}`, `${this.baseUrl.toString()}/`);
    return this.writeRequest("PUT", url, `${resourceType}/${id}`, resource);
  }

  async delete(resourceType: string, id: string): Promise<WriteResult> {
    this.scopeSet.assert("write", resourceType);
    const url = new URL(`${resourceType}/${id}`, `${this.baseUrl.toString()}/`);
    return this.writeRequest("DELETE", url, `${resourceType}/${id}`);
  }

  /** Runs each operation in `operations` in order and collects one `WriteResult` per
   * operation. An individual operation's failure (a rejected scope check, a network
   * error, a server-side rejection) becomes that operation's `WriteFailure` entry — it
   * does not stop the remaining operations from running. */
  async writeBatch(operations: readonly WriteOperation[]): Promise<WriteResult[]> {
    const results: WriteResult[] = [];
    for (const operation of operations) {
      results.push(await this.runOperation(operation));
    }
    return results;
  }

  private async runOperation(operation: WriteOperation): Promise<WriteResult> {
    try {
      if (operation.kind === "create") {
        return await this.create(operation.resourceType, operation.resource);
      }
      if (operation.kind === "update") {
        return await this.update(operation.resourceType, operation.id, operation.resource);
      }
      return await this.delete(operation.resourceType, operation.id);
    } catch (error) {
      const path =
        operation.kind === "create"
          ? operation.resourceType
          : `${operation.resourceType}/${operation.id}`;
      return {
        ok: false,
        status: 0,
        code: "REQUEST_FAILED",
        path,
        issues: error instanceof GatewayError ? error.message : undefined,
      };
    }
  }

  private async writeRequest(
    method: "POST" | "PUT" | "DELETE",
    url: URL,
    path: string,
    resource?: unknown,
  ): Promise<WriteResult> {
    const token = await this.tokens.getToken();
    const response = await fetch(enforceTls(url), {
      method,
      headers: {
        Authorization: `${token.tokenType} ${token.accessToken}`,
        Accept: "application/fhir+json",
        ...(resource !== undefined ? { "Content-Type": "application/fhir+json" } : {}),
      },
      body: resource !== undefined ? JSON.stringify(resource) : null,
    });

    if (response.ok) {
      const responseBody: unknown =
        response.status === 204 ? undefined : await response.json().catch(() => undefined);
      return { ok: true, status: response.status, resource: responseBody };
    }

    const issues: unknown = await response.json().catch(() => undefined);
    return {
      ok: false,
      status: response.status,
      code: classifyWriteFailureStatus(response.status),
      path,
      issues,
    };
  }

  /** Kicks off a Bulk Data `$export` (system, `Patient/$export`, or
   * `Group/[id]/$export`) and returns the job to poll with `checkBulkExportStatus()`.
   * Throws if the server doesn't respond `202 Accepted` with a `Content-Location`
   * header, per the IG's kick-off contract — anything else means the server rejected
   * the request outright, not that the export is running. */
  async startBulkExport(options: StartBulkExportOptions): Promise<BulkExportJob> {
    const token = await this.tokens.getToken();
    const url = buildExportUrl(this.baseUrl, options);
    const response = await fetch(enforceTls(url), {
      headers: {
        Authorization: `${token.tokenType} ${token.accessToken}`,
        Accept: "application/fhir+json",
        Prefer: "respond-async",
      },
    });

    if (response.status !== 202) {
      throw new GatewayError(
        `Bulk export kick-off failed: HTTP ${response.status}`,
        "BULK_EXPORT_KICKOFF_FAILED",
        url.pathname,
      );
    }
    const statusUrl = response.headers.get("content-location");
    if (!statusUrl) {
      throw new GatewayError(
        "Bulk export kick-off response is missing a Content-Location header",
        "BULK_EXPORT_KICKOFF_FAILED",
        url.pathname,
      );
    }
    return { statusUrl };
  }

  /** Checks a bulk export job once — `"in-progress"` (202, optionally with progress/
   * retry-after info), `"completed"` (200, with the output file list), or `"error"`
   * (any other status). Does not loop; call `pollBulkExportUntilComplete()` for that. */
  async checkBulkExportStatus(job: BulkExportJob): Promise<BulkExportStatus> {
    const token = await this.tokens.getToken();
    const url = enforceTls(job.statusUrl);
    const response = await fetch(url, {
      headers: {
        Authorization: `${token.tokenType} ${token.accessToken}`,
        Accept: "application/fhir+json",
      },
    });

    if (response.status === 202) {
      const progress = response.headers.get("x-progress");
      const retryAfter = response.headers.get("retry-after");
      return {
        status: "in-progress",
        ...(progress !== null ? { progress } : {}),
        ...(retryAfter !== null && !Number.isNaN(Number(retryAfter))
          ? { retryAfterSeconds: Number(retryAfter) }
          : {}),
      };
    }

    if (response.status === 200) {
      const body: unknown = await response.json();
      return parseCompletedExportBody(body, url.origin);
    }

    const issues: unknown = await response.json().catch(() => undefined);
    return { status: "error", issues };
  }

  /** Polls `checkBulkExportStatus()` until it reports `"completed"`, waiting the
   * server's `Retry-After` between attempts when given, `intervalMs` (default 1000)
   * otherwise. Throws `GatewayError`/`BULK_EXPORT_FAILED` on an `"error"` status, or
   * `BULK_EXPORT_TIMEOUT` after `timeoutMs` (default 5 minutes) with no completion. */
  async pollBulkExportUntilComplete(
    job: BulkExportJob,
    options: { readonly intervalMs?: number; readonly timeoutMs?: number } = {},
  ): Promise<Extract<BulkExportStatus, { status: "completed" }>> {
    const timeoutMs = options.timeoutMs ?? 5 * 60_000;
    const start = Date.now();
    for (;;) {
      const result = await this.checkBulkExportStatus(job);
      if (result.status === "completed") return result;
      if (result.status === "error") {
        throw new GatewayError(
          "Bulk export failed",
          "BULK_EXPORT_FAILED",
          undefined,
          result.issues,
        );
      }
      if (Date.now() - start > timeoutMs) {
        throw new GatewayError("Bulk export polling timed out", "BULK_EXPORT_TIMEOUT");
      }
      const waitMs =
        result.retryAfterSeconds !== undefined
          ? result.retryAfterSeconds * 1000
          : (options.intervalMs ?? 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /** Downloads one `output[].url` file's raw NDJSON text — parse it with this
   * package's `parseNdjson()`. Sends the bearer token only when `requiresAccessToken`
   * is `true` (from the completed job's status), matching the IG's rule that some
   * servers serve output files unauthenticated (e.g. short-lived signed URLs). */
  async downloadBulkExportFile(
    file: BulkExportOutputFile,
    options: { readonly requiresAccessToken?: boolean } = {},
  ): Promise<string> {
    const url = enforceTls(file.url);
    const headers: Record<string, string> = {};
    if (options.requiresAccessToken) {
      const token = await this.tokens.getToken();
      headers.Authorization = `${token.tokenType} ${token.accessToken}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new GatewayError(
        `Bulk export file download failed: HTTP ${response.status}`,
        "BULK_EXPORT_DOWNLOAD_FAILED",
        url.pathname,
      );
    }
    return response.text();
  }

  /** Cancels a bulk export job the server hasn't finished yet — `DELETE` on the status
   * URL, per the IG. Throws on a non-2xx response. */
  async cancelBulkExport(job: BulkExportJob): Promise<void> {
    const token = await this.tokens.getToken();
    const url = enforceTls(job.statusUrl);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
    });
    if (!response.ok) {
      throw new GatewayError(
        `Bulk export cancel failed: HTTP ${response.status}`,
        "BULK_EXPORT_CANCEL_FAILED",
        url.pathname,
      );
    }
  }

  private async request(url: URL): Promise<unknown> {
    const token = await this.tokens.getToken();
    const response = await fetch(enforceTls(url), {
      headers: {
        Authorization: `${token.tokenType} ${token.accessToken}`,
        Accept: "application/fhir+json",
      },
    });

    if (!response.ok) {
      throw new GatewayError(
        `FHIR server returned HTTP ${response.status}`,
        "FHIR_REQUEST_FAILED",
        url.pathname,
      );
    }

    return response.json();
  }
}
