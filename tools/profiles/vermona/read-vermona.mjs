// read-vermona.mjs — the controller tables of Vermona's user guides, as pdftotext -layout prints
// them, decided nothing.
//
// Two forms:
//   - the Mono Lancet '15's MIDI Control Change Messages: a sentence saying what values mean
//     (`a value of 0..63 means OFF; 64..127 means ON`), then `Function  CC#  Description  Factory
//     Setting` rows, a function's name and its description going on below (`Modulation` / `Wheel`);
//   - the Kick Lancet's: `The function of the GATE jack can be specified by MIDI control command
//     #84`, then `CC# 84 Value  Description` and a value a line (`0  standard 5V (factory default)`),
//     its description going on below.

/** The Mono Lancet's form: { meaning, rows: [{ name, cc, description, factory }] }. */
export function readSwitchTable(text) {
  const lines = text.split(/\r?\n/);
  const meaning = /For all MIDI control changes, a value of (.+? means \w+; .+? means \w+)\./.exec(text.replace(/\s+/g, ' '))?.[1] ?? null;
  const at = lines.findIndex((l) => /^\s*Function\s+CC#\s+Description/.test(l));
  if (at < 0) return null;
  const rows = [];
  for (const line of lines.slice(at + 1)) {
    if (/^\s*\d+\s*$/.test(line)) break;                       // the page number
    const m = /^(\s*)(\S.*?)\s{2,}(\d{1,3})\s{2,}(.*?)\s{2,}(ON|OFF)\s*$/.exec(line);
    if (m) { rows.push({ name: m[2], cc: Number(m[3]), description: m[4], factory: m[5] }); continue; }
    const last = rows.at(-1);
    if (!last || !line.trim() || /^\s*Setting\s*$/.test(line)) continue;
    // A name going on (at the name's column) and the description going on (further right).
    const name = /^\s{4,8}(\S+)\s{6,}(\S.*)$/.exec(line);
    if (name) { last.name = `${last.name} ${name[1]}`; last.description = `${last.description} ${name[2].trim()}`; continue; }
    last.description = `${last.description} ${line.trim()}`;
  }
  return { meaning, rows };
}

/**
 * The Kick Lancet's form: [{ jack, cc, values: [{ value, label, description }], page }], `page` the
 * PDF page of the sentence that names the controller (`firstPage`, the text's first, counted on at
 * each form feed pdftotext ends a page with).
 */
export function readValueTables(text, firstPage = 1) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const pageAt = [];
  lines.reduce((page, line, k) => { const here = page + (line.match(/\f/g)?.length ?? 0); pageAt[k] = here; return here; }, firstPage);
  lines.forEach((line, k) => {
    const head = /The function of the (\S+) jack can be specified by MIDI control command #(\d+)/.exec(lines.slice(k, k + 2).join(' ').replace(/\s+/g, ' '));
    if (!head || out.some((o) => o.cc === Number(head[2]))) return;
    const table = { jack: head[1], cc: Number(head[2]), values: [], page: pageAt[k] };
    const start = lines.findIndex((l, j) => j > k && /^\s*CC#\s*\d+\s+Value\s+Description/.test(l));
    for (const l of lines.slice(start + 1)) {
      if (/^\s*(?:\d{1,2}\s*$|[A-Z][A-Za-z ]+$)/.test(l) && !/^\s*\d\s{2,}/.test(l) && table.values.length) break;
      const v = /^\s*(\d)\s{2,}(\S.*)$/.exec(l);
      if (v) { table.values.push({ value: Number(v[1]), label: v[2].trim(), description: '' }); continue; }
      if (/^\s*User Guide\b/.test(l)) continue;                // the page footer
      if (l.trim() && table.values.length) table.values.at(-1).description = `${table.values.at(-1).description} ${l.trim()}`.trim();
    }
    out.push(table);
  });
  return out;
}
