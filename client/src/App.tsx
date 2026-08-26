import { useState } from "react";
import type { FormatName } from "@interop-gateway/core";
import { SAMPLE_ADT_A01, SAMPLE_CDA_CCD } from "./samples.js";
import { translateToFhir } from "./translate.js";

const SAMPLES: Record<FormatName, { label: string; input: string }> = {
  hl7v2: { label: "HL7v2 input", input: SAMPLE_ADT_A01 },
  cda: { label: "C-CDA XML input", input: SAMPLE_CDA_CCD },
};

export function App() {
  const [format, setFormat] = useState<FormatName>("hl7v2");
  const [input, setInput] = useState(SAMPLES.hl7v2.input);
  const [result, setResult] = useState<{ output: string } | { error: string } | null>(null);

  function handleFormatChange(next: FormatName): void {
    setFormat(next);
    setInput(SAMPLES[next].input);
    setResult(null);
  }

  return (
    <main>
      <h1>interop-gateway demo — HL7v2/C-CDA → FHIR</h1>
      <p>
        Sandbox demo only. Input is translated locally in your browser; nothing is sent anywhere.
        Paste a synthetic message — never real patient data.
      </p>
      <div className="controls">
        <fieldset>
          <legend>Source format</legend>
          <label>
            <input
              type="radio"
              name="format"
              value="hl7v2"
              checked={format === "hl7v2"}
              onChange={() => handleFormatChange("hl7v2")}
            />
            HL7v2
          </label>
          <label>
            <input
              type="radio"
              name="format"
              value="cda"
              checked={format === "cda"}
              onChange={() => handleFormatChange("cda")}
            />
            C-CDA
          </label>
        </fieldset>
        <button type="button" onClick={() => setResult(translateToFhir(input, format))}>
          Translate
        </button>
      </div>
      <div className="panes">
        <div>
          <label htmlFor="source-input">{SAMPLES[format].label}</label>
          <textarea
            id="source-input"
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
