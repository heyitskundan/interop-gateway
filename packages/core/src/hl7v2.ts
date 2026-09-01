import {
  translateHl7ToFhir,
  translateFhirToHl7,
  Hl7ParseError,
  FhirValidationError,
  type TranslationResult,
} from "hl7-fhir-translator";
import { GatewayError } from "./errors.js";
import type { FormatPlugin, TranslationOutcome } from "./gateway.js";

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

/** `FormatPlugin` for HL7v2. `toFhir()`'s `value` is a parsed FHIR Bundle object;
 * `fromFhir()`'s `value` is a serialized HL7v2 message string. Both carry the mapping
 * trail and warnings from the underlying `hl7-fhir-translator` call. */
export const formatHl7v2: FormatPlugin = {
  name: "hl7v2",
  toFhir(input: string): TranslationOutcome {
    const result = translateToFhir(input);
    return {
      value: JSON.parse(result.translated),
      mappings: result.mappings,
      warnings: result.warnings,
    };
  },
  fromFhir(bundle: unknown): TranslationOutcome {
    const result = translateFromFhir(JSON.stringify(bundle));
    return { value: result.translated, mappings: result.mappings, warnings: result.warnings };
  },
};
