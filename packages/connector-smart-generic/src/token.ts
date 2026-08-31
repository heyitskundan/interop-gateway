import { randomUUID } from "node:crypto";
import { SignJWT, importJWK, type JWK } from "jose";
import { enforceTls, GatewayError } from "@interop-gateway/core";

export interface AccessToken {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresAt: number;
  readonly scope: string;
  /** Present when the grant included `offline_access` — lets `TokenManager` refresh
   * without the user going through the authorization redirect again. Backend-services
   * (`client_secret_post`/`private_key_jwt`) tokens never have one; there's nothing to
   * refresh with, `TokenManager` just re-runs the client-credentials exchange instead. */
  readonly refreshToken?: string;
  /** SMART launch context the authorization server may return alongside the token —
   * which `Patient`/`Encounter` the launch was scoped to. Only ever present after an
   * `authorization_code` exchange; backend-services auth has no launch context. */
  readonly patient?: string;
  readonly encounter?: string;
  readonly idToken?: string;
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

/** `authorization_code` (SMART App Launch — EHR launch or standalone launch) — the
 * interactive, patient/clinician-facing flow. This library cannot run the redirect and
 * consent screen itself (that's a browser step, by design), but provides every other
 * piece: `buildAuthorizationUrl()` to start it, `exchangeAuthorizationCode()` to finish
 * it once the authorization server redirects back with a `code`, and `TokenManager`
 * refreshing via `refreshToken` afterward — a `SmartClient` constructed with this auth
 * method and an already-obtained token behaves the same as a backend-services one
 * except its refresh path uses `grant_type=refresh_token` instead of re-running
 * client-credentials, since there's no credential to silently re-run it with. */
export interface AuthorizationCodeAuth {
  readonly method: "authorization_code";
  readonly tokenUrl: string;
  readonly clientId: string;
  /** Omit for a public client (PKCE only, the standalone/patient-facing case); set for
   * a confidential client that also has a client secret. */
  readonly clientSecret?: string;
  readonly redirectUri: string;
  /** The token this constructor call starts from — the result of
   * `exchangeAuthorizationCode()` (or a prior `refreshAccessToken()` call), not
   * something `SmartClient` can obtain on its own; there is no redirect flow inside
   * this package. */
  readonly initialToken: AccessToken;
}

export type AuthConfig = SymmetricAuth | AsymmetricAuth | AuthorizationCodeAuth;

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

function buildRequestBody(
  auth: SymmetricAuth | AsymmetricAuth,
  assertion?: string,
): URLSearchParams {
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
  refresh_token?: string;
  patient?: string;
  encounter?: string;
  id_token?: string;
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

/** Shared by every grant type below — a token endpoint's response shape doesn't depend
 * on which grant produced it. Optional SMART launch-context fields (`refresh_token`,
 * `patient`, `encounter`, `id_token`) are carried through when present, omitted when
 * not — a backend-services response never has them, an `authorization_code`/
 * `refresh_token` response usually does. */
async function parseTokenResponse(response: Response, origin: string): Promise<AccessToken> {
  if (!response.ok) {
    throw new GatewayError(
      `Token endpoint returned HTTP ${response.status}`,
      "TOKEN_REQUEST_FAILED",
      origin,
    );
  }

  const parsed: unknown = await response.json();
  if (!isTokenResponseBody(parsed)) {
    throw new GatewayError(
      "Token endpoint response is missing required fields",
      "TOKEN_RESPONSE_INVALID",
      origin,
    );
  }

  return {
    accessToken: parsed.access_token,
    tokenType: parsed.token_type,
    expiresAt: Date.now() + parsed.expires_in * 1000,
    scope: parsed.scope,
    ...(parsed.refresh_token !== undefined ? { refreshToken: parsed.refresh_token } : {}),
    ...(parsed.patient !== undefined ? { patient: parsed.patient } : {}),
    ...(parsed.encounter !== undefined ? { encounter: parsed.encounter } : {}),
    ...(parsed.id_token !== undefined ? { idToken: parsed.id_token } : {}),
  };
}

/** Runs the OAuth2 client-credentials token exchange for `auth` (backend-services —
 * `client_secret_post` or `private_key_jwt` — only; `authorization_code` has no
 * client-credentials equivalent, see `exchangeAuthorizationCode`/`refreshAccessToken`)
 * and returns the resulting access token. */
export async function fetchAccessToken(auth: SymmetricAuth | AsymmetricAuth): Promise<AccessToken> {
  const url = enforceTls(auth.tokenUrl);

  const assertion =
    auth.method === "private_key_jwt" ? await buildClientAssertion(auth) : undefined;
  const body = buildRequestBody(auth, assertion);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return parseTokenResponse(response, url.origin);
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** A cryptographically random `code_verifier` (RFC 7636 — 43-128 characters from the
 * unreserved URL-safe alphabet) and its `code_challenge` (`S256`: base64url of the
 * SHA-256 digest). Generated fresh per authorization attempt — never reused. */
export async function generatePkce(): Promise<{
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}> {
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier) as BufferSource,
  );
  return { codeVerifier, codeChallenge: base64url(new Uint8Array(digest)) };
}

export interface AuthorizationRequestOptions {
  readonly authorizeUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  /** Defaults to a fresh random value — pass your own to correlate the redirect back to
   * a specific session yourself instead of relying on the generated one. */
  readonly state?: string;
  /** The FHIR server's base URL — required by the SMART spec for an EHR launch,
   * strongly recommended otherwise, so the authorization server knows which resource
   * server the resulting token is for. */
  readonly aud?: string;
  /** The opaque launch context token from an EHR launch redirect. Omit for a standalone
   * (patient-initiated) launch — there is no EHR launch context to carry. */
  readonly launch?: string;
}

export interface AuthorizationRequest {
  /** Redirect the user's browser here to start the SMART launch. */
  readonly url: URL;
  readonly state: string;
  /** Persist this (session storage, a signed cookie — never a query param, it must not
   * round-trip through the browser) and pass it back into
   * `exchangeAuthorizationCode()` once the authorization server redirects back with a
   * `code`. Losing it means the exchange cannot succeed — there is no way to recover a
   * `code_verifier` from just its `code_challenge`, by design. */
  readonly codeVerifier: string;
}

/** Builds the authorization-endpoint URL to redirect a user's browser to, with PKCE
 * (`S256`) — the first half of the `authorization_code` flow. This library cannot
 * perform the redirect itself; a browser and a user's login/consent are inherently
 * outside what any server-side package can automate. Call
 * `exchangeAuthorizationCode()` with the `code` the authorization server redirects
 * back with (plus the `codeVerifier` this call returns) to finish the flow. */
export async function buildAuthorizationUrl(
  options: AuthorizationRequestOptions,
): Promise<AuthorizationRequest> {
  const { codeVerifier, codeChallenge } = await generatePkce();
  const state = options.state ?? randomUUID();

  const url = enforceTls(options.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", options.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (options.aud !== undefined) url.searchParams.set("aud", options.aud);
  if (options.launch !== undefined) url.searchParams.set("launch", options.launch);

  return { url, state, codeVerifier };
}

export interface ExchangeAuthorizationCodeOptions {
  readonly tokenUrl: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly clientId: string;
  /** The `codeVerifier` `buildAuthorizationUrl()` returned for this same authorization
   * attempt — proves this exchange came from the same party that started it. */
  readonly codeVerifier: string;
  /** Confidential client only — omit for a public client (PKCE alone authenticates it). */
  readonly clientSecret?: string;
}

/** Exchanges an authorization `code` (from the redirect back after
 * `buildAuthorizationUrl()`'s URL) for an access token — the second half of the
 * `authorization_code` flow. The resulting `AccessToken.refreshToken`, when present
 * (the server granted `offline_access`), is what `TokenManager` uses to refresh
 * without repeating the redirect. */
export async function exchangeAuthorizationCode(
  options: ExchangeAuthorizationCodeOptions,
): Promise<AccessToken> {
  const url = enforceTls(options.tokenUrl);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: options.clientId,
    code_verifier: options.codeVerifier,
    ...(options.clientSecret !== undefined ? { client_secret: options.clientSecret } : {}),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return parseTokenResponse(response, url.origin);
}

export interface RefreshAccessTokenOptions {
  readonly tokenUrl: string;
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret?: string;
}

/** Exchanges a `refreshToken` (from a prior `exchangeAuthorizationCode()` or
 * `refreshAccessToken()` call) for a new access token, without the user going through
 * the authorization redirect again. Throws if the authorization server rejects the
 * refresh token (revoked, expired) — same as any other token-endpoint failure; there is
 * no automatic fallback to re-launching, since that requires a browser this package
 * doesn't have. */
export async function refreshAccessToken(options: RefreshAccessTokenOptions): Promise<AccessToken> {
  const url = enforceTls(options.tokenUrl);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    ...(options.clientSecret !== undefined ? { client_secret: options.clientSecret } : {}),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return parseTokenResponse(response, url.origin);
}
