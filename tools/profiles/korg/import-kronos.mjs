// import-kronos.mjs — the KRONOS's MIDI Implementation archive -> tools/profiles/korg/tables/<name>.json
//
//   node tools/profiles/korg/import-kronos.mjs "<unpacked KRONOS_MIDIimp.zip>/MIDI implementation" kronos
//
// Korg publishes the KRONOS's MIDI Implementation as a ZIP (KRONOS_MIDIimp.zip on its support page),
// not as one text: the layout (synths/<name>.mjs) names the files a profile is made from, and this
// keeps what it needs of each, as printed:
//
//   - the object's table (Prog_HD-1.txt): every row, read by read-kronos-table.mjs;
//   - KRONOS_MIDI_SysEx.txt: the blocks of the messages the profile sends and reads (Parameter Change,
//     and the KARMA and Drum Track ones the layout names; Current Object Dump Request, Current Object
//     Dump) and the footnotes they point to;
//   - the voice model's file (SysExParams/VoiceModels/HD-1.txt): its message format and its list of
//     AMS sources by number;
//   - the MIDI implementation (the KRONOS's a PDF, read through pdftotext; the NAUTILUS's text): the
//     Device Inquiry reply and the member codes, and the banks Bank Select reaches (Bank Map KORG).
//
// The NAUTILUS's archive is the same form (NAUTILUS_MIDIimp.zip, its tables under SysExDumps/), without
// the voice model files.
//
// With each file's name and SHA-256 and the page's address. This is committed; Korg's files are not.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLayout } from './import-korg.mjs';
import { footnote, messageBlock, readEngineTables, readObjectHeader, readObjectRows } from './read-kronos-table.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const printedVersion = (text) => /Version\s+([\d.]+)\s+\(([^)]*)\)/.exec(text.split(/\r?\n/)[0] ?? '');

/** The voice model's list of AMS sources: `  0  Off`, `  1  AMS Mixer 1`, … under `HD-1 AMS Sources`. */
export function amsSources(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /AMS Sources\s*$/.test(l));
  if (start < 0) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*(\d+)\s{2,}(\S.*?)\s*$/.exec(line);
    if (m) out.push({ value: Number(m[1]), label: m[2] });
    else if (out.length && line.trim() && !/^[-\s]+$/.test(line)) break;
  }
  return out;
}

/** The voice model's `Message Formats:` paragraph, as printed. */
export function messageFormats(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^Message Formats:/.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /F0 42 3g 68 44/.test(l));
  return lines.slice(start, end < 0 ? start + 20 : end).map((l) => l.trimEnd()).filter(Boolean);
}

/**
 * The Device Inquiry reply from the implementation's text (pdftotext -layout): the bracketed bytes
 * after `DEVICE INQUIRY REPLY` (printed `INQUlRY`), and each model's member code (`KRONOS3 61Keys
 * member code mm = 1D`).
 */
export function inquiryReply(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /DEVICE\s+INQU.RY\s+REPLY/i.test(l));
  if (at < 0) return null;
  const reply = lines.slice(at, at + 3).map((l) => /\[\s*(F0,7E,[^\]]*?)\s*\]/.exec(l)).find(Boolean);
  const members = [];
  for (const line of lines.slice(at, at + 20)) {
    const m = /(\S+\s+\d+Keys)\s+member code mm = ([0-9A-F]{2})/.exec(line);
    if (m) members.push({ model: m[1], code: m[2] });
  }
  return reply ? { reply: reply[1].split(',').map((b) => b.trim()), members } : null;
}

/**
 * The receive table of banks when Global's Bank Map is KORG (`*1 : When Bank Map in Global mode is
 * KORG;`): each line a Bank Select MSB and LSB (a range of LSBs, `79,01-09`, for a run of banks), and
 * what that bank is in Program and in Combination mode (`: Bank INT-A 000 - 127 : Bank INT-A 000 -
 * 127`), either blank. Up to the GM(2) map or the Set List table.
 */
export function bankMap(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /When Bank Map in Global mode is KORG/.test(l));
  if (start < 0) return null;
  const cell = (c) => {
    const m = /^\s*(?:Bank\s+)?(\S.*?)\s+(\d{3}) - (\d{3})\s*$/.exec(c ?? '');
    return m ? { label: m[1], first: Number(m[2]), last: Number(m[3]) } : null;
  };
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (/GM\(2\)|Set List/.test(line)) break;
    const m = /\b([0-9A-F]{2}),([0-9A-F]{2})(?:-([0-9A-F]{2}))?,\s+00 - 7F\s+:(.*)$/.exec(line);
    if (!m) continue;
    const [program, combination] = m[4].split(':');
    rows.push({ msb: m[1], lsb: m[2], ...(m[3] ? { lsbTo: m[3] } : {}), program: cell(program), combination: cell(combination) });
  }
  return rows;
}

export function importArchive(dir, layout) {
  const doc = layout.document;
  const read = (file) => readFileSync(path.join(dir, file), 'latin1');
  const objectText = read(doc.object);
  const messagesText = read(doc.messages);
  const voiceText = doc.voiceModel ? read(doc.voiceModel) : null;
  // The KRONOS's implementation is a PDF, read with pdftotext (poppler); the NAUTILUS's is text.
  const implementationText = doc.implementation.endsWith('.pdf')
    ? execFileSync('pdftotext', ['-layout', path.join(dir, doc.implementation), '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
    : read(doc.implementation);
  const printed = (text) => {
    const m = printedVersion(text);
    return m ? `Version ${m[1]} (${m[2].replace(/\s+/g, ' ')})` : null;
  };
  return {
    source: {
      title: doc.title,
      archive: doc.archive,
      archiveDate: doc.archiveDate,
      url: doc.url,
      file: doc.object,
      printed: printed(objectText),
      sha256: sha256(path.join(dir, doc.object)),
    },
    files: [doc.messages, doc.voiceModel, doc.implementation, doc.engines].filter(Boolean).map((file) => ({
      file,
      ...(file.endsWith('.txt') && printed(read(file)) ? { printed: printed(read(file)) } : {}),
      sha256: sha256(path.join(dir, file)),
    })),
    object: readObjectHeader(objectText),
    messages: {
      parameterChange: messageBlock(messagesText, '43'),
      ...Object.fromEntries([...(layout.functions ?? []).map((f) => f.code), ...(layout.citedMessages ?? [])].map((code) => [code, messageBlock(messagesText, code)])),
      currentObjectDumpRequest: messageBlock(messagesText, '74'),
      currentObjectDump: messageBlock(messagesText, '75'),
      objects: footnote(messagesText, '1'),
      banks: footnote(messagesText, '2'),
      packing: footnote(messagesText, '3'),
      value: footnote(messagesText, '4'),
    },
    ...(voiceText ? { voiceModel: { messageFormats: messageFormats(voiceText), amsSources: amsSources(voiceText) } } : {}),
    identity: inquiryReply(implementationText),
    banks: bankMap(implementationText),
    rows: readObjectRows(objectText),
    ...(doc.engines ? { engines: readEngineTables(read(doc.engines)) } : {}),
  };
}

export function stringifyKronos(data) {
  const { rows, engines, ...rest } = data;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, '');
  const list = (items, indent) => items.map((r) => `${indent}${JSON.stringify(r)}`).join(',\n');
  const engineText = engines
    ? `,\n  "engines": [\n${engines.map(({ rows: er, ...e }) => `    ${JSON.stringify(e).replace(/}$/, '')},"rows":[${er.length ? `\n${list(er, '      ')}\n    ` : ''}]}`).join(',\n')}\n  ]`
    : '';
  return `${head},\n  "rows": [\n${list(rows, '    ')}\n  ]${engineText}\n}\n`;
}

async function main() {
  const [dir, name] = process.argv.slice(2);
  if (!dir || !name) {
    console.error('usage: node tools/profiles/korg/import-kronos.mjs "<unpacked KRONOS_MIDIimp.zip>/MIDI implementation" <name>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (layout.format !== 'kronos') {
    console.error(`${name}'s layout is not a KRONOS object table (format: 'kronos')`);
    process.exitCode = 2;
    return;
  }
  const data = importArchive(dir, layout);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyKronos(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.object.title}, ${data.rows.length} rows, ${data.voiceModel?.amsSources?.length ?? 0} AMS sources, ${data.identity?.members.length ?? 0} member codes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
