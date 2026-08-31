# @interop-gateway/validate-us-core

Required-element, max-cardinality, and fixed-code-binding checks against a pluggable set
of [US Core](http://hl7.org/fhir/us/core/) FHIR profiles, for
[interop-gateway](https://github.com/heyitskundan/interop-gateway).

## Scope — read before treating a pass as conformance

This package ships built-in rules for 15 resource types: `Patient`, `Condition`,
`Observation`, `AllergyIntolerance`, `Immunization`, `Procedure`, `Encounter`,
`DiagnosticReport`, `CareTeam`, `Coverage`, `Device`, `DocumentReference`, `Goal`,
`ServiceRequest`, `MedicationRequest` — chosen because they're the resource types this
project's own translators (`hl7-fhir-translator`, `cda-fhir-translator`) can produce.
More can be added at runtime — see "Pluggability" below.

For each, it checks three things (see `src/rules.ts` for the exact list per resource
type and the profile URL each targets):

1. **Required-element presence** — a small set of Must Support / minimum-cardinality
   elements are present (arrays checked for at least one entry).
2. **Max cardinality** — for elements declared `0..1`/`1..1`, the JSON value is shaped
   correctly (a singular element must never serialize as an array). This only catches
   the singular-should-not-be-array direction — an unbounded (`0..*`/`1..*`) element
   always serializes as a JSON array regardless of how many entries it holds, so there's
   no finite max on that side to violate.
3. **Fixed code-value binding** — for `status`/`intent`/`lifecycleStatus` fields bound
   with **required** strength to one of FHIR R4's own small fixed enumerations (e.g.
   `Observation.status` must be one of 8 specific codes), the value is checked against
   that list.

These are this package's own reading of each profile's published implementation guide —
**they were not individually re-fetched and diffed against each profile's
StructureDefinition JSON** during this package's initial build, unlike
`hl7-fhir-translator`'s vocabulary tables, which were pulled directly from real IG
ConceptMap JSON. Treat a `valid: true` result as "the obviously-required fields are
present, correctly shaped, and (for the handful of fields checked) using a valid fixed
code," not a certified US Core conformance result.

**Terminology bound to an external code system is still entirely out of scope.** This
checks that `Observation.code` exists, for example, not that its coding actually comes
from the profile's required LOINC ValueSet — verifying that would require the actual
ValueSet contents (LOINC/SNOMED CT/RxNorm), which this package doesn't ship and won't
fabricate. Only the small, fixed, R4-base-spec enumerations listed above are checked. A
resource can pass every check here and still fail a real conformance validator (like the
official FHIR validator with the US Core IG loaded) on LOINC/SNOMED terminology grounds.

A resource type with no rule table returns `{ supported: false, valid: true, issues: [] }`
— `valid: true` there means "nothing to check it against," not "confirmed conformant."
Check `supported` to tell the two cases apart.

## Pluggability

The 15 built-in profiles aren't a closed set — `registerProfile()` adds a rule for a
resource type this package doesn't ship one for (a custom IG, a state-specific profile,
your organization's stricter local variant), or overrides a built-in rule outright:

```ts
import {
  registerProfile,
  unregisterProfile,
  listRegisteredProfiles,
} from "@interop-gateway/validate-us-core";

registerProfile("Basic", {
  profile: "https://example.org/fhir/StructureDefinition/my-custom-profile",
  required: [{ path: "code", max: 1, description: "Basic.code" }],
});

listRegisteredProfiles(); // includes "Basic" now, alongside the 15 built-ins
unregisterProfile("Basic"); // back to supported: false for Basic
```

Registration takes effect immediately — no rebuild, no reload. `resetProfiles()`
discards every custom registration/removal and restores exactly the built-in table
(mainly useful between tests).

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source until then.

```bash
npm install @interop-gateway/validate-us-core
```

## Use

```ts
import { validateUsCore, validateUsCoreBundle } from "@interop-gateway/validate-us-core";

const result = validateUsCore(patientResource);
if (!result.valid) {
  console.error(result.issues);
}

// Or validate every resource in a Bundle at once:
const results = validateUsCoreBundle(fhirBundle);
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
