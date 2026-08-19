import {
  cdaToFhir,
  fhirToCda,
  TranslateError,
  type FhirBundle,
  type TranslateResult,
  type TranslateToCdaResult,
} from "cda-fhir-translator";
import { GatewayError, type FormatPlugin } from "@interop-gateway/core";

export type { TranslateResult, TranslateToCdaResult, FhirBundle } from "cda-fhir-translator";

function wrapTranslationError(cause: unknown, code: string): never {
  if (cause instanceof TranslateError) {
    throw new GatewayError(cause.message, code, cause.path, cause);
  }
  const message = cause instanceof Error ? cause.message : "Translation failed";
  throw new GatewayError(message, code, undefined, cause);
}

/**
 * Translates a C-CDA 2.1 XML document into a FHIR R4 Bundle, returning the mapping
 * trace and warnings alongside the result. Coverage is exactly whatever the installed
 * `cda-fhir-translator` version supports (currently: Allergies, Medications, Problems,
 * Results, Vital Signs) — this wrapper narrows nothing and adds nothing on top of it.
 * Always throws `GatewayError`, never the underlying library's raw error type.
 */
export function translateToFhir(cdaXml: string): TranslateResult {
  try {
    return cdaToFhir(cdaXml);
  } catch (cause) {
    wrapTranslationError(cause, "CDA_TRANSLATION_FAILED");
  }
}

/** Translates a FHIR R4 Bundle into a C-CDA 2.1 XML document, returning the mapping
 * trace and warnings alongside the result. */
export function translateFromFhir(bundle: FhirBundle): TranslateToCdaResult {
  try {
    return fhirToCda(bundle);
  } catch (cause) {
    wrapTranslationError(cause, "FHIR_TRANSLATION_FAILED");
  }
}

/**
 * The `FormatPlugin` this package exists to provide — register it with
 * `new InteropGateway({ formats: [formatCda] })` to enable `translate()` for C-CDA.
 * `toFhir()` returns the parsed FHIR Bundle object; `fromFhir()` takes a Bundle-shaped
 * object and returns a serialized C-CDA XML string.
 */
export const formatCda: FormatPlugin = {
  name: "cda",
  toFhir(input: string): unknown {
    return translateToFhir(input).bundle;
  },
  fromFhir(bundle: unknown): string {
    return translateFromFhir(bundle as FhirBundle).xml;
  },
};
