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
        Every package is independently installable and independently testable — nothing
        here requires the whole monorepo. Grouped by what they actually do, not
        alphabetically.
      </p>

      <h2 id="core" className="mt-8">
        Core
      </h2>
      <Pkg
        id="core-pkg"
        name="core"
        summary="Pipeline engine — the interfaces everything else implements."
        detail="Stage/Envelope interfaces, TLS enforcement guard, EncryptedStore (AES-256-GCM), ScopeSet enforcement, HashChainedAuditLog with PHI-shaped-value rejection, the SecretsProvider interface, structural HL7v2/CDA validation, and the InteropGateway translate()/validate() API."
      />

      <h2 id="formats" className="mt-8">
        Format plugins
      </h2>
      <Pkg
        id="format-hl7v2"
        name="format-hl7v2"
        summary="HL7v2 ↔ FHIR, wrapping the published hl7-fhir-translator package."
        detail="Full coverage of the official HL7 v2-to-FHIR IG: all 14 IG-listed message types, segment/datatype/vocabulary depth. Adds no translation logic of its own — registers the translator as a FormatPlugin and normalizes its errors."
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
        detail="OAuth2 client-credentials or backend-services (private_key_jwt) auth, token caching with automatic refresh, scope-checked read/search/write/writeBatch against a FHIR R4 server. Tested against the live SMART Health IT reference sandbox."
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
        summary="Required-element structural checks for 15 US Core profiles."
        detail="Covers the resource types the two translators can actually produce. Documented explicitly as this package's own reading of each profile's Must Support elements — not independently re-verified against fetched StructureDefinition JSON — with terminology binding entirely out of scope."
      />

      <h2 id="engine" className="mt-8">
        Runtime
      </h2>
      <Pkg
        id="engine-pkg"
        name="engine"
        summary="YAML-configured pipeline runtime, with a CLI and a Dockerfile."
        detail="Wires a protocol source (mllp/http/file), a format (hl7v2/cda), and a destination (http/file) together from one config file. A translation or delivery failure for one message reports through the source's own failure channel — an AE ACK, a 422, the error/ subdirectory — rather than stopping the pipeline."
      />

      <h2 id="mcp-server" className="mt-8">
        AI tool surface
      </h2>
      <Pkg
        id="mcp-server-pkg"
        name="mcp-server"
        summary="MCP tool surface (translate, validate) over InteropGateway."
        detail="Lets an MCP client — an AI assistant, an agent framework — translate HL7v2/C-CDA into FHIR or check structural well-formedness, without that client needing to know anything about either format."
      />

      <h2 id="architecture" className="mt-8">
        How they fit together
      </h2>
      <p style={muted}>
        Three independent axes, combined however a given deployment needs:
      </p>
      <ul className="list-disc space-y-2 pl-5 text-sm" style={muted}>
        <li>
          <strong>What format is the data in</strong> — <code>format-hl7v2</code> or{" "}
          <code>format-cda</code>, both registered on the same <code>InteropGateway</code>{" "}
          instance if a deployment needs both.
        </li>
        <li>
          <strong>How does it arrive/leave</strong> — <code>protocol-mllp</code>,{" "}
          <code>protocol-http</code>, or <code>protocol-file</code> for message-based
          transport; <code>connector-smart-generic</code> for a live FHIR API instead.
        </li>
        <li>
          <strong>Where do secrets live</strong> — <code>secrets-keychain</code> for local
          dev, <code>secrets-vault</code>/<code>secrets-aws</code> for a real deployment.
        </li>
      </ul>
      <p style={muted}>
        <code>engine</code> is the piece that actually wires the first two axes together
        from a config file for a deployable service; <code>mcp-server</code> exposes just
        the translation piece to an AI client; a custom Node script can compose any of
        these directly, same as the demo above does.
      </p>
    </div>
  );
}
