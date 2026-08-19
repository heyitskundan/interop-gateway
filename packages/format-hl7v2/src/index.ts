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

/** Translates a raw HL7v2 message into a FHIR R4 Bundle. Returns the mapping trail and
 * warnings. Throws `GatewayError` on failure. */
export function translateToFhir(rawHl7: string): TranslationResult {
  try {
    return translateHl7ToFhir(rawHl7);
  } catch (cause) {
    wrapTranslationError(cause, "HL7V2_TRANSLATION_FAILED");
  }
}

/** Translates a FHIR R4 resource/Bundle (JSON string) into an HL7v2 message. Returns the
 * mapping trail and warnings. Throws `GatewayError` on failure. */
export function translateFromFhir(rawFhirJson: string): TranslationResult {
  try {
    return translateFhirToHl7(rawFhirJson);
  } catch (cause) {
    wrapTranslationError(cause, "FHIR_TRANSLATION_FAILED");
  }
}

/** `FormatPlugin` for HL7v2. `toFhir()` returns a parsed FHIR Bundle object; `fromFhir()`
 * returns a serialized HL7v2 message string. */
export const formatHl7v2: FormatPlugin = {
  name: "hl7v2",
  toFhir(input: string): unknown {
    return JSON.parse(translateToFhir(input).translated);
  },
  fromFhir(bundle: unknown): string {
    return translateFromFhir(JSON.stringify(bundle)).translated;
  },
};
