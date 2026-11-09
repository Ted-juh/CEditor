// read-novation-sysex.mjs — the SysEx a Novation programmer's reference prints for reading a patch
// back: the request, the message the instrument answers with, and the patch format, byte by byte.
//
// The Circuit Tracks' reference prints each message as a table under its name (`Current Patch Dump
// Request`, `Replace Current Patch`): a byte or a run of bytes in hex a row (`00 20 29`), a choice of
// one (`00 / 01`, the synth), the data (`00 - 7F`, "Synth patch data: 340 bytes"), and F7. Its
// patch format is one row a byte: address, default, min, max, and the setting it holds, or the
// settings it holds bit by bit (`LFO1_OneShot (bit 0), …, LFO1_FadeMode (bits 4-5)`). These are
// single tables down the page, so `pdftotext -layout` reads them as they stand.
//
// Decides nothing about which parameter a byte is: that is the builder's.

import { execFileSync } from 'node:child_process';

export function pagesText(pdf, pages) {
  return pages.map((page) => execFileSync('pdftotext', ['-layout', '-f', String(page), '-l', String(page), pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).join('\n');
}

/**
 * The message printed under a heading: [{ bytes: ['F0'] }, { bytes: ['00', '20', '29'] }, { choice:
 * ['00', '01'], description }, { data: 340 }, { bytes: ['F7'] }], up to and including F7.
 */
export function readMessage(text, heading) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const at = lines.findIndex((l) => l.trim() === heading);
  if (at < 0) return null;
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    // Hex, then the same in decimal (`0 32 41`, `0 - 127`, `0/1`), then what it is.
    const m = /^\s+([0-9A-F]{2}(?:\s[0-9A-F]{2})*|[0-9A-F]{2}\s*\/\s*[0-9A-F]{2}|[0-9A-F]{2}\s*-\s*[0-9A-F]{2})\s{2,}\d[\d\s/-]*?\s{2,}(.*)$/.exec(lines[i]);
    if (!m) continue;
    const token = m[1].trim();
    const description = m[2].trim();
    if (/\//.test(token)) out.push({ choice: token.split('/').map((x) => x.trim()), description });
    else if (/-/.test(token)) out.push({ data: Number(/(\d+)\s*bytes/i.exec(description)?.[1] ?? 0), description });
    else out.push({ bytes: token.split(/\s+/), description });
    if (token === 'F7') break;
  }
  return out.at(-1)?.bytes?.[0] === 'F7' ? out : null;
}

/** The patch format: [{ address, default, min, max, settings: [{ name, bits: [from, to] | null }] }]. */
export function readPatchFormat(text) {
  const rows = [];
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(-|\d+)\s+(-|\d+)\s+(\S.*?)\s*$/.exec(line);
    if (m) { rows.push({ address: Number(m[1]), default: Number(m[2]), min: m[3] === '-' ? null : Number(m[3]), max: m[4] === '-' ? null : Number(m[4]), text: m[5] }); continue; }
    // A name wrapped onto the next line (`LFO2_` / `DelayTrigger (bit 3), …`); a page number is not one.
    const more = /^\s{12,}(\S.*?)\s*$/.exec(line);
    if (more && rows.length && !/^\d+$/.test(more[1])) rows.at(-1).text += rows.at(-1).text.endsWith('_') ? more[1] : ` ${more[1]}`;
  }
  return rows.map(({ text: t, ...row }) => ({
    ...row,
    settings: t.split(/,\s*/).map((part) => {
      const bits = /\(bits?\s*(\d+)(?:\s*-\s*(\d+))?\)/.exec(part);
      return { name: part.replace(/\s*\(bits?[^)]*\)/, '').trim(), bits: bits ? [Number(bits[1]), Number(bits[2] ?? bits[1])] : null };
    }),
  }));
}
