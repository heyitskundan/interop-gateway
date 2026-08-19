export interface StructuralValidationResult {
  readonly valid: boolean;
  readonly format: "hl7v2" | "cda" | "unknown";
  readonly issues: readonly string[];
}

/**
 * First validation layer before anything is translated: does the input even look like
 * a well-formed HL7v2 message or C-CDA document. Deliberately shallow — deep structural
 * checks belong to `format-hl7v2`/`format-cda`, which already validate as part of
 * translation. This stage exists to fail fast on garbage input with a clear message
 * instead of an opaque parser error further down the pipeline.
 */
export function validateStructural(input: string): StructuralValidationResult {
  const trimmed = input.trim();

  if (trimmed.startsWith("MSH")) {
    const issues: string[] = [];
    const fieldSeparator = trimmed[3];
    if (!fieldSeparator || /[A-Za-z0-9]/.test(fieldSeparator)) {
      issues.push("MSH segment is missing its field separator character");
    }
    const segments = trimmed.split(/\r\n|\r|\n/).filter(Boolean);
    if (segments.length === 0) {
      issues.push("Message contains no segments");
    }
    return { valid: issues.length === 0, format: "hl7v2", issues };
  }

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<ClinicalDocument")) {
    const issues: string[] = [];
    if (!trimmed.includes("<ClinicalDocument")) {
      issues.push("Missing ClinicalDocument root element");
    }
    return { valid: issues.length === 0, format: "cda", issues };
  }

  return {
    valid: false,
    format: "unknown",
    issues: [
      "Unrecognized input — expected an HL7v2 message (starting with MSH|) or a C-CDA XML document",
    ],
  };
}
