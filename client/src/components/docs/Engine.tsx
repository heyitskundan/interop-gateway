import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function Engine() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        @interop-gateway/engine
      </h1>
      <p style={muted}>
        Deployable pipeline runtime — wires a protocol source, a format translator, and a
        destination together from one YAML config, so running a translation pipeline doesn't require
        writing any code.
      </p>
      <p style={muted}>
        One source, one format — but destinations can be a single unconditional{" "}
        <code>destination</code> <em>or</em> a list of <code>routes</code>, each matched against the
        translated resource in order, first match wins, fanning out to every destination in that
        rule.
      </p>

      <h2 id="install" className="mt-8">
        Install
      </h2>
      <CodeBlock lang="bash" code="npm install @interop-gateway/engine" />

      <h2 id="config" className="mt-8">
        Config
      </h2>
      <CodeBlock
        lang="yaml"
        code={`name: adt-to-ehr
format: hl7v2 # or "cda"
source:
  protocol: mllp # "mllp" | "http" | "file"
  port: 2575
destination:
  protocol: http # "http" | "file"
  url: https://ehr.example.org/ingest
validateProfile: true # optional, default false — runs US Core validation before delivery`}
      />
      <table className="table mb-4">
        <thead>
          <tr>
            <th>source.protocol</th>
            <th>Fields</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>mllp</code>
            </td>
            <td className="text-muted">
              <code>port</code>, <code>host</code> (optional, default <code>0.0.0.0</code>)
            </td>
          </tr>
          <tr>
            <td>
              <code>http</code>
            </td>
            <td className="text-muted">
              <code>port</code>, <code>path</code> (optional — omit to accept any path)
            </td>
          </tr>
          <tr>
            <td>
              <code>file</code>
            </td>
            <td className="text-muted">
              <code>directory</code>, <code>pollIntervalMs</code> (optional, default 1000)
            </td>
          </tr>
        </tbody>
      </table>

      <h2 id="routing" className="mt-8">
        Routing
      </h2>
      <p style={muted}>
        Exactly one of <code>destination</code>/<code>routes</code> must be set —{" "}
        <code>destination</code> for the simple unconditional case above, <code>routes</code> for
        conditional branching and fan-out:
      </p>
      <CodeBlock
        lang="yaml"
        code={`name: adt-router
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
        directory: /data/other`}
      />
      <p style={muted}>
        Rules are tried in order; the first rule whose <code>when</code> matches delivers to{" "}
        <em>every</em> destination in its <code>to</code> list (fan-out — not just the first one).
        Omit <code>when</code> for a catch-all/default rule. A message matching no rule is a
        delivery failure — same failure channel as anything else.
      </p>

      <h2 id="persistence" className="mt-8">
        Persistence: audit log and dead-letter queue
      </h2>
      <p style={muted}>
        <code>runPipeline()</code> persists the audit log to disk by default, next to the config
        file. The dead-letter queue stays opt-in to <em>have</em> — set{" "}
        <code>persistence.deadLetter</code> if you want one — but the CLI's <code>run</code> command
        always creates one by default, since a deployed pipeline should retain its dead letters.
      </p>
      <p style={muted}>
        <strong>Persisting without encryption is refused by default.</strong> Set{" "}
        <code>persistence.&lt;audit|deadLetter&gt;.encryptPassphrase</code>, or the whole thing
        throws <code>GatewayError</code>/<code>UNENCRYPTED_PERSISTENCE_REFUSED</code> before writing
        anything:
      </p>
      <CodeBlock
        lang="yaml"
        code={`persistence:
  audit:
    directory: /var/interop-gateway/audit # optional — defaults to <name>-audit/
    encryptPassphrase: "..." # required unless allowUnencryptedPersistence: true is set
  deadLetter:
    directory: /var/interop-gateway/dead-letters
    encryptPassphrase: "..." # same rule — this store holds raw message content, unredacted`}
      />
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `await runPipeline(config, { ephemeral: true }); // in-memory audit log, no persistence
await runPipeline(config, { allowUnencryptedPersistence: true }); // persists as plaintext, explicitly`,
          },
          {
            lang: "ts",
            code: `await runPipeline(config, { ephemeral: true }); // in-memory audit log, no persistence
await runPipeline(config, { allowUnencryptedPersistence: true }); // persists as plaintext, explicitly`,
          },
        ]}
      />
      <p style={muted}>Replay everything currently in the dead-letter queue:</p>
      <CodeBlock lang="bash" code="npx @interop-gateway/engine replay pipeline.yaml" />
      <p style={muted}>
        Re-runs each queued message through the same translate/validate/route/deliver handler a live
        pipeline uses. A message that succeeds is removed from the queue; one that fails again stays
        queued with <code>attempts</code> incremented, so a message stuck failing repeatedly stays
        visible for triage instead of retrying silently forever.
      </p>

      <h2 id="cli" className="mt-8">
        CLI
      </h2>
      <CodeBlock
        lang="bash"
        code={`npx @interop-gateway/engine validate pipeline.yaml   # check the config, don't run it
npx @interop-gateway/engine run pipeline.yaml        # run it (SIGINT/SIGTERM stop it cleanly)
npx @interop-gateway/engine replay pipeline.yaml      # re-run everything in the dead-letter queue

# Without persistence.*.encryptPassphrase in the config, run/replay refuse to persist
# unencrypted unless you pass this explicitly:
npx @interop-gateway/engine run pipeline.yaml --allow-unencrypted`}
      />

      <h2 id="programmatic" className="mt-8">
        Use programmatically
      </h2>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { loadPipelineConfig, runPipeline } from "@interop-gateway/engine";
import { HashChainedAuditLog } from "@interop-gateway/core";
import { readFileSync } from "node:fs";

const config = loadPipelineConfig(readFileSync("pipeline.yaml", "utf8"));
const auditSink = new HashChainedAuditLog(); // pass your own in-memory sink explicitly
const running = await runPipeline(config, { auditSink });

// running.address — bound host/port for a network source, undefined for a file source
// running.stop() — stop the listener/watcher cleanly`,
          },
          {
            lang: "ts",
            code: `import { loadPipelineConfig, runPipeline } from "@interop-gateway/engine";
import { HashChainedAuditLog } from "@interop-gateway/core";
import { readFileSync } from "node:fs";

const config = loadPipelineConfig(readFileSync("pipeline.yaml", "utf8"));
const auditSink = new HashChainedAuditLog(); // pass your own in-memory sink explicitly
const running = await runPipeline(config, { auditSink });

// running.address — bound host/port for a network source, undefined for a file source
// running.stop() — stop the listener/watcher cleanly`,
          },
        ]}
      />
    </div>
  );
}
