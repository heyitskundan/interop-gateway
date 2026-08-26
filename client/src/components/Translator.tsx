import { useCallback, useState } from "react";
import { translate, TranslateError } from "../api.js";
import { SAMPLES } from "../samples.js";
import type { DisplayResult, Direction, Format } from "../types.js";
import { DirectionToggle } from "./DirectionToggle.js";
import { FormatToggle } from "./FormatToggle.js";
import { InputPane } from "./InputPane.js";
import { OutputPane } from "./OutputPane.js";
import { SampleMessages } from "./SampleMessages.js";

export function Translator() {
  const [format, setFormat] = useState<Format>("hl7v2");
  const [direction, setDirection] = useState<Direction>("toFhir");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<DisplayResult | undefined>();
  const [error, setError] = useState<TranslateError | undefined>();

  const handleTranslate = useCallback(() => {
    if (input.trim() === "") return;
    try {
      setResult(translate(input, format, direction));
      setError(undefined);
    } catch (err) {
      setResult(undefined);
      setError(err instanceof TranslateError ? err : new TranslateError("Unexpected error"));
    }
  }, [input, format, direction]);

  const resetOutput = useCallback(() => {
    setResult(undefined);
    setError(undefined);
  }, []);

  const handleFormatChange = useCallback(
    (f: Format) => {
      setFormat(f);
      resetOutput();
    },
    [resetOutput],
  );

  const handleDirectionChange = useCallback(
    (d: Direction) => {
      setDirection(d);
      resetOutput();
    },
    [resetOutput],
  );

  const handleSwitch = useCallback(
    (next: { format?: Format; direction: Direction }) => {
      if (next.format) setFormat(next.format);
      setDirection(next.direction);
      resetOutput();
    },
    [resetOutput],
  );

  const handleSampleSelect = useCallback((index: number) => {
    const sample = SAMPLES[index];
    if (!sample) return;
    setFormat(sample.format);
    setDirection(sample.direction);
    setInput(sample.content);
    setResult(undefined);
    setError(undefined);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 lg:px-8"
        style={{ borderColor: "var(--color-divider)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <FormatToggle format={format} onChange={handleFormatChange} />
          <DirectionToggle format={format} direction={direction} onChange={handleDirectionChange} />
        </div>
        <SampleMessages format={format} direction={direction} onSelect={handleSampleSelect} />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <InputPane
            value={input}
            onChange={setInput}
            format={format}
            direction={direction}
            onSwitch={handleSwitch}
            onTranslate={handleTranslate}
          />
        </div>
        <div className="min-w-0 flex-1">
          <OutputPane result={result} error={error} />
        </div>

        <button
          type="button"
          onClick={handleTranslate}
          disabled={input.trim() === ""}
          title="Translate (⌘⏎)"
          aria-label="Translate"
          className="absolute top-1/2 left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 text-2xl leading-none shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          style={{
            borderColor: "var(--color-bg)",
            background: "var(--color-accent)",
            color: "var(--color-bg)",
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
