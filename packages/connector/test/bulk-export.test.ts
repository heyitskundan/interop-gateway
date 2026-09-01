import { describe, expect, it } from "vitest";
import { buildExportUrl, parseCompletedExportBody, parseNdjson } from "../src/bulk-export.js";
import { GatewayError } from "@interop-gateway/core";

describe("buildExportUrl", () => {
  const baseUrl = new URL("https://sandbox.example.org/fhir");

  it("system-level: path is $export", () => {
    const url = buildExportUrl(baseUrl, { level: "system" });
    expect(url.pathname).toBe("/fhir/$export");
  });

  it("patient-level: path is Patient/$export", () => {
    const url = buildExportUrl(baseUrl, { level: "patient" });
    expect(url.pathname).toBe("/fhir/Patient/$export");
  });

  it("group-level: path is Group/[id]/$export", () => {
    const url = buildExportUrl(baseUrl, { level: "group", groupId: "group-1" });
    expect(url.pathname).toBe("/fhir/Group/group-1/$export");
  });

  it("group-level without a groupId throws GatewayError", () => {
    expect(() => buildExportUrl(baseUrl, { level: "group" })).toThrow(GatewayError);
  });

  it("defaults _outputFormat to application/fhir+ndjson", () => {
    const url = buildExportUrl(baseUrl, { level: "system" });
    expect(url.searchParams.get("_outputFormat")).toBe("application/fhir+ndjson");
  });

  it("includes _type, _since, and _typeFilter when given", () => {
    const url = buildExportUrl(baseUrl, {
      level: "system",
      types: ["Patient", "Observation"],
      since: "2026-01-01T00:00:00Z",
      typeFilter: ["Patient?status=active", "Observation?status=final"],
    });

    expect(url.searchParams.get("_type")).toBe("Patient,Observation");
    expect(url.searchParams.get("_since")).toBe("2026-01-01T00:00:00Z");
    expect(url.searchParams.get("_typeFilter")).toBe(
      "Patient?status=active,Observation?status=final",
    );
  });

  it("omits _type/_since/_typeFilter when not given", () => {
    const url = buildExportUrl(baseUrl, { level: "system" });
    expect(url.searchParams.has("_type")).toBe(false);
    expect(url.searchParams.has("_since")).toBe(false);
    expect(url.searchParams.has("_typeFilter")).toBe(false);
  });

  it("respects a caller-supplied outputFormat", () => {
    const url = buildExportUrl(baseUrl, { level: "system", outputFormat: "application/ndjson" });
    expect(url.searchParams.get("_outputFormat")).toBe("application/ndjson");
  });
});

describe("parseCompletedExportBody", () => {
  it("parses a valid completed-export body", () => {
    const result = parseCompletedExportBody(
      {
        transactionTime: "2026-01-01T00:00:00Z",
        request: "https://sandbox.example.org/fhir/$export",
        requiresAccessToken: true,
        output: [{ type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" }],
      },
      "https://sandbox.example.org",
    );

    expect(result).toEqual({
      status: "completed",
      transactionTime: "2026-01-01T00:00:00Z",
      requiresAccessToken: true,
      output: [{ type: "Patient", url: "https://sandbox.example.org/files/patient.ndjson" }],
    });
  });

  it("includes deleted/error arrays when present", () => {
    const result = parseCompletedExportBody(
      {
        transactionTime: "2026-01-01T00:00:00Z",
        requiresAccessToken: false,
        output: [],
        deleted: [{ type: "Patient", url: "https://sandbox.example.org/files/deleted.ndjson" }],
        error: [{ type: "OperationOutcome", url: "https://sandbox.example.org/files/err.ndjson" }],
      },
      "https://sandbox.example.org",
    );

    expect(result).toMatchObject({
      deleted: [{ type: "Patient", url: "https://sandbox.example.org/files/deleted.ndjson" }],
      error: [{ type: "OperationOutcome", url: "https://sandbox.example.org/files/err.ndjson" }],
    });
  });

  it("throws GatewayError when required fields are missing", () => {
    expect(() =>
      parseCompletedExportBody(
        { transactionTime: "2026-01-01T00:00:00Z" },
        "https://x.example.org",
      ),
    ).toThrow(GatewayError);
  });
});

describe("parseNdjson", () => {
  it("parses one JSON value per non-blank line", () => {
    const text = '{"resourceType":"Patient","id":"1"}\n{"resourceType":"Patient","id":"2"}\n\n';
    expect(parseNdjson(text)).toEqual([
      { resourceType: "Patient", id: "1" },
      { resourceType: "Patient", id: "2" },
    ]);
  });

  it("returns an empty array for empty/whitespace-only text", () => {
    expect(parseNdjson("")).toEqual([]);
    expect(parseNdjson("   \n  \n")).toEqual([]);
  });
});
