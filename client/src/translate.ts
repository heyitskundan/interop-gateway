import { InteropGateway } from "@interop-gateway/core";
import { formatHl7v2 } from "@interop-gateway/format-hl7v2";

const gateway = new InteropGateway({ formats: [formatHl7v2] });

/** Pure translate step, separated from the App component so it's directly unit-testable
 * and so App.tsx only exports the component (keeps Vite's Fast Refresh happy). */
export function translateHl7v2ToFhir(input: string): { output: string } | { error: string } {
  try {
    const bundle = gateway.translate(input, { from: "hl7v2", to: "fhir" });
    return { output: JSON.stringify(bundle, null, 2) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Translation failed" };
  }
}
