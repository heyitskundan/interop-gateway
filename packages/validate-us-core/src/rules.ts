/** A single required-element check against a resource. `path` is a dotted accessor
 * (arrays are checked for at least one element); `anyOf` requires at least one of
 * several accessors to be present, for FHIR choice-type elements (`effective[x]`,
 * `medication[x]`) and substance-or-negation patterns. */
export interface FieldRule {
  readonly path?: string;
  readonly anyOf?: readonly string[];
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

/**
 * Required-element rules for a subset of US Core (v6.1.0) profiles, scoped to the
 * resource types this project's own translators (`hl7-fhir-translator`,
 * `cda-fhir-translator`) can produce. These encode this package's own reading of each
 * profile's Must Support / minimum-cardinality elements from the published
 * implementation guide — they were not re-fetched and diffed against each profile's
 * StructureDefinition JSON during this package's initial build, so treat a pass here as
 * "the obviously-required fields are present," not a certified US Core conformance
 * result. Terminology binding (e.g. that `code` actually uses a LOINC/SNOMED code from
 * the profile's required ValueSet) is out of scope entirely — this checks structural
 * presence only.
 */
export const US_CORE_PROFILES: Readonly<Record<string, ProfileRule>> = {
  Patient: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
    required: [
      { path: "identifier", description: "Patient.identifier (at least one)" },
      { path: "name", description: "Patient.name (at least one)" },
      { path: "gender", description: "Patient.gender" },
    ],
  },
  Condition: {
    profile:
      "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns",
    required: [
      { path: "subject", description: "Condition.subject" },
      { path: "code", description: "Condition.code" },
      { path: "category", description: "Condition.category (at least one)" },
      { path: "clinicalStatus", description: "Condition.clinicalStatus" },
    ],
  },
  Observation: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab",
    required: [
      { path: "status", description: "Observation.status" },
      { path: "code", description: "Observation.code" },
      { path: "subject", description: "Observation.subject" },
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
      { path: "patient", description: "AllergyIntolerance.patient" },
      {
        anyOf: ["code", "reaction"],
        description: "AllergyIntolerance.code, or reaction[].substance (substance-or-negation)",
      },
    ],
  },
  Immunization: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization",
    required: [
      { path: "status", description: "Immunization.status" },
      { path: "vaccineCode", description: "Immunization.vaccineCode" },
      { path: "patient", description: "Immunization.patient" },
      {
        anyOf: ["occurrenceDateTime", "occurrenceString"],
        description: "Immunization.occurrence[x]",
      },
    ],
  },
  Procedure: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure",
    required: [
      { path: "status", description: "Procedure.status" },
      { path: "code", description: "Procedure.code" },
      { path: "subject", description: "Procedure.subject" },
    ],
  },
  Encounter: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter",
    required: [
      { path: "status", description: "Encounter.status" },
      { path: "class", description: "Encounter.class" },
      { path: "subject", description: "Encounter.subject" },
    ],
  },
  DiagnosticReport: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab",
    required: [
      { path: "status", description: "DiagnosticReport.status" },
      { path: "code", description: "DiagnosticReport.code" },
      { path: "subject", description: "DiagnosticReport.subject" },
      { path: "category", description: "DiagnosticReport.category (at least one)" },
    ],
  },
  CareTeam: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-careteam",
    required: [
      { path: "status", description: "CareTeam.status" },
      { path: "subject", description: "CareTeam.subject" },
      { path: "participant", description: "CareTeam.participant (at least one)" },
    ],
  },
  Coverage: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-coverage",
    required: [
      { path: "status", description: "Coverage.status" },
      { path: "beneficiary", description: "Coverage.beneficiary" },
      { path: "payor", description: "Coverage.payor (at least one)" },
    ],
  },
  Device: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-implantable-device",
    required: [
      { path: "patient", description: "Device.patient" },
      { path: "type", description: "Device.type" },
    ],
  },
  DocumentReference: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference",
    required: [
      { path: "status", description: "DocumentReference.status" },
      { path: "type", description: "DocumentReference.type" },
      { path: "subject", description: "DocumentReference.subject" },
      { path: "content", description: "DocumentReference.content (at least one)" },
    ],
  },
  Goal: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-goal",
    required: [
      { path: "lifecycleStatus", description: "Goal.lifecycleStatus" },
      { path: "description", description: "Goal.description" },
      { path: "subject", description: "Goal.subject" },
    ],
  },
  ServiceRequest: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-servicerequest",
    required: [
      { path: "status", description: "ServiceRequest.status" },
      { path: "intent", description: "ServiceRequest.intent" },
      { path: "code", description: "ServiceRequest.code" },
      { path: "subject", description: "ServiceRequest.subject" },
    ],
  },
  MedicationRequest: {
    profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest",
    required: [
      { path: "status", description: "MedicationRequest.status" },
      { path: "intent", description: "MedicationRequest.intent" },
      { path: "subject", description: "MedicationRequest.subject" },
      {
        anyOf: ["medicationCodeableConcept", "medicationReference"],
        description: "MedicationRequest.medication[x]",
      },
    ],
  },
};
