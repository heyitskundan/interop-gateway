import {
  cdaToFhir,
  fhirToCda,
  TranslateError,
  type FhirBundle,
  type TranslateResult,
  type TranslateToCdaResult,
} from "cda-fhir-translator";
import { GatewayError } from "./errors.js";
import type { FormatPlugin, TranslationOutcome } from "./gateway.js";

export type { TranslateResult, TranslateToCdaResult, FhirBundle } from "cda-fhir-translator";

function wrapTranslationError(cause: unknown, code: string): never {
  if (cause instanceof TranslateError) {
    throw new GatewayError(cause.message, code, cause.path, cause);
  }
  const message = cause instanceof Error ? cause.message : "Translation failed";
  throw new GatewayError(message, code, undefined, cause);
}

/** Translates a C-CDA 2.1 XML document into a FHIR R4 Bundle. Returns the mapping trace
 * and warnings. Throws `GatewayError` on failure. */
export function translateToFhir(cdaXml: string): TranslateResult {
  try {
    return cdaToFhir(cdaXml);
  } catch (cause) {
    wrapTranslationError(cause, "CDA_TRANSLATION_FAILED");
  }
}

/** Translates a FHIR R4 Bundle into a C-CDA 2.1 XML document. Returns the mapping trace
 * and warnings. Throws `GatewayError` on failure. */
export function translateFromFhir(bundle: FhirBundle): TranslateToCdaResult {
  try {
    return fhirToCda(bundle);
  } catch (cause) {
    wrapTranslationError(cause, "FHIR_TRANSLATION_FAILED");
  }
}

/** `FormatPlugin` for C-CDA. `toFhir()`'s `value` is a parsed FHIR Bundle object;
 * `fromFhir()`'s `value` is a serialized C-CDA XML string. Both carry the mapping trace
 * and warnings from the underlying `cda-fhir-translator` call. */
export const formatCda: FormatPlugin = {
  name: "cda",
  toFhir(input: string): TranslationOutcome {
    const result = translateToFhir(input);
    return { value: result.bundle, mappings: result.mappings, warnings: result.warnings };
  },
  fromFhir(bundle: unknown): TranslationOutcome {
    const result = translateFromFhir(bundle as FhirBundle);
    return { value: result.xml, mappings: result.mappings, warnings: result.warnings };
  },
};
