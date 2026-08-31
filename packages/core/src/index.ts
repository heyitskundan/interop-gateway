export { createEnvelope, withPayload, type Envelope } from "./envelope.js";
export { GatewayError, ScopeError, TlsError, ValidationError } from "./errors.js";
export { enforceTls } from "./tls.js";
export { assertNotRawCredential, type SecretRef, type SecretsProvider } from "./secrets.js";
export { EncryptedStore, InMemoryStore, deriveKey, type Store } from "./store.js";
export { ScopeSet, type GrantedScope, type ScopeOperation } from "./scope.js";
export { FileAuditLog, HashChainedAuditLog, type AuditEntry, type AuditSink } from "./audit.js";
export { validateStructural, type StructuralValidationResult } from "./validate.js";
export {
  InteropGateway,
  type FormatName,
  type FormatPlugin,
  type InteropGatewayOptions,
  type TranslateOptions,
} from "./gateway.js";
