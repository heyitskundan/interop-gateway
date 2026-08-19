import {
  translateHl7ToFhir,
  translateFhirToHl7,
  Hl7ParseError,
  FhirValidationError,
  type TranslationResult,
} from "hl7-fhir-translator";
import { GatewayError, type FormatPlugin } from "@interop-gateway/core";

export type { TranslationResult, Mapping, TranslationDirection } from "hl7-fhir-translator";

function wrapTranslationError(cause: unknown, code: string): never {
  const context =
    cause instanceof Hl7ParseError || cause instanceof FhirValidationError
      ? cause.context
      : undefined;
  const message = cause instanceof Error ? cause.message : "Translation failed";
  throw new GatewayError(message, code, context, cause);
}

/** Translates a raw HL7v2 message into a FHIR R4 Bundle, returning the mapping trail and
 * warnings alongside the result. Always throws `GatewayError` (never the underlying
 * library's raw error type) so callers only need to handle one error shape across every
 * format plugin. */
export function translateToFhir(rawHl7: string): TranslationResult {
  try {
    return translateHl7ToFhir(rawHl7);
  } catch (cause) {
    wrapTranslationError(cause, "HL7V2_TRANSLATION_FAILED");
  }
}

/** Translates a FHIR R4 resource/Bundle (JSON string) into an HL7v2 message, returning
 * the mapping trail and warnings alongside the result. */
export function translateFromFhir(rawFhirJson: string): TranslationResult {
  try {
    return translateFhirToHl7(rawFhirJson);
  } catch (cause) {
    wrapTranslationError(cause, "FHIR_TRANSLATION_FAILED");
  }
}

/**
 * The `FormatPlugin` this package exists to provide — register it with
 * `new InteropGateway({ formats: [formatHl7v2] })` to enable `translate()` for HL7v2.
 * `toFhir()` returns the parsed FHIR Bundle object (not the JSON string); `fromFhir()`
 * takes a Bundle-shaped object and returns a serialized HL7v2 message string.
 */
export const formatHl7v2: FormatPlugin = {
  name: "hl7v2",
  toFhir(input: string): unknown {
    return JSON.parse(translateToFhir(input).translated);
  },
  fromFhir(bundle: unknown): string {
    return translateFromFhir(JSON.stringify(bundle)).translated;
  },
};
