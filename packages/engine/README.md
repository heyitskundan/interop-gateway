# @interop-gateway/engine

Deployable pipeline runtime for [interop-gateway](https://github.com/heyitskundan/interop-gateway) —
wires a protocol source, a format translator, and a destination together from one YAML
config, so running a translation pipeline doesn't require writing any code.

One source, one format — but destinations can be a single unconditional `destination`
_or_ a list of `routes`, each matched against the translated resource in order, first
match wins, fanning out to every destination in that rule (see "Routing" below).

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

`validateProfile: true` runs `@interop-gateway/core` on every translated
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

## Routing

Exactly one of `destination`/`routes` must be set — `destination` for the simple
unconditional case above, `routes` for conditional branching and fan-out:

```yaml
name: adt-router
format: hl7v2
source:
  protocol: mllp
  port: 2575
routes:
  - when:
      entry.0.resource.resourceType: Patient
    to:
      - protocol: file
        directory: /data/patients
      - protocol: http
        url: https://audit.example.org/ingest
  - to:
      - protocol: file
        directory: /data/other
```

Rules are tried in order; the first rule whose `when` matches delivers to _every_
destination in its `to` list (fan-out — not just the first one). Omit `when` for a
catch-all/default rule. `when` matches fields on the translated FHIR resource by
dot-path equality — since `translate()` always produces a `Bundle`, `resourceType` at
the top level is always `"Bundle"`; match into `entry.<index>.resource.<field>` for the
actual clinical resource instead (`entry.0.resource.resourceType` above). A message
matching no rule is a delivery failure — same failure channel as anything else (`AE`
ACK, 422, `error/` subdirectory) — so include a catch-all rule last if you want one
rather than letting unmatched messages fail.

## Persistence: audit log and dead-letter queue

`runPipeline()` — called directly, from `run`, or via `mcp`'s `run_pipeline`
tool — persists the audit log to disk by default, next to the config file (or
`process.cwd()` for a direct library call with no config path). The dead-letter queue
stays opt-in to _have_ — set `persistence.deadLetter` if you want one — but `run`
always creates one by default, since a deployed pipeline should retain its dead
letters:

- **Audit log** (`<name>-audit/`) — every `translate`/`validateProfile`/`route`/
  `deliver` event, same hash-chained tamper-evident format `HashChainedAuditLog`
  already wrote, now surviving a restart via `FileAuditLog`.
- **Dead-letter queue** (`<name>-dead-letters/`) — a message that fails translation,
  US Core validation, routing, or delivery is retained here (raw message, which stage
  failed, the error, an attempt count) in addition to being reported through the usual
  failure channel. Nothing is silently lost.

**Persisting without encryption is refused by default.** Set
`persistence.<audit|deadLetter>.encryptPassphrase`, or the whole thing throws
`GatewayError`/`UNENCRYPTED_PERSISTENCE_REFUSED` before writing anything:

```yaml
persistence:
  audit:
    directory: /var/interop-gateway/audit # optional — defaults to <name>-audit/
    encryptPassphrase: "..." # required unless allowUnencryptedPersistence: true is set
  deadLetter:
    directory: /var/interop-gateway/dead-letters
    encryptPassphrase: "..." # same rule — this store holds raw message content, unredacted
```

`encryptPassphrase` derives an AES-256-GCM key via PBKDF2 (the pipeline `name` as
salt — the same passphrase always derives the same key for a given pipeline across
restarts). To explicitly accept plaintext-on-disk instead — a conscious choice, not
what happens if you forget the passphrase — pass `allowUnencryptedPersistence: true` in
`RunPipelineOptions`, or run the CLI with `--allow-unencrypted`. For tests or quick
demos where an in-memory-only audit log (the old default) is genuinely what you want,
pass `ephemeral: true` instead — that skips persistence entirely, no dead-letter queue
either:

```ts
await runPipeline(config, { ephemeral: true }); // in-memory audit log, no persistence
await runPipeline(config, { allowUnencryptedPersistence: true }); // persists as plaintext, explicitly
```

Replay everything currently in the dead-letter queue:

```bash
npx @interop-gateway/engine replay pipeline.yaml
```

Re-runs each queued message through the same translate/validate/route/deliver handler
a live pipeline uses. A message that succeeds is removed from the queue; one that fails
again stays queued with `attempts` incremented and `error`/`when` updated, so a message
stuck failing repeatedly stays visible for triage instead of retrying silently forever.
Fix the underlying problem (a destination that was down, a route rule config error)
before replaying, or edit `pipeline.yaml` between `run` and `replay` the way the CLI
test suite does — `replay` reads the config fresh each time.

## CLI

```bash
npx @interop-gateway/engine validate pipeline.yaml   # check the config, don't run it
npx @interop-gateway/engine run pipeline.yaml        # run it (SIGINT/SIGTERM stop it cleanly)
npx @interop-gateway/engine replay pipeline.yaml      # re-run everything in the dead-letter queue

# Without persistence.*.encryptPassphrase in the config, run/replay refuse to persist
# unencrypted unless you pass this explicitly:
npx @interop-gateway/engine run pipeline.yaml --allow-unencrypted
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
const auditSink = new HashChainedAuditLog(); // pass your own in-memory sink explicitly...
const running = await runPipeline(config, { auditSink });
// ...or omit auditSink and pass { ephemeral: true } for the same in-memory-only
// behavior without constructing one yourself — see "Persistence" above for the default.
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

Internally, this is hand-rolled sequential logic (source → translate →
`validateProfile`? → route → deliver): `runPipeline()`'s handler calls
`createEnvelope`/`AuditSink.append` directly at each stage, rather than composing a
generic chain — `core` shipped a `Pipeline`/`Stage` abstraction for this at one point,
but neither this package nor `mcp` ever adopted it (this package's needs — an
optional validation stage, fan-out delivery, per-stage audit/dead-letter hooks — don't
map cleanly onto a linear envelope-in/envelope-out model), so it was removed rather than
kept as unused code.

## Docker

```bash
docker build -t interop-gateway-engine -f packages/engine/Dockerfile .
docker run -v $(pwd)/pipeline.yaml:/config/pipeline.yaml -p 2575:2575 interop-gateway-engine
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
