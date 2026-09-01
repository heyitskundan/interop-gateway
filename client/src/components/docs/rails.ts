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

export const coreRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#install", label: "Install" },
  { href: "#translate", label: "Translate/validate" },
  { href: "#translators", label: "Translators directly" },
  { href: "#validate", label: "US Core validation" },
  { href: "#envelope", label: "Envelopes and correlation IDs" },
  { href: "#storage", label: "Encrypted storage" },
  { href: "#scope", label: "Scope enforcement" },
  { href: "#tls", label: "TLS enforcement" },
  { href: "#audit", label: "Tamper-evident audit log" },
  { href: "#secrets-guard", label: "Raw-credential guard" },
  { href: "#cli", label: "CLI" },
];

export const protocolRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#install", label: "Install" },
  { href: "#mllp", label: "MLLP" },
  { href: "#http", label: "HTTP" },
  { href: "#file", label: "File" },
];

export const secretsRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#install", label: "Install" },
  { href: "#keychain", label: "Keychain" },
  { href: "#vault", label: "Vault" },
  { href: "#aws", label: "AWS Secrets Manager" },
];

export const connectorRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#install", label: "Install" },
  { href: "#backend-services", label: "Backend-services" },
  { href: "#authorize", label: "authorization_code + PKCE" },
  { href: "#pkce", label: "PKCE internals" },
  { href: "#bulk-export", label: "Bulk Data ($export)" },
  { href: "#write", label: "Write support" },
  { href: "#scope", label: "Scope enforcement" },
  { href: "#internals", label: "Internals" },
];

export const engineRail: RailItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#install", label: "Install" },
  { href: "#config", label: "Config" },
  { href: "#routing", label: "Routing" },
  { href: "#persistence", label: "Persistence" },
  { href: "#cli", label: "CLI" },
  { href: "#programmatic", label: "Use programmatically" },
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
