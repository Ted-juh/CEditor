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
// left's.

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
