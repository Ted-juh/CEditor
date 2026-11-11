// read-twisted-page.mjs — the MIDI tables of Twisted Electrons' web manuals, as printed, decided
// nothing.
//
// A manual page sets each table in a `midi-table-wrap` block: an `<h3>` title, a note, a header
// row of `<th>` and a body of `<tr>` rows of `<td>` cells (TWISTfm's Core MIDI Messages, Direct
// Performance CCs, Main Fader CCs, SysEx Editor Protocol, SysEx Responses, Editor SysEx Parameter
// Index, Raw Preset and Raw Setting SysEx Address Index). And the paragraph under a heading, as
// text (`Header: F0 7D 54 57 30. All data bytes are 7-bit. …`).

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rarr: '→', ndash: '–', mdash: '—' };
export const textOf = (html) => html
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Every table on the page, under the heading nearest above it (TWISTfm and BlastBeats set them in
 * `midi-table-wrap` blocks, hapiNES L in `data-table`s under an `<h2>`, deton8 in a `table-wrap`):
 * [{ title, note?, columns: [...], rows: [[cell …] …] }].
 */
export function readTables(html) {
  const out = [];
  for (const table of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const before = html.slice(0, table.index);
    const headings = [...before.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)];
    const heading = headings.at(-1);
    const note = heading ? /<p class="table-note">([\s\S]*?)<\/p>/.exec(before.slice(heading.index)) : null;
    const columns = [...table[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table[0])?.[1] ?? table[0];
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => textOf(c[1]))).filter((r) => r.length);
    out.push({ title: heading ? textOf(heading[2]) : '', ...(note ? { note: textOf(note[1]) } : {}), columns, rows });
  }
  return out;
}

/** The text of the paragraphs between a heading and the next table or heading. */
export function paragraphAfter(html, heading) {
  const at = html.indexOf(heading);
  if (at < 0) return null;
  const rest = html.slice(at + heading.length);
  const end = rest.search(/<table|<h[23]/);
  return textOf(rest.slice(0, end < 0 ? 2000 : end)) || null;
}
