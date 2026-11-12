// read-kodamo-manual.mjs — the MIDI implementation of Kodamo's MASK1 user manual, as printed, decided
// nothing.
//
// Two columns, no header: a message (`CC 20 Filter cutoff`, `Program change`, `SysEx Voice transmit`)
// and what the MASK1 does with it (`Mapped to Filter > CUTF`, `Ignored. Use CC 32 to select bank`), a
// remark that does not fit going on below. Read from `pdftotext -layout`; the list of controllers
// ends at `Other CCs`.

/** The controllers in this text: [{ cc, name, remark }]. */
export function readControllers(text) {
  const rows = [];
  for (const line of text.replace(/\f/g, '\n').split('\n')) {
    if (/^Other CCs\b/.test(line)) break;
    const m = /^CC (\d{1,3}) (.+?)\s{2,}(\S.*?)\s*$/.exec(line);
    if (m) { rows.push({ cc: Number(m[1]), name: m[2].trim(), remark: m[3] }); continue; }
    // A remark going on below its row: set under the remark column, nothing at the margin.
    if (rows.length && /^\s{20,}\S/.test(line) && !/^\s*\d{1,3}\s*$/.test(line)) rows.at(-1).remark = `${rows.at(-1).remark} ${line.trim()}`;
  }
  return rows;
}
