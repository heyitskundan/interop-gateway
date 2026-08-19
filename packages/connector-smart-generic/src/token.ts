import { randomUUID } from "node:crypto";
import { SignJWT, importJWK, type JWK } from "jose";
import { enforceTls, GatewayError } from "@interop-gateway/core";

export interface AccessToken {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresAt: number;
  readonly scope: string;
}

/** `client_secret_post` — the client authenticates with a shared secret. */
export interface SymmetricAuth {
  readonly method: "client_secret_post";
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scope: string;
}

/** `private_key_jwt` (SMART backend-services) — the client authenticates with a signed
 * JWT assertion instead of a shared secret. */
export interface AsymmetricAuth {
  readonly method: "private_key_jwt";
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly privateKey: JWK;
  readonly kid: string;
  readonly alg: string;
  readonly scope: string;
}

export type AuthConfig = SymmetricAuth | AsymmetricAuth;

const JWT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const JWT_LIFETIME_SECONDS = 300;

async function buildClientAssertion(auth: AsymmetricAuth): Promise<string> {
  const key = await importJWK(auth.privateKey, auth.alg);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: auth.alg, kid: auth.kid, typ: "JWT" })
    .setIssuer(auth.clientId)
    .setSubject(auth.clientId)
    .setAudience(auth.tokenUrl)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_LIFETIME_SECONDS)
    .sign(key);
}

function buildRequestBody(auth: AuthConfig, assertion?: string): URLSearchParams {
  if (auth.method === "client_secret_post") {
    return new URLSearchParams({
      grant_type: "client_credentials",
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      scope: auth.scope,
    });
  }
  return new URLSearchParams({
    grant_type: "client_credentials",
    scope: auth.scope,
    client_assertion_type: JWT_ASSERTION_TYPE,
    client_assertion: assertion ?? "",
  });
}

interface TokenResponseBody {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

function isTokenResponseBody(value: unknown): value is TokenResponseBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).access_token === "string" &&
    typeof (value as Record<string, unknown>).token_type === "string" &&
    typeof (value as Record<string, unknown>).expires_in === "number" &&
    typeof (value as Record<string, unknown>).scope === "string"
  );
}

/** Runs the OAuth2 client-credentials token exchange for `auth` and returns the
 * resulting access token. */
export async function fetchAccessToken(auth: AuthConfig): Promise<AccessToken> {
  const url = enforceTls(auth.tokenUrl);

  const assertion =
    auth.method === "private_key_jwt" ? await buildClientAssertion(auth) : undefined;
  const body = buildRequestBody(auth, assertion);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new GatewayError(
      `Token endpoint returned HTTP ${response.status}`,
      "TOKEN_REQUEST_FAILED",
      url.origin,
    );
  }

  const parsed: unknown = await response.json();
  if (!isTokenResponseBody(parsed)) {
    throw new GatewayError(
      "Token endpoint response is missing required fields",
      "TOKEN_RESPONSE_INVALID",
      url.origin,
    );
  }

  return {
    accessToken: parsed.access_token,
    tokenType: parsed.token_type,
    expiresAt: Date.now() + parsed.expires_in * 1000,
    scope: parsed.scope,
  };
}
