# @interop-gateway/format-cda

C-CDA ↔ FHIR R4 format plugin for [interop-gateway](https://github.com/heyitskundan/interop-gateway),
wrapping the published [`cda-fhir-translator`](https://github.com/heyitskundan/cda-fhir-translator)
package. This package adds no translation logic of its own — it registers
`cda-fhir-translator`'s deterministic mapper as an `@interop-gateway/core` `FormatPlugin`
and normalizes its errors to `GatewayError`.

## Install

Not yet published to npm — see the [root README](../../README.md#install) for building
from source until then.

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

## Coverage

Tracks whatever C-CDA sections the installed `cda-fhir-translator` version supports —
see that package's own README for the current list. This wrapper does not narrow or
extend that coverage.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
