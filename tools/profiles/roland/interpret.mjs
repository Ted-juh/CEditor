// interpret.mjs — what a Roland address-map row's display line means.
//
// parse-address-map.mjs transcribes; this decides. Each row carries a wire range in brackets and,
// beneath it, what the synth's own screen shows for that range:
//
//   FILTER Mode            (0 - 4)    BYPASS, LPF, HPF, BPF, PKG      -> five choice labels
//   OSC Pitch             (40 - 88)   -24 - +24                       -> a display range
//   Master Tune         (24 - 2024)   -100.0 - 100.0 [cent]           -> a range, a precision, a unit
//   AMP Pan                (0 - 127)  L64 - 63R                       -> bipolar, left negative
//   Program Control Ch     (0 - 16)   1 - 16, OFF                     -> 17 labels, the span expanded
//   Keyboard Velocity     (0 - 127)   REAL, 1 - 127                   -> a number, the line kept as text
//   FILTER Slope            (0 - 1)   -12, -24 [dB]                   -> labels "-12 dB", "-24 dB"
//
// The rule that keeps this honest: a display line becomes choice labels ONLY when, with its numeric
// spans expanded, it names exactly as many values as the wire range holds. Anything that does not
// count out stays a number, and the manual's line is kept as the parameter's description, so
// nothing is invented and nothing is lost. `unresolved` lists those rows so a reader can see them.

const NUMBER = /^[-+]?\d+(?:\.\d+)?$/;

/** More than this many labels is a list nobody can scroll; keep the number, keep the line as text. */
const MAX_LABELS = 32;

/** Beyond this many wire values a row is a number whatever its display line says. */
const MAX_LISTED = 4096;

const decimals = (text) => (text.includes('.') ? text.split('.')[1].length : 0);

/** `"-12, -24 [dB]"` -> { text: '-12, -24', unit: 'dB' } */
function splitUnit(display) {
  const match = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(display);
  return match ? { text: match[1].trim(), unit: match[2].trim() } : { text: display.trim(), unit: '' };
}

/**
 * `"1 - 16, OFF"` -> ['1', '2', … '16', 'OFF'], or null when a token is a span that is not
 * integers. `expanded` says whether any span was opened up — a list the manual spelled out name by
 * name is a real menu however long it is (the SH-201's D Beam Assign has 37 entries), while one
 * that only became long by expanding `1 - 127` is a number with a special value at one end.
 */
function expandLabels(text) {
  const labels = [];
  let expanded = false;
  for (const raw of text.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const span = /^([-+]?\d+)\s+-\s+([-+]?\d+)$/.exec(token);
    if (span) {
      const lo = Number(span[1]);
      const hi = Number(span[2]);
      if (hi < lo) return null;
      expanded = true;
      for (let v = lo; v <= hi; v++) labels.push(span[1].startsWith('+') && v > 0 ? `+${v}` : String(v));
    } else {
      labels.push(token);
    }
  }
  return { labels, expanded };
}

/** `-36, -35, … 0` is a range written out longhand: whole numbers rising by one. */
function isUnitStep(labels) {
  if (labels.length < 3 || !labels.every((l) => /^[-+]?\d+$/.test(l))) return false;
  return labels.every((l, i) => i === 0 || Number(l) === Number(labels[i - 1]) + 1);
}

/**
 * One row -> what the profile needs to know about its value.
 *
 * Returns { kind: 'number' | 'choice', labels?, displayMin?, displayMax?, precision?, unit?,
 * description?, unresolved? }. `values` is the wire value of each label: min..max, or the row's own
 * set when the manual prints one, `(0, 5 - 8)`.
 */
export function interpretRow(row) {
  const display = row.display?.trim();
  // Every wire value, listed only when there are few enough to be labels: a 28-bit sample offset
  // (the V-Synth GT's, 0 - 268435455) listed in full ran the generator out of memory.
  const count = row.values ? row.values.length : row.max - row.min + 1;
  const values = row.values ?? (count <= MAX_LISTED ? Array.from({ length: count }, (unused, i) => row.min + i) : null);

  if (!display) {
    // A set with no labels still must not offer the values between its members.
    if (row.values) return { kind: 'choice', labels: values.map(String), values };
    return { kind: 'number' };
  }

  const { text: printed, unit } = splitUnit(display);
  // `-63(LOWER) - +63(UPPER)`: the words name the ends; the numbers are the range.
  const text = printed.replace(/([-+]?\d+(?:\.\d+)?)\([A-Za-z ]+\)/g, '$1');

  // A range: `-24 - +24`, `5.00 - 300.00`, `-100.0 - 100.0 [cent]`.
  const range = /^([-+]?\d+(?:\.\d+)?)\s*-\s*([-+]?\d+(?:\.\d+)?)$/.exec(text);
  if (range && !row.values) {
    const displayMin = Number(range[1]);
    const displayMax = Number(range[2]);
    const precision = Math.max(decimals(range[1]), decimals(range[2]));
    const same = displayMin === row.min && displayMax === row.max && precision === 0;
    return {
      kind: 'number',
      ...(same ? {} : { displayMin, displayMax }),
      ...(precision ? { precision } : {}),
      ...(unit && unit !== 'ASCII' ? { unit } : {}),
    };
  }

  // Pan: `L64 - 63R`, left negative.
  const pan = /^L(\d+)\s*-\s*(\d+)R$/.exec(text);
  if (pan && !row.values) {
    return { kind: 'number', displayMin: -Number(pan[1]), displayMax: Number(pan[2]), unit: '' };
  }

  if (!values) return { kind: 'number', description: display, ...(unit ? { unit } : {}) };
  const expansion = expandLabels(text);
  const labels = expansion?.labels;
  if (labels && labels.length === values.length) {
    if (!row.values && isUnitStep(labels)) {
      return { kind: 'number', displayMin: Number(labels[0]), displayMax: Number(labels.at(-1)), ...(unit ? { unit } : {}) };
    }
    if (expansion.expanded && labels.length > MAX_LABELS) {
      return { kind: 'number', description: display, ...(unit ? { unit } : {}) };
    }
    // A unit printed once at the end belongs to every NUMERIC label: `-12, -24 [dB]` is two
    // values in dB, and `BYPASS, 1000, 1250 [Hz]` is a bypass and two frequencies.
    const labelled = unit ? labels.map((label) => (NUMBER.test(label) ? `${label} ${unit}` : label)) : labels;
    return { kind: 'choice', labels: labelled, values };
  }

  return { kind: 'number', description: display, unresolved: true };
}
