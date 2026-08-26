import {
  translateToFhir as hl7ToFhir,
  translateFromFhir as hl7FromFhir,
  type TranslationResult,
} from "@interop-gateway/format-hl7v2";
import {
  translateToFhir as cdaToFhirFn,
  translateFromFhir as cdaFromFhirFn,
  type TranslateResult as CdaToFhirResult,
  type TranslateToCdaResult,
  type FhirBundle,
} from "@interop-gateway/format-cda";
import { GatewayError } from "@interop-gateway/core";
import type { DisplayResult, Direction, Format } from "./types.js";

export class TranslateError extends Error {
  constructor(
    message: string,
    public readonly context?: string,
  ) {
    super(message);
    this.name = "TranslateError";
  }
}

function normalizeHl7v2(result: TranslationResult): DisplayResult {
  return {
    translated: result.translated,
    mappings: result.mappings.map((m) => ({
      source: m.source,
      target: m.target,
      detail: m.note ?? m.value,
    })),
    warnings: result.warnings,
  };
}

function normalizeCdaToFhir(result: CdaToFhirResult): DisplayResult {
  return {
    translated: JSON.stringify(result.bundle, null, 2),
    mappings: result.mappings.map((m) => ({
      source: m.cdaPath,
      target: m.fhirPath,
      detail: m.resourceType,
    })),
    warnings: result.warnings.map((w) => `${w.path}: ${w.message}`),
  };
}

function normalizeCdaFromFhir(result: TranslateToCdaResult): DisplayResult {
  return {
    translated: result.xml,
    mappings: result.mappings.map((m) => ({
      source: m.cdaPath,
      target: m.fhirPath,
      detail: m.resourceType,
    })),
    warnings: result.warnings.map((w) => `${w.path}: ${w.message}`),
  };
}

/**
 * Runs entirely in the browser — both format packages behind this call parse the
 * string, return a string, and do no I/O, so nothing here ever leaves the tab.
 */
export function translate(input: string, format: Format, direction: Direction): DisplayResult {
  try {
    if (format === "hl7v2") {
      return normalizeHl7v2(direction === "toFhir" ? hl7ToFhir(input) : hl7FromFhir(input));
    }

    if (direction === "toFhir") {
      return normalizeCdaToFhir(cdaToFhirFn(input));
    }

    let bundle: FhirBundle;
    try {
      bundle = JSON.parse(input) as FhirBundle;
    } catch {
      throw new TranslateError("Input is not valid JSON");
    }
    return normalizeCdaFromFhir(cdaFromFhirFn(bundle));
  } catch (error) {
    if (error instanceof TranslateError) throw error;
    if (error instanceof GatewayError) throw new TranslateError(error.message, error.path);
    throw error;
  }
}
