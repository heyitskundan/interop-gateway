import { InteropGateway, type FormatName } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";
import { formatCda } from "@interop-gateway/format-cda";

const gateway = new InteropGateway({ formats: [formatHl7v2, formatCda] });

/** Translates `input` (an HL7v2 message or C-CDA XML document, per `format`) to a FHIR
 * Bundle using `InteropGateway`, locally in the browser. */
export function translateToFhir(
  input: string,
  format: FormatName,
): { output: string } | { error: string } {
  try {
    const bundle = gateway.translate(input, { from: format, to: "fhir" });
    return { output: JSON.stringify(bundle, null, 2) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Translation failed" };
  }
}
