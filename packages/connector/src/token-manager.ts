import type { SecretsProvider } from "@interop-gateway/core";
import { GatewayError } from "@interop-gateway/core";
import {
  fetchAccessToken,
  refreshAccessToken,
  type AccessToken,
  type AuthConfig,
} from "./token.js";

const REFRESH_MARGIN_MS = 30_000;

/** Returns a cached access token if it has more than 30 seconds left before expiry,
 * otherwise refreshes it. Persists the token through `secrets` (if given).
 *
 * How "refresh" happens depends on `auth.method`: `client_secret_post`/
 * `private_key_jwt` (backend-services) re-run the client-credentials exchange, since
 * there's a standing credential to re-authenticate with. `authorization_code` has no
 * such credential — it refreshes via `grant_type=refresh_token` using whatever
 * `refreshToken` came back with the most recent token, throwing `REFRESH_TOKEN_UNAVAILABLE`
 * if none is available (the authorization server didn't grant `offline_access`, or the
 * caller never obtained one) rather than silently failing later at the FHIR request. */
export class TokenManager {
  private cached: AccessToken | undefined;

  constructor(
    private readonly auth: AuthConfig,
    private readonly secrets?: SecretsProvider,
    private readonly cacheKey: string = "interop-gateway:connector:access-token",
  ) {}

  async getToken(): Promise<AccessToken> {
    if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return this.cached;
    }

    if (!this.cached) {
      const stored = this.secrets ? await this.readCachedToken() : undefined;
      const seed =
        stored ?? (this.auth.method === "authorization_code" ? this.auth.initialToken : undefined);
      if (seed && seed.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
        this.cached = seed;
        return seed;
      }
      this.cached = seed;
    }

    const token = await this.obtainToken();
    this.cached = token;
    if (this.secrets) {
      await this.secrets.setSecret({ name: this.cacheKey }, JSON.stringify(token));
    }
    return token;
  }

  private async obtainToken(): Promise<AccessToken> {
    if (this.auth.method === "authorization_code") {
      const refreshToken = this.cached?.refreshToken ?? this.auth.initialToken.refreshToken;
      if (!refreshToken) {
        throw new GatewayError(
          "Access token expired and no refresh token is available — the user must go " +
            "through the authorization redirect again (buildAuthorizationUrl/exchangeAuthorizationCode)",
          "REFRESH_TOKEN_UNAVAILABLE",
        );
      }
      return refreshAccessToken({
        tokenUrl: this.auth.tokenUrl,
        refreshToken,
        clientId: this.auth.clientId,
        ...(this.auth.clientSecret !== undefined ? { clientSecret: this.auth.clientSecret } : {}),
      });
    }
    return fetchAccessToken(this.auth);
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
