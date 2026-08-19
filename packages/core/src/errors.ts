/**
 * Base error for the whole package. `path` carries a FHIR/HL7 path or a resource
 * identifier shape — never the value at that path, so error output is safe to log
 * without redaction.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export class ScopeError extends GatewayError {
  constructor(operation: string, resourceType: string) {
    super(
      `Current token scope does not permit "${operation}" on "${resourceType}"`,
      "SCOPE_DENIED",
    );
    this.name = "ScopeError";
  }
}

export class TlsError extends GatewayError {
  constructor(origin: string) {
    super(`TLS enforcement rejected a non-https connection to ${origin}`, "TLS_REJECTED");
    this.name = "TlsError";
  }
}

export class ValidationError extends GatewayError {
  constructor(message: string, path?: string) {
    super(message, "VALIDATION_FAILED", path);
    this.name = "ValidationError";
  }
}
