import type { Direction, Format } from "../types.js";

interface Props {
  format: Format;
  direction: Direction;
  onChange: (direction: Direction) => void;
}

const LABELS: Record<Format, Record<Direction, string>> = {
  hl7v2: { toFhir: "HL7v2 → FHIR", fromFhir: "FHIR → HL7v2" },
  cda: { toFhir: "C-CDA → FHIR", fromFhir: "FHIR → C-CDA" },
};

export function DirectionToggle({ format, direction, onChange }: Props) {
  return (
    <div className="seg" role="radiogroup" aria-label="Translation direction">
      {(["toFhir", "fromFhir"] as const).map((value) => (
        <label key={value} className="seg-opt">
          <input
            type="radio"
            name="direction"
            checked={direction === value}
            onChange={() => onChange(value)}
          />
          {LABELS[format][value]}
        </label>
      ))}
    </div>
  );
}
