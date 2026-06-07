// Shared label/formatting helpers for the Device Profile Designer screens — single source so the
// wording stays consistent (previously byteOrderLabel disagreed between screens) and the SysEx-
// template substitution isn't copy-pasted across Overview / Device structure / Message shapes.

export function familyLabel(model) {
  return model?.inherits ? model.inherits.charAt(0).toUpperCase() + model.inherits.slice(1) : (model?.manufacturer ?? 'Custom');
}

export function byteOrderLabel(b) {
  return b === 'msb-first' ? 'MSB first' : b === 'lsb-first' ? 'LSB first' : (b ?? '—');
}

export function checksumLabel(c) {
  return c?.type === 'roland-7bit' ? 'Roland · (128 − Σ) mod 128' : (c?.type ?? 'none');
}

export function shapeById(merged, id) {
  return (merged?.messageShapes ?? []).find((s) => s.id === id) ?? null;
}

// Substitute a message-shape template's tokens with resolved values / placeholders.
export function shapeTemplate(shape, merged) {
  return (shape?.template ?? []).map((t) =>
    t === '$deviceId' ? merged?.deviceId
      : t === '$modelId' ? merged?.modelId
      : t === '$address' ? '[addr]'
      : t === '$encodedValue' ? '[value]'
      : t === '$size' ? '[size]'
      : t === '$checksum' ? '[sum]'
      : t
  ).join(' ');
}
