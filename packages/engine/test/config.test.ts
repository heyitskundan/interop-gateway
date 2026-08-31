import { describe, expect, it } from "vitest";
import { ValidationError } from "@interop-gateway/core";
import { loadPipelineConfig } from "../src/config.js";

describe("loadPipelineConfig", () => {
  it("parses a valid mllp -> http pipeline config", () => {
    const config = loadPipelineConfig(`
name: adt-to-ehr
format: hl7v2
source:
  protocol: mllp
  port: 2575
destination:
  protocol: http
  url: https://ehr.example.org/ingest
`);

    expect(config).toEqual({
      name: "adt-to-ehr",
      format: "hl7v2",
      source: { protocol: "mllp", port: 2575, host: undefined },
      destination: { protocol: "http", url: "https://ehr.example.org/ingest" },
    });
  });

  it("parses a valid http source with no path filter", () => {
    const config = loadPipelineConfig(`
name: any-path
format: hl7v2
source:
  protocol: http
  port: 8080
destination:
  protocol: file
  directory: /data/outbound
`);

    expect(config.source).toEqual({ protocol: "http", port: 8080, path: undefined });
  });

  it("parses a valid file -> file pipeline config with optional fields", () => {
    const config = loadPipelineConfig(`
name: cda-drop
format: cda
source:
  protocol: file
  directory: /data/inbound
  pollIntervalMs: 500
destination:
  protocol: file
  directory: /data/outbound
`);

    expect(config.source).toEqual({
      protocol: "file",
      directory: "/data/inbound",
      pollIntervalMs: 500,
    });
    expect(config.destination).toEqual({ protocol: "file", directory: "/data/outbound" });
  });

  it("throws ValidationError for invalid YAML", () => {
    expect(() => loadPipelineConfig("name: [unterminated")).toThrow(ValidationError);
  });

  it("throws ValidationError when name is missing", () => {
    expect(() =>
      loadPipelineConfig(
        "format: hl7v2\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: file\n  directory: /y",
      ),
    ).toThrow(/"name"/);
  });

  it("throws ValidationError for an unrecognized format", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: dicom\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: file\n  directory: /y",
      ),
    ).toThrow(/"format"/);
  });

  it("throws ValidationError for an unrecognized source protocol", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: carrier-pigeon\ndestination:\n  protocol: file\n  directory: /y",
      ),
    ).toThrow(/source\.protocol/);
  });

  it("throws ValidationError when a required source field is missing", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\ndestination:\n  protocol: file\n  directory: /y",
      ),
    ).toThrow(/source\.directory/);
  });

  it("throws ValidationError for an unrecognized destination protocol", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: carrier-pigeon",
      ),
    ).toThrow(/destination\.protocol/);
  });

  it("throws ValidationError when the top-level document isn't a mapping", () => {
    expect(() => loadPipelineConfig("- just\n- a\n- list")).toThrow(ValidationError);
  });

  it("parses routes with when/to and a catch-all rule", () => {
    const config = loadPipelineConfig(`
name: routed
format: hl7v2
source:
  protocol: file
  directory: /data/inbound
routes:
  - when:
      resourceType: Patient
    to:
      - protocol: file
        directory: /data/patients
      - protocol: http
        url: https://audit.example.org/ingest
  - to:
      - protocol: file
        directory: /data/other
`);

    expect(config.destination).toBeUndefined();
    expect(config.routes).toEqual([
      {
        when: { resourceType: "Patient" },
        to: [
          { protocol: "file", directory: "/data/patients" },
          { protocol: "http", url: "https://audit.example.org/ingest" },
        ],
      },
      { to: [{ protocol: "file", directory: "/data/other" }] },
    ]);
  });

  it("throws ValidationError when both destination and routes are set", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: file\n  directory: /y\nroutes:\n  - to:\n      - protocol: file\n        directory: /z",
      ),
    ).toThrow(/exactly one of "destination"\/"routes"/);
  });

  it("throws ValidationError when neither destination nor routes is set", () => {
    expect(() =>
      loadPipelineConfig("name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x"),
    ).toThrow(/exactly one of "destination"\/"routes"/);
  });

  it("throws ValidationError for an empty routes array", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\nroutes: []",
      ),
    ).toThrow(/"routes" must be a non-empty array/);
  });

  it("throws ValidationError when a route's to is missing or empty", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\nroutes:\n  - to: []",
      ),
    ).toThrow(/"routes\[0\]\.to" must have at least one destination/);
  });

  it("throws ValidationError when a route's when value isn't a string", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\nroutes:\n  - when:\n      resourceType: 5\n    to:\n      - protocol: file\n        directory: /y",
      ),
    ).toThrow(/routes\[0\]\.when\.resourceType/);
  });

  it("parses persistence.audit and persistence.deadLetter, each with an optional encryptPassphrase", () => {
    const config = loadPipelineConfig(`
name: x
format: hl7v2
source:
  protocol: file
  directory: /x
destination:
  protocol: file
  directory: /y
persistence:
  audit:
    directory: /var/audit
    encryptPassphrase: secret
  deadLetter:
    directory: /var/dlq
`);

    expect(config.persistence).toEqual({
      audit: { directory: "/var/audit", encryptPassphrase: "secret" },
      deadLetter: { directory: "/var/dlq" },
    });
  });

  it("persistence is omitted entirely when not set", () => {
    const config = loadPipelineConfig(
      "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: file\n  directory: /y",
    );

    expect(config.persistence).toBeUndefined();
  });

  it("throws ValidationError when persistence.audit is missing a directory", () => {
    expect(() =>
      loadPipelineConfig(
        "name: x\nformat: hl7v2\nsource:\n  protocol: file\n  directory: /x\ndestination:\n  protocol: file\n  directory: /y\npersistence:\n  audit: {}",
      ),
    ).toThrow(/"persistence\.audit\.directory" must be a non-empty string/);
  });
});
