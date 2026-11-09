// read-korg-text.mjs — a Korg MIDI Implementation (the plain-text file Korg publishes beside each
// manual) -> its tables and footnotes, as printed. Decides nothing about what a parameter is.
//
// Korg has written these the same way for twenty years: ASCII tables boxed in `+---+` and `|`, a
// heading above each (`2-1 CHANNEL MESSAGES`, `TABLE 2 : PROGRAM PARAMETER`, ` *3 : Non Registered
// Parameter Number (NRPN)`), and footnotes after it, three kinds of them:
//
//   *6-01 : vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH       a mark, with its text
//   *3-5 (VOICE MODE)                                                    a list, one value a line
//      0 : ARP LATCH
//   *note P6 (SELECT NOISE)                                              the same, named by a note
//
// A table row that leaves its first cell empty continues the row above (a value list that did not
// fit, a sub-type per type); the reader keeps those lines with the row, in order.

/** The file as lines: BOM, CRLF and tabs gone, nothing else touched. */
export function lines(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
}

const BORDER = /^\s*\+[-+=]+\+\s*$/;
const ROW = /^\s*\|.*\|\s*$/;
// A rule inside a row, between the bit fields that share a byte: `|    -------+-------+---+`.
const INNER = /^\s*\|[\s-]*\+[-+]*\+?\s*$/;
const HEADING = /^\s*(?:(\d+-\d+)\s+(.+?)\s*(?:\[H\].*)?$|(TABLE\s+\d+)\s*:\s*(.+?)\s*$|\*(\d+)\s*:\s*(.+?)\s*$|\((\d+)\)\s+(.+?)\s{2,}.*$|\((\d+)\)\s+(.+?)\s*$)/;

/** The cells of a `| a | b | c |` line, trimmed. */
export function cells(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

/**
 * Every boxed table, with the heading printed above it and its rows. A table's header rows are the
 * rows before its second border; a row whose first cell is empty is a continuation of the row above.
 */
export function readTables(text) {
  const all = lines(text);
  const tables = [];
  let heading = null;
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    const h = HEADING.exec(line);
    if (h && !ROW.test(line) && !BORDER.test(line)) {
      const [id, title] = h[1] ? [h[1], h[2]] : h[3] ? [h[3].replace(/\s+/g, ' '), h[4]] : h[5] ? [`*${h[5]}`, h[6]] : h[7] ? [`(${h[7]})`, h[8]] : [`(${h[9]})`, h[10]];
      heading = { id, title: title.trim(), line: i + 1 };
      continue;
    }
    if (!BORDER.test(line) || !ROW.test(all[i + 1] ?? '')) continue;
    // A table: borders and rows until a line that is neither.
    const start = i;
    const block = [];
    while (i < all.length && (BORDER.test(all[i]) || ROW.test(all[i]) || INNER.test(all[i]))) {
      if (!INNER.test(all[i]) || ROW.test(all[i]) && !/\+\s*$/.test(all[i])) block.push({ text: all[i], line: i + 1 });
      i++;
    }
    i--;
    const borders = block.map((b, k) => (BORDER.test(b.text) ? k : -1)).filter((k) => k >= 0);
    // Header: the rows between the first two borders, when a third border follows (a table whose
    // every row is boxed has no header of its own, and its first row is data).
    const headerEnd = borders.length >= 3 && borders[1] - borders[0] <= 3 ? borders[1] : 0;
    const header = block.slice(1, headerEnd).filter((b) => ROW.test(b.text)).map((b) => cells(b.text));
    const rows = [];
    for (const b of block.slice(headerEnd)) {
      if (!ROW.test(b.text)) continue;
      const c = cells(b.text);
      if (c.every((x) => !x)) continue;
      if (!c[0] && rows.length) rows.at(-1).more.push(c);
      else rows.push({ line: b.line, cells: c, more: [] });
    }
    tables.push({ heading, startLine: start + 1, header, rows });
  }
  return tables;
}

const MARK = /^\s*\*(\d+-\d+|\d+)\s*:\s?(.*)$/;          // *6-01 : text   /  *4 : text
const LIST = /^\s*\*(\d+-\d+)\s*\((.+)\)\s*$/;            // *3-5 (VOICE MODE)
const NOTE = /^\s*\*note\s+([A-Z]\d+)\b\s*(?:\((.*)\))?\s*$/i;   // *note P6 (SELECT NOISE)
const TLIST = /^\s*\*([A-Z]-\d+)\s*:\s*$/;                         // *T-1 :   (entries in columns below)

/**
 * The footnotes: `{ '6-01': { text, line } }` for a mark with text, `{ '3-5': { title, entries } }`
 * and `{ P6: { title, entries } }` for a list. A list entry is `0 : ARP LATCH`, `0 ~ 255 : Poly` or
 * a heading inside the list (`[POLY]`), kept as printed in `lines`.
 */
export function readFootnotes(text) {
  const all = lines(text);
  const marks = {};
  const notes = {};
  let open = null;
  const close = () => { open = null; };
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    if (BORDER.test(line) || ROW.test(line)) { close(); continue; }
    let m = TLIST.exec(line);
    if (m) {
      open = { kind: 'list', key: m[1], title: '', lines: [], line: i + 1 };
      notes[open.key] = open;
      continue;
    }
    m = NOTE.exec(line);
    if (m) {
      open = { kind: 'list', key: m[1].toUpperCase(), title: (m[2] ?? '').trim(), lines: [], line: i + 1 };
      notes[open.key] = open;
      continue;
    }
    m = LIST.exec(line);
    if (m) {
      open = { kind: 'list', key: m[1], title: m[2].trim(), lines: [], line: i + 1 };
      notes[open.key] = open;
      continue;
    }
    m = MARK.exec(line);
    if (m) {
      // The same mark printed twice (the transmitted and received tables share none, but a file can
      // repeat one): the first stands, later ones are kept beside it.
      const entry = { kind: 'mark', key: m[1], text: m[2].trim(), lines: [m[2].trim()], line: i + 1 };
      if (marks[m[1]]) (marks[m[1]].again ??= []).push(entry);
      else marks[m[1]] = entry;
      open = entry;
      continue;
    }
    if (!line.trim()) {
      // A blank line ends a mark's text; a list may have blank lines between its parts.
      if (open?.kind === 'mark') close();
      continue;
    }
    if (open && /^\s{2,}/.test(line)) {
      open.lines.push(line.trim());
      if (open.kind === 'mark') open.text = `${open.text} ${line.trim()}`.trim();
      continue;
    }
    // Text at the left margin that is none of the above: a heading or prose, not part of a note.
    close();
  }
  for (const note of Object.values(notes)) note.entries = listEntries(note.lines);
  return { marks, notes };
}

/** `0 : ARP LATCH`, `0 ~ 255  : Poly`, `48~57 : '0'~'9'` -> { from, to, label }. Other lines are not entries. */
export function listEntries(listLines) {
  const out = [];
  const entry = /^(-?\d+)\s*(?:~\s*(-?\d+))?\s*:\s*/;
  for (const line of listLines) {
    if (!entry.test(line)) continue;
    // Several to a line, in columns (the microKORG S's `0: 1/32       5: 1/8       10: 3/8`, and
    // `3: Sin(Cross) 7: Audio In` with a single space between). A new entry starts only where the
    // label so far closes its brackets: `Percent Type (USER PARAMETER : 0~101 : 0 ~ 100%)` is one.
    let rest = line;
    while (rest) {
      const head = entry.exec(rest);
      if (!head) break;
      let body = rest.slice(head[0].length);
      let cut = body.length;
      for (const m of body.matchAll(/\s+-?\d+\s*(?:~\s*-?\d+)?\s*:/g)) {
        const before = body.slice(0, m.index);
        if ((before.match(/\(/g) ?? []).length === (before.match(/\)/g) ?? []).length) { cut = m.index; break; }
      }
      out.push({ from: Number(head[1]), to: Number(head[2] ?? head[1]), label: body.slice(0, cut).trim() });
      rest = body.slice(cut).trim();
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The document's own title line: `KORG minilogue xd Implementation   Revision 1.01 (2020.2.10)`. */
export function documentTitle(text) {
  const first = lines(text).find((l) => l.trim());
  const m = /^\s*(.*?)\s{2,}Revision\s+(\S+)\s*(?:\((.*)\))?/i.exec(first ?? '');
  return m ? { title: m[1].trim(), revision: m[2], date: m[3] ?? null } : { title: (first ?? '').trim(), revision: null, date: null };
}
