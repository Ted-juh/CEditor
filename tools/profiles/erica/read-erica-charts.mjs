// read-erica-charts.mjs — the MIDI charts of Erica Synths' manuals -> their rows as printed, decided
// nothing.
//
// Two shapes:
//   - the voice matrix (the PĒRKONS HD-01): a parameter a row, a column for each voice under
//     `VOICE 1  VOICE 2 …`, the controller in each cell;
//   - the function lists (the LXR-02): `CC  Function  Voice` and `NRPN Nr.  Function  Voice`, up to
//     three lists side by side on a page, the CC list running on into the NRPN list's page. Each list
//     starts at its header's number column; a row is a number there, the function, and the voice
//     (`1` - `6`, `all`, `-`).
// A cell is words set less than 8 points apart; the columns are further apart than that.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

const cellsOf = (words) => {
  const cells = [];
  for (const w of [...words].sort((a, b) => a.x0 - b.x0)) {
    const prev = cells.at(-1);
    if (prev && w.x0 - prev.x1 < 8) { prev.words.push(w); prev.x1 = w.x1; } else cells.push({ x0: w.x0, x1: w.x1, words: [w] });
  }
  return cells.map((c) => ({ x0: c.x0, x1: c.x1, text: text(c.words) }));
};

/** The voice matrix: [{ page, name, voice, cc }], a cell each. */
export function readVoiceMatrix(lines) {
  const header = lines.find((l) => l.words.filter((w) => w.text === 'VOICE').length >= 2);
  if (!header) throw new Error('no VOICE header on these pages');
  const voices = header.words.filter((w) => w.text === 'VOICE').map((w) => ({ x0: w.x0, voice: Number(header.words[header.words.indexOf(w) + 1]?.text) }));
  const right = voices.at(-1).x0 + 60;
  const rows = [];
  for (const l of lines.filter((x) => x.page === header.page && x.y > header.y)) {
    const cells = cellsOf(l.words.filter((w) => w.x0 < right));
    if (cells.length !== voices.length + 1 || !/^[A-Z][A-Z0-9 ]+$/.test(cells[0].text) || cells[0].x1 > voices[0].x0) continue;
    const numbers = cells.slice(1);
    if (!numbers.every((c) => /^\d{1,3}$/.test(c.text))) continue;
    numbers.forEach((c, k) => {
      // A cell under its voice's header (they are set within a few points of it).
      const v = voices.reduce((best, x) => (Math.abs(x.x0 - c.x0) < Math.abs(best.x0 - c.x0) ? x : best));
      if (v !== voices[k]) throw new Error(`${cells[0].text}: a cell out of its column`);
      rows.push({ page: l.page, name: cells[0].text, voice: v.voice, cc: Number(c.text) });
    });
  }
  return rows;
}

/** The function lists: [{ page, kind: 'cc' | 'nrpn', number, name, voice }], `-` rows included. */
export function readFunctionLists(lines) {
  const rows = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  for (const page of pages) {
    const on = lines.filter((l) => l.page === page);
    // The lists on this page: where each header's number column starts, and its kind.
    // (Read by word: `NRPN Nr.` is set as close to `Function` as a cell's words are.)
    const lists = [];
    for (const l of on) {
      const w = [...l.words].sort((a, b) => a.x0 - b.x0);
      w.forEach((word, k) => {
        if (word.text !== 'Function' || w[k + 1]?.text !== 'Voice') return;
        if (w[k - 1]?.text === 'CC') lists.push({ y: l.y, x0: w[k - 1].x0, voiceX: w[k + 1].x0, kind: 'cc' });
        else if (w[k - 1]?.text === 'Nr.' && w[k - 2]?.text === 'NRPN') lists.push({ y: l.y, x0: w[k - 2].x0, voiceX: w[k + 1].x0, kind: 'nrpn' });
      });
    }
    // (A page's footer, `36  LXR OWNERS MANUAL`, has its folio where a list's numbers stand.)
    const footer = (l) => /OWNERSMANUAL/.test(l.words.map((w) => w.text).join(''));
    for (const l of on.filter((x) => !footer(x))) {
      const cells = cellsOf(l.words);
      for (const list of lists.filter((x) => x.y < l.y)) {
        // The number at the list's start (within a few points), the function after it, the voice under
        // its header.
        const at = cells.findIndex((c) => Math.abs(c.x0 - list.x0) <= 4 && /^\d{1,3}$/.test(c.text));
        if (at < 0) continue;
        const name = cells[at + 1];
        const voice = cells.find((c) => Math.abs(c.x0 - list.voiceX) <= 6);
        if (!name || name.x0 >= list.voiceX - 4) {
          // (`98  NRPN fine`, `116  -`: a function and no voice, or nothing at all.)
          rows.push({ page, kind: list.kind, number: Number(cells[at].text), name: name?.text ?? '', voice: voice?.text ?? '' });
          continue;
        }
        rows.push({ page, kind: list.kind, number: Number(cells[at].text), name: name.text, voice: voice && voice !== name ? voice.text : '' });
      }
    }
  }
  // The lists' own order: CC by number, then NRPN by number (a list runs on from page to page).
  return rows.sort((a, b) => (a.kind === b.kind ? a.number - b.number : a.kind === 'cc' ? -1 : 1));
}
