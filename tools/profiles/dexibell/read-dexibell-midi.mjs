// read-dexibell-midi.mjs — the "Received data" of Dexibell's MIDI Implementation PDFs, as printed,
// decided nothing.
//
// Each message is a block, two blocks side by side on a page: a heading (`TW Overdrive Level
// (Controller number 90)`), `Status  2nd byte  3rd byte` and the bytes, `n= MIDI channel number: …;
// default midi ch.14`, `vv= Control value: 00H~7FH (0~127)`, what the values mean (`00H = Off, 7FH =
// On`, `0H = 0, 10H = 1, … 7FH = 8`), and notes (`• Not received when …`); the same messages again
// as transmitted, from the first page whose notes say "Not transmitted". A footage set as a fraction
// a point or two below its heading (`LOWER TW 1` / `1/3'`) is its heading's.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const HEADING = /^(.*?)\s*\(Controller numbers?\s+([\d, ]+?)\s*\)\s*(.*)$/;

/** The blocks on these lines (from documentLines), each column of each page read top to bottom. */
export function readBlocks(lines) {
  const pages = [...new Set(lines.map((l) => l.page))];
  const blocks = [];
  for (const page of pages) {
    const own = lines.filter((l) => l.page === page);
    // The right column starts where a line's second `Status` does.
    const split = own.map((l) => l.words.filter((w) => w.text === 'Status')).find((s) => s.length === 2)?.[1].x0 - 6 || 300;
    for (const side of [(w) => w.x0 < split, (w) => w.x0 >= split]) {
      let lastY = null;
      for (const l of own) {
        const words = l.words.filter(side);
        if (!words.length) continue;
        const t = text(words);
        if (/^DEXIBELL\b|^Versione|^\d+$/.test(t)) continue;
        const heading = HEADING.exec(t);
        if (heading) {
          blocks.push({ page, name: heading[1], controllers: heading[2].split(/\s*,\s*/).map(Number), lines: heading[3] ? [heading[3]] : [] });
          lastY = l.y;
          continue;
        }
        const block = blocks.at(-1);
        if (!block || block.page !== page) { lastY = l.y; continue; }
        // (A fraction set just below its heading.)
        if (lastY != null && l.y - lastY <= 4 && /^\d+\/\d+'?$/.test(t)) { block.name = `${block.name} ${t}`; lastY = l.y; continue; }
        block.lines.push(t);
        lastY = l.y;
      }
    }
  }
  // The document prints its "Received data" and then the same messages as "Transmitted data", with
  // no heading of its own for the second: it starts on the first page whose notes say "Not
  // transmitted".
  const firstTransmitted = Math.min(...blocks.filter((b) => b.lines.some((x) => /^•\s*Not transmitted/i.test(x))).map((b) => b.page));
  return blocks.map(({ lines: ls, ...b }) => ({
    ...b,
    section: b.page >= firstTransmitted ? 'transmitted' : 'received',
    channel: ls.find((x) => /^n= MIDI channel/.test(x)) ?? null,
    values: ls.find((x) => /^vv=/.test(x)) ?? null,
    meanings: ls.filter((x) => /^(?:[0-9A-F]+H\s*=|\d+~\d+\s*=)/.test(x)),
    notes: ls.filter((x) => /^•/.test(x)),
  }));
}
