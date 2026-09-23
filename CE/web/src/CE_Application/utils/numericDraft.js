/** Parse a complete numeric draft, accepting either dot or comma as the decimal separator. */
export function parseNumericDraft(raw) {
  const text = String(raw ?? '').trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(text)) return NaN;
  return Number(text.replace(',', '.'));
}
