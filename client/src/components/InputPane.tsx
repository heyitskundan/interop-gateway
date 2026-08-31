import { useMemo, useRef } from "react";
import { highlightCda } from "../cda-highlight.js";
import { highlightHl7 } from "../hl7-highlight.js";
import { highlightJson } from "../json-highlight.js";
import type { Direction, Format } from "../types.js";
import { DetectionBadge } from "./DetectionBadge.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
  format: Format;
  direction: Direction;
  onSwitch: (next: { format?: Format; direction: Direction }) => void;
  onTranslate: () => void;
}

const PLACEHOLDER: Record<Format, Record<Direction, string>> = {
  hl7v2: {
    toFhir: "Paste an HL7v2 message…",
    fromFhir: "Paste a FHIR R4 resource or Bundle (JSON)…",
  },
  cda: { toFhir: "Paste C-CDA XML…", fromFhir: "Paste a FHIR R4 resource or Bundle (JSON)…" },
};

export function InputPane({ value, onChange, format, direction, onSwitch, onTranslate }: Props) {
  const highlightRef = useRef<HTMLPreElement>(null);
  // A native <textarea> can't color individual characters, so the visible text renders in a
  // highlighted <pre> underneath; the textarea sits on top with transparent text (but a real,
  // visible caret) so typing/selection/scrolling stay fully native — the classic
  // highlighted-textarea overlay technique.
  const highlighted = useMemo(() => {
    if (direction === "fromFhir") return highlightJson(value);
    return format === "hl7v2" ? highlightHl7(value) : highlightCda(value);
  }, [value, format, direction]);

  return (
    <div className="flex h-full flex-col gap-3 p-4 sm:p-6 lg:p-8">
      {/* Matches OutputPane's tab-bar row exactly (h-10, border-b) so both content boxes below start at the same y, not just end up the same height. */}
      <div
        className="flex h-10 shrink-0 items-center border-b"
        style={{ borderColor: "var(--color-divider)" }}
      >
        <DetectionBadge value={value} format={format} direction={direction} onSwitch={onSwitch} />
      </div>

      <div className="relative min-h-0 flex-1">
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-auto border border-transparent p-4 font-mono text-base leading-relaxed whitespace-pre-wrap break-words"
          style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            const pre = highlightRef.current;
            if (pre) {
              pre.scrollTop = e.currentTarget.scrollTop;
              pre.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onTranslate();
            }
          }}
          spellCheck={false}
          placeholder={PLACEHOLDER[format][direction]}
          className="input absolute inset-0 resize-none font-mono text-sm leading-relaxed whitespace-pre-wrap break-words !text-transparent placeholder:opacity-40"
          style={{ background: "transparent", caretColor: "var(--color-text)" }}
        />
      </div>
    </div>
  );
}
