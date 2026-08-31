import { describe, expect, it } from "vitest";

/**
 * Hits the real, public SMART Health IT reference sandbox (r4.smarthealthit.org) —
 * open read access, Synthea-generated synthetic patients only, no OAuth required for
 * reads. This verifies the FHIR request/response shape that `SmartClient.read()`/
 * `search()` are built against, using a live server rather than a mock.
 *
 * The full SMART backend-services OAuth handshake (`SmartClient` end-to-end, including
 * token exchange) requires a client registered against a sandbox — a manual,
 * interactive step per the "bring your own credentials" model documented in
 * `docs/vendor-onboarding.md` — and is not exercised here.
 *
 * Opt-in only (`RUN_LIVE_SANDBOX_TESTS=1`): an external network dependency this far
 * outside this repo's control has no place gating an automated pipeline — run
 * `RUN_LIVE_SANDBOX_TESTS=1 npm test -w packages/connector-smart-generic` to exercise
 * it deliberately.
 */
describe.skipIf(!process.env.RUN_LIVE_SANDBOX_TESTS)(
  "SMART Health IT reference sandbox (live network)",
  () => {
    const baseUrl = "https://r4.smarthealthit.org";

    it("returns a FHIR Bundle of synthetic Patient resources for a search", async () => {
      const response = await fetch(`${baseUrl}/Patient?_count=1`, {
        headers: { Accept: "application/fhir+json" },
      });
      expect(response.ok).toBe(true);

      const bundle = (await response.json()) as {
        resourceType: string;
        entry?: Array<{ resource: { resourceType: string } }>;
      };
      expect(bundle.resourceType).toBe("Bundle");
      expect(bundle.entry?.[0]?.resource.resourceType).toBe("Patient");
    });

    it("returns a single Patient resource for a read by id", async () => {
      const searchResponse = await fetch(`${baseUrl}/Patient?_count=1`, {
        headers: { Accept: "application/fhir+json" },
      });
      const bundle = (await searchResponse.json()) as {
        entry: Array<{ resource: { id: string } }>;
      };
      const id = bundle.entry[0]!.resource.id;

      const readResponse = await fetch(`${baseUrl}/Patient/${id}`, {
        headers: { Accept: "application/fhir+json" },
      });
      expect(readResponse.ok).toBe(true);

      const patient = (await readResponse.json()) as { resourceType: string; id: string };
      expect(patient.resourceType).toBe("Patient");
      expect(patient.id).toBe(id);
    });
  },
);
