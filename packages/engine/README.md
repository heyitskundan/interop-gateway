# @interop-gateway/engine

Deployable pipeline runtime for [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
wires a protocol source, a format translator, and a destination together from one YAML
config, so running a translation pipeline doesn't require writing any code.

## Install

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
```

Source options:

| `source.protocol` | Fields |
| --- | --- |
| `mllp` | `port`, `host` (optional, default `0.0.0.0`) |
| `http` | `port`, `path` (optional — omit to accept any path) |
| `file` | `directory`, `pollIntervalMs` (optional, default 1000) |

Destination options:

| `destination.protocol` | Fields |
| --- | --- |
| `http` | `url` (must be `https://`) |
| `file` | `directory` |

## CLI

```bash
npx @interop-gateway/engine validate pipeline.yaml   # check the config, don't run it
npx @interop-gateway/engine run pipeline.yaml        # run it (SIGINT/SIGTERM stop it cleanly)
```

## Use programmatically

```ts
import { loadPipelineConfig, runPipeline } from "@interop-gateway/engine";
import { readFileSync } from "node:fs";

const config = loadPipelineConfig(readFileSync("pipeline.yaml", "utf8"));
const running = await runPipeline(config);
console.log(running.address); // { port, address } for mllp/http sources, undefined for file
// ...
await running.stop();
```

A translation or delivery failure for one message never stops the pipeline — it's
reported back through the source's own failure channel instead: an `AE` ACK for MLLP, a
422 response for HTTP, the `error/` subdirectory (with an error sidecar) for file.

## Docker

```bash
docker build -t interop-gateway-engine -f packages/engine/Dockerfile .
docker run -v $(pwd)/pipeline.yaml:/config/pipeline.yaml -p 2575:2575 interop-gateway-engine
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
