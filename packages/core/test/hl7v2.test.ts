import { describe, expect, it } from "vitest";
import { formatHl7v2, translateFromFhir, translateToFhir } from "../src/hl7v2.js";
import { GatewayError } from "../src/errors.js";

// SYNTHETIC DATA ONLY — NOT REAL PHI
const ADT_A01_SAMPLE = [
  "MSH|^~\\&|HIS|HOSP|ADT|HOSP|20240101120000||ADT^A01|MSG001|P|2.5",
  "EVN|A01|20240101120000||01|7802^Rivera^Carlos^^RN|20240101115500|HOSP",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^A||19800515|M|||123 Main St^^Springfield^IL^62701^USA||5559876543^PRN^PH",
  "PV1|1|I|ICU^101^A^^^HOSP||||1234^Smith^Jane^M^MD|5678^Johnson^Mary^R^MD",
].join("\r");

describe("translateToFhir", () => {
  it("translates a synthetic ADT^A01 message into a FHIR Bundle with a mapping trail", () => {
    const result = translateToFhir(ADT_A01_SAMPLE);
    const bundle = JSON.parse(result.translated);

    expect(bundle.resourceType).toBe("Bundle");
    expect(result.mappings.length).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("wraps a parse failure in a GatewayError carrying the library's context as path, never the raw input", () => {
    expect(() => translateToFhir("not a real HL7v2 message")).toThrow(GatewayError);
  });

  it("also wraps an unsupported message type (a different underlying error class) as GatewayError", () => {
    // The message parses structurally but ADT^Z99 isn't a supported trigger event, which
    // the underlying library reports via its FhirValidationError class rather than
    // Hl7ParseError — this exercises the second `instanceof` arm in the error wrapper.
    const unsupportedTrigger =
      "MSH|^~\\&|A|B|C|D|20240101120000||ADT^Z99|1|P|2.5\rEVN|Z99|20240101120000";
    expect(() => translateToFhir(unsupportedTrigger)).toThrow(GatewayError);
  });
});

describe("translateFromFhir", () => {
  it("round-trips a translated Bundle back into an HL7v2 message", () => {
    const { translated: bundleJson } = translateToFhir(ADT_A01_SAMPLE);
    const result = translateFromFhir(bundleJson);
    expect(result.translated.startsWith("MSH|")).toBe(true);
  });

  it("wraps invalid JSON input in a GatewayError", () => {
    expect(() => translateFromFhir("not json")).toThrow(GatewayError);
  });
});

describe("formatHl7v2 (FormatPlugin)", () => {
  it("has the name InteropGateway registers it under", () => {
    expect(formatHl7v2.name).toBe("hl7v2");
  });

  it("toFhir() returns a parsed Bundle object, not a JSON string", () => {
    const bundle = formatHl7v2.toFhir(ADT_A01_SAMPLE) as { resourceType: string };
    expect(bundle.resourceType).toBe("Bundle");
  });

  it("fromFhir() serializes a Bundle object back into an HL7v2 message string", () => {
    const bundle = formatHl7v2.toFhir(ADT_A01_SAMPLE);
    const message = formatHl7v2.fromFhir(bundle);
    expect(message.startsWith("MSH|")).toBe(true);
  });
});
