# @interop-gateway/protocol-file

File-drop ingest and delivery for [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
the transport underneath most SFTP-based HL7v2/CDA feeds, where an SFTP daemon (or any
other process) lands files on local disk and something else has to notice and consume
them.

## Scope — local filesystem, not an SFTP client

This package watches and writes local directories. It does not speak the SFTP protocol
itself — pair it with an SFTP server (or client) that lands files in the directory
`FileIngestWatcher` watches, or writes to the directory `writeFileMessage` targets. That
covers the common real-world topology (an SFTP daemon owns the network side, this
package owns what happens to the file once it's on disk) without this package needing
its own SSH/SFTP dependency.

## Install

```bash
npm install @interop-gateway/protocol-file
```

## Receive (ingest watcher)

```ts
import { FileIngestWatcher, type FileHandlerResult } from "@interop-gateway/protocol-file";

const watcher = new FileIngestWatcher({
  directory: "/data/inbound",
  handler: async (content, fileName): Promise<FileHandlerResult> => {
    // validate/route/translate `content` here
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

## Send (file delivery)

```ts
import { writeFileMessage } from "@interop-gateway/protocol-file";

const path = await writeFileMessage(payload, { directory: "/data/outbound" });
```

Writes to a temp file in the target directory first, then renames it into place, so
anything polling that directory (including another `FileIngestWatcher`) never sees a
partially-written file. Creates the target directory if it doesn't exist. Pass
`fileName` to control the name; otherwise one is generated
(`<timestamp>-<uuid>.txt`).

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
