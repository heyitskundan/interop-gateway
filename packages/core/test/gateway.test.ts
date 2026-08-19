import { describe, expect, it } from "vitest";
import { InteropGateway, type FormatPlugin } from "../src/gateway.js";
import { GatewayError } from "../src/errors.js";

const fakeHl7v2Plugin: FormatPlugin = {
  name: "hl7v2",
  toFhir: (input) => ({ resourceType: "Bundle", sourceLength: input.length }),
  fromFhir: () => "MSH|^~\\&|...",
};

const HL7V2_SAMPLE = "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260101120000||ADT^A01|1|P|2.5";

describe("InteropGateway.translate", () => {
  it("routes to the matching format plugin's toFhir() after structural validation", () => {
    const gateway = new InteropGateway({ formats: [fakeHl7v2Plugin] });
    const result = gateway.translate(HL7V2_SAMPLE, { from: "hl7v2", to: "fhir" });
    expect(result).toEqual({ resourceType: "Bundle", sourceLength: HL7V2_SAMPLE.length });
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
});

describe("InteropGateway.validate", () => {
  it("exposes structural validation directly", () => {
    const gateway = new InteropGateway();
    expect(gateway.validate(HL7V2_SAMPLE).valid).toBe(true);
  });
});
