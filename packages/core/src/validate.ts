export interface StructuralValidationResult {
  readonly valid: boolean;
  readonly format: "hl7v2" | "cda" | "unknown";
  readonly issues: readonly string[];
}

/** Checks whether a string is a structurally well-formed HL7v2 message or C-CDA
 * document. */
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
