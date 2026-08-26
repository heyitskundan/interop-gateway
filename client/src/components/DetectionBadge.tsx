import { useMemo } from "react";
import type { Direction, Format } from "../types.js";

interface Props {
  value: string;
  format: Format;
  direction: Direction;
  onSwitch: (next: { format?: Format; direction: Direction }) => void;
}

interface Detected {
  readonly label: string;
  readonly format?: Format;
  readonly direction: Direction;
}

/** Shape-only detection: `MSH|` → HL7v2, `<` → C-CDA XML, `{` → FHIR JSON (format
 * ambiguous from shape alone — a Bundle looks the same whether it's headed back to
 * HL7v2 or C-CDA, so only `direction` is inferred there, not `format`). */
function detect(value: string): Detected | undefined {
  const trimmed = value.trimStart();
  if (trimmed.startsWith("MSH|")) return { label: "Detected: HL7v2 message", format: "hl7v2", direction: "toFhir" };
  if (trimmed.startsWith("<")) return { label: "Detected: C-CDA XML", format: "cda", direction: "toFhir" };
  if (trimmed.startsWith("{")) return { label: "Detected: FHIR JSON", direction: "fromFhir" };
  return undefined;
}

export function DetectionBadge({ value, format, direction, onSwitch }: Props) {
  const detected = useMemo(() => (value.trim() === "" ? undefined : detect(value)), [value]);

  if (!detected) {
    return value.trim() === "" ? null : (
      <span className="tag tag-neutral">
        Doesn&apos;t look like HL7v2, C-CDA XML, or a FHIR JSON Bundle
      </span>
    );
  }

  const mismatch =
    detected.direction !== direction || (detected.format !== undefined && detected.format !== format);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="tag tag-accent">{detected.label}</span>
      {mismatch && (
        <button
          type="button"
          onClick={() => onSwitch({ format: detected.format, direction: detected.direction })}
          className="btn"
          style={{ padding: "2px 8px", fontSize: 12 }}
        >
          Switch to match →
        </button>
      )}
    </div>
  );
}
