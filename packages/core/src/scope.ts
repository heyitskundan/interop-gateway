import { ScopeError } from "./errors.js";

export type ScopeOperation = "read" | "write" | "search";

export interface GrantedScope {
  readonly resourceType: string;
  readonly operations: readonly ScopeOperation[];
}

/**
 * SMART on FHIR scopes already define what's accessible, but the package enforces them
 * itself too, rather than trusting the token and letting the server reject an
 * out-of-scope call. Every `read()`/`write()`/`search()` entry point checks against this
 * before making a network call.
 */
export class ScopeSet {
  constructor(private readonly scopes: readonly GrantedScope[]) {}

  permits(operation: ScopeOperation, resourceType: string): boolean {
    return this.scopes.some(
      (s) =>
        (s.resourceType === "*" || s.resourceType === resourceType) &&
        s.operations.includes(operation),
    );
  }

  assert(operation: ScopeOperation, resourceType: string): void {
    if (!this.permits(operation, resourceType)) {
      throw new ScopeError(operation, resourceType);
    }
  }
}
