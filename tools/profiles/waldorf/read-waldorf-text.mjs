// read-waldorf-text.mjs — a sound dump's byte table as Waldorf's early SysEx documents type it, decided
// nothing.
//
// The Microwave's (1989) System Exclusive documentation is plain text, and the Wave's, though a PDF,
// was typed the same way: the sound dump byte by byte, each line a byte number (or a run, `153-168`),
// the parameter's name and, in brackets, its values (`(0...127, equals -64...+63)`, `(0: off, 1: on
// )`). The Microwave marks a row its version 2.0 changed with `+` or `*` before the number. A row's
// brackets can run onto the lines below, even onto a line that starts with a number (`12 means
// global. )`): while they are open, the next line is theirs. A row printed with no brackets (`Osc 2
// Octave`, the second of two alike) is kept as printed; what it shares with the first is the
// builder's to decide.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** A document's lines: a text file as it is, a PDF as pdftotext lays it out. */
export function textLines(file) {
  if (/\.pdf$/i.test(file)) return execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/);
  return readFileSync(file, 'latin1').split(/\r?\n/);
}

const depth = (s) => [...s].reduce((d, c) => d + (c === '(' ? 1 : c === ')' ? -1 : 0), 0);

/**
 * A row's text -> its name, what its brackets hold, and what follows them (`see above`). Brackets with
 * no number in them are the name's (`Filter Resonance (Q) (0...127)`).
 */
export function splitRow(text) {
  let open = text.indexOf('(');
  while (open >= 0 && /^\([^()\d]*\)/.test(text.slice(open)) && text.indexOf('(', open + 1) > 0) open = text.indexOf('(', open + 1);
  if (open < 0) return { name: text.replace(/\s+/g, ' ').trim() };
  let d = 0;
  let close = text.length;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')' && --d === 0) { close = i; break; }
  }
  const after = text.slice(close + 1).replace(/^[\s,]+/, '').trim();
  return { name: text.slice(0, open).replace(/\s+/g, ' ').trim(), values: text.slice(open + 1, close).replace(/\s+/g, ' ').trim(), ...(after ? { after } : {}) };
}

/**
 * The byte table from the line `start` matches to the one `end` does: [{ byte, to?, mark?, name,
 * values?, after? }], `to` the last byte of a run (the name's sixteen characters).
 */
export function readByteTable(lines, start, end) {
  const rows = [];
  let on = false;
  let current = null;
  let text = '';
  const close = () => { if (current) rows.push({ ...current, ...splitRow(text) }); current = null; text = ''; };
  for (const line of lines) {
    if (!on) { if (start.test(line)) on = true; continue; }
    if (current && depth(text) > 0) { text += ` ${line.trim()}`; continue; }
    if (end.test(line)) break;
    const m = /^\s*([*+])?\s*(\d+)(?:\s*-\s*(\d+))?\s+(\S.*?)\s*$/.exec(line);
    if (m) {
      close();
      current = { byte: Number(m[2]), ...(m[3] ? { to: Number(m[3]) } : {}), ...(m[1] ? { mark: m[1] } : {}) };
      text = m[4];
    } else close();
  }
  close();
  return rows;
}

/**
 * A numbered list (the modifier table: `0= LFO 1` on the Microwave, `0       Lfo 1` on the Wave), from
 * the line `start` matches (which may carry the first entry) to the one `end` does: [{ value, label,
 * marked? }].
 */
export function readIndexList(lines, start, end) {
  const out = [];
  let on = false;
  for (const line of lines) {
    if (!on) { if (!start.test(line)) continue; on = true; } else if (end.test(line)) break;
    const m = /(?:^|\s)(\d+)(?:\s*=\s*|\s{2,}|\s+(?=[A-Za-z]))(\S.*?)\s*$/.exec(line.replace(/^\s*\*/, ' '));
    if (m) out.push({ value: Number(m[1]), label: m[2], ...(/^\s*\*/.test(line) ? { marked: true } : {}) });
  }
  return out;
}
