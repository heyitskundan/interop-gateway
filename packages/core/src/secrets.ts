import { GatewayError } from "./errors.js";

export interface SecretRef {
  readonly name: string;
}

/**
 * Every credential (client secret, backend-services private key, refresh token) flows
 * through this interface. `packages/core` never stores a plaintext secret itself —
 * `secrets-keychain`/`secrets-vault`/`secrets-aws` are the concrete implementations.
 */
export interface SecretsProvider {
  getSecret(ref: SecretRef): Promise<string>;
  setSecret(ref: SecretRef, value: string): Promise<void>;
  deleteSecret(ref: SecretRef): Promise<void>;
}

const PRIVATE_KEY_PATTERN = /-----BEGIN (RSA |EC )?PRIVATE KEY-----/;
const AWS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/;

/**
 * Guards against a real production credential being passed directly as a config value
 * where a `SecretsProvider` reference was expected — e.g. a caller accidentally pasting
 * a private key string into a connector config instead of a keychain lookup name.
 */
export function assertNotRawCredential(value: string, context: string): void {
  if (PRIVATE_KEY_PATTERN.test(value) || AWS_KEY_PATTERN.test(value)) {
    throw new GatewayError(
      `A raw credential was passed directly as "${context}" instead of a SecretsProvider reference`,
      "RAW_CREDENTIAL_DETECTED",
    );
  }
}
