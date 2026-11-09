// read-novation-values.mjs — the value tables Novation's documents print beside their MIDI parameter
// tables (`Osc Waveform Table`, `Table 3: Sync Values`), from poppler's word positions.
//
// A value table is a heading `Value` (or `Waveform Index`, `Sync Index`) with the names' heading to
// its right (`Type`, `Shape`, `Waveform Name`), then a number and a name a line. Some hold several
// lists under headings of their own in the number column (the Circuit Tracks' Filter Table: `Drive
// Type`, then `Type`; its Mod Matrix Table: `Source`, then `Destination`). A name too long for its
// column wraps onto the next line; a few names sit a line below their numbers (`15`, `16` beside
// `analogue pulse`, `analogue sync`), and are given to the numbers left without one, in order.
//
// Decides nothing about which parameter a table belongs to: that is the builder's.

import { execFileSync } from 'node:child_process';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const middle = (box) => (box.y0 + box.y1) / 2;

/** A page's words, put together into phrases: words on one line with no more than a space between. */
export function pagePhrases(xml) {
  const words = [...String(xml).matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: decode(m[5]) }))
    .filter((w) => w.text.trim())
    .sort((a, b) => middle(a) - middle(b) || a.x0 - b.x0);
  const phrases = [];
  for (const w of words) {
    const last = phrases.findLast((p) => Math.abs(middle(p) - middle(w)) < 2 && w.x0 >= p.x1 - 1 && w.x0 - p.x1 < 7
      // A heading ends at `Index`: the MiniNova sets `Waveform Index Waveform Name` a space apart.
      && !/\bIndex$/.test(p.text));
    if (last) Object.assign(last, { text: `${last.text} ${w.text}`, x1: w.x1, y0: Math.min(last.y0, w.y0), y1: Math.max(last.y1, w.y1) });
    else phrases.push({ ...w });
  }
  return phrases.sort((a, b) => middle(a) - middle(b) || a.x0 - b.x0);
}

const NUMBER_HEADING = /^(Value|[\w ]+ Index)$/i;
// Capitalised, as titles are: `sine table` is a waveform.
const TITLE = /\bTable$|^Table \d+:/;
const integer = (text) => /^\d+$/.test(text.trim());

/** The value tables on a page: [{ title, lists: [{ name, entries: [{ value, label }] }] }]. */
export function pageValueTables(phrases) {
  const sameLine = (a, b) => Math.abs(middle(a) - middle(b)) < 2.5;
  const headings = phrases.filter((p) => NUMBER_HEADING.test(p.text.trim()));
  const tables = [];
  for (const h of headings) {
    const right = phrases.filter((p) => p !== h && sameLine(p, h) && p.x0 > h.x1).sort((a, b) => a.x0 - b.x0);
    const nameHeading = right[0];
    if (!nameHeading || NUMBER_HEADING.test(nameHeading.text)) continue;
    // The names run to the next heading on the line (a third column), or to the next table to the
    // right, wherever its headings sit.
    // right, wherever its headings or its title sit (the Circuit Tracks' Audio Table beside its Mod
    // Matrix Table).
    const titles = phrases.filter((p) => TITLE.test(p.text));
    const limit = Math.min((right[1]?.x0 ?? Infinity) - 8, ...headings.filter((o) => o.x0 > nameHeading.x0).map((o) => o.x0 - 12), ...titles.filter((t) => t.x0 > nameHeading.x0 + 10).map((t) => t.x0 - 8));
    const numbersFrom = h.x0 - 16;
    const namesFrom = nameHeading.x0 - 3;
    const inNumbers = (p) => p.x0 >= numbersFrom - 30 && p.x0 < namesFrom;
    const inNames = (p) => p.x0 >= namesFrom && p.x0 < limit - 4;
    // A number and its name set a space apart read as one phrase (the MiniNova's `0 Sine`).
    const numbered = (p) => (inNumbers(p) ? /^(\d+)(?:\s+(.+))?$/.exec(p.text.trim()) : null);
    const below = phrases.filter((p) => middle(p) > middle(h) + 2 && (inNumbers(p) || inNames(p)));
    // Down to a title or another table's heading in these columns, or a long gap.
    const lists = [{ name: '', entries: [] }];
    const unused = [];
    let lastY = middle(h);
    for (const p of below) {
      if (middle(p) - lastY > 45) break;
      if (TITLE.test(p.text) || (NUMBER_HEADING.test(p.text) && inNumbers(p))) break;
      const n = numbered(p);
      if (n && p.x0 >= numbersFrom) {
        const label = [n[2], ...below.filter((q) => q !== p && inNames(q) && sameLine(q, p)).map((q) => q.text)].filter(Boolean).join(' ');
        lists.at(-1).entries.push({ value: Number(n[1]), label, y: middle(p) });
        lastY = middle(p);
      } else if (inNumbers(p) && !n && !below.some((q) => q !== p && numbered(q) && sameLine(q, p))) {
        // A heading in the number column starts a list of its own (`Drive Type`, `Source`).
        if (lists.at(-1).entries.length || lists.at(-1).name) lists.push({ name: p.text, entries: [] });
        else lists.at(-1).name = p.text;
        lastY = middle(p);
      } else if (inNames(p) && !below.some((q) => q !== p && numbered(q) && sameLine(q, p))) {
        unused.push(p);
      }
    }
    // A name wrapped onto the line below a named entry continues it; the rest go, in order, to the
    // entries left without a name.
    const all = lists.flatMap((l) => l.entries);
    const left = [];
    for (const p of unused) {
      const above = all.filter((e) => e.y < middle(p) && middle(p) - (e.lastY ?? e.y) <= 12).at(-1);
      if (above?.label && !all.some((e) => !e.label && Math.abs(e.y - middle(p)) <= 12)) { above.label = `${above.label} ${p.text}`; above.lastY = middle(p); } else left.push(p);
    }
    const unnamed = all.filter((e) => !e.label);
    if (unnamed.length && unnamed.length === left.length) unnamed.forEach((e, i) => { e.label = left[i].text; });
    // Its title: the nearest above it, and of two on one line (the MiniNova's), the nearer across.
    const title = phrases.filter((p) => TITLE.test(p.text) && middle(p) < middle(h) && p.x0 >= numbersFrom - 120 && p.x0 < limit)
      .sort((a, b) => middle(b) - middle(a) || Math.abs(a.x0 - h.x0) - Math.abs(b.x0 - h.x0))[0];
    tables.push({
      y: middle(h),
      title: title?.text.trim() ?? '',
      heading: [h.text.trim(), nameHeading.text.trim()],
      lists: lists.filter((l) => l.entries.length).map((l) => ({ name: l.name, entries: l.entries.map(({ value, label }) => ({ value, label: label.replace(/\s+/g, ' ').trim() })) })),
    });
  }
  // A list with no title of its own is the right-hand half of a titled table on its line (the
  // MiniNova's tweak assignments, 0 - 62 then 63 - 125), or no value table at all (a table of
  // program changes whose third heading is `Value`).
  const out = [];
  for (const t of tables.filter((x) => x.lists.length)) {
    if (t.title) { out.push(t); continue; }
    const whole = out.find((o) => Math.abs(o.y - t.y) < 3 && o.heading.join('/') === t.heading.join('/'));
    if (whole) whole.lists.at(-1).entries.push(...t.lists.flatMap((l) => l.entries));
  }
  return out.map(({ y, ...t }) => t);
}

/** Every value table on the pages given, each with its page. */
export function readValueTables(pdf, pages) {
  const out = [];
  for (const page of pages) {
    const xml = execFileSync('pdftotext', ['-bbox-layout', '-f', String(page), '-l', String(page), pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const t of pageValueTables(pagePhrases(xml))) out.push({ page, ...t });
  }
  return out;
}
