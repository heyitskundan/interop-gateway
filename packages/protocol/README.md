# @interop-gateway/protocol

Three transport adapters for [interop-gateway](https://github.com/heyitskundan/interop-gateway),
each with a receive side and a send side. None of them know what format is travelling
over them.

## Install

```bash
npm install @interop-gateway/protocol
```

## MLLP

MLLP (Minimal Lower Layer Protocol) is the TCP transport most hospital HL7v2 feeds
actually run over: each message is wrapped between a start byte (`0x0B`) and an end
sequence (`0x1C 0x0D`), and every send waits for the receiver to acknowledge it with an
ACK (`MSA-1 = AA`) or reject it with a NACK (`AE`/`AR`).

```ts
import { MllpServer, type MllpHandlerResult } from "@interop-gateway/protocol";

const server = new MllpServer({
  handler: async (message: string): Promise<MllpHandlerResult> => ({ code: "AA" }),
});
await server.listen(2575);
```

A handler that throws produces an `AE` ACK automatically — the connection stays open
and the next message on it is still processed.

Both `MllpServer` and `sendMllpMessage` are plain, unencrypted TCP (`node:net`) — MLLP
itself has no built-in transport encryption, unlike the HTTP adapter below. This matches
how MLLP is used in practice: within a private network, or wrapped in a VPN/TLS tunnel
(MLLPS) you provide — don't expose an `MllpServer` directly to an untrusted network, and
don't `sendMllpMessage` to a host outside a trusted/tunneled network.

```ts
import { sendMllpMessage } from "@interop-gateway/protocol";

const result = await sendMllpMessage(hl7v2Message, { host: "lab.example.org", port: 2575 });
if (!result.acknowledged) {
  console.error(`NACK (${result.code}): ${result.rawAck}`);
}
```

`sendMllpMessage` retries (default 3 attempts) on connection failure or ACK timeout —
never on a received NACK, which is a real response from the receiver, not a delivery
failure. After every attempt fails, it throws `GatewayError` with the underlying
connection error as `cause`.

## HTTP

Receive HL7v2/FHIR/CDA payloads pushed to you over HTTP, and deliver them to a remote
endpoint with TLS enforced and automatic retry.

```ts
import { HttpIngestServer, type HttpHandlerResult } from "@interop-gateway/protocol";

const server = new HttpIngestServer({
  path: "/ingest",
  handler: async (body, headers): Promise<HttpHandlerResult> => {
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

```ts
import { sendHttpMessage } from "@interop-gateway/protocol";

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

## File

The transport underneath most SFTP-based feeds — an SFTP daemon lands files on disk,
this package watches/writes that disk location. It does not speak the SFTP protocol
itself — pair it with an SFTP server (or client) that lands files in the directory
`FileIngestWatcher` watches, or writes to the directory `writeFileMessage` targets.

```ts
import { FileIngestWatcher, type FileHandlerResult } from "@interop-gateway/protocol";

const watcher = new FileIngestWatcher({
  directory: "/data/inbound",
  handler: async (content, fileName): Promise<FileHandlerResult> => {
    return { status: "processed" };
  },
});
await watcher.start();
```

Polls `directory` (default every 1000ms) for files it hasn't already picked up. On
`{status: "processed"}` the file moves to `<directory>/processed/`; on
`{status: "error"}` — or if the handler throws — it moves to `<directory>/error/`
alongside a `<name>.error.txt` sidecar with the failure message. Never re-reads its own
`processed`/`error` subdirectories, and never double-processes a file that's still
mid-flight when a poll tick lands. Call `watcher.stop()` to stop polling.

```ts
import { writeFileMessage } from "@interop-gateway/protocol";

const path = await writeFileMessage(payload, { directory: "/data/outbound" });
```

Writes to a temp file in the target directory first, then renames it into place, so
anything polling that directory (including another `FileIngestWatcher`) never sees a
partially-written file. Creates the target directory if it doesn't exist. Pass
`fileName` to control the name; otherwise one is generated (`<timestamp>-<uuid>.txt`).

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
