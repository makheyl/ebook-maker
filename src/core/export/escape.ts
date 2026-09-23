const BACKSLASH = String.fromCharCode(92);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const UNSAFE_JSON_CHARS = new RegExp(`[<>&${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, 'g');

/**
 * Makes JSON safe to embed inside `<script type="application/json">`: every `<`, `>`, `&` and
 * the two JS line separators become \uXXXX escapes, so user text like `</script>` can never
 * close the tag early. The result is still valid JSON that parses to the same value.
 */
export function escapeJsonForHtml(json: string): string {
  return json.replace(
    UNSAFE_JSON_CHARS,
    (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** Guards inline <script>/<style> bodies (our own player code) against early termination. */
export function escapeInlineCode(code: string, tag: 'script' | 'style'): string {
  const closing = new RegExp(`</(${tag})`, 'gi');
  return code.replace(closing, `<${BACKSLASH}/$1`).replace(/<!--/g, `<${BACKSLASH}!--`);
}

/** File-system-safe name for downloads. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'book';
}
