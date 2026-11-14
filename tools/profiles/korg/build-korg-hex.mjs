// build-korg-hex.mjs — values in the notation of the microKORG documents: hex on the left of the
// colon, what they mean on the right.
//
//   00~7F:0~127                         a number, 0 - 127
//   00,01:Off,On                        a choice of the values printed, one name each
//   00~06:1/32,24,16,12,8,6,4           a choice, when the names count out to the range
//   00~3F/40~7F:Fingered/Always         a choice, each name taking a range; the value sent is its first
//   00~7F:Saw~OneShot   *3-1            a choice from the list *3-1 (`00~15 : Saw  16~2A : Square …`),
//                                       when its ranges cover the whole range; the first of each is sent
//   00,01~40~7F:-63,-63~0~63            a number centred on 40, 01~7F shown as -63 ~ +63 (00 is 01)
//   00,01~40~7F:L63,L63~CNT~R63         the same, a pan
//   *2-1                                a cell that is only a mark: what the mark says, read the same
//                                       way (`00~15 : Up  16~2A : Down …`, or `00,01~7F = -63,-63~+63`);
//                                       a mark that tabulates every value (`00~07 :  0,  0,  1, …`)
//                                       makes a number 0 - 127, its first, middle and last said
//
// Anything else is said and left out: a value printed over two bytes (`7F 1C~7F,00 00,…`), or one
// whose names do not count out.

const H = (x) => Number.parseInt(x, 16);

/** `00~15 : Saw 16~2A : Square …` -> [{ from, to, label }], hex. Null when a label is a number list. */
export function hexRanges(text) {
  const out = [...String(text ?? '').matchAll(/([0-9A-F]{2})\s*~\s*([0-9A-F]{2})\s*:\s*(.+?)(?=\s+[0-9A-F]{2}\s*~\s*[0-9A-F]{2}\s*:|\s*$)/gi)]
    .map((m) => ({ from: H(m[1]), to: H(m[2]), label: m[3].trim() }));
  if (out.length < 2 || out.some((e) => /^[-+\d\s,]+$/.test(e.label))) return null;
  return out;
}

/** A list of entries `n: label`, decimal, as the T-lists print them. */
function decimalList(list) {
  if (!list?.entries?.length) return null;
  return list.entries.every((e) => e.from === e.to) ? list.entries.map((e) => ({ value: e.from, label: e.label })) : null;
}

/** `00~07 :  0,  0,  1, …  78~7F : 94, …,100`: a value for each of 00~7F, or null. */
export function valueTable(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/([0-9A-F]{2})\s*~\s*([0-9A-F]{2})\s*:\s*((?:[-+L R]*\s*[\w.]+\s*,\s*)*[-+L R]*\s*[\w.]+)/gi)) {
    const values = m[3].split(',').map((x) => x.replace(/\s+/g, ''));
    if (values.length !== H(m[2]) - H(m[1]) + 1 || H(m[1]) !== out.length) return null;
    out.push(...values);
  }
  return out.length === 128 ? out : null;
}

/** `-63`, `+63`, `L63`, `R63`, `CNT`, `0` -> a signed number, or null. */
const signedLabel = (label) => {
  const m = /^([-+LR]?)\s*(\d+)$/i.exec(String(label).trim());
  if (m) return (/^[-L]$/i.test(m[1]) ? -1 : 1) * Number(m[2]);
  return /^(CNT|Center|Centre)$/i.test(String(label).trim()) ? 0 : null;
};

export function readHexValue(cell, marks, lists) {
  const refs = [...String(cell).matchAll(/\*([\w-]+)/g)].map((m) => m[1]);
  const s = String(cell).replace(/\*[\w-]+/g, '').replace(/\s+/g, ' ').trim();
  if (!s) {
    // Only a mark: what the mark prints is the value (`*2-1 : 00~15 : Up  16~2A : Down …`).
    const ref = refs.find((r) => marks[r]);
    if (!ref) return { why: 'it is printed without a value' };
    const said = marks[ref];
    const headed = /^([0-9A-F]{2}(?:[,~][0-9A-F]{2})+)\s*=\s*(\S+)/i.exec(said);
    if (headed) return readHexValue(`${headed[1]}:${headed[2]}`, marks, lists);
    const ranges = hexRanges(said);
    if (ranges && ranges[0].from === 0 && ranges.at(-1).to === 0x7f && ranges.every((r, i) => i === 0 || r.from === ranges[i - 1].to + 1)) {
      return { choices: ranges.map((r) => ({ value: r.from, label: r.label })), min: 0, max: 0x7f, note: `Each name takes a range (*${ref}); the first value of it is sent.` };
    }
    const table = valueTable(said);
    if (table) return { min: 0, max: 0x7f, shown: `${table[0]} ~ ${table[0x7f]} in the uneven steps *${ref} lists: 0 is ${table[0]}, 64 is ${table[0x40]}, 127 is ${table[0x7f]}` };
    return { why: `the mark it points to (*${ref}) prints "${said.slice(0, 60)}"` };
  }
  const [left, right] = s.split(/:(.*)/s).map((x) => x?.trim());
  // Two bytes, MSB then LSB (`7F 41~7F,00 00,00 01~3F:-63~0~63`, `00 00~7F,01 00~16:0~127,128~150`):
  // a 14-bit value on CC 6 and 38, two's complement where it runs below zero.
  if (/\s/.test(left)) {
    const values = [];
    for (const part of left.split(',')) {
      const m = /^([0-9A-F]{2})\s+([0-9A-F]{2})(?:~([0-9A-F]{2}))?$/i.exec(part.trim());
      if (!m) return { why: `its value is printed over two bytes as "${s}"` };
      for (const lsb of [H(m[2]), ...(m[3] ? [H(m[3])] : [])]) values.push((H(m[1]) << 7) | lsb);
    }
    const signed = values.map((v) => (v >= 8192 ? v - 16384 : v));
    const negative = signed.some((v) => v < 0);
    const pick = negative ? signed : values;
    return { min: Math.min(...pick), max: Math.max(...pick), wide: true, signed: negative, shown: right ? `${left} = ${right}` : null };
  }
  const names = right ? right.replace(/\[[^\]]*\]$/, '').split(',').map((x) => x.trim()).filter(Boolean) : [];
  const unit = /\[([^\]]*)\]$/.exec(right ?? '')?.[1] ?? '';

  // `00~3F/40~7F:Fingered/Always`
  if (/^[0-9A-F]{2}~[0-9A-F]{2}(\/[0-9A-F]{2}~[0-9A-F]{2})+$/i.test(left)) {
    const ranges = left.split('/').map((r) => r.split('~').map(H));
    const labels = (right ?? '').split('/').map((x) => x.trim());
    if (labels.length === ranges.length) return { choices: ranges.map(([from], i) => ({ value: from, label: labels[i] })), min: ranges[0][0], max: ranges.at(-1)[1] };
    return { why: `names "${right}" for the ranges ${left}` };
  }
  // `00,01:Off,On`
  if (/^[0-9A-F]{2}(,[0-9A-F]{2})+$/i.test(left)) {
    const values = left.split(',').map(H);
    if (names.length === values.length) return { choices: values.map((value, i) => ({ value, label: names[i] })) };
    return { why: `names "${right}" for the values ${left}` };
  }
  // `00,01~40~7F:-63,-63~0~63`, `00,01~7F:-63,-63~+63`, `00,01~40~7F:L63,L63~CNT~R63`: 00 and 01
  // both the bottom, centred on 40.
  const centred = /^([0-9A-F]{2}),([0-9A-F]{2})~(?:([0-9A-F]{2})~)?([0-9A-F]{2})$/i.exec(left);
  const sides = right ? /^([^,~]+),\s*\1\s*~\s*(?:([^,~]+?)\s*~\s*)?([^,~]+)$/.exec(right) : null;
  if (centred && sides && H(centred[1]) + 1 === H(centred[2])) {
    const [bottom, top] = [signedLabel(sides[1]), signedLabel(sides[3])];
    const [min, max] = [H(centred[2]), H(centred[4])];
    if (bottom !== null && top !== null && top - bottom === max - min) {
      return { min, max, displayMin: bottom, displayMax: top, shown: `${left} = ${right}` };
    }
  }
  // `00~7F…`, `00,01~40~7F…`
  const span = /^([0-9A-F]{2})(?:,[0-9A-F]{2})?~(?:[0-9A-F]{2}~)?([0-9A-F]{2})$/i.exec(left);
  if (!span) return { why: `the value is printed as "${s}"` };
  const [min, max] = [H(span[1]), H(span[2])];
  const count = max - min + 1;
  if (/^[0-9A-F]{2}~[0-9A-F]{2}$/i.test(left) && names.length === count && !names.some((n) => /~/.test(n))) {
    return { choices: names.map((label, i) => ({ value: min + i, label })), min, max };
  }
  for (const ref of refs) {
    const ranges = hexRanges(marks[ref]);
    if (ranges && ranges[0].from === min && ranges.at(-1).to === max && ranges.every((r, i) => i === 0 || r.from === ranges[i - 1].to + 1)) {
      return { choices: ranges.map((r) => ({ value: r.from, label: r.label })), min, max, note: `Each name takes a range (*${ref}); the first value of it is sent.` };
    }
    const list = decimalList(lists[ref]);
    if (list && list.length === count && list.every((e, i) => e.value === i) && list.length <= 32) {
      return { choices: list.map((e) => ({ value: min + e.value, label: e.label })), min, max };
    }
  }
  // What the marks add: a table of every value, summed up; otherwise its text, or a list's title.
  const tabled = refs.find((r) => valueTable(marks[r]));
  if (tabled) return { min, max, unit, shown: `${readHexValue(`*${tabled}`, marks, lists).shown}${unit ? `, in ${unit}` : ''}` };
  const explained = refs.map((r) => marks[r] ?? (lists[r]?.title ? `${lists[r].title}` : null)).filter(Boolean)[0];
  // `00~7F:0~127` says nothing the range does not.
  const plain = right && right.replace(/\[[^\]]*\]$/, '').replace(/\s+/g, '') === `${min}~${max}`;
  return { min, max, unit, shown: [right && !plain ? `${left} = ${right}` : null, explained ? explained.slice(0, 160) : null].filter(Boolean).join('; ') || null };
}
