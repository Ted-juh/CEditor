// read-radikal-manual.mjs — the MIDI controller table of Radikal Technologies' Delta CEP A/A2 manual,
// as printed, decided nothing.
//
// The table is `CC  Bereich  Neutral  Parameter` (the header in German in the English manual too: the
// range and the neutral value), a row a line, not in the controllers' order, its header repeated on
// the next page with the columns set elsewhere. Read from `pdftotext -layout`, each cell where that
// page's header puts it. A row can lack a range (CC 90, `Delay Time LSB (lower 3 Bits …)`) and most
// lack a neutral value. The PDF's text layer loses the `ff` ligature (`VCF Cuto`), set apart at the
// page's foot; the layout names the words it breaks.

/**
 * The table in this text: [{ cc, range, neutral, parameter, page }], `page` the PDF page of the row
 * (`firstPage`, the text's first, counted on at each form feed pdftotext ends a page with).
 */
export function readControllerTable(text, { ligatures = {}, firstPage = 1 } = {}) {
  const rows = [];
  let cols = null;
  const lines = text.split('\f').flatMap((pageText, i) => pageText.split('\n').map((line) => ({ line, page: firstPage + i })));
  for (const { line, page } of lines) {
    const head = /^(\s*)CC(\s+)Bereich(\s+)Neutral(\s+)Parameter/.exec(line);
    if (head) {
      const at = (word) => line.indexOf(word);
      cols = { range: at('Bereich'), neutral: at('Neutral'), parameter: at('Parameter') };
      continue;
    }
    if (!cols || /^\s*\d+ of \d+\s*$/.test(line)) continue;                 // the page's number
    const cc = /^\s*(\d{1,3})\s/.exec(line);
    if (!cc) { if (line.trim() && !/^\s*(?:\d+ of \d+|f+l?i?|ff|fl|fi)\s*$/.test(line) && rows.length) cols = null; continue; }
    // A cell starts a little left of its title where it is centred under it: take each from 2 points before.
    const cell = (from, to) => line.slice(Math.max(0, from - 2), to === undefined ? undefined : to - 2).trim();
    let parameter = cell(cols.parameter);
    for (const [broken, whole] of Object.entries(ligatures)) parameter = parameter.replace(new RegExp(`\\b${broken}\\b`, 'g'), whole);
    rows.push({ cc: Number(cc[1]), range: cell(cols.range, cols.neutral) || null, neutral: cell(cols.neutral, cols.parameter) ? Number(cell(cols.neutral, cols.parameter)) : null, parameter, page });
  }
  return rows;
}
