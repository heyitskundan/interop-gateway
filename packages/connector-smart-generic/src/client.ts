import { enforceTls, GatewayError, ScopeSet, type GrantedScope } from "@interop-gateway/core";
import { TokenManager } from "./token-manager.js";
import type { AuthConfig } from "./token.js";
import type { SecretsProvider } from "@interop-gateway/core";
import { classifyWriteFailureStatus, type WriteOperation, type WriteResult } from "./write.js";

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
