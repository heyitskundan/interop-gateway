import { GatewayError } from "./errors.js";

export interface SecretRef {
  readonly name: string;
}

/** Interface for getting, setting, and deleting a credential by reference. */
export interface SecretsProvider {
  getSecret(ref: SecretRef): Promise<string>;
  setSecret(ref: SecretRef, value: string): Promise<void>;
  deleteSecret(ref: SecretRef): Promise<void>;
}

const PRIVATE_KEY_PATTERN = /-----BEGIN (RSA |EC )?PRIVATE KEY-----/;
const AWS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/;

/** Throws `GatewayError` if `value` matches a PEM private key or an AWS access key ID
 * pattern. */
export function assertNotRawCredential(value: string, context: string): void {
  if (PRIVATE_KEY_PATTERN.test(value) || AWS_KEY_PATTERN.test(value)) {
    throw new GatewayError(
      `A raw credential was passed directly as "${context}" instead of a SecretsProvider reference`,
      "RAW_CREDENTIAL_DETECTED",
    );
  }
}
