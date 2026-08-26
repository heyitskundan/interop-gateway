import { useState } from "react";
import { highlightBash } from "../../bash-highlight.js";
import { highlightCda } from "../../cda-highlight.js";
import { highlightHl7 } from "../../hl7-highlight.js";
import { highlightJs } from "../../js-highlight.js";
import { highlightJson } from "../../json-highlight.js";

type Lang = "js" | "ts" | "bash" | "json" | "xml" | "hl7" | "yaml" | "text";

interface Variant {
  readonly lang: Lang;
  readonly code: string;
}

type Props = { readonly lang?: Lang; readonly code: string } | { readonly variants: readonly Variant[] };

const HIGHLIGHT: Record<Lang, ((code: string) => string) | undefined> = {
  js: highlightJs,
  ts: highlightJs,
  bash: highlightBash,
  json: highlightJson,
  xml: highlightCda,
  hl7: highlightHl7,
  yaml: undefined,
  text: undefined,
};

const LANG_LABEL: Partial<Record<Lang, string>> = {
  js: "JS",
  ts: "TS",
  bash: "Shell",
  json: "JSON",
  xml: "XML",
  hl7: "HL7v2",
  yaml: "YAML",
};

/** A hairline "blueprint" panel with corner registration marks — the one decorative
 * motif this design system carries, used for every code sample and worked example in
 * the docs.
 *
 * Pass `code`/`lang` for a single block, or `variants` (e.g. the same example as both
 * `js` and `ts`) to render a tab strip that switches between them in place, instead of
 * stacking separate blocks for the same snippet. */
export function CodeBlock(props: Props) {
  const variants: readonly Variant[] = "variants" in props ? props.variants : [{ lang: props.lang ?? "text", code: props.code }];
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = variants[Math.min(active, variants.length - 1)]!;

  const highlighter = HIGHLIGHT[current.lang];
  const html = highlighter
    ? highlighter(current.code)
    : current.code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return (
    <div className="blueprint my-4 p-4" style={{ background: "var(--color-surface)" }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <div className="mb-2 flex items-center justify-between">
        {variants.length > 1 ? (
          <div className="flex gap-1" role="tablist" aria-label="Language">
            {variants.map((variant, i) => (
              <button
                key={variant.lang}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={i === active ? "tag tag-accent" : "tag tag-neutral"}
                style={{ cursor: "pointer", border: "none" }}
              >
                {LANG_LABEL[variant.lang] ?? variant.lang}
              </button>
            ))}
          </div>
        ) : (
          <span className="tag tag-neutral">{LANG_LABEL[current.lang] ?? ""}</span>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(current.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-muted flex items-center gap-1 border px-2 py-1 text-[11px] leading-none"
          style={{ borderColor: "var(--color-divider)" }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="overflow-x-auto pb-3 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
