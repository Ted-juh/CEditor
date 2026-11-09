// build-korg-hex.mjs — values in the notation of the microKORG documents: hex on the left of the
// colon, what they mean on the right.
//
//   00~7F:0~127                         a number, 0 - 127
//   00,01:Off,On                        a choice of the values printed, one name each
//   00~06:1/32,24,16,12,8,6,4           a choice, when the names count out to the range
//   00~3F/40~7F:Fingered/Always         a choice, each name taking a range; the value sent is its first
//   00~7F:Saw~OneShot   *3-1            a choice from the list *3-1 (`00~15 : Saw  16~2A : Square …`),
//                                       when its ranges cover the whole range; the first of each is sent
//   00,01~40~7F:-63,-63~0~63            a number, 0 - 127, its meaning in the description
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

export function readHexValue(cell, marks, lists) {
  const refs = [...String(cell).matchAll(/\*([\w-]+)/g)].map((m) => m[1]);
  const s = String(cell).replace(/\*[\w-]+/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return { why: 'it is printed without a value' };
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
  const explained = refs.map((r) => marks[r] ?? (lists[r]?.title ? `${lists[r].title}` : null)).filter(Boolean)[0];
  return { min, max, unit, shown: [right ? `${left} = ${right}` : null, explained ? explained.slice(0, 160) : null].filter(Boolean).join('; ') || null };
}
