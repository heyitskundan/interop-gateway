# @interop-gateway/validate-us-core

Required-element structural checks against a subset of
[US Core](http://hl7.org/fhir/us/core/) FHIR profiles, for
[interop-gateway](https://github.com/heyitskundan/interop-gateway).

## Scope — read before treating a pass as conformance

This package covers 15 resource types: `Patient`, `Condition`, `Observation`,
`AllergyIntolerance`, `Immunization`, `Procedure`, `Encounter`, `DiagnosticReport`,
`CareTeam`, `Coverage`, `Device`, `DocumentReference`, `Goal`, `ServiceRequest`,
`MedicationRequest` — chosen because they're the resource types this project's own
translators (`hl7-fhir-translator`, `cda-fhir-translator`) can produce.

For each, it checks that a small set of Must Support / minimum-cardinality elements are
present (see `src/rules.ts` for the exact list per resource type and the profile URL
each targets). These are this package's own reading of each profile's published
implementation guide — **they were not individually re-fetched and diffed against each
profile's StructureDefinition JSON** during this package's initial build, unlike
`hl7-fhir-translator`'s vocabulary tables, which were pulled directly from real IG
ConceptMap JSON. Treat a `valid: true` result as "the obviously-required fields are
present," not a certified US Core conformance result.

**Terminology binding is entirely out of scope.** This checks that `Observation.code`
exists, for example, not that its coding actually comes from the profile's required
LOINC/SNOMED ValueSet. A resource can pass every check here and still fail a real
conformance validator (like the official FHIR validator with the US Core IG loaded) on
terminology grounds.

A resource type with no rule table returns `{ supported: false, valid: true, issues: [] }`
— `valid: true` there means "nothing to check it against," not "confirmed conformant."
Check `supported` to tell the two cases apart.

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
