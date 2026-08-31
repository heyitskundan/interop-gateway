import { describe, expect, it } from "vitest";
import { enforceTls } from "../src/tls.js";
import { TlsError } from "../src/errors.js";

describe("enforceTls", () => {
  it("passes through an https URL unchanged", () => {
    const parsed = enforceTls("https://sandbox.example.org/fhir/Patient/1");
    expect(parsed.protocol).toBe("https:");
  });

  it("rejects a plaintext http URL", () => {
    expect(() => enforceTls("http://sandbox.example.org/fhir/Patient/1")).toThrow(TlsError);
  });

  it("rejects a downgraded redirect target passed as a URL instance", () => {
    const downgraded = new URL("http://sandbox.example.org/fhir/Patient/1");
    expect(() => enforceTls(downgraded)).toThrow(TlsError);
  });

  it("never includes the path/query in the rejection message, only the origin", () => {
    try {
      enforceTls("http://sandbox.example.org/fhir/Patient/12345?ssn=123-45-6789"); // synthetic-pattern-for-detection-test
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TlsError);
      const message = (error as TlsError).message;
      expect(message).toContain("sandbox.example.org");
      expect(message).not.toContain("12345");
      expect(message).not.toContain("123-45-6789"); // synthetic-pattern-for-detection-test
    }
  });
});
