import { describe, expect, it } from "vitest";
import { validateUsCore, validateUsCoreBundle } from "../src/index.js";

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
});

describe("validateUsCoreBundle", () => {
  it("validates every entry in a Bundle and reports each result", () => {
    const results = validateUsCoreBundle({
      resourceType: "Bundle",
      entry: [
        { resource: { resourceType: "Patient", identifier: [{ value: "1" }], name: [{ family: "Doe" }] } },
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
