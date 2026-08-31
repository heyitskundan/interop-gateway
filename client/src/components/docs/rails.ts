export interface RailItem {
  href: string;
  label: string;
  indent?: boolean;
}

// "On this page" anchor lists, one per docs page — kept separate from the page
// components themselves so those files export only a component (react-refresh's
// only-export-components rule needs that for fast refresh to stay reliable).
export const gettingStartedRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#installation", label: "Installation" },
  { href: "#quickstart", label: "Quick start" },
  { href: "#phi", label: "PHI and compliance" },
  { href: "#requirements", label: "Requirements" },
];

export const apiReferenceRail: RailItem[] = [
  { href: "#core", label: "InteropGateway" },
  { href: "#formats", label: "Format plugins" },
  { href: "#protocols", label: "Protocol adapters" },
  { href: "#connector", label: "SMART on FHIR connector" },
  { href: "#secrets", label: "Secrets providers" },
  { href: "#validate", label: "US Core validation" },
  { href: "#errors", label: "Errors" },
  { href: "#cli", label: "CLI reference" },
];

export const packagesRail: RailItem[] = [
  { href: "#overview", label: "The 13 packages" },
  { href: "#core", label: "core", indent: true },
  { href: "#formats", label: "format-hl7v2 / format-cda", indent: true },
  { href: "#protocols", label: "protocol-mllp / -http / -file", indent: true },
  { href: "#connector", label: "connector-smart-generic", indent: true },
  { href: "#secrets", label: "secrets-keychain / -vault / -aws", indent: true },
  { href: "#validate", label: "validate-us-core", indent: true },
  { href: "#engine", label: "engine", indent: true },
  { href: "#mcp-server", label: "mcp-server", indent: true },
  { href: "#architecture", label: "How they fit together" },
];

export const advancedRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#envelope", label: "Envelopes and correlation IDs" },
  { href: "#storage", label: "Encrypted storage" },
  { href: "#scope", label: "Scope enforcement" },
  { href: "#tls", label: "TLS enforcement" },
  { href: "#audit", label: "Tamper-evident audit log" },
  { href: "#dead-letter", label: "Dead-letter queue and replay" },
  { href: "#secrets-guard", label: "Raw-credential guard" },
  { href: "#connector-internals", label: "connector-smart-generic internals" },
  { href: "#connector-authorize", label: "connector-smart-generic: authorization_code + PKCE" },
  { href: "#connector-bulk-export", label: "connector-smart-generic: Bulk Data ($export)" },
];

export const mcpRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#install", label: "1. Install" },
  { href: "#local", label: "2. Building from source" },
  { href: "#tools", label: "3. Tools" },
  { href: "#audit", label: "4. Correlation IDs and audit logging" },
  { href: "#programmatic", label: "5. Embed programmatically" },
];

export const changelogRail: RailItem[] = [
  { href: "#v1-0-0", label: "v1.0.0" },
  { href: "#v0-4-0", label: "v0.4.0" },
  { href: "#v0-3-0", label: "v0.3.0" },
  { href: "#v0-2-0", label: "v0.2.0" },
  { href: "#v0-1-0", label: "v0.1.0" },
];
