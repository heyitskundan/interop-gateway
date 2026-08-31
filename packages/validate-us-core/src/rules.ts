/** A single required-element check against a resource. `path` is a dotted accessor
 * (arrays are checked for at least one element); `anyOf` requires at least one of
 * several accessors to be present, for FHIR choice-type elements (`effective[x]`,
 * `medication[x]`) and substance-or-negation patterns.
 *
 * `max`, when set, checks the element's JSON shape matches its declared maximum
 * cardinality: `max: 1` fails if the value at `path` is a JSON array (a `0..1`/`1..1`
 * element must never serialize as one) — the direction a hand-rolled translator is
 * actually likely to get wrong. There's no corresponding "must be an array" check for
 * unbounded (`0..*`/`1..*`) elements: this package doesn't encode a finite max for any
 * of them, so there's nothing to violate on the other side. `max` isn't set on `anyOf`
 * rules — a choice-type element's cardinality applies per selected type, not to the
 * `anyOf` group itself.
 *
 * `codeValues`, when set, checks the plain `code`-typed string at `path` (not a
 * `CodeableConcept`/`Coding`) is one of this list — only used for elements bound with
 * **required** strength to one of FHIR R4's own fixed base-resource enumerations
 * (`status`/`intent`/`lifecycleStatus` fields), which this package can state with
 * confidence without fetching external ValueSet data. Terminology bound to an
 * external code system (LOINC, SNOMED CT) stays entirely out of scope — see
 * `README.md`. */
export interface FieldRule {
  readonly path?: string;
  readonly anyOf?: readonly string[];
  readonly max?: number;
  readonly codeValues?: readonly string[];
  readonly description: string;
}

export interface ProfileRule {
  readonly profile: string;
  readonly required: readonly FieldRule[];
}

function get(resource: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || value === undefined) return undefined;
    return (value as Record<string, unknown>)[key];
  }, resource);
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export function checkField(resource: Record<string, unknown>, rule: FieldRule): boolean {
  if (rule.path) return isPresent(get(resource, rule.path));
  if (rule.anyOf) return rule.anyOf.some((path) => isPresent(get(resource, path)));
  return true;
}

/** `undefined` means "not applicable" (no `max` set, `path` missing, or the field is
 * absent — absence is the presence check's job, not this one's) rather than a pass/fail
 * boolean, so a caller can skip emitting a redundant issue when there's nothing to
 * report. */
export function checkMaxCardinality(
  resource: Record<string, unknown>,
  rule: FieldRule,
): boolean | undefined {
  if (rule.max === undefined || !rule.path) return undefined;
  const value = get(resource, rule.path);
  if (!isPresent(value)) return undefined;
  if (rule.max === 1) return !Array.isArray(value);
  return undefined;
}

/** Same "not applicable" convention as `checkMaxCardinality`. */
export function checkCodeBinding(
  resource: Record<string, unknown>,
  rule: FieldRule,
): boolean | undefined {
  if (!rule.codeValues || !rule.path) return undefined;
  const value = get(resource, rule.path);
  if (!isPresent(value)) return undefined;
  if (typeof value !== "string") return false;
  return rule.codeValues.includes(value);
}

/**
 * Required-element rules for a subset of US Core (v6.1.0) profiles, scoped to the
 * resource types this project's own translators (`hl7-fhir-translator`,
 * `cda-fhir-translator`) can produce. These encode this package's own reading of each
 * profile's Must Support / minimum-cardinality elements from the published
 * implementation guide — they were not re-fetched and diffed against each profile's
 * StructureDefinition JSON during this package's initial build, so treat a pass here as
 * "the obviously-required fields are present, correctly shaped, and (for the handful of
 * fields checked) using a valid fixed code," not a certified US Core conformance
 * result. Terminology bound to an external code system (LOINC, SNOMED CT, RxNorm) is
 * out of scope entirely — this checks structural presence, singular-vs-array shape, and
 * (for FHIR-R4-fixed `status`/`intent`/`lifecycleStatus` enumerations only) valid code
 * membership.
 */
export const US_CORE_PROFILES: Readonly<Record<string, ProfileRule>> = {
  Patient: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
    required: [
      { path: "identifier", description: "Patient.identifier (at least one)" },
      { path: "name", description: "Patient.name (at least one)" },
      { path: "gender", max: 1, description: "Patient.gender" },
    ],
  },
  Condition: {
    profile:
      "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns",
    required: [
      { path: "subject", max: 1, description: "Condition.subject" },
      { path: "code", max: 1, description: "Condition.code" },
      { path: "category", description: "Condition.category (at least one)" },
      { path: "clinicalStatus", max: 1, description: "Condition.clinicalStatus" },
    ],
  },
  Observation: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: [
          "registered",
          "preliminary",
          "final",
          "amended",
          "corrected",
          "cancelled",
          "entered-in-error",
          "unknown",
        ],
        description: "Observation.status",
      },
      { path: "code", max: 1, description: "Observation.code" },
      { path: "subject", max: 1, description: "Observation.subject" },
      { path: "category", description: "Observation.category (at least one)" },
      {
        anyOf: ["effectiveDateTime", "effectivePeriod", "effectiveTiming", "effectiveInstant"],
        description: "Observation.effective[x]",
      },
    ],
  },
  AllergyIntolerance: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance",
    required: [
      { path: "patient", max: 1, description: "AllergyIntolerance.patient" },
      {
        anyOf: ["code", "reaction"],
        description: "AllergyIntolerance.code, or reaction[].substance (substance-or-negation)",
      },
    ],
  },
  Immunization: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: ["completed", "entered-in-error", "not-done"],
        description: "Immunization.status",
      },
      { path: "vaccineCode", max: 1, description: "Immunization.vaccineCode" },
      { path: "patient", max: 1, description: "Immunization.patient" },
      {
        anyOf: ["occurrenceDateTime", "occurrenceString"],
        description: "Immunization.occurrence[x]",
      },
    ],
  },
  Procedure: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: [
          "preparation",
          "in-progress",
          "not-done",
          "on-hold",
          "stopped",
          "completed",
          "entered-in-error",
          "unknown",
        ],
        description: "Procedure.status",
      },
      { path: "code", max: 1, description: "Procedure.code" },
      { path: "subject", max: 1, description: "Procedure.subject" },
    ],
  },
  Encounter: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: [
          "planned",
          "arrived",
          "triaged",
          "in-progress",
          "onleave",
          "finished",
          "cancelled",
          "entered-in-error",
          "unknown",
        ],
        description: "Encounter.status",
      },
      { path: "class", max: 1, description: "Encounter.class" },
      { path: "subject", max: 1, description: "Encounter.subject" },
    ],
  },
  DiagnosticReport: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: [
          "registered",
          "partial",
          "preliminary",
          "final",
          "amended",
          "corrected",
          "appended",
          "cancelled",
          "entered-in-error",
          "unknown",
        ],
        description: "DiagnosticReport.status",
      },
      { path: "code", max: 1, description: "DiagnosticReport.code" },
      { path: "subject", max: 1, description: "DiagnosticReport.subject" },
      { path: "category", description: "DiagnosticReport.category (at least one)" },
    ],
  },
  CareTeam: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-careteam",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: ["proposed", "active", "suspended", "inactive", "entered-in-error"],
        description: "CareTeam.status",
      },
      { path: "subject", max: 1, description: "CareTeam.subject" },
      { path: "participant", description: "CareTeam.participant (at least one)" },
    ],
  },
  Coverage: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-coverage",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: ["active", "cancelled", "draft", "entered-in-error"],
        description: "Coverage.status",
      },
      { path: "beneficiary", max: 1, description: "Coverage.beneficiary" },
      { path: "payor", description: "Coverage.payor (at least one)" },
    ],
  },
  Device: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-implantable-device",
    required: [
      { path: "patient", max: 1, description: "Device.patient" },
      { path: "type", max: 1, description: "Device.type" },
    ],
  },
  DocumentReference: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: ["current", "superseded", "entered-in-error"],
        description: "DocumentReference.status",
      },
      { path: "type", max: 1, description: "DocumentReference.type" },
      { path: "subject", max: 1, description: "DocumentReference.subject" },
      { path: "content", description: "DocumentReference.content (at least one)" },
    ],
  },
  Goal: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-goal",
    required: [
      {
        path: "lifecycleStatus",
        max: 1,
        codeValues: [
          "proposed",
          "planned",
          "accepted",
          "active",
          "on-hold",
          "completed",
          "cancelled",
          "entered-in-error",
          "rejected",
        ],
        description: "Goal.lifecycleStatus",
      },
      { path: "description", max: 1, description: "Goal.description" },
      { path: "subject", max: 1, description: "Goal.subject" },
    ],
  },
  ServiceRequest: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-servicerequest",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: [
          "draft",
          "active",
          "on-hold",
          "revoked",
          "completed",
          "entered-in-error",
          "unknown",
        ],
        description: "ServiceRequest.status",
      },
      {
        path: "intent",
        max: 1,
        codeValues: [
          "proposal",
          "plan",
          "directive",
          "order",
          "original-order",
          "reflex-order",
          "filler-order",
          "instance-order",
          "option",
        ],
        description: "ServiceRequest.intent",
      },
      { path: "code", max: 1, description: "ServiceRequest.code" },
      { path: "subject", max: 1, description: "ServiceRequest.subject" },
    ],
  },
  MedicationRequest: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest",
    required: [
      {
        path: "status",
        max: 1,
        codeValues: [
          "active",
          "on-hold",
          "cancelled",
          "completed",
          "entered-in-error",
          "stopped",
          "draft",
          "unknown",
        ],
        description: "MedicationRequest.status",
      },
      {
        path: "intent",
        max: 1,
        codeValues: [
          "proposal",
          "plan",
          "order",
          "original-order",
          "reflex-order",
          "filler-order",
          "instance-order",
          "option",
        ],
        description: "MedicationRequest.intent",
      },
      { path: "subject", max: 1, description: "MedicationRequest.subject" },
      {
        anyOf: ["medicationCodeableConcept", "medicationReference"],
        description: "MedicationRequest.medication[x]",
      },
    ],
  },
};
