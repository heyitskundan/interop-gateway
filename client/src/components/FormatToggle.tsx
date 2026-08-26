import type { Format } from "../types.js";

interface Props {
  format: Format;
  onChange: (format: Format) => void;
}

export function FormatToggle({ format, onChange }: Props) {
  return (
    <div className="seg" role="radiogroup" aria-label="Source format">
      {(
        [
          { value: "hl7v2", label: "HL7v2" },
          { value: "cda", label: "C-CDA" },
        ] as const
      ).map((opt) => (
        <label key={opt.value} className="seg-opt">
          <input
            type="radio"
            name="format"
            checked={format === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
