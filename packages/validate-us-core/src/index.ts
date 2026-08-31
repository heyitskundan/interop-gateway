import {
  checkCodeBinding,
  checkField,
  checkMaxCardinality,
  US_CORE_PROFILES,
  type ProfileRule,
} from "./rules.js";

export { US_CORE_PROFILES, type FieldRule, type ProfileRule } from "./rules.js";

export interface UsCoreValidationResult {
  readonly resourceType: string;
  /** False when this package has no rule table for the resource's `resourceType` —
   * `valid` is `true` in that case too, since there's nothing to check it against, not
   * because it was confirmed conformant. Check `supported` to tell the two apart. */
  readonly supported: boolean;
  readonly valid: boolean;
  readonly profile?: string;
  readonly issues: readonly string[];
}

/** Mutable profile registry, seeded from the built-in `US_CORE_PROFILES` table at
 * module load. `validateUsCore`/`validateUsCoreBundle` read from this, not the frozen
 * `US_CORE_PROFILES` export directly, so `registerProfile()` can add a resource type
 * this package doesn't ship a rule for, or override a built-in one with a stricter or
 * differently-scoped rule (a custom IG, a state-specific profile, a local Argonaut
 * variant) — without forking this package. */
const registry = new Map<string, ProfileRule>(Object.entries(US_CORE_PROFILES));

/** Registers (or overrides) the rule used for `resourceType`. Takes effect on the very
 * next `validateUsCore`/`validateUsCoreBundle` call — there's no rebuild/reload step. */
export function registerProfile(resourceType: string, rule: ProfileRule): void {
  registry.set(resourceType, rule);
}

/** Removes a resourceType's rule — `validateUsCore` reports it as `supported: false`
 * afterward, same as a resourceType this package never had a rule for. */
export function unregisterProfile(resourceType: string): void {
  registry.delete(resourceType);
}

export function getRegisteredProfile(resourceType: string): ProfileRule | undefined {
  return registry.get(resourceType);
}

/** All currently-registered resource types, built-in and custom alike. */
export function listRegisteredProfiles(): readonly string[] {
  return [...registry.keys()];
}

/** Discards every custom `registerProfile()` call and any `unregisterProfile()`
 * removal, restoring the registry to exactly the built-in `US_CORE_PROFILES` table.
 * Mainly for tests that register a throwaway profile and don't want it leaking into
 * the next test. */
export function resetProfiles(): void {
  registry.clear();
  for (const [resourceType, rule] of Object.entries(US_CORE_PROFILES)) {
    registry.set(resourceType, rule);
  }
}

/** Checks `resource` against this package's required-element rules for its
 * `resourceType`'s US Core profile (see `rules.ts` for exactly what's covered and its
 * limitations). Throws nothing — an unrecognized or malformed input just produces a
 * result with `valid: false` and an explanatory issue. */
export function validateUsCore(resource: unknown): UsCoreValidationResult {
  if (typeof resource !== "object" || resource === null) {
    return {
      resourceType: "unknown",
      supported: false,
      valid: false,
      issues: ["Input is not a FHIR resource object"],
    };
  }

  const resourceType = (resource as Record<string, unknown>).resourceType;
  if (typeof resourceType !== "string") {
    return {
      resourceType: "unknown",
      supported: false,
      valid: false,
      issues: ['Resource is missing a string "resourceType" field'],
    };
  }

  const rule = getRegisteredProfile(resourceType);
  if (!rule) {
    return { resourceType, supported: false, valid: true, issues: [] };
  }

  const record = resource as Record<string, unknown>;
  const issues: string[] = [];
  for (const field of rule.required) {
    if (!checkField(record, field)) {
      issues.push(`Missing required element: ${field.description}`);
      continue;
    }
    if (checkMaxCardinality(record, field) === false) {
      issues.push(
        `Max cardinality violation: ${field.description} must not be a JSON array (max 1)`,
      );
    }
    if (checkCodeBinding(record, field) === false) {
      issues.push(
        `Invalid code: ${field.description} must be one of [${field.codeValues!.join(", ")}]`,
      );
    }
  }

  return {
    resourceType,
    supported: true,
    valid: issues.length === 0,
    profile: rule.profile,
    issues,
  };
}

/** Runs `validateUsCore` over every resource in a FHIR Bundle's `entry[].resource`. */
export function validateUsCoreBundle(bundle: unknown): readonly UsCoreValidationResult[] {
  const entries = (bundle as { entry?: readonly { resource?: unknown }[] })?.entry ?? [];
  return entries
    .filter((entry) => entry.resource !== undefined)
    .map((entry) => validateUsCore(entry.resource));
}
