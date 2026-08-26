// Operates on the already-HTML-escaped string, so tag/bracket delimiters are matched as
// &lt;/&gt; rather than literal </> — escaping runs first (below) for the same injection
// safety reason the other highlighters escape first, which means the raw < and > are
// gone by the time this regex runs.
const XML_TOKEN =
  /(?<comment>&lt;!--[\s\S]*?--&gt;)|(?<tag>&lt;\/?[A-Za-z][\w:.-]*)|(?<attrname>\s[A-Za-z_:][\w:.-]*(?=="))|(?<attrvalue>"[^"]*")|(?<bracket>\/?&gt;)/g;

/**
 * Syntax-highlights a C-CDA XML document for display, using the same VS Code-style
 * token colors as the JSON/JS/Bash highlighters elsewhere in the docs: tags, attribute
 * names, attribute values, and `<!-- -->` comments each get their own color. Single-pass
 * tokenizer, not an XML parser — good enough for a document rendered read-only, not a
 * guarantee against every valid XML construct. HTML-escapes first, same safety rule as
 * the other highlighters — attribute/text values can contain arbitrary translated
 * content (e.g. a patient name).
 */
export function highlightCda(xml: string): string {
  const escaped = xml.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(XML_TOKEN, (match, ...rest) => {
    const groups = rest[rest.length - 1] as Record<string, string | undefined>;
    if (groups.comment) return `<span class="cda-comment">${match}</span>`;
    if (groups.tag) return `<span class="cda-tag">${match}</span>`;
    if (groups.attrname) {
      const lead = match.match(/^\s/)?.[0] ?? "";
      return `${lead}<span class="cda-attr-name">${match.slice(lead.length)}</span>`;
    }
    if (groups.attrvalue) return `<span class="cda-attr-value">${match}</span>`;
    if (groups.bracket) return `<span class="cda-delim">${match}</span>`;
    return match;
  });
}
