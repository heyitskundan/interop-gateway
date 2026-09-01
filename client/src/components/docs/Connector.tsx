import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Connector() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        @interop-gateway/connector
      </h1>
      <p style={muted}>
        Vendor-agnostic SMART on FHIR connector: backend-services token exchange (
        <code>client_secret_post</code>, <code>private_key_jwt</code>) and the interactive,
        patient/clinician-facing <code>authorization_code</code> flow with PKCE, scope-checked{" "}
        <code>read()</code>/<code>search()</code>/<code>write()</code> against a FHIR R4 server, and
        Bulk Data <code>$export</code>.
      </p>
      <p style={muted}>
        This package never ships with, brokers, or manages a shared credential. Whoever deploys it
        registers their own app with each vendor (Epic, Cerner, etc.) and supplies their own client
        ID, secret/key, and token endpoint — a two-tier vendor/hospital access process this package
        does not change.
      </p>

      <h2 id="install" className="mt-8">
        Install
      </h2>
      <CodeBlock lang="bash" code="npm install @interop-gateway/core @interop-gateway/connector" />

      <h2 id="backend-services" className="mt-8">
        Backend-services (private_key_jwt) — the preferred flow
      </h2>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { SmartClient } from "@interop-gateway/connector";

const client = new SmartClient({
  baseUrl: "https://your-sandbox-or-hospital-fhir-server.example.org/fhir",
  auth: {
    method: "private_key_jwt",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    privateKey: yourPrivateKeyJwk, // never a raw PEM string — see assertNotRawCredential
    kid: "your-key-id",
    alg: "RS384",
    scope: "system/Patient.read",
  },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
});

const patient = await client.read("Patient", "123");`,
          },
          {
            lang: "ts",
            code: `import { SmartClient, type SmartClientOptions } from "@interop-gateway/connector";

const options: SmartClientOptions = {
  baseUrl: "https://your-sandbox-or-hospital-fhir-server.example.org/fhir",
  auth: {
    method: "private_key_jwt",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    privateKey: yourPrivateKeyJwk,
    kid: "your-key-id",
    alg: "RS384",
    scope: "system/Patient.read",
  },
  scopes: [{ resourceType: "Patient", operations: ["read", "search"] }],
};
const client = new SmartClient(options);`,
          },
        ]}
      />

      <h2 id="authorize" className="mt-8">
        authorization_code (SMART App Launch, patient/clinician-facing)
      </h2>
      <p style={muted}>
        The interactive flow, for a patient portal or a clinician-facing embedded app. This package
        cannot perform the redirect and login/consent screen itself — that's a browser step,
        inherent to the flow — but provides every other piece: building the authorization URL with
        PKCE, exchanging the returned <code>code</code>, and refreshing afterward.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  SmartClient,
} from "@interop-gateway/connector";

// 1. Start the launch — redirect the user's browser to \`url\`. Persist \`codeVerifier\`
//    (session storage, a signed cookie) — you need it back in step 2.
const { url, codeVerifier, state } = await buildAuthorizationUrl({
  authorizeUrl: "https://your-sandbox.example.org/auth/authorize",
  clientId: "your-client-id",
  redirectUri: "https://your-app.example.org/callback",
  scope: "launch/patient patient/Patient.read offline_access",
  aud: "https://your-sandbox.example.org/fhir", // the FHIR server this launch is for
  launch: launchParamFromEhrRedirect, // omit for a standalone (non-EHR) launch
});
// redirect(url); persistSession({ codeVerifier, state });

// 2. The authorization server redirects back with ?code=...&state=...
//    Verify state matches what you persisted, then exchange the code:
const token = await exchangeAuthorizationCode({
  tokenUrl: "https://your-sandbox.example.org/auth/token",
  code: codeFromRedirectQueryParam,
  redirectUri: "https://your-app.example.org/callback",
  clientId: "your-client-id",
  codeVerifier, // from step 1's session
});
// token.patient / token.encounter carry the launch context, when the server sends it.

// 3. Use it — SmartClient refreshes via token.refreshToken automatically once it's
//    within 30 seconds of expiry, no further redirect needed until the refresh token
//    itself is revoked/expires.
const client = new SmartClient({
  baseUrl: "https://your-sandbox.example.org/fhir",
  auth: {
    method: "authorization_code",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    redirectUri: "https://your-app.example.org/callback",
    initialToken: token,
  },
  scopes: [{ resourceType: "Patient", operations: ["read"] }],
});
const patient = await client.read("Patient", token.patient);`,
          },
          {
            lang: "ts",
            code: `import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  SmartClient,
} from "@interop-gateway/connector";

// 1. Start the launch — redirect the user's browser to \`url\`. Persist \`codeVerifier\`
//    (session storage, a signed cookie) — you need it back in step 2.
const { url, codeVerifier, state } = await buildAuthorizationUrl({
  authorizeUrl: "https://your-sandbox.example.org/auth/authorize",
  clientId: "your-client-id",
  redirectUri: "https://your-app.example.org/callback",
  scope: "launch/patient patient/Patient.read offline_access",
  aud: "https://your-sandbox.example.org/fhir", // the FHIR server this launch is for
  launch: launchParamFromEhrRedirect, // omit for a standalone (non-EHR) launch
});
// redirect(url); persistSession({ codeVerifier, state });

// 2. The authorization server redirects back with ?code=...&state=...
//    Verify state matches what you persisted, then exchange the code:
const token = await exchangeAuthorizationCode({
  tokenUrl: "https://your-sandbox.example.org/auth/token",
  code: codeFromRedirectQueryParam,
  redirectUri: "https://your-app.example.org/callback",
  clientId: "your-client-id",
  codeVerifier, // from step 1's session
});
// token.patient / token.encounter carry the launch context, when the server sends it.

// 3. Use it — SmartClient refreshes via token.refreshToken automatically once it's
//    within 30 seconds of expiry, no further redirect needed until the refresh token
//    itself is revoked/expires.
const client = new SmartClient({
  baseUrl: "https://your-sandbox.example.org/fhir",
  auth: {
    method: "authorization_code",
    tokenUrl: "https://your-sandbox.example.org/auth/token",
    clientId: "your-client-id",
    redirectUri: "https://your-app.example.org/callback",
    initialToken: token,
  },
  scopes: [{ resourceType: "Patient", operations: ["read"] }],
});
const patient = await client.read("Patient", token.patient!);`,
          },
        ]}
      />
      <p style={muted}>
        If the refresh token is ever rejected (revoked, expired) or was never granted (
        <code>offline_access</code> wasn't in <code>scope</code>), the next call throws{" "}
        <code>GatewayError</code>/<code>REFRESH_TOKEN_UNAVAILABLE</code> instead of silently failing
        at the FHIR request — the user needs to go through step 1 again.
      </p>

      <h2 id="pkce" className="mt-8">
        PKCE internals
      </h2>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { generatePkce, refreshAccessToken } from "@interop-gateway/connector";

// generatePkce() alone, if you want the raw verifier/challenge instead of a full request:
const { codeVerifier, codeChallenge } = await generatePkce(); // S256 — SHA-256 digest, base64url

// Refreshing later without repeating the redirect (needs offline_access in scope):
const refreshed = await refreshAccessToken({ tokenUrl, refreshToken: token.refreshToken, clientId });`,
          },
          {
            lang: "ts",
            code: `import { generatePkce, refreshAccessToken } from "@interop-gateway/connector";

// generatePkce() alone, if you want the raw verifier/challenge instead of a full request:
const { codeVerifier, codeChallenge } = await generatePkce(); // S256 — SHA-256 digest, base64url

// Refreshing later without repeating the redirect (needs offline_access in scope):
const refreshed = await refreshAccessToken({ tokenUrl, refreshToken: token.refreshToken!, clientId });`,
          },
        ]}
      />

      <h2 id="bulk-export" className="mt-8">
        Bulk Data ($export)
      </h2>
      <p style={muted}>
        System-, patient-, and group-level export per the{" "}
        <a href="https://hl7.org/fhir/uv/bulkdata/" target="_blank" rel="noreferrer">
          FHIR Bulk Data Access IG
        </a>{" "}
        — kick-off, async status polling, and NDJSON output download, all on{" "}
        <code>SmartClient</code>.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { parseNdjson } from "@interop-gateway/connector";

const job = await client.startBulkExport({
  level: "group",
  groupId: "cohort-1",
  types: ["Patient", "Observation"],
  since: "2026-01-01T00:00:00Z",
});

// Poll until done — waits the server's Retry-After between attempts when given.
const completed = await client.pollBulkExportUntilComplete(job);
// Or poll it yourself: client.checkBulkExportStatus(job) returns
// { status: "in-progress", progress?, retryAfterSeconds? } | { status: "completed", output, ... } | { status: "error", issues }

for (const file of completed.output) {
  const ndjsonText = await client.downloadBulkExportFile(file, {
    requiresAccessToken: completed.requiresAccessToken,
  });
  const resources = parseNdjson(ndjsonText); // one parsed resource per line
}

await client.cancelBulkExport(job); // DELETE the job if you need to stop it early`,
          },
          {
            lang: "ts",
            code: `import { parseNdjson } from "@interop-gateway/connector";

const job = await client.startBulkExport({
  level: "group",
  groupId: "cohort-1",
  types: ["Patient", "Observation"],
  since: "2026-01-01T00:00:00Z",
});

// Poll until done — waits the server's Retry-After between attempts when given.
const completed = await client.pollBulkExportUntilComplete(job);
// Or poll it yourself: client.checkBulkExportStatus(job) returns
// { status: "in-progress", progress?, retryAfterSeconds? } | { status: "completed", output, ... } | { status: "error", issues }

for (const file of completed.output) {
  const ndjsonText = await client.downloadBulkExportFile(file, {
    requiresAccessToken: completed.requiresAccessToken,
  });
  const resources = parseNdjson(ndjsonText); // one parsed resource per line
}

await client.cancelBulkExport(job); // DELETE the job if you need to stop it early`,
          },
        ]}
      />
      <p style={muted}>
        <code>buildExportUrl()</code>/<code>parseCompletedExportBody()</code>/
        <code>parseNdjson()</code> are exported standalone too, for building the request/parsing the
        response yourself outside <code>SmartClient</code>.
      </p>

      <h2 id="write" className="mt-8">
        Write support
      </h2>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `const created = await client.create("Patient", patientResource);
// { ok: true, status: 201, resource: {...} }

const conflict = await client.update("Patient", "123", patientResource);
// { ok: false, status: 409, code: "CONFLICT", path: "Patient/123", issues: {...} }

const results = await client.writeBatch([
  { kind: "create", resourceType: "Patient", resource: patientResource },
  { kind: "update", resourceType: "Observation", id: "obs-1", resource: observationResource },
  { kind: "delete", resourceType: "Encounter", id: "enc-1" },
]);
// One WriteResult per operation, in order. One operation failing does not stop the rest.`,
          },
          {
            lang: "ts",
            code: `const created = await client.create("Patient", patientResource);
// { ok: true, status: 201, resource: {...} }

const conflict = await client.update("Patient", "123", patientResource);
// { ok: false, status: 409, code: "CONFLICT", path: "Patient/123", issues: {...} }

const results = await client.writeBatch([
  { kind: "create", resourceType: "Patient", resource: patientResource },
  { kind: "update", resourceType: "Observation", id: "obs-1", resource: observationResource },
  { kind: "delete", resourceType: "Encounter", id: "enc-1" },
]);
// One WriteResult per operation, in order. One operation failing does not stop the rest.`,
          },
        ]}
      />
      <p style={muted}>
        <code>create</code>/<code>update</code>/<code>delete</code> never throw for a server-side
        rejection — they return a <code>WriteResult</code> so a caller can inspect the outcome
        without a try/catch per call. They do throw <code>ScopeError</code> if the resource
        type/operation isn't in <code>scopes</code>, before any network call.
      </p>

      <h2 id="scope" className="mt-8">
        Scope enforcement
      </h2>
      <p style={muted}>
        <code>SmartClient</code> checks the <code>scopes</code> you configured before making any
        request — a request outside those scopes throws <code>ScopeError</code> immediately, before
        a network call is attempted, rather than relying on the server to reject it.
      </p>

      <h2 id="internals" className="mt-8">
        Internals — build a custom connector variant
      </h2>
      <p style={muted}>
        <code>SmartClient</code> is built from pieces also exported directly, for a custom connector
        variant instead of <code>SmartClient</code> as-is.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { fetchAccessToken, TokenManager, classifyWriteFailureStatus } from "@interop-gateway/connector";

// Run the backend-services token exchange standalone, without a SmartClient instance
const token = await fetchAccessToken(authConfig); // { accessToken, expiresAt, ... }

// The caching/auto-refresh wrapper SmartClient uses internally — re-runs client-credentials
// for backend-services auth, grant_type=refresh_token for authorization_code
const tokenManager = new TokenManager(authConfig, secretsProvider);
const cached = await tokenManager.getToken(); // reuses if >30s from expiry, else refreshes

// The same HTTP-status classification create/update/delete use internally
classifyWriteFailureStatus(409); // "CONFLICT"
classifyWriteFailureStatus(422); // "VALIDATION_FAILED"
classifyWriteFailureStatus(500); // "REQUEST_FAILED"`,
          },
          {
            lang: "ts",
            code: `import { fetchAccessToken, TokenManager, classifyWriteFailureStatus } from "@interop-gateway/connector";

// Run the backend-services token exchange standalone, without a SmartClient instance
const token = await fetchAccessToken(authConfig); // { accessToken, expiresAt, ... }

// The caching/auto-refresh wrapper SmartClient uses internally — re-runs client-credentials
// for backend-services auth, grant_type=refresh_token for authorization_code
const tokenManager = new TokenManager(authConfig, secretsProvider);
const cached = await tokenManager.getToken(); // reuses if >30s from expiry, else refreshes

// The same HTTP-status classification create/update/delete use internally
classifyWriteFailureStatus(409); // "CONFLICT"
classifyWriteFailureStatus(422); // "VALIDATION_FAILED"
classifyWriteFailureStatus(500); // "REQUEST_FAILED"`,
          },
        ]}
      />
    </div>
  );
}
