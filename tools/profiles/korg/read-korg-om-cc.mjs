// read-korg-om-cc.mjs — the microKORG (2002) Owner's Manual, p. 62: "Messages transmitted and received
// by the microKORG", the knobs' control changes as they leave the factory.
//
// The MIDI Implementation names the 41 knob and switch slots and says they are assignable; their
// initial numbers are printed only here. The page is a table set in columns, read from
// `pdftotext -layout` text: synth parameter, vocoder parameter, initial CC, value transmitted, value
// received. Its headings are centred over their columns, so the columns are found from the rows: a
// row is anchored on its `CC#nn`, and the names and values start where most anchored rows start them.
//
// A row's values can wrap onto the line above or below it, and a parameter that means something else
// in vocoder mode prints `Synth; …` and `Vocoder; …` on lines of their own. Each such line goes to
// the nearest row that is not already whole (a row whose own line carries both values, plainly);
// between two equally near, to the one that does not have that kind of line yet.

/** Runs of text separated by two spaces or more, with where each starts. */
function fields(line, from = 0, to = line.length) {
  const out = [];
  const part = line.slice(from, to);
  for (const m of part.matchAll(/\S+(?: \S+)*/g)) out.push({ at: from + m.index, text: m[0] });
  return out;
}

/** The value most often seen. */
function mode(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

/** The page's rows: { cc, synth, vocoder, sent, received } with sent/received as printed, joined. */
export function readOmCcPage(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const head = lines.findIndex((l) => /Initial/.test(l) && /Value \(transmitted\)/.test(l) && /Value \(received\)/.test(l));
  if (head < 0) return [];
  const anchors = [];
  for (let i = head + 1; i < lines.length; i++) {
    const m = /CC#(\d+)/.exec(lines[i]);
    if (m) anchors.push({ line: i, cc: Number(m[1]), at: m.index, end: m.index + m[0].length });
  }
  if (!anchors.length) return [];
  const ccAt = mode(anchors.map((a) => a.at));
  const after = (a) => fields(lines[a.line], a.end);
  const before = (a) => fields(lines[a.line], 0, a.at);
  // The vocoder name (or its dash) sits just before the CC; the synth name just before that.
  const vocoderAt = mode(anchors.map((a) => before(a).at(-1)?.at).filter((x) => x !== undefined));
  const synthAt = mode(anchors.map((a) => before(a).filter((f) => f.at < vocoderAt).at(-1)?.at).filter((x) => x !== undefined));
  const sentAt = mode(anchors.map((a) => after(a)[0]?.at).filter((x) => x !== undefined));
  const receivedAt = mode(anchors.map((a) => after(a)).filter((f) => f.length === 2).map((f) => f[1].at));
  const cut = (line) => {
    const out = { sent: [], received: [] };
    for (const f of fields(line, ccAt).filter((x) => !/^CC#\d+$/.test(x.text))) {
      if (f.at < sentAt - 2) continue;
      (f.at >= receivedAt - 2 ? out.received : out.sent).push(f.text);
    }
    return { sent: out.sent.join(' '), received: out.received.join(' ') };
  };
  const kind = (part) => (/^Synth;/.test(part.sent || part.received) ? 'synth' : /^Vocoder;/.test(part.sent || part.received) ? 'vocoder' : 'plain');
  const records = anchors.map((a) => {
    const own = { line: a.line, ...cut(lines[a.line]) };
    const name = (from, to) => lines[a.line].slice(from, to).trim();
    return {
      cc: a.cc,
      synth: name(synthAt, vocoderAt),
      vocoder: name(vocoderAt, a.at).replace(/^[–-]+$/, ''),
      whole: !!own.sent && !!own.received && kind(own) === 'plain',
      parts: [own],
    };
  });
  const end = anchors.at(-1).line + 3;
  for (let i = head + 1; i <= end && i < lines.length; i++) {
    if (anchors.some((a) => a.line === i)) continue;
    const part = { line: i, ...cut(lines[i]) };
    if (!part.sent && !part.received) continue;
    const open = records.filter((r) => !r.whole);
    const distance = (r) => Math.abs(r.parts[0].line - i);
    const best = Math.min(...open.map(distance));
    const near = open.filter((r) => distance(r) === best);
    const k = kind(part);
    const pick = near.find((r) => k === 'plain' || !r.parts.some((p) => kind(p) === k)) ?? near[0];
    pick.parts.push(part);
  }
  return records.map((r) => {
    const parts = r.parts.sort((a, b) => a.line - b.line);
    const join = (key) => parts.map((p) => p[key]).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return { cc: r.cc, synth: r.synth, vocoder: r.vocoder, sent: join('sent'), received: join('received') };
  });
}

/** `Synth; A Vocoder; B` -> { synth: 'A', vocoder: 'B' }; a value with no such split is both. */
export function modes(text) {
  const m = /Synth;\s*(.*?)\s*Vocoder;\s*(.*)$/.exec(text ?? '');
  return m ? { synth: m[1].trim(), vocoder: m[2].trim() } : { synth: text ?? '', vocoder: text ?? '' };
}
