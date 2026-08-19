# @interop-gateway/format-hl7v2

HL7v2 ↔ FHIR R4 format plugin for [interop-gateway](https://github.com/heyitskundan/interop-gateway),
wrapping the published [`hl7-fhir-translator`](https://github.com/heyitskundan/hl7-fhir-translator)
package. This package adds no translation logic of its own — it registers
`hl7-fhir-translator`'s deterministic mapper as an `@interop-gateway/core` `FormatPlugin`
and normalizes its errors to `GatewayError`.

## Install

```bash
npm install @interop-gateway/core @interop-gateway/format-hl7v2
```

## Use directly

```js
// JavaScript
import { translateToFhir, translateFromFhir } from "@interop-gateway/format-hl7v2";

const { translated, mappings, warnings } = translateToFhir(hl7v2Message);
```

```ts
// TypeScript
import { translateToFhir, type TranslationResult } from "@interop-gateway/format-hl7v2";

const result: TranslationResult = translateToFhir(hl7v2Message);
```

## Use as a plugin

```js
import { InteropGateway } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";

const gateway = new InteropGateway({ formats: [formatHl7v2] });
const bundle = gateway.translate(hl7v2Message, { from: "hl7v2", to: "fhir" });
```

## Coverage

Tracks whatever message types the installed `hl7-fhir-translator` version supports —
see that package's own README for the current list. This wrapper does not narrow or
extend that coverage.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
