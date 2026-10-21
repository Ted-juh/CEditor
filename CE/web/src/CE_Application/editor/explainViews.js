// explainViews.js — the Values sidebar's drawings of what a call does with its values, laid out from
// what the core read (scripting/bitFields.js, scripting/callExplainers.js): which cell is marked,
// where an arrow starts and ends, what each row is labelled. docs/design/api-descriptions-handoff.md,
// "The Values sidebar and the hint".
//
// Nothing here works out what a call does; that is the core's, in the runtime's arithmetic. This only
// turns it into rows of cells and positions. Pure, so the layout is tested without a browser.

export const hex2 = (n) => `0x${Number(n).toString(16).toUpperCase().padStart(2, '0')}`;

/** A cell's centre along a row of cells `size` wide with `gap` between them, from the row's left. */
export const cellCentre = (i, size, gap) => i * (size + gap) + size / 2;

const byteOf = (cells, key) => {
  let n = 0;
  for (const cell of cells) {
    const v = cell[key];
    if (v === null || v === undefined) return null;
    n = n * 2 + v;
  }
  return n;
};

/**
 * getBits and setBits as rows, one block a byte (highest bit first, as a byte is written):
 *
 *   value   the byte as it is, the field outlined          label: its hex
 *   numbers the bit numbers, the field's in its colour
 *   arrow   from the start bit to the left, over `count` bits (a dot where it starts, a head where it ends)
 *   new     setBits' new setting under the field          label: its hex
 *   result  the byte it makes (setBits), or the setting read moved down to bit 0 (getBits)
 *
 * Cells whose value is not known are empty. Returns null for a call with nothing to draw.
 */
export function bitRows(bits) {
  if (!bits?.groups?.length) return null;
  const { start, count, verb } = bits;
  const end = start + count - 1;
  const setting = verb === 'ce.midi.setBits';
  const groups = bits.groups.map((group) => {
    const cells = group.cells.map((c) => ({
      bit: c.bit,
      field: c.field,
      before: c.was !== undefined && c.was !== null ? c.was : c.v,
      after: c.v,
      // setBits' new bit, under the field only.
      put: setting && c.field && bits.bits !== null && bits.bits !== undefined ? Math.floor(bits.bits / 2 ** (c.bit - start)) % 2 : null,
    }));
    const field = cells.map((c, i) => (c.field ? i : -1)).filter((i) => i >= 0);
    const arrow = field.length
      ? { left: Math.min(...field), right: Math.max(...field), dot: cells.some((c) => c.bit === start), head: cells.some((c) => c.bit === end) }
      : null;
    const before = byteOf(cells, 'before');
    const after = byteOf(cells, 'after');
    return {
      label: group.label,
      cells,
      arrow,
      beforeHex: before === null ? '' : hex2(before),
      afterHex: after === null ? '' : hex2(after),
      hasPut: cells.some((c) => c.put !== null),
    };
  });
  const out = { verb: setting ? 'set' : 'get', start, count, groups, bitsHex: '', result: null, read: null, readCells: null };
  if (setting && bits.bits !== null && bits.bits !== undefined) out.bitsHex = hex2(bits.bits);
  if (setting && bits.result !== null && bits.result !== undefined) out.result = true;
  if (!setting && bits.read !== null && bits.read !== undefined) {
    out.read = { value: bits.read, hex: hex2(bits.read) };
    // The setting read, moved down to bit 0: drawn as a byte when it fits in one.
    if (count <= 8) {
      out.readCells = [7, 6, 5, 4, 3, 2, 1, 0].map((b) => ({ bit: b, v: Math.floor(bits.read / 2 ** b) % 2, field: b < count }));
    }
  }
  return out;
}

/** A number as a row shows it: whole numbers as they are, others to two places (or none past 100). */
export function shownResult(n) {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  return `≈ ${r}`;
}

/**
 * scale's two number lines, `width` wide with `pad` at each end: where the value sits on the first
 * and where it lands on the second, held at the ends when it is outside (`outside` says so).
 */
export function rangeLines(explain, width = 260, pad = 18) {
  if (!explain || explain.kind !== 'ranges') return null;
  const span = width - 2 * pad;
  const x = explain.at === null ? null : pad + Math.max(0, Math.min(1, explain.at)) * span;
  return {
    width, pad, x,
    from: explain.from.map(String),
    to: explain.to.map(String),
    value: explain.value === null ? '' : String(explain.value),
    result: explain.result === null ? '' : shownResult(explain.result),
    outside: explain.outside,
  };
}

/** A list as the script's language writes one: {7, 104} in Lua, [7, 104] elsewhere. */
export function listText(values, language) {
  const inner = values.join(', ');
  return language === 'lua' ? `{${inner}}` : `[${inner}]`;
}

/** Text with `code` marks, as parts to draw: the marked ones in the code font, without the marks. */
export function codeParts(text) {
  return String(text ?? '').split('`').map((part, i) => ({ text: part, code: i % 2 === 1 })).filter((p) => p.text);
}
