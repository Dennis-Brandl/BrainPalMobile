// Utility to replace parameter chip placeholders in HTML content
// with resolved values from Value Properties.

/**
 * Replaces `<span data-param-chip="name.key">...</span>` with resolved values.
 * Falls back to `<name.key>` if no resolved value is available.
 */
export function replaceParamChips(
  html: string,
  resolvedParams: Record<string, string>,
): string {
  return html.replace(
    /<span\s+data-param-chip="([^"]+)"[^>]*>.*?<\/span>/g,
    (_match, nameKey: string) => {
      return resolvedParams[nameKey] ?? `&lt;${nameKey}&gt;`;
    },
  );
}
