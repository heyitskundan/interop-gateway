# @interop-gateway/protocol-http

HTTP ingest and delivery for [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
receive HL7v2/FHIR/CDA payloads pushed to you over HTTP, and deliver them to a remote
endpoint with TLS enforced and automatic retry.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source until then.

```bash
npm install @interop-gateway/protocol-http
```

## Receive

```ts
import { HttpIngestServer, type HttpHandlerResult } from "@interop-gateway/protocol-http";

const server = new HttpIngestServer({
  path: "/ingest",
  handler: async (body, headers): Promise<HttpHandlerResult> => {
    // validate/route/translate `body` here
    return { status: 200, body: "OK" };
  },
});
await server.listen(8080);
```

`HttpIngestServer` runs a plain HTTP listener — put a TLS-terminating reverse proxy or
load balancer in front of it in production, the same deployment pattern most HL7v2/FHIR
webhook receivers already use. A handler that throws produces a 500 with the error
message as the body — this package doesn't sanitize that message before returning it,
so a handler must not throw PHI-bearing text (see `SECURITY.md`'s no-PHI-in-errors
rule) — and requests over `maxBodyBytes` (default 10MB) also produce a 500. A `path`
filter is optional — omit it to accept POSTs on any path. Non-POST requests get a 405.

## Send

```ts
import { sendHttpMessage } from "@interop-gateway/protocol-http";

const result = await sendHttpMessage(payload, { url: "https://receiver.example.org/ingest" });
if (!result.ok) {
  console.error(`Receiver rejected the payload: ${result.status} ${result.body}`);
}
```

`sendHttpMessage` requires an `https://` URL — it throws `GatewayError` immediately for
any other scheme, before attempting a request. It retries (default 3 attempts) on a
network error or timeout, never on a non-2xx HTTP response — that's a real response from
the receiver, returned in `HttpSendResult` instead of thrown. After every attempt fails,
it throws `GatewayError` with the underlying error as `cause`.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
