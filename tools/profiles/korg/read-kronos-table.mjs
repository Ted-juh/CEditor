// read-kronos-table.mjs — one of the KRONOS's object tables (Prog_HD-1.txt, CombiAndSongTimbreSet.txt,
// Global.txt, …) as rows.
//
// Korg ships the KRONOS's MIDI Implementation as a ZIP of plain text: KRONOS_MIDI_SysEx.txt gives the
// messages, and a table per object gives every setting of that object a row,
//
//   | OFS  | bit | parameter | parameter | data(hex) | value | TYP|SOC|SUB|PID|IDX|note
//   |   92 |     | Insert Effect1 | Panpot | 00~7F | L000~R127 |  7|  0|  0|  6|  0|
//   |      | 6   | Insert Effect1 | Switch | 00~01 | Off~On    |  6|  0|  0|  0|  0|* -> bypass, Invert Value
//
// its byte in the object (OFS, blank for a bit field sharing the byte above), its bits, its group and
// name, its range in hex and as shown, the five bytes its parameter change takes, and a note after the
// box. Reserved bytes are printed `*`. This reads the rows as printed and decides nothing about them.

/** The header: `HD-1 Program Size: 3706 byte … Version 1.01 (Jan  7, 2015)` and `Object Version: 5`. */
export function readObjectHeader(text) {
  const lines = text.split(/\r?\n/);
  const size = lines.map((l) => /^(.*?)\s+Size:\s*(\d+)\s*byte\s+Version\s+(\S+)\s+\(([^)]*)\)/.exec(l)).find(Boolean);
  const object = lines.map((l) => /^Object Version:\s*(\d+)/.exec(l)).find(Boolean);
  if (!size) throw new Error('No "<object> Size: n byte … Version v (date)" line');
  return {
    title: size[1].trim(),
    size: Number(size[2]),
    version: size[3],
    date: size[4].replace(/\s+/g, ' ').trim(),
    objectVersion: object ? Number(object[1]) : null,
  };
}

const ID_CELLS = 5;

/**
 * Every row with a parameter id or a name, in order: `{ line, ofs, bit, group, name, data, value,
 * id, note }`. A row printing no OFS shares the byte of the row above it, and gets that OFS. Reserved
 * rows (`*`) and the boxes' rules are skipped; a row with an id and no name (the further bytes of a
 * value spread over several, each with its own id) is kept as printed.
 */
export function readObjectRows(text) {
  const rows = [];
  let ofs = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.startsWith('|')) return;
    const cells = raw.split('|');
    if (cells.length < 7 + ID_CELLS) return;
    const [ofsCell, bit, group, name, data, value] = cells.slice(1, 7).map((c) => c.trim());
    const idCells = cells.slice(7, 7 + ID_CELLS).map((c) => c.trim());
    const note = cells.slice(7 + ID_CELLS).join('|').trim();
    if (/^data\(hex\)$/i.test(data)) return;                       // the heading row
    const hasId = idCells.every((c) => /^\d+$/.test(c));
    if (/^\d+$/.test(ofsCell)) ofs = Number(ofsCell);
    if (!hasId && [ofsCell, bit, group, name, data, value].some((c) => c === '*' || c === '|')) return;
    if (!hasId && !name) return;
    rows.push({
      line: index + 1,
      ofs,
      ...(bit ? { bit } : {}),
      group,
      name,
      data,
      value,
      ...(hasId ? { id: idCells.map(Number) } : {}),
      ...(note ? { note } : {}),
    });
  });
  return rows;
}

/**
 * The lines of one message's block in KRONOS_MIDI_SysEx.txt (`[43] Parameter Change (integer)` up to
 * the next block), or one of its footnotes (`*3` up to the next).
 */
export function messageBlock(text, code) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`[${code}]`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^\[[0-9A-F]{2}\]/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).map((l) => l.trimEnd()).filter((l, i, all) => l || (i && all[i - 1]));
}

export function footnote(text, mark) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `*${mark}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^\*\d+\s*$/.test(l.trim()));
  return lines.slice(start, end < 0 ? undefined : end).map((l) => l.trimEnd()).filter(Boolean);
}
