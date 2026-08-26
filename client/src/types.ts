export type Format = "hl7v2" | "cda";
export type Direction = "toFhir" | "fromFhir";

/** One field-level translation step, normalized across both format packages' own
 * (differently-shaped) mapping trail types — hl7v2's `{source, target, value, note}`
 * and cda's `{cdaPath, fhirPath, resourceType}`. */
export interface NormalizedMapping {
  readonly source: string;
  readonly target: string;
  readonly detail?: string;
}

/** Both format packages' translate functions, normalized to one display shape. */
export interface DisplayResult {
  readonly translated: string;
  readonly mappings: readonly NormalizedMapping[];
  readonly warnings: readonly string[];
}
