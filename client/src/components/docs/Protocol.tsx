import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Protocol() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        @interop-gateway/protocol
      </h1>
      <p style={muted}>
        Three transport adapters, each with a receive side and a send side. None of them know
        what format is travelling over them.
      </p>

      <h2 id="install" className="mt-8">
        Install
      </h2>
      <CodeBlock lang="bash" code="npm install @interop-gateway/protocol" />

      <h2 id="mllp" className="mt-8">
        MLLP
      </h2>
      <p style={muted}>
        MLLP (Minimal Lower Layer Protocol) is the TCP transport most hospital HL7v2 feeds
        actually run over: each message is wrapped between a start byte (<code>0x0B</code>) and
        an end sequence (<code>0x1C 0x0D</code>), and every send waits for the receiver to
        acknowledge it with an ACK (<code>MSA-1 = AA</code>) or reject it with a NACK (
        <code>AE</code>/<code>AR</code>).
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { MllpServer } from "@interop-gateway/protocol";

const server = new MllpServer({
  handler: async (message) => ({ code: "AA" }),
});
await server.listen(2575);`,
          },
          {
            lang: "ts",
            code: `import { MllpServer, type MllpHandlerResult } from "@interop-gateway/protocol";

const server = new MllpServer({
  handler: async (message: string): Promise<MllpHandlerResult> => ({ code: "AA" }),
});
await server.listen(2575);`,
          },
        ]}
      />
      <p style={muted}>
        A handler that throws produces an <code>AE</code> ACK automatically — the connection
        stays open and the next message on it is still processed. Both <code>MllpServer</code>{" "}
        and <code>sendMllpMessage</code> are plain, unencrypted TCP (<code>node:net</code>) —
        MLLP itself has no built-in transport encryption, unlike the HTTP adapter below. This
        matches how MLLP is used in practice: within a private network, or wrapped in a VPN/TLS
        tunnel (MLLPS) you provide.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { sendMllpMessage } from "@interop-gateway/protocol";

const result = await sendMllpMessage(hl7v2Message, { host: "lab.example.org", port: 2575 });
if (!result.acknowledged) {
  console.error(\`NACK (\${result.code}): \${result.rawAck}\`);
}`,
          },
          {
            lang: "ts",
            code: `import { sendMllpMessage } from "@interop-gateway/protocol";

const result = await sendMllpMessage(hl7v2Message, { host: "lab.example.org", port: 2575 });
if (!result.acknowledged) {
  console.error(\`NACK (\${result.code}): \${result.rawAck}\`);
}`,
          },
        ]}
      />
      <p style={muted}>
        <code>sendMllpMessage</code> retries (default 3 attempts) on connection failure or ACK
        timeout — never on a received NACK, which is a real response from the receiver, not a
        delivery failure. After every attempt fails, it throws <code>GatewayError</code> with
        the underlying connection error as <code>cause</code>.
      </p>

      <h2 id="http" className="mt-8">
        HTTP
      </h2>
      <p style={muted}>
        Receive HL7v2/FHIR/CDA payloads pushed to you over HTTP, and deliver them to a remote
        endpoint with TLS enforced and automatic retry.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { HttpIngestServer } from "@interop-gateway/protocol";

const server = new HttpIngestServer({
  path: "/ingest",
  handler: async (body, headers) => {
    return { status: 200, body: "OK" };
  },
});
await server.listen(8080);`,
          },
          {
            lang: "ts",
            code: `import { HttpIngestServer, type HttpHandlerResult } from "@interop-gateway/protocol";

const server = new HttpIngestServer({
  path: "/ingest",
  handler: async (body, headers): Promise<HttpHandlerResult> => {
    return { status: 200, body: "OK" };
  },
});
await server.listen(8080);`,
          },
        ]}
      />
      <p style={muted}>
        <code>HttpIngestServer</code> runs a plain HTTP listener — put a TLS-terminating reverse
        proxy or load balancer in front of it in production. A handler that throws produces a
        500 with the error message as the body — this package doesn't sanitize that message
        before returning it, so a handler must not throw PHI-bearing text — and requests over{" "}
        <code>maxBodyBytes</code> (default 10MB) also produce a 500. A <code>path</code> filter
        is optional — omit it to accept POSTs on any path. Non-POST requests get a 405.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { sendHttpMessage } from "@interop-gateway/protocol";

const result = await sendHttpMessage(payload, { url: "https://receiver.example.org/ingest" });
if (!result.ok) {
  console.error(\`Receiver rejected the payload: \${result.status} \${result.body}\`);
}`,
          },
          {
            lang: "ts",
            code: `import { sendHttpMessage } from "@interop-gateway/protocol";

const result = await sendHttpMessage(payload, { url: "https://receiver.example.org/ingest" });
if (!result.ok) {
  console.error(\`Receiver rejected the payload: \${result.status} \${result.body}\`);
}`,
          },
        ]}
      />
      <p style={muted}>
        <code>sendHttpMessage</code> requires an <code>https://</code> URL — it throws{" "}
        <code>GatewayError</code> immediately for any other scheme, before attempting a request.
        It retries (default 3 attempts) on a network error or timeout, never on a non-2xx HTTP
        response — that's a real response from the receiver, returned in{" "}
        <code>HttpSendResult</code> instead of thrown.
      </p>

      <h2 id="file" className="mt-8">
        File
      </h2>
      <p style={muted}>
        The transport underneath most SFTP-based feeds — an SFTP daemon lands files on disk,
        this package watches/writes that disk location. It does not speak the SFTP protocol
        itself — pair it with an SFTP server (or client) that lands files in the directory{" "}
        <code>FileIngestWatcher</code> watches, or writes to the directory{" "}
        <code>writeFileMessage</code> targets.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { FileIngestWatcher } from "@interop-gateway/protocol";

const watcher = new FileIngestWatcher({
  directory: "/data/inbound",
  handler: async (content, fileName) => {
    return { status: "processed" };
  },
});
await watcher.start();`,
          },
          {
            lang: "ts",
            code: `import { FileIngestWatcher, type FileHandlerResult } from "@interop-gateway/protocol";

const watcher = new FileIngestWatcher({
  directory: "/data/inbound",
  handler: async (content, fileName): Promise<FileHandlerResult> => {
    return { status: "processed" };
  },
});
await watcher.start();`,
          },
        ]}
      />
      <p style={muted}>
        Polls <code>directory</code> (default every 1000ms) for files it hasn't already picked
        up. On <code>{'{status: "processed"}'}</code> the file moves to{" "}
        <code>&lt;directory&gt;/processed/</code>; on <code>{'{status: "error"}'}</code> — or if
        the handler throws — it moves to <code>&lt;directory&gt;/error/</code> alongside a{" "}
        <code>&lt;name&gt;.error.txt</code> sidecar with the failure message.
      </p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { writeFileMessage } from "@interop-gateway/protocol";

const path = await writeFileMessage(payload, { directory: "/data/outbound" });`,
          },
          {
            lang: "ts",
            code: `import { writeFileMessage } from "@interop-gateway/protocol";

const path = await writeFileMessage(payload, { directory: "/data/outbound" });`,
          },
        ]}
      />
      <p style={muted}>
        Writes to a temp file in the target directory first, then renames it into place, so
        anything polling that directory (including another <code>FileIngestWatcher</code>)
        never sees a partially-written file. Pass <code>fileName</code> to control the name;
        otherwise one is generated (<code>&lt;timestamp&gt;-&lt;uuid&gt;.txt</code>).
      </p>
    </div>
  );
}
