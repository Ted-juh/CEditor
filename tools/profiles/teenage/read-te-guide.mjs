// read-te-guide.mjs — a teenage engineering guide page (HTML) -> its MIDI tables as printed, decided
// nothing.
//
// The guides are web pages whose tables are grids of boxes, set differently from guide to guide (a row
// a box of cells on the OP-1 field's page, a cell a box of its own on the EP-133's). What every one
// keeps is a cell's text in a `txt` div, in reading order, its lines split by `<br/>`. So the page is
// read as that run of cells: a table is a run of header cells (`name  cc  channel  range`, `MIDI cc
// number  range  function`), then its rows, as many cells each, while its controller cell holds a
// controller (`7`, `1-6`, `54 - 57`). The cell before the header says what the table is (`incoming
// midi control change messages.`).

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
const clean = (s) => decode(s.replace(/<br\s*\/?>/g, ' / ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').replace(/^\/\s*|\s*\/$/g, '').trim();

/** The page's cells, in reading order. */
export function pageCells(html) {
  const body = html.split('window.__reactRouterContext')[0];
  return [...body.matchAll(/<div class="txt[^"]*">([\s\S]*?)<\/div>/g)].map((m) => clean(m[1])).filter((c) => c !== '');
}

const HEADERS = /^(?:name|control|function|parameter|cc|MIDI cc number|track ?\/ ?(?:\/ )?channel|channel|range|value)$/i;
const KEY = (h) => (/^(?:name|control|function|parameter)$/i.test(h) ? 'name' : /^(?:cc|MIDI cc number)$/i.test(h) ? 'cc' : /channel/i.test(h) ? 'channel' : 'range');
const CONTROLLER = /^\d{1,3}(?:\s*-\s*\d{1,3})?$/;

/**
 * The tables on a page: [{ caption, columns, rows: [{ name, cc, channel?, range? }] }]. A second
 * set of the same columns (the OP-Z's relative controllers) is `relative cc` and so on.
 */
export function readTables(cells) {
  const tables = [];
  for (let i = 0; i < cells.length; i++) {
    // A header: three or more header cells in a run, a controller column among them.
    let n = 0;
    while (i + n < cells.length && HEADERS.test(cells[i + n])) n++;
    if (n < 3 || !cells.slice(i, i + n).some((c) => KEY(c) === 'cc')) continue;
    const seen = new Set();
    const columns = cells.slice(i, i + n).map((c) => { const k = KEY(c); const key = seen.has(k) ? `relative ${k}` : k; seen.add(k); return key; });
    const ccAt = columns.indexOf('cc');
    const table = { caption: cells[i - 1] ?? '', columns, rows: [] };
    let at = i + n;
    while (at + n <= cells.length && CONTROLLER.test(cells[at + ccAt])) {
      table.rows.push(Object.fromEntries(columns.map((c, k) => [c, cells[at + k]])));
      at += n;
    }
    tables.push(table);
    i = at - 1;
  }
  return tables;
}
