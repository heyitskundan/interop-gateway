import { CodeBlock } from "./CodeBlock.js";

const muted = { opacity: 0.85 };

export function GettingStarted({ goPackages }: { goPackages: () => void }) {
  return (
    <div>
      <h1 id="top" className="mb-2">
        Getting Started
      </h1>
      <p style={muted}>
        interop-gateway is a TypeScript SDK for two problems healthtech integrations always hit
        separately: connecting to a live hospital system over SMART on FHIR, and translating between
        old-style HL7v2/CDA messages and modern FHIR — <code>InteropGateway</code>'s{" "}
        <code>translate()</code>/<code>validate()</code> for the format side,{" "}
        <code>connector-smart-generic</code>'s <code>SmartClient</code> (<code>read()</code>/
        <code>write()</code>/<code>search()</code>) for live connectivity, instead of ten different
        libraries. It is open source, Apache-2.0-licensed.
      </p>

      <h2 id="overview" className="mt-8">
        Overview
      </h2>
      <p style={muted}>
        The translation half wraps two separately-published, independently-tested packages —{" "}
        <a
          href="https://github.com/heyitskundan/hl7-fhir-translator"
          target="_blank"
          rel="noreferrer"
        >
          hl7-fhir-translator
        </a>{" "}
        and{" "}
        <a
          href="https://github.com/heyitskundan/cda-fhir-translator"
          target="_blank"
          rel="noreferrer"
        >
          cda-fhir-translator
        </a>{" "}
        — as <code>FormatPlugin</code>s, rather than reimplementing either mapping engine. The
        connectivity half is a vendor-agnostic SMART on FHIR client plus protocol adapters (MLLP,
        HTTP, file-drop) that don't care which format is travelling over them. See{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goPackages();
          }}
        >
          Packages
        </a>{" "}
        for what each of the 13 packages actually does.
      </p>

      <h2 id="installation" className="mt-8">
        Installation
      </h2>
      <p style={muted}>
        Install only the packages you need — this isn't an all-or-nothing framework.
      </p>
      <CodeBlock
        lang="bash"
        code="npm install @interop-gateway/core @interop-gateway/format-hl7v2"
      />

      <h2 id="quickstart" className="mt-8">
        Quick start
      </h2>
      <p style={muted}>Translating an HL7v2 message into a FHIR Bundle:</p>
      <CodeBlock
        variants={[
          {
            lang: "js",
            code: `import { InteropGateway } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const bundle = gateway.translate(hl7v2Message, { from: "hl7v2", to: "fhir" });`,
          },
          {
            lang: "ts",
            code: `import { InteropGateway, type TranslateOptions } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const options: TranslateOptions = { from: "hl7v2", to: "fhir" };
const bundle = gateway.translate(hl7v2Message, options);`,
          },
        ]}
      />
      <p style={muted}>
        Swap in <code>formatCda</code> from <code>@interop-gateway/format-cda</code> and{" "}
        <code>from: "cda"</code> for C-CDA XML — same call shape, same gateway instance can hold
        both.
      </p>

      <h2 id="phi" className="mt-8">
        PHI and compliance
      </h2>
      <div className="blueprint flex gap-3 p-4">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flex: "none", marginTop: 2 }}
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="tag tag-accent">PHI</span>
            <strong style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>
              This package supports a compliant system — it isn&apos;t one by itself
            </strong>
          </div>
          <p className="mb-2 text-sm" style={muted}>
            HIPAA/SOC 2 compliance is a property of an organization's overall practices — risk
            assessments, signed BAAs with every vendor/hospital it connects to, employee policies,
            and (for SOC 2) a third-party audit over time. Using this library does not by itself
            make your deployment compliant.
          </p>
          <p className="text-sm" style={muted}>
            What the library does concretely: enforces TLS everywhere; writes a tamper-evident audit
            entry for every <code>engine</code>/<code>mcp-server</code> call, persisted to disk by
            default and refusing to persist unencrypted unless you explicitly opt out (
            <code>ephemeral: true</code> for tests, <code>allowUnencryptedPersistence: true</code>{" "}
            to consciously accept plaintext-on-disk) — the same rule applies to a dead-letter queue
            once you configure one; checks SMART scopes before every read/write; never logs a PHI
            value (structural shape and FHIR/HL7 paths only); and never stores a plaintext secret —
            see{" "}
            <a
              href="https://github.com/heyitskundan/interop-gateway/blob/main/SECURITY.md"
              target="_blank"
              rel="noreferrer"
            >
              <code>SECURITY.md</code>
            </a>{" "}
            for the full model.
          </p>
        </div>
      </div>

      <h2 id="requirements" className="mt-8">
        Requirements
      </h2>
      <table className="table">
        <thead>
          <tr>
            <th>Requirement</th>
            <th>Version</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Node.js</td>
            <td>18 or later</td>
            <td className="text-muted">Translation packages also run in a browser bundle</td>
          </tr>
          <tr>
            <td>TypeScript</td>
            <td>Optional</td>
            <td className="text-muted">Full type defs ship for both ESM and CJS builds</td>
          </tr>
          <tr>
            <td>Vault / AWS credentials</td>
            <td>Only if used</td>
            <td className="text-muted">
              <code>secrets-vault</code>/<code>secrets-aws</code> are opt-in — the dev default is{" "}
              <code>secrets-keychain</code> (OS keychain, no external service)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
