import { checkField, US_CORE_PROFILES } from "./rules.js";

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

  const rule = US_CORE_PROFILES[resourceType];
  if (!rule) {
    return { resourceType, supported: false, valid: true, issues: [] };
  }

  const record = resource as Record<string, unknown>;
  const issues = rule.required
    .filter((field) => !checkField(record, field))
    .map((field) => `Missing required element: ${field.description}`);

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
