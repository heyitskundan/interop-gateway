import { afterEach, describe, expect, it } from "vitest";
import {
  validateUsCore,
  validateUsCoreBundle,
  registerProfile,
  unregisterProfile,
  getRegisteredProfile,
  listRegisteredProfiles,
  resetProfiles,
} from "../src/index.js";

describe("validateUsCore", () => {
  it("returns valid:true for a Patient with identifier, name, and gender", () => {
    const result = validateUsCore({
      resourceType: "Patient",
      identifier: [{ system: "urn:oid:1.2.3", value: "MRN-1" }],
      name: [{ family: "Doe", given: ["Jane"] }],
      gender: "female",
    });

    expect(result).toEqual({
      resourceType: "Patient",
      supported: true,
      valid: true,
      profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
      issues: [],
    });
  });

  it("flags a Patient missing gender", () => {
    const result = validateUsCore({
      resourceType: "Patient",
      identifier: [{ value: "MRN-1" }],
      name: [{ family: "Doe" }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(["Missing required element: Patient.gender"]);
  });

  it("flags a Patient with an empty identifier array as missing", () => {
    const result = validateUsCore({
      resourceType: "Patient",
      identifier: [],
      name: [{ family: "Doe" }],
      gender: "male",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Patient.identifier (at least one)");
  });

  it("passes an Observation whose effective[x] is effectivePeriod, not effectiveDateTime", () => {
    const result = validateUsCore({
      resourceType: "Observation",
      status: "final",
      code: { coding: [{ system: "http://loinc.org", code: "8310-5" }] },
      subject: { reference: "Patient/1" },
      category: [{ coding: [{ code: "vital-signs" }] }],
      effectivePeriod: { start: "2026-01-01" },
    });

    expect(result.valid).toBe(true);
  });

  it("flags an Observation with no effective[x] at all", () => {
    const result = validateUsCore({
      resourceType: "Observation",
      status: "final",
      code: {},
      subject: {},
      category: [{}],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Observation.effective[x]");
  });

  it("passes AllergyIntolerance via the reaction-substance path when code is absent", () => {
    const result = validateUsCore({
      resourceType: "AllergyIntolerance",
      patient: { reference: "Patient/1" },
      reaction: [{ substance: { coding: [{ code: "7980" }] } }],
    });

    expect(result.valid).toBe(true);
  });

  it("flags AllergyIntolerance with neither code nor reaction", () => {
    const result = validateUsCore({
      resourceType: "AllergyIntolerance",
      patient: { reference: "Patient/1" },
    });

    expect(result.valid).toBe(false);
  });

  it("returns supported:false and valid:true for a resource type with no rule table", () => {
    const result = validateUsCore({ resourceType: "Basic", extension: [] });

    expect(result).toEqual({ resourceType: "Basic", supported: false, valid: true, issues: [] });
  });

  it("returns valid:false for a non-object input", () => {
    const result = validateUsCore("not a resource");
    expect(result.valid).toBe(false);
    expect(result.supported).toBe(false);
  });

  it("returns valid:false when resourceType is missing", () => {
    const result = validateUsCore({ id: "123" });
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/resourceType/);
  });

  it("validates MedicationRequest's medication[x] choice via medicationReference", () => {
    const result = validateUsCore({
      resourceType: "MedicationRequest",
      status: "active",
      intent: "order",
      subject: { reference: "Patient/1" },
      medicationReference: { reference: "Medication/1" },
    });

    expect(result.valid).toBe(true);
  });

  it("passes an Immunization whose occurrence[x] is occurrenceString, not occurrenceDateTime", () => {
    const result = validateUsCore({
      resourceType: "Immunization",
      status: "completed",
      vaccineCode: { coding: [{ code: "08" }] },
      patient: { reference: "Patient/1" },
      occurrenceString: "unknown",
    });

    expect(result.valid).toBe(true);
  });

  it("flags an Immunization with no occurrence[x] at all", () => {
    const result = validateUsCore({
      resourceType: "Immunization",
      status: "completed",
      vaccineCode: {},
      patient: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Immunization.occurrence[x]");
  });

  it("validates a Procedure with status, code, and subject", () => {
    const result = validateUsCore({
      resourceType: "Procedure",
      status: "completed",
      code: { coding: [{ code: "80146002" }] },
      subject: { reference: "Patient/1" },
    });

    expect(result.valid).toBe(true);
  });

  it("flags a Procedure missing code", () => {
    const result = validateUsCore({
      resourceType: "Procedure",
      status: "completed",
      subject: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Procedure.code");
  });

  it("validates an Encounter with status, class, and subject", () => {
    const result = validateUsCore({
      resourceType: "Encounter",
      status: "in-progress",
      class: { code: "AMB" },
      subject: { reference: "Patient/1" },
    });

    expect(result.valid).toBe(true);
  });

  it("flags an Encounter missing class", () => {
    const result = validateUsCore({
      resourceType: "Encounter",
      status: "in-progress",
      subject: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Encounter.class");
  });

  it("validates a DiagnosticReport with status, code, subject, and category", () => {
    const result = validateUsCore({
      resourceType: "DiagnosticReport",
      status: "final",
      code: { coding: [{ code: "58410-2" }] },
      subject: { reference: "Patient/1" },
      category: [{ coding: [{ code: "LAB" }] }],
    });

    expect(result.valid).toBe(true);
  });

  it("flags a DiagnosticReport missing category", () => {
    const result = validateUsCore({
      resourceType: "DiagnosticReport",
      status: "final",
      code: {},
      subject: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain(
      "Missing required element: DiagnosticReport.category (at least one)",
    );
  });

  it("validates a CareTeam with status, subject, and at least one participant", () => {
    const result = validateUsCore({
      resourceType: "CareTeam",
      status: "active",
      subject: { reference: "Patient/1" },
      participant: [{ member: { reference: "Practitioner/1" } }],
    });

    expect(result.valid).toBe(true);
  });

  it("flags a CareTeam with an empty participant array", () => {
    const result = validateUsCore({
      resourceType: "CareTeam",
      status: "active",
      subject: {},
      participant: [],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain(
      "Missing required element: CareTeam.participant (at least one)",
    );
  });

  it("validates a Coverage with status, beneficiary, and at least one payor", () => {
    const result = validateUsCore({
      resourceType: "Coverage",
      status: "active",
      beneficiary: { reference: "Patient/1" },
      payor: [{ reference: "Organization/1" }],
    });

    expect(result.valid).toBe(true);
  });

  it("flags a Coverage missing payor", () => {
    const result = validateUsCore({ resourceType: "Coverage", status: "active", beneficiary: {} });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Coverage.payor (at least one)");
  });

  it("validates a Device with patient and type", () => {
    const result = validateUsCore({
      resourceType: "Device",
      patient: { reference: "Patient/1" },
      type: { coding: [{ code: "123" }] },
    });

    expect(result.valid).toBe(true);
  });

  it("flags a Device missing type", () => {
    const result = validateUsCore({ resourceType: "Device", patient: {} });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Device.type");
  });

  it("validates a DocumentReference with status, type, subject, and content", () => {
    const result = validateUsCore({
      resourceType: "DocumentReference",
      status: "current",
      type: { coding: [{ code: "34133-9" }] },
      subject: { reference: "Patient/1" },
      content: [{ attachment: { contentType: "application/pdf" } }],
    });

    expect(result.valid).toBe(true);
  });

  it("flags a DocumentReference with an empty content array", () => {
    const result = validateUsCore({
      resourceType: "DocumentReference",
      status: "current",
      type: {},
      subject: {},
      content: [],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain(
      "Missing required element: DocumentReference.content (at least one)",
    );
  });

  it("validates a Goal with lifecycleStatus, description, and subject", () => {
    const result = validateUsCore({
      resourceType: "Goal",
      lifecycleStatus: "active",
      description: { text: "Lower A1c" },
      subject: { reference: "Patient/1" },
    });

    expect(result.valid).toBe(true);
  });

  it("flags a Goal missing description", () => {
    const result = validateUsCore({
      resourceType: "Goal",
      lifecycleStatus: "active",
      subject: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: Goal.description");
  });

  it("validates a ServiceRequest with status, intent, code, and subject", () => {
    const result = validateUsCore({
      resourceType: "ServiceRequest",
      status: "active",
      intent: "order",
      code: { coding: [{ code: "24627-2" }] },
      subject: { reference: "Patient/1" },
    });

    expect(result.valid).toBe(true);
  });

  it("flags a ServiceRequest missing intent", () => {
    const result = validateUsCore({
      resourceType: "ServiceRequest",
      status: "active",
      code: {},
      subject: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Missing required element: ServiceRequest.intent");
  });
});

describe("max cardinality", () => {
  it("flags a singular element serialized as a JSON array", () => {
    const result = validateUsCore({
      resourceType: "Patient",
      identifier: [{ value: "MRN-1" }],
      name: [{ family: "Doe" }],
      gender: ["female"], // should be a bare string, not an array
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain(
      "Max cardinality violation: Patient.gender must not be a JSON array (max 1)",
    );
  });

  it("does not flag a present, correctly-shaped singular element", () => {
    const result = validateUsCore({
      resourceType: "Patient",
      identifier: [{ value: "MRN-1" }],
      name: [{ family: "Doe" }],
      gender: "female",
    });

    expect(result.issues.some((issue) => issue.includes("Max cardinality violation"))).toBe(false);
  });

  it("does not double-report a missing field as also a cardinality violation", () => {
    const result = validateUsCore({
      resourceType: "Patient",
      identifier: [{ value: "MRN-1" }],
      name: [{ family: "Doe" }],
      // gender omitted entirely
    });

    expect(result.issues).toEqual(["Missing required element: Patient.gender"]);
  });
});

describe("required code-value binding", () => {
  it("flags an Observation.status value outside the fixed R4 enumeration", () => {
    const result = validateUsCore({
      resourceType: "Observation",
      status: "in-progress", // not a valid Observation.status code
      code: { coding: [{ system: "http://loinc.org", code: "8310-5" }] },
      subject: { reference: "Patient/1" },
      category: [{ coding: [{ code: "vital-signs" }] }],
      effectiveDateTime: "2026-01-01",
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) =>
        issue.includes("Invalid code: Observation.status must be one of"),
      ),
    ).toBe(true);
  });

  it("passes every valid Observation.status code", () => {
    for (const status of ["registered", "preliminary", "final", "amended", "unknown"]) {
      const result = validateUsCore({
        resourceType: "Observation",
        status,
        code: { coding: [{ system: "http://loinc.org", code: "8310-5" }] },
        subject: { reference: "Patient/1" },
        category: [{ coding: [{ code: "vital-signs" }] }],
        effectiveDateTime: "2026-01-01",
      });
      expect(result.valid, `status ${status} should be valid`).toBe(true);
    }
  });

  it("flags a MedicationRequest.intent value outside the fixed R4 enumeration", () => {
    const result = validateUsCore({
      resourceType: "MedicationRequest",
      status: "active",
      intent: "urgent", // not a valid intent code
      subject: { reference: "Patient/1" },
      medicationReference: { reference: "Medication/1" },
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) =>
        issue.includes("Invalid code: MedicationRequest.intent must be one of"),
      ),
    ).toBe(true);
  });
});

describe("profile registry (pluggability)", () => {
  afterEach(() => resetProfiles());

  it("registerProfile adds a rule for a resourceType this package doesn't ship one for", () => {
    expect(validateUsCore({ resourceType: "Basic" }).supported).toBe(false);

    registerProfile("Basic", {
      profile: "https://example.org/fhir/StructureDefinition/custom-basic",
      required: [{ path: "code", max: 1, description: "Basic.code" }],
    });

    const missing = validateUsCore({ resourceType: "Basic" });
    expect(missing.supported).toBe(true);
    expect(missing.valid).toBe(false);
    expect(missing.issues).toContain("Missing required element: Basic.code");

    const present = validateUsCore({ resourceType: "Basic", code: { text: "x" } });
    expect(present.valid).toBe(true);
    expect(present.profile).toBe("https://example.org/fhir/StructureDefinition/custom-basic");
  });

  it("registerProfile overrides a built-in profile's rules", () => {
    registerProfile("Patient", {
      profile: "https://example.org/fhir/StructureDefinition/strict-patient",
      required: [{ path: "birthDate", max: 1, description: "Patient.birthDate" }],
    });

    // The built-in Patient.gender/identifier/name rules no longer apply.
    const result = validateUsCore({ resourceType: "Patient", birthDate: "1980-01-01" });
    expect(result.valid).toBe(true);
    expect(result.profile).toBe("https://example.org/fhir/StructureDefinition/strict-patient");
  });

  it("unregisterProfile makes a resourceType report as unsupported again", () => {
    unregisterProfile("Patient");
    expect(validateUsCore({ resourceType: "Patient" }).supported).toBe(false);
  });

  it("listRegisteredProfiles includes built-ins plus anything registered", () => {
    expect(listRegisteredProfiles()).toContain("Patient");
    expect(listRegisteredProfiles()).not.toContain("Basic");

    registerProfile("Basic", { profile: "https://example.org/x", required: [] });
    expect(listRegisteredProfiles()).toContain("Basic");
  });

  it("getRegisteredProfile returns the exact rule object registered", () => {
    const rule = { profile: "https://example.org/x", required: [] };
    registerProfile("Basic", rule);
    expect(getRegisteredProfile("Basic")).toBe(rule);
  });

  it("resetProfiles discards custom registrations and restores built-ins", () => {
    registerProfile("Basic", { profile: "https://example.org/x", required: [] });
    unregisterProfile("Condition");

    resetProfiles();

    expect(getRegisteredProfile("Basic")).toBeUndefined();
    expect(getRegisteredProfile("Condition")).toBeDefined();
  });
});

describe("validateUsCoreBundle", () => {
  it("validates every entry in a Bundle and reports each result", () => {
    const results = validateUsCoreBundle({
      resourceType: "Bundle",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            identifier: [{ value: "1" }],
            name: [{ family: "Doe" }],
          },
        },
        {
          resource: {
            resourceType: "Condition",
            subject: {},
            code: {},
            category: [{}],
            clinicalStatus: {},
          },
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.resourceType).toBe("Patient");
    expect(results[0]!.valid).toBe(false); // missing gender
    expect(results[1]!.resourceType).toBe("Condition");
    expect(results[1]!.valid).toBe(true);
  });

  it("skips entries with no resource", () => {
    const results = validateUsCoreBundle({ resourceType: "Bundle", entry: [{}] });
    expect(results).toHaveLength(0);
  });

  it("returns an empty array for a Bundle with no entries", () => {
    expect(validateUsCoreBundle({ resourceType: "Bundle" })).toEqual([]);
  });
});
