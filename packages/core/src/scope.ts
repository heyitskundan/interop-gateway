import { ScopeError } from "./errors.js";

export type ScopeOperation = "read" | "write" | "search";

export interface GrantedScope {
  readonly resourceType: string;
  readonly operations: readonly ScopeOperation[];
}

/** Checks an operation and resource type against a set of granted SMART on FHIR scopes. */
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
