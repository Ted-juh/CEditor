// read-twisted-pdf.mjs — the MIDI tables of Twisted Electrons' PDF manuals, as printed, decided
// nothing. Each is returned in the shape read-twisted-page.mjs gives a web page's table:
// { title, columns: ['Group', 'CC', 'Parameter', 'Values', 'Direction'], rows }.
//
// Two forms:
//   - TherapSID and AY3: `MIDI Message  Range  Result  Direction`, a row `Control CC#6  1-127  Voice1
//     Attack  receive/send`, its range or result going on below (`51-75=HP`, `& Mod Wheel`). A range
//     can hold spaces (`0=off   1=on`), so the columns are where each page's header puts them.
//   - MEGAfm: `Parameter  MIDI CC  Range`, a section a line in capitals (`OPERATOR 1`), a row `Op1
//     Total Level  19  0-127`; a row whose controller is not a number (`Velocity`, `1 (mod wheel)`)
//     kept as printed.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const COLUMNS = ['Group', 'CC', 'Parameter', 'Values', 'Direction'];

/**
 * The `Control CC#` rows on these lines (from documentLines). The header's words are centred over
 * their columns, so a row is read by its words: `Control CC#n`, then the range's (`1-127`, `0=off`,
 * `1=on`, `0-25=LP`), then the result's, then the direction (`receive/send`, `send`). A line of its
 * own goes on the row above: in its range where it starts left of that row's result, in its result
 * otherwise.
 */
export function readControlRows(lines, title) {
  const rows = [];
  let resultX = null;
  let rangeX = null;
  const RANGE = /^\d+(?:-\d+)?(?:=\S+)?$/;
  const DIRECTION = /^(?:receive\/send|send|receive)$/;
  for (const l of lines) {
    const w = l.words;
    const t = text(w);
    if (/^\d+ of \d+$/.test(t) || /^MIDI Message\b/i.test(t) || /\bRange\b.*\bResult\b/.test(t)) continue;
    if (w[0]?.text === 'Control' && /^CC#\d+(?:\+\d+)?$/.test(w[1]?.text ?? '')) {
      let k = 2;
      const range = [];
      while (k < w.length && RANGE.test(w[k].text)) range.push(w[k++]);
      const direction = DIRECTION.test(w.at(-1)?.text ?? '') && w.length - 1 >= k ? w.at(-1) : null;
      const result = w.slice(k, direction ? -1 : undefined);
      resultX = result[0]?.x0 ?? null;
      rangeX = range[0]?.x0 ?? null;
      rows.push(['', w[1].text.slice(3), text(result), text(range), direction?.text ?? '']);
      continue;
    }
    const last = rows.at(-1);
    if (!last || resultX == null) continue;
    // (Under the message, `& Mod Wheel`: what else sets the row's result, put beside it.)
    const message = w.filter((x) => rangeX != null && x.x0 < rangeX - 4);
    const before = w.filter((x) => !message.includes(x) && x.x0 < resultX - 4);
    const after = w.filter((x) => x.x0 >= resultX - 4);
    if (message.length) last[2] = `${last[2]} (${text(message)})`;
    if (before.length) last[3] = `${last[3]} ${text(before)}`.trim();
    if (after.length) last[2] = `${last[2]} ${text(after)}`.trim();
  }
  return { title, columns: COLUMNS, rows };
}

/** MEGAfm's `Parameter  MIDI CC  Range` rows in pdftotext -layout text, under their sections. */
export function readParameterRows(layoutText, title) {
  const rows = [];
  let section = '';
  let on = false;
  for (const raw of layoutText.split(/\r?\n/)) {
    const line = raw.replace(/\f/g, '').trimEnd();
    const t = line.trim();
    if (/^Parameter\s{2,}MIDI CC\s{2,}Range$/.test(t)) { on = true; continue; }
    if (!on || !t) continue;
    const m = /^(.+?)\s{2,}(\S.*?)\s{2,}(\d+-\d+)$/.exec(t);
    if (m) { rows.push([section, m[2], m[1], m[3], '']); continue; }
    if (/^[A-Z][A-Z0-9 ]*$/.test(t)) { section = t; continue; }
    if (rows.length) on = false;      // the table's end: prose follows
  }
  return { title, columns: COLUMNS, rows };
}
