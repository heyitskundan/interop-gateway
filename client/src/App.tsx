import { useState } from "react";
import { SAMPLE_ADT_A01 } from "./samples.js";
import { translateHl7v2ToFhir } from "./translate.js";

export function App() {
  const [input, setInput] = useState(SAMPLE_ADT_A01);
  const [result, setResult] = useState<{ output: string } | { error: string } | null>(null);

  return (
    <main>
      <h1>interop-gateway demo — HL7v2 → FHIR</h1>
      <p>
        Sandbox demo only. Input is translated locally in your browser; nothing is sent anywhere.
        Paste a synthetic HL7v2 message — never real patient data.
      </p>
      <button type="button" onClick={() => setResult(translateHl7v2ToFhir(input))}>
        Translate
      </button>
      <div className="panes">
        <div>
          <label htmlFor="hl7-input">HL7v2 input</label>
          <textarea
            id="hl7-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="fhir-output">FHIR output</label>
          {result && "error" in result ? (
            <pre id="fhir-output" className="error" role="alert">
              {result.error}
            </pre>
          ) : (
            <pre id="fhir-output">{result?.output ?? ""}</pre>
          )}
        </div>
      </div>
    </main>
  );
}
