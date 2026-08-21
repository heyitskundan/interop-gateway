import type { SecretsProvider } from "@interop-gateway/core";
import { fetchAccessToken, type AccessToken, type AuthConfig } from "./token.js";

const REFRESH_MARGIN_MS = 30_000;

/** Returns a cached access token if it has more than 30 seconds left before expiry,
 * otherwise runs the token exchange again. Persists the token through `secrets` (if
 * given). */
export class TokenManager {
  private cached: AccessToken | undefined;

  constructor(
    private readonly auth: AuthConfig,
    private readonly secrets?: SecretsProvider,
    private readonly cacheKey: string = "interop-gateway:connector-smart-generic:access-token",
  ) {}

  async getToken(): Promise<AccessToken> {
    if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return this.cached;
    }

    if (!this.cached && this.secrets) {
      const stored = await this.readCachedToken();
      if (stored && stored.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
        this.cached = stored;
        return stored;
      }
    }

    const token = await fetchAccessToken(this.auth);
    this.cached = token;
    if (this.secrets) {
      await this.secrets.setSecret({ name: this.cacheKey }, JSON.stringify(token));
    }
    return token;
  }

  private async readCachedToken(): Promise<AccessToken | undefined> {
    try {
      const raw = await this.secrets!.getSecret({ name: this.cacheKey });
      return JSON.parse(raw) as AccessToken;
    } catch {
      return undefined;
    }
  }
}
