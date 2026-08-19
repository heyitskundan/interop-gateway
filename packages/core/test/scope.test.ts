import { describe, expect, it } from "vitest";
import { ScopeSet } from "../src/scope.js";
import { ScopeError } from "../src/errors.js";

describe("ScopeSet", () => {
  it("permits an operation explicitly granted for the resource type", () => {
    const scopes = new ScopeSet([{ resourceType: "Patient", operations: ["read"] }]);
    expect(scopes.permits("read", "Patient")).toBe(true);
    expect(() => scopes.assert("read", "Patient")).not.toThrow();
  });

  it("denies an operation not granted for that resource type", () => {
    const scopes = new ScopeSet([{ resourceType: "Patient", operations: ["read"] }]);
    expect(scopes.permits("write", "Patient")).toBe(false);
    expect(() => scopes.assert("write", "Patient")).toThrow(ScopeError);
  });

  it("denies access to a resource type with no matching scope at all", () => {
    const scopes = new ScopeSet([{ resourceType: "Patient", operations: ["read"] }]);
    expect(scopes.permits("read", "Observation")).toBe(false);
  });

  it("honors a wildcard resource-type grant", () => {
    const scopes = new ScopeSet([{ resourceType: "*", operations: ["read"] }]);
    expect(scopes.permits("read", "Observation")).toBe(true);
    expect(scopes.permits("write", "Observation")).toBe(false);
  });

  it.each(["read", "write", "search"] as const)(
    "checks each operation (%s) independently per resource type",
    (operation) => {
      const scopes = new ScopeSet([{ resourceType: "Patient", operations: [operation] }]);
      expect(scopes.permits(operation, "Patient")).toBe(true);
    },
  );
});
