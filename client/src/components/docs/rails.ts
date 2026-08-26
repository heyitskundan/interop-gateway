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

export const changelogRail: RailItem[] = [
  { href: "#v0-4-0", label: "v0.4.0" },
  { href: "#v0-3-0", label: "v0.3.0" },
  { href: "#v0-2-0", label: "v0.2.0" },
  { href: "#v0-1-0", label: "v0.1.0" },
];
