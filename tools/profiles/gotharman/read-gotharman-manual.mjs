// read-gotharman-manual.mjs — the parameter list of Gotharman's Anamono user manual, as printed,
// decided nothing.
//
// The list is a table a section (`OSC 1`, `DSP FILTER`, …), each under the same header: `Parameter
// Values  MIDI ctrl  NRPN 99  NRPN 98`. A row's first line carries its NRPN numbers in hex (`00h
// 06h`); its name and values wrap below it (`Pulsewidth Source` / `Select between the` / `16
// modulation` / `sources.`). The columns are where the header puts them, a cell starting a little
// left of its title (the values start under `Parameter`'s end, not under `Values`): a word is the
// column its left edge falls in. A controller can be prefixed with the group it belongs to
// (`Primary 55`). The MIDI page's sections (the MIDI channel, the edit knobs' assignments) have no
// NRPN numbers: there a name starts a row; elsewhere only a line with numbers does.

const joined = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const HEX = /^([0-9A-F]{2})h$/;

/** The header's columns on this line, or null: { values, ctrl, msb, lsb } — where each cell starts. */
function headerOf(line) {
  const t = line.words.map((w) => w.text);
  if (t[0] !== 'Parameter' || !t.includes('Values') || t.filter((x) => x === 'NRPN').length !== 2) return null;
  const x = (word, k = 0) => line.words.filter((w) => w.text === word)[k].x0;
  // A cell starts left of its centred title: the values about 25 points (under `Parameter`'s end), a
  // controller's group about 18 (`Secondary` at 252 under `MIDI` at 270), the NRPN numbers about 10.
  return { values: x('Values') - 25, ctrl: x('MIDI') - 20, msb: x('NRPN', 0) - 10, lsb: x('NRPN', 1) - 10 };
}

/** The list on these lines (from documentLines): [{ page, section, name, values, ctrl, group?, msb, lsb }]. */
export function readParameterList(lines) {
  let cols = null;
  let section = null;
  let pendingSection = null;
  // Whether this section's rows carry NRPN numbers, decided by its first row: the MIDI page's do not.
  let numberedSection = null;
  const rows = [];
  for (const [k, l] of lines.entries()) {
    const header = headerOf(l);
    if (header) {
      cols = header;
      if (pendingSection && pendingSection !== section) { section = pendingSection; numberedSection = null; }
      pendingSection = null;
      continue;
    }
    const t = joined(l.words);
    // A section's title: capitals on a line of their own, a header under it.
    if (/^[A-Z][A-Z0-9 /&-]*$/.test(t) && lines[k + 1] && headerOf(lines[k + 1])) { pendingSection = t; continue; }
    if (!cols || /^\d{1,3}$/.test(t)) continue;
    const cell = (from, to) => l.words.filter((w) => w.x0 >= from && w.x0 < to);
    const name = cell(-Infinity, cols.values);
    const values = cell(cols.values, cols.ctrl);
    const ctrl = cell(cols.ctrl, cols.msb);
    const msb = cell(cols.msb, cols.lsb);
    const lsb = cell(cols.lsb, Infinity);
    const numbered = msb.length === 1 && HEX.test(msb[0].text) && lsb.length === 1 && HEX.test(lsb[0].text);
    if (numberedSection === null && (name.length || numbered)) numberedSection = numbered;
    // A row: its NRPN numbers, or in a section without them (the MIDI page's), a name.
    if (numbered || (!numberedSection && name.length)) {
      const c = /^(?:(Primary|Secondary) )?(\d{1,3})$/i.exec(joined(ctrl));
      rows.push({
        page: l.page, section, name: joined(name), values: joined(values),
        ...(c ? { ctrl: Number(c[2]), ...(c[1] ? { group: c[1].toLowerCase() } : {}) } : {}),
        ...(numbered ? { msb: parseInt(HEX.exec(msb[0].text)[1], 16), lsb: parseInt(HEX.exec(lsb[0].text)[1], 16) } : {}),
      });
      continue;
    }
    // The row's cells going on below it.
    const last = rows.at(-1);
    if (!last) continue;
    if (name.length) last.name = `${last.name} ${joined(name)}`;
    if (values.length) last.values = `${last.values} ${joined(values)}`.trim();
  }
  return rows.map((r) => ({ ...r, name: r.name.trim(), values: r.values.trim() }));
}

/**
 * The LD instruments' (LD3, LD Zero, Tiny LD, SpazeBoard6) list of parameters controllable by CC, in
 * `pdftotext -layout` text: `PARAMETER  CC#  PART NUMBER`, a row a line, the part column `MIDI
 * channel 1-16` (a part's parameter, on the part's channel) or `-` (the instrument's), a name that
 * does not fit going on below (`Oscillator1 Wave/Sampler` / `Start`): [{ name, cc, parts }], parts
 * the number of part channels or 0, and `page`, the PDF page of the row (`firstPage`, the text's
 * first page, counted on at each form feed).
 */
export function readCcList(text, firstPage = 1) {
  const rows = [];
  let on = false;
  // (pdftotext ends each page with a form feed: the lines after one are on the next page.)
  const lines = text.split('\f').flatMap((pageText, i) => pageText.split('\n').map((line) => ({ line, page: firstPage + i })));
  for (const { line, page } of lines) {
    if (/^PARAMETER\s+CC#\s+PART NUMBER/.test(line)) { on = true; continue; }
    if (!on || !line.trim() || /^\s*\d{1,4}\s*$/.test(line)) continue;
    const m = /^(\S.*?)\s{2,}(\d{1,3})\s{2,}(?:MIDI channel 1-(\d+)|-)\s*$/.exec(line);
    if (m) { rows.push({ name: m[1].trim(), cc: Number(m[2]), parts: m[3] ? Number(m[3]) : 0, page }); continue; }
    // A name going on below its row (set at the margin, nothing else on the line); prose ends the list.
    if (/^\S/.test(line) && !/\s{2,}/.test(line.trim()) && line.trim().split(' ').length <= 3 && rows.length) rows.at(-1).name = `${rows.at(-1).name} ${line.trim()}`;
    else on = false;
  }
  return rows;
}
