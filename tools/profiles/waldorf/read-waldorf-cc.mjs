// read-waldorf-cc.mjs — a Waldorf manual's controller chart -> its rows as printed, decided nothing.
//
// The manuals of Waldorf's instruments edited by control change print an appendix of controllers:
// the micro Q's `Ctrl #`, `Controller Range`, `Controller Name or Sound Parameter`, `Value Range`
// (pp. 151 - 155); the Streichfett's `Ctrl`, `Controller or Sound Control`, `Value Range`, with no
// range column (p. 21); the Rocket's `Ctrl`, `Alt Ctrl`, `Controlle Range`, `Controller or Sound
// Parameter`, `Value Range` (p. 34). The columns are found from those headings on each page. A row is
// a line whose first word, under `Ctrl`, is a number; a line without one runs its row's text on. The
// Streichfett and the Rocket set the chart in two columns with headings over the left only: the right
// is read under the same headings moved across, by as far as its controller numbers stand from the
// left's. The Pulse's manual prints its tables with no headings over most pages, and its value lists
// in its text: readNumberedTable and readNumberedList read those.

import { execFileSync } from 'node:child_process';

import { pageLines } from './read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').trim();

/** The chart's rows on these pages: [{ page, controller, alt?, range?, name, value }]. */
export function readControllerChart(pdf, pages) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages.at(-1)), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return chartRows(pageLines(xml), pages[0]);
}

/** The headings' columns, from a line with `Ctrl` and `Value` on it: { ctrl, alt?, range?, name, value }. */
function headingColumns(words) {
  const ctrl = words.find((w) => w.text === 'Ctrl');
  const value = words.find((w) => w.text === 'Value' && ctrl && w.x0 > ctrl.x0);
  if (!ctrl || !value) return null;
  const between = words.filter((w) => w.x0 > ctrl.x0 && w.x0 < value.x0);
  const alt = between.find((w) => w.text === 'Alt');
  const controllers = between.filter((w) => w.text === 'Controller');
  const name = controllers.at(-1);
  if (!name) return null;
  // The range column: a first `Controller` (the micro Q's `Controller Range`) or the Rocket's `Control-`.
  const range = controllers.length >= 2 ? controllers[0] : between.find((w) => w.text === 'Control-');
  return { ctrl: ctrl.x0 - 12, ...(alt ? { alt: alt.x0 - 6 } : {}), ...(range ? { range: range.x0 - 2 } : {}), name: name.x0 - 2, value: value.x0 - 2 };
}

/** readControllerChart on lines from pageLines; `first` is the first page's number. */
export function chartRows(lines, first = 1) {
  const rows = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  for (const page of pages) {
    const own = lines.filter((l) => l.page === page);
    const head = own.find((l) => headingColumns(l.words));
    if (!head) continue;
    const left = headingColumns(head.words);
    // The right half: its controller numbers stand as far from the left's as its columns do.
    // (A row's first word from `from` on, a number with words after it.)
    const numbersAt = (from, to, within) => own.flatMap((l) => {
      const ws = l.words.filter((w) => w.x0 >= from && w.x0 < to);
      return ws.length >= 2 && /^\d+$/.test(ws[0].text) && ws[0].x0 < from + within ? [ws[0].x0] : [];
    });
    const half = left.value + 60;
    const leftNumbers = numbersAt(left.ctrl, half, 40);
    const rightNumbers = numbersAt(half, Infinity, Infinity);
    // Medians, not the nearest: a value cell can start with a number (the Streichfett's `1 = Full`).
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const dx = rightNumbers.length >= 2 && leftNumbers.length ? median(rightNumbers) - median(leftNumbers) : null;
    const right = dx ? Object.fromEntries(Object.entries(left).map(([k, x]) => [k, x + dx])) : null;
    for (const [cols, from, to, top] of [[left, 0, right ? right.ctrl : Infinity, head.y], ...(right ? [[right, right.ctrl, Infinity, 0]] : [])]) {
      const order = ['ctrl', 'alt', 'range', 'name', 'value'].filter((k) => cols[k] !== undefined);
      let current = null;
      for (const l of own.filter((x) => x.y > top)) {
        const words = l.words.filter((w) => w.x0 >= from && w.x0 < to);
        if (!words.length || /User.s Manual|Reference Manual|^\d+$|Appendix/.test(text(words))) continue;
        const cell = (k) => {
          const i = order.indexOf(k);
          return words.filter((w) => w.x0 >= cols[k] && (i + 1 >= order.length || w.x0 < cols[order[i + 1]]));
        };
        const number = cell('ctrl');
        if (number.length === 1 && /^\d+$/.test(number[0].text)) {
          current = {
            page: first + page - 1,
            controller: Number(number[0].text),
            ...(cols.alt !== undefined ? { alt: text(cell('alt')) } : {}),
            ...(cols.range !== undefined ? { range: text(cell('range')) } : {}),
            name: text(cell('name')),
            value: text(cell('value')),
          };
          rows.push(current);
        } else if (current && !number.length) {
          // A name or value run on under its row.
          const name = text(cell('name'));
          const v = text(cell('value'));
          if (name && !/^(Sound Parameter|Parameter|Control)$/.test(name)) current.name = `${current.name} ${name}`;
          if (v) current.value = `${current.value} ${v}`;
        }
      }
    }
  }
  return rows;
}

/**
 * A numbered table read without its headings, which the Pulse's manual prints once and then sets
 * each page at its own indent: a row is a number, a range (`0...127`, `16...112`, or one value), the
 * parameter's name and its values, the name and values apart at the widest gap after the range; the
 * lines under it run its values on (`0: Pulse`, `1: Sawtooth` …). The Pulse's controller assignments
 * (appendix B) and its program dump (appendix C): [{ page, number, range, name, value }]. A row whose
 * range is a byte in hex (`$F0`) is a message's framing, not read; the table ends at `stop`.
 */
export function readNumberedTable(pdf, pages, stop = null) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages.at(-1)), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const rows = [];
  let current = null;
  let at0 = null;   // where the current row's values start
  for (const l of pageLines(xml)) {
    const t = text(l.words);
    if (stop && rows.length && stop.test(t)) break;
    if (/User.s Manual|^\d+$/.test(t)) continue;
    const [n, range, ...rest] = l.words;
    if (n && /^\d+$/.test(n.text) && range && /^\d+(?:\.{2,3}|…)\d+$|^\d+$/.test(range.text) && rest.length) {
      let at = 0;
      let widest = -1;
      for (let i = 0; i + 1 < rest.length; i++) { const gap = rest[i + 1].x0 - rest[i].x1; if (gap > widest) { widest = gap; at = i; } }
      const split = widest >= 8 ? at + 1 : rest.length;
      current = { page: pages[0] + l.page - 1, number: Number(n.text), range: range.text, name: text(rest.slice(0, split)), value: text(rest.slice(split)) };
      rows.push(current);
      at0 = rest[split]?.x0 ?? null;
    } else if (current && at0 !== null && Math.abs(l.words[0].x0 - at0) <= 6) {
      // Values run on under their row's values (`1: Sawtooth` under `0: Pulse`).
      current.value = `${current.value} ${t}`.trim();
    } else current = null;
  }
  return rows;
}

/**
 * A numbered list set in a manual's text (the Pulse's `Table 1: Modulation sources`, `0 Off
 * Modulation off`, `1 LFO1 LFO 1 signal` …): from the line `start` matches to the one `end` does,
 * each line's number and its name, the words before the widest gap (the description after it is not
 * kept). [{ value, label }].
 */
export function readNumberedList(pdf, page, start, end) {
  const xml = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const out = [];
  let on = false;
  for (const l of pageLines(xml)) {
    const t = text(l.words);
    if (!on && start.test(t)) on = true;
    if (!on) continue;
    if (end.test(t)) break;
    // The list's own words: a number, then its name, then (set apart) what it means.
    const at = l.words.findIndex((w) => /^\d+$/.test(w.text));
    if (at < 0) continue;
    const rest = l.words.slice(at + 1);
    if (!rest.length) continue;
    let cut = rest.length;
    for (let i = 0; i + 1 < rest.length; i++) if (rest[i + 1].x0 - rest[i].x1 >= 8) { cut = i + 1; break; }
    out.push({ value: Number(l.words[at].text), label: text(rest.slice(0, cut)) });
  }
  return out;
}
