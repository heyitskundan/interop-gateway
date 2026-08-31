# @interop-gateway/engine

Deployable pipeline runtime for [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
wires a protocol source, a format translator, and a destination together from one YAML
config, so running a translation pipeline doesn't require writing any code.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source, or the CLI section below for running the compiled CLI directly.

```bash
npm install @interop-gateway/engine
```

## Config

```yaml
name: adt-to-ehr
format: hl7v2 # or "cda"
source:
  protocol: mllp # "mllp" | "http" | "file"
  port: 2575
destination:
  protocol: http # "http" | "file"
  url: https://ehr.example.org/ingest
validateProfile: true # optional, default false — see below
```

`validateProfile: true` runs `@interop-gateway/validate-us-core` on every translated
Bundle before delivery. A resource that fails a required US Core element check is
routed to the same failure channel a translation failure already uses (an `AE` ACK, a
422, the `error/` subdirectory) and delivery never runs.

Source options:

| `source.protocol` | Fields                                                 |
| ----------------- | ------------------------------------------------------ |
| `mllp`            | `port`, `host` (optional, default `0.0.0.0`)           |
| `http`            | `port`, `path` (optional — omit to accept any path)    |
| `file`            | `directory`, `pollIntervalMs` (optional, default 1000) |

Destination options:

| `destination.protocol` | Fields                     |
| ---------------------- | -------------------------- |
| `http`                 | `url` (must be `https://`) |
| `file`                 | `directory`                |

## CLI

```bash
npx @interop-gateway/engine validate pipeline.yaml   # check the config, don't run it
npx @interop-gateway/engine run pipeline.yaml        # run it (SIGINT/SIGTERM stop it cleanly)
```

Not yet published to npm — the `npx` commands above will 404 until it is. Until then,
build it from the repo and run the compiled CLI directly:

```bash
npm run build -w packages/engine
node packages/engine/dist/cli.js validate pipeline.yaml
node packages/engine/dist/cli.js run pipeline.yaml
```

## Use programmatically

```ts
import { loadPipelineConfig, runPipeline } from "@interop-gateway/engine";
import { HashChainedAuditLog } from "@interop-gateway/core";
import { readFileSync } from "node:fs";

const config = loadPipelineConfig(readFileSync("pipeline.yaml", "utf8"));
const auditSink = new HashChainedAuditLog(); // optional — omit for a private default
const running = await runPipeline(config, { auditSink });
console.log(running.address); // { port, address } for mllp/http sources, undefined for file
// ...
await running.stop();

console.log(auditSink.list()); // every translate/validateProfile/deliver event, per message
```

A translation or delivery failure for one message never stops the pipeline — it's
reported back through the source's own failure channel instead: an `AE` ACK for MLLP, a
422 response for HTTP, the `error/` subdirectory (with an error sidecar) for file. Every
message gets a correlation ID the moment it's ingested; that ID is prefixed onto the
failure message (`[id] <message>`) and onto every audit entry written for that message,
so a failure surfaced to the sender's own system can be matched back to its audit trail.

## Docker

```bash
docker build -t interop-gateway-engine -f packages/engine/Dockerfile .
docker run -v $(pwd)/pipeline.yaml:/config/pipeline.yaml -p 2575:2575 interop-gateway-engine
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
