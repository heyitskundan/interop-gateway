import { enforceTls, GatewayError, ScopeSet, type GrantedScope } from "@interop-gateway/core";
import { TokenManager } from "./token-manager.js";
import type { AuthConfig } from "./token.js";
import type { SecretsProvider } from "@interop-gateway/core";

export interface SmartClientOptions {
  readonly baseUrl: string;
  readonly auth: AuthConfig;
  readonly scopes: readonly GrantedScope[];
  readonly secrets?: SecretsProvider;
}

/** Vendor-agnostic SMART on FHIR connector: obtains an access token via the configured
 * auth method and performs scope-checked `read()`/`search()` calls against a FHIR R4
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
