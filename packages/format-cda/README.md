# @interop-gateway/format-cda

C-CDA ↔ FHIR R4 format plugin for [interop-gateway](https://github.com/heyitskundan/interop-gateway),
wrapping the published [`cda-fhir-translator`](https://github.com/heyitskundan/cda-fhir-translator)
package. This package adds no translation logic of its own — it registers
`cda-fhir-translator`'s deterministic mapper as an `@interop-gateway/core` `FormatPlugin`
and normalizes its errors to `GatewayError`.

## Coverage — read before relying on this for a document type you need

`cda-fhir-translator` is still work in progress. As of this package's `0.1.0`, the
underlying library covers 5 C-CDA sections both directions: **Allergies, Medications,
Problems, Results, Vital Signs**, always as a Continuity of Care Document (`fhirToCda`
has no `documentType` option yet — see that package's own roadmap). This wrapper tracks
the installed `cda-fhir-translator` version's coverage exactly; it narrows nothing and
adds nothing on top of it. Check `cda-fhir-translator`'s own CHANGELOG for what's
supported in the version you have installed before assuming a section is covered.

## Install

```bash
npm install @interop-gateway/core @interop-gateway/format-cda
```

## Use directly

```js
// JavaScript
import { translateToFhir, translateFromFhir } from "@interop-gateway/format-cda";

const { bundle, mappings, warnings } = translateToFhir(cdaXml);
```

```ts
// TypeScript
import { translateToFhir, type TranslateResult } from "@interop-gateway/format-cda";

const result: TranslateResult = translateToFhir(cdaXml);
```

## Use as a plugin

```js
import { InteropGateway } from "@interop-gateway/core";
import { formatCda } from "@interop-gateway/format-cda";

const gateway = new InteropGateway({ formats: [formatCda] });
const bundle = gateway.translate(cdaXml, { from: "cda", to: "fhir" });
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
