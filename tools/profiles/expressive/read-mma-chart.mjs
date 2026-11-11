// read-mma-chart.mjs — the control change table of a MIDI Implementation Chart v2.0 (the MMA's
// standard form) -> its rows as printed, decided nothing.
//
// The form's control table is `Control #  Function  Transmitted (Y/N)  Recognized (Y/N)  Remarks`, a
// row for every controller 0 - 127, the function blank where the instrument does nothing with it.
// The header gives the columns; a row is a line whose first word is a number left of `Function`, the
// function the words up to `Transmitted`, the two answers (`Yes`, `No`) under their headers, the
// remarks after `Remarks`. Repeated on each page the table runs over.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The control rows: [{ page, cc, name, transmitted, recognized, remarks }]. */
export function readControlTable(lines) {
  const rows = [];
  let columns = null;
  for (const l of lines) {
    const at = (t) => l.words.find((w) => w.text === t)?.x0;
    if (at('Function') !== undefined && at('Transmitted') !== undefined && at('Recognized') !== undefined) {
      columns = { page: l.page, function: at('Function'), transmitted: at('Transmitted'), recognized: at('Recognized'), remarks: at('Remarks') ?? Infinity };
      continue;
    }
    if (!columns || columns.page !== l.page) continue;
    const first = l.words[0];
    if (!first || !/^\d{1,3}$/.test(first.text) || first.x0 >= columns.function) continue;
    const answer = (from, to) => l.words.find((w) => w.x0 >= from - 8 && w.x0 < to - 4 && /^(?:Yes|No)$/.test(w.text))?.text ?? '';
    rows.push({
      page: l.page,
      cc: Number(first.text),
      name: text(l.words.filter((w) => w !== first && w.x0 >= columns.function - 4 && w.x1 <= columns.transmitted)),
      transmitted: answer(columns.transmitted, columns.recognized),
      recognized: answer(columns.recognized, columns.remarks),
      remarks: text(l.words.filter((w) => w.x0 >= columns.remarks - 4)),
    });
  }
  return rows;
}
