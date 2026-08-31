import { describe, expect, it } from "vitest";
import { assertNotRawCredential } from "../src/secrets.js";
import { GatewayError } from "../src/errors.js";

describe("assertNotRawCredential", () => {
  it("allows an ordinary secrets-provider reference name", () => {
    expect(() =>
      assertNotRawCredential("prod/epic/client-secret", "clientSecretRef"),
    ).not.toThrow();
  });

  it("rejects a raw PEM private key passed directly as config", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIExample==\n-----END PRIVATE KEY-----"; // synthetic-pattern-for-detection-test
    expect(() => assertNotRawCredential(pem, "privateKey")).toThrow(GatewayError);
  });

  it("rejects a raw AWS access key ID passed directly as config", () => {
    expect(() => assertNotRawCredential("AKIAABCDEFGHIJKLMNOP", "awsKey")).toThrow(GatewayError); // synthetic-pattern-for-detection-test
  });
});
