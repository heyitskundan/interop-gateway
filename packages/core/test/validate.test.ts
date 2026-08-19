import { describe, expect, it } from "vitest";
import { validateStructural } from "../src/validate.js";

describe("validateStructural", () => {
  it("recognizes a well-formed HL7v2 message", () => {
    const message =
      "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260101120000||ADT^A01|1|P|2.5\rPID|1||123^^^MRN";
    const result = validateStructural(message);
    expect(result).toEqual({ valid: true, format: "hl7v2", issues: [] });
  });

  it("flags an HL7v2 message missing its field separator", () => {
    const result = validateStructural("MSH");
    expect(result.format).toBe("hl7v2");
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("MSH segment is missing its field separator character");
  });

  it("recognizes a well-formed C-CDA document", () => {
    const doc = '<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3"></ClinicalDocument>';
    const result = validateStructural(doc);
    expect(result).toEqual({ valid: true, format: "cda", issues: [] });
  });

  it("flags XML that declares itself but has no ClinicalDocument root", () => {
    const result = validateStructural('<?xml version="1.0"?><NotClinicalDocument/>');
    expect(result.format).toBe("cda");
    expect(result.valid).toBe(false);
  });

  it("rejects unrecognized input", () => {
    const result = validateStructural('{ "resourceType": "Patient" }');
    expect(result).toEqual({
      valid: false,
      format: "unknown",
      issues: [
        "Unrecognized input — expected an HL7v2 message (starting with MSH|) or a C-CDA XML document",
      ],
    });
  });
});
