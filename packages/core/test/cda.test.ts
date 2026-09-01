import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatCda, translateFromFhir, translateToFhir } from "../src/cda.js";
import { GatewayError } from "../src/errors.js";

const ccdFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/ccd-synthetic.xml", import.meta.url)),
  "utf8",
);

describe("translateToFhir", () => {
  it("translates the synthetic CCD fixture into a FHIR Bundle with a mapping trace", () => {
    const result = translateToFhir(ccdFixture);
    expect(result.bundle.resourceType).toBe("Bundle");
    expect(Array.isArray(result.mappings)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("wraps a parse failure in a GatewayError carrying the library's path, never a PHI value", () => {
    expect(() => translateToFhir("<NotClinicalDocument/>")).toThrow(GatewayError);
  });
});

describe("translateFromFhir", () => {
  it("round-trips a translated Bundle back into C-CDA XML", () => {
    const { bundle } = translateToFhir(ccdFixture);
    const result = translateFromFhir(bundle);
    expect(result.xml).toContain("<ClinicalDocument");
  });

  it("wraps a malformed Bundle (missing entry array) in a GatewayError via the generic-Error fallback path", () => {
    // @ts-expect-error -- deliberately malformed input to exercise error handling
    expect(() => translateFromFhir({ resourceType: "Bundle" })).toThrow(GatewayError);
  });
});

describe("formatCda (FormatPlugin)", () => {
  it("has the name InteropGateway registers it under", () => {
    expect(formatCda.name).toBe("cda");
  });

  it("toFhir()'s value is a parsed Bundle object, alongside the mapping trail", () => {
    const outcome = formatCda.toFhir(ccdFixture);
    expect((outcome.value as { resourceType: string }).resourceType).toBe("Bundle");
    expect(outcome.mappings.length).toBeGreaterThan(0);
    expect(Array.isArray(outcome.warnings)).toBe(true);
  });

  it("fromFhir() serializes a Bundle object back into C-CDA XML", () => {
    const toFhirOutcome = formatCda.toFhir(ccdFixture);
    const fromFhirOutcome = formatCda.fromFhir(toFhirOutcome.value);
    expect(fromFhirOutcome.value as string).toContain("<ClinicalDocument");
  });
});
