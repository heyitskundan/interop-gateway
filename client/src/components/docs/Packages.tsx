const muted = { opacity: 0.85 };

function Pkg({
  id,
  name,
  summary,
  detail,
}: {
  id: string;
  name: string;
  summary: string;
  detail: string;
}) {
  return (
    <div id={id} className="mb-6">
      <h3 className="mb-1">
        <code>@interop-gateway/{name}</code>
      </h3>
      <p className="mb-1 text-sm font-medium" style={{ opacity: 0.95 }}>
        {summary}
      </p>
      <p className="text-sm" style={muted}>
        {detail}
      </p>
    </div>
  );
}

export function Packages() {
  return (
    <div>
      <h1 id="overview" className="mb-2">
        The 13 packages
      </h1>
      <p style={muted}>
        Every package is independently installable and independently testable — nothing here
        requires the whole monorepo. Grouped by what they actually do, not alphabetically.
      </p>

      <h2 id="core" className="mt-8">
        Core
      </h2>
      <Pkg
        id="core-pkg"
        name="core"
        summary="Shared interfaces and primitives — every export in real use by engine and/or mcp-server."
        detail="TLS enforcement (enforceTls), EncryptedStore (AES-256-GCM), ScopeSet enforcement, the SecretsProvider interface, structural HL7v2/CDA validation, the InteropGateway translate()/validate() API (both directions), createEnvelope, and HashChainedAuditLog/FileAuditLog are all in real use by other packages today. FileStore — the on-disk Store implementation — is exported from a separate @interop-gateway/core/node entry point, so a browser bundle importing the main export never pulls in node:fs. The Pipeline/Stage composable-stage abstraction was removed — it shipped exported and tested but was never adopted by engine or mcp-server, whose actual needs (an optional validation stage, fan-out delivery, per-stage audit/dead-letter hooks) don't map cleanly onto a linear envelope-in/envelope-out chain."
      />

      <h2 id="formats" className="mt-8">
        Format plugins
      </h2>
      <Pkg
        id="format-hl7v2"
        name="format-hl7v2"
        summary="HL7v2 ↔ FHIR, wrapping the published hl7-fhir-translator package."
        detail="Wraps hl7-fhir-translator's 16 supported message types (ADT, ORU, ORM, VXU, SIU, OML, MDM, RDE — see that package's own README for the full table), segment/datatype/vocabulary depth. Adds no translation logic of its own — registers the translator as a FormatPlugin and normalizes its errors."
      />
      <Pkg
        id="format-cda"
        name="format-cda"
        summary="C-CDA ↔ FHIR, wrapping the published cda-fhir-translator package."
        detail="Full C-CDA 2.1 section coverage: 26 structured sections (each to a discrete FHIR resource type) plus 39 narrative-only sections. Same wrapping approach as format-hl7v2."
      />

      <h2 id="protocols" className="mt-8">
        Protocol adapters
      </h2>
      <Pkg
        id="protocol-mllp"
        name="protocol-mllp"
        summary="MLLP receive and send, with ACK/NACK."
        detail="The TCP transport most hospital HL7v2 feeds actually run over. Tested against real TCP connections on localhost, no mocking."
      />
      <Pkg
        id="protocol-http"
        name="protocol-http"
        summary="HTTP ingest server and TLS-enforced delivery client."
        detail="Plain-HTTP listener (expects a TLS-terminating proxy in front in production, same posture as protocol-mllp) plus a send function that requires https:// and retries on network failure, never on a non-2xx response."
      />
      <Pkg
        id="protocol-file"
        name="protocol-file"
        summary="File-drop ingest watcher and atomic file delivery."
        detail="The transport underneath most SFTP-based feeds — an SFTP daemon lands files on disk, this package watches/writes that disk location. Deliberately doesn't embed its own SFTP client."
      />

      <h2 id="connector" className="mt-8">
        Connectivity
      </h2>
      <Pkg
        id="connector-smart-generic"
        name="connector-smart-generic"
        summary="Vendor-agnostic SMART on FHIR connector."
        detail="Backend-services (client_secret_post, private_key_jwt) and interactive authorization_code+PKCE auth (the patient/clinician-facing SMART App Launch — this package builds the authorization URL and exchanges the code, the actual browser redirect/consent is inherently the caller's), token caching with automatic refresh (client-credentials re-run for backend-services, grant_type=refresh_token for authorization_code), scope-checked read/search/write/writeBatch against a FHIR R4 server, and Bulk Data $export (system/patient/group-level, async status polling, NDJSON download). Tested against the live SMART Health IT reference sandbox."
      />

      <h2 id="secrets" className="mt-8">
        Secrets providers
      </h2>
      <Pkg
        id="secrets-keychain"
        name="secrets-keychain"
        summary="SecretsProvider backed by the OS keychain — the dev default."
        detail="macOS security / Linux secret-tool, no external service required."
      />
      <Pkg
        id="secrets-vault"
        name="secrets-vault"
        summary="SecretsProvider backed by a HashiCorp Vault KV v2 engine."
        detail="Talks to Vault's HTTP API directly — zero new dependencies beyond fetch. deleteSecret soft-deletes (recoverable), not the hard-delete metadata endpoint."
      />
      <Pkg
        id="secrets-aws"
        name="secrets-aws"
        summary="SecretsProvider backed by AWS Secrets Manager."
        detail="Signs requests via aws4fetch instead of pulling in the full AWS SDK. setSecret falls back from PutSecretValue to CreateSecret on a ResourceNotFoundException."
      />

      <h2 id="validate" className="mt-8">
        Validation
      </h2>
      <Pkg
        id="validate-us-core"
        name="validate-us-core"
        summary="Required-element, max-cardinality, and fixed-code-binding checks for 15 built-in US Core profiles — pluggable for more."
        detail="Covers the resource types the two translators can actually produce, plus whatever a caller registers via registerProfile()/unregisterProfile() — the rule table isn't a closed hardcoded set. Three check layers per resource: required-element presence, max-cardinality shape (a 0..1/1..1 element must not serialize as a JSON array), and fixed-code-value binding for status/intent/lifecycleStatus fields bound with required strength to one of FHIR R4's own small enumerations. Documented explicitly as this package's own reading of each profile's Must Support elements — not independently re-verified against fetched StructureDefinition JSON — with terminology bound to an external code system (LOINC/SNOMED/RxNorm) entirely out of scope, since verifying that needs the real ValueSet contents this repo doesn't have. Wired into engine as the opt-in validateProfile: true pipeline config flag, and into mcp-server as its own validateUsCore tool; call it directly yourself for any other integration."
      />

      <h2 id="engine" className="mt-8">
        Runtime
      </h2>
      <Pkg
        id="engine-pkg"
        name="engine"
        summary="YAML-configured pipeline runtime, with a CLI and a Dockerfile."
        detail="Wires one protocol source (mllp/http/file) and a format (hl7v2/cda) to either a single unconditional destination or a routes list — rules matched in order against the translated resource, first match delivers to every destination in that rule (fan-out), no match is a delivery failure. A translation, validation, routing, or delivery failure for one message reports through the source's own failure channel — an AE ACK, a 422, the error/ subdirectory — prefixed with that message's correlation ID, and (if configured) is also retained in a dead-letter queue for later replay, rather than stopping the pipeline. Every message gets a correlationId (core's createEnvelope) and an audit entry at each stage. The CLI's run command persists both the audit log and the dead-letter queue to disk by default (<name>-audit/, <name>-dead-letters/ next to the config file, optionally encrypted via a persistence.*.encryptPassphrase); interop-gateway-engine replay pipeline.yaml re-runs everything currently queued. runPipeline() called directly still defaults to an in-memory audit log and no dead-letter queue. validateProfile: true in PipelineConfig runs US Core validation before delivery, using the same failure channel."
      />

      <h2 id="mcp-server" className="mt-8">
        AI tool surface
      </h2>
      <Pkg
        id="mcp-server-pkg"
        name="mcp-server"
        summary="MCP tool surface: translate/validate, live FHIR read/write, MLLP send, and pipeline control."
        detail="15 tools: translate/validate/validateUsCore never leave the process; connect_ehr (backend-services) and start_smart_launch/complete_smart_launch (interactive authorization_code+PKCE) open a live SmartClient connection for read_resource/write_resource/start_bulk_export/check_bulk_export_status/download_bulk_export_file/cancel_bulk_export to use, send_message sends real MLLP, and run_pipeline/stop_pipeline start and stop an engine pipeline — a different trust boundary, disclosed per-tool. Every call gets a correlationId and an audit entry, same mechanism as engine — persisted and encrypted by default (FileAuditLog, refuses unencrypted persistence without an explicit opt-out), not the in-memory default this used to have. run_pipeline passes this server's own resolved auditSink/deadLetterQueue through to every pipeline it starts, rather than each pipeline keeping a separate log. See the MCP tab for the full tool list and setup steps (Claude Code, Claude Desktop, and generic stdio clients)."
      />

      <h2 id="architecture" className="mt-8">
        How they fit together
      </h2>
      <p style={muted}>Three independent axes, combined however a given deployment needs:</p>
      <ul className="list-disc space-y-2 pl-5 text-sm" style={muted}>
        <li>
          <strong>What format is the data in</strong> — <code>format-hl7v2</code> or{" "}
          <code>format-cda</code>, both registered on the same <code>InteropGateway</code> instance
          if a deployment needs both.
        </li>
        <li>
          <strong>How does it arrive/leave</strong> — <code>protocol-mllp</code>,{" "}
          <code>protocol-http</code>, or <code>protocol-file</code> for message-based transport;{" "}
          <code>connector-smart-generic</code> for a live FHIR API instead.
        </li>
        <li>
          <strong>Where do secrets live</strong> — <code>secrets-keychain</code> for local dev,{" "}
          <code>secrets-vault</code>/<code>secrets-aws</code> for a real deployment.
        </li>
      </ul>
      <p style={muted}>
        <code>engine</code> is the piece that actually wires the first two axes together from a
        config file for a deployable service; <code>mcp-server</code> exposes all three —
        translation/validation, a live <code>SmartClient</code> connection, and MLLP send/pipeline
        control — as tool calls for an AI client (secrets providers aren't exposed directly —{" "}
        <code>connect_ehr</code>'s auth argument carries the credential itself, not a{" "}
        <code>SecretsProvider</code> reference); a custom Node script can compose any of these
        directly, same as the demo above does.
      </p>
      <p style={muted}>
        Two things that used to sit disconnected from this picture are wired in now:{" "}
        <code>validate-us-core</code> profile validation (opt-in in <code>engine</code> via{" "}
        <code>validateProfile: true</code>, a standalone tool in <code>mcp-server</code>) and
        per-message identification/audit logging (<code>core</code>'s <code>createEnvelope</code>/
        <code>HashChainedAuditLog</code>/<code>FileAuditLog</code>, called by both).
      </p>
    </div>
  );
}
