import { describe, expect, it } from "vitest";
import { InteropGateway, type FormatPlugin } from "../src/gateway.js";
import { GatewayError } from "../src/errors.js";
import { formatHl7v2 } from "../src/hl7v2.js";

const fakeHl7v2Plugin: FormatPlugin = {
  name: "hl7v2",
  toFhir: (input) => ({
    value: { resourceType: "Bundle", sourceLength: input.length },
    mappings: [],
    warnings: [],
  }),
  fromFhir: () => ({ value: "MSH|^~\\&|...", mappings: [], warnings: [] }),
};

const HL7V2_SAMPLE = "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260101120000||ADT^A01|1|P|2.5";

describe("InteropGateway.translate", () => {
  it("routes to the matching format plugin's toFhir() after structural validation", () => {
    const gateway = new InteropGateway({ formats: [fakeHl7v2Plugin] });
    const result = gateway.translate(HL7V2_SAMPLE, { from: "hl7v2", to: "fhir" });
    expect(result).toEqual({
      value: { resourceType: "Bundle", sourceLength: HL7V2_SAMPLE.length },
      mappings: [],
      warnings: [],
    });
  });

  it("throws before calling the plugin when structural validation fails", () => {
    const gateway = new InteropGateway({ formats: [fakeHl7v2Plugin] });
    expect(() => gateway.translate("not a real message", { from: "hl7v2", to: "fhir" })).toThrow(
      GatewayError,
    );
  });

  it("throws a clear error when no plugin is registered for the requested format", () => {
    const gateway = new InteropGateway({ formats: [] });
    expect(() => gateway.translate(HL7V2_SAMPLE, { from: "hl7v2", to: "fhir" })).toThrow(
      /No format plugin registered for "hl7v2"/,
    );
  });

  it("routes to the matching format plugin's fromFhir() for the fhir -> X direction", () => {
    const gateway = new InteropGateway({ formats: [fakeHl7v2Plugin] });
    const result = gateway.translate(JSON.stringify({ resourceType: "Bundle" }), {
      from: "fhir",
      to: "hl7v2",
    });
    expect(result).toEqual({ value: "MSH|^~\\&|...", mappings: [], warnings: [] });
  });

  it("passes the parsed FHIR object, not the raw string, to fromFhir()", () => {
    let received: unknown;
    const spyPlugin: FormatPlugin = {
      ...fakeHl7v2Plugin,
      fromFhir: (bundle) => {
        received = bundle;
        return { value: "MSH|^~\\&|...", mappings: [], warnings: [] };
      },
    };
    const gateway = new InteropGateway({ formats: [spyPlugin] });
    gateway.translate(JSON.stringify({ resourceType: "Bundle", id: "abc" }), {
      from: "fhir",
      to: "hl7v2",
    });
    expect(received).toEqual({ resourceType: "Bundle", id: "abc" });
  });

  it("throws a clear error when the fhir -> X input is not valid JSON", () => {
    const gateway = new InteropGateway({ formats: [fakeHl7v2Plugin] });
    expect(() => gateway.translate("not json", { from: "fhir", to: "hl7v2" })).toThrow(
      /expects a FHIR resource\/Bundle serialized as a JSON string/,
    );
  });

  it("does not run structural validation on the fhir -> X direction", () => {
    const gateway = new InteropGateway({ formats: [fakeHl7v2Plugin] });
    expect(() =>
      gateway.translate(JSON.stringify({ resourceType: "Bundle" }), {
        from: "fhir",
        to: "hl7v2",
      }),
    ).not.toThrow();
  });

  it("throws a clear error when no plugin is registered for the fhir -> X target format", () => {
    const gateway = new InteropGateway({ formats: [] });
    expect(() =>
      gateway.translate(JSON.stringify({ resourceType: "Bundle" }), { from: "fhir", to: "hl7v2" }),
    ).toThrow(/No format plugin registered for "hl7v2"/);
  });
});

describe("InteropGateway.translate mapping trail", () => {
  // SYNTHETIC DATA ONLY — NOT REAL PHI
  const ADT_A01_SAMPLE = [
    "MSH|^~\\&|HIS|HOSP|ADT|HOSP|20240101120000||ADT^A01|MSG001|P|2.5",
    "EVN|A01|20240101120000||01|7802^Rivera^Carlos^^RN|20240101115500|HOSP",
    "PID|1||MRN12345^^^HOSP^MR||Doe^John^A||19800515|M|||123 Main St^^Springfield^IL^62701^USA||5559876543^PRN^PH",
    "PV1|1|I|ICU^101^A^^^HOSP||||1234^Smith^Jane^M^MD|5678^Johnson^Mary^R^MD",
  ].join("\r");

  it("surfaces the real formatHl7v2 plugin's mapping trail and warnings", () => {
    const gateway = new InteropGateway({ formats: [formatHl7v2] });
    const result = gateway.translate(ADT_A01_SAMPLE, { from: "hl7v2", to: "fhir" });
    expect((result.value as { resourceType: string }).resourceType).toBe("Bundle");
    expect(result.mappings.length).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

describe("InteropGateway.validate", () => {
  it("exposes structural validation directly", () => {
    const gateway = new InteropGateway();
    expect(gateway.validate(HL7V2_SAMPLE).valid).toBe(true);
  });
});
