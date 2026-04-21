function normalizeToken(value) {
  return String(value ?? '').trim();
}

export function normalizeEnumValues(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of Array.isArray(values) ? values : []) {
    const next = normalizeToken(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    result.push(next);
  }

  return result;
}

export function resolveEnumDefaultValue(values = [], defaultValue = '') {
  const normalizedValues = normalizeEnumValues(values);
  if (!normalizedValues.length) return '';

  const candidate = normalizeToken(defaultValue);
  if (candidate && normalizedValues.includes(candidate)) {
    return candidate;
  }

  return normalizedValues[0];
}

export function getEnumNormalizedValue(values = [], currentValue = '') {
  const normalizedValues = normalizeEnumValues(values);
  if (!normalizedValues.length) return 0;
  if (normalizedValues.length === 1) return 1;

  const resolvedValue = resolveEnumDefaultValue(normalizedValues, currentValue);
  const index = normalizedValues.indexOf(resolvedValue);
  if (index < 0) return 0;

  return index / (normalizedValues.length - 1);
}

export function getNextEnumValue(values = [], currentValue = '', wrap = false) {
  const normalizedValues = normalizeEnumValues(values);
  if (!normalizedValues.length) return '';

  const resolvedValue = resolveEnumDefaultValue(normalizedValues, currentValue);
  const currentIndex = normalizedValues.indexOf(resolvedValue);
  if (currentIndex < 0) return normalizedValues[0];

  const nextIndex = currentIndex + 1;
  if (nextIndex < normalizedValues.length) {
    return normalizedValues[nextIndex];
  }

  return wrap ? normalizedValues[0] : normalizedValues[normalizedValues.length - 1];
}
