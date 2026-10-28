// ce.file — the part that is the same in every runtime: taking .syx and .mid files apart and putting
// them together. These work on bytes the script already holds, so they run everywhere, window shut
// too; the dialogs that bring a file's bytes in are the panel view's (panelRuntime.js).
//
// Design record: docs/design/ce-file-module.md. The JavaScript prelude runs this file itself
// (tools/scripts/gen-file-prelude.mjs); the Lua and Python preludes are ports held to the same
// answers by test/fileParity.test.js.
//
// `say(level, text)` reports a refused call ('error') or something left out ('warn').

const HEX_TEXT = /^([0-9a-fA-F]{2})*$/;
const DEFAULT_TICKS = 480;

/* -------------------------------------------------------------------------------- helpers */

function opt(opts, key) {
  return opts && typeof opts === 'object' ? opts[key] : undefined;
}

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampInt(v, lo, hi, fallback) {
  if (!finite(v)) return fallback;
  const x = Math.floor(v + 0.5);
  return x < lo ? lo : (x > hi ? hi : x);
}

/** Bytes from a list of numbers 0 to 255, or hex text ("F0 41 10" or "F04110"). Else null. */
export function fileBytes(v) {
  if (typeof v === 'string') {
    const text = v.replace(/\s+/g, '').replace(/^0x/i, '');
    if (!HEX_TEXT.test(text)) return null;
    const out = [];
    for (let i = 0; i < text.length; i += 2) out.push(parseInt(text.slice(i, i + 2), 16));
    return out;
  }
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const b of v) {
    if (!finite(b) || b < 0 || b > 255 || Math.floor(b) !== b) return null;
    out.push(b);
  }
  return out;
}

function startsWith(list, prefix) {
  if (list.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (list[i] !== prefix[i]) return false;
  return true;
}

/* -------------------------------------------------------------------------------- SysEx */

/** The SysEx messages in a .syx file's bytes, each from F0 to F7, in order. */
export function fileSyxSplit(bytes, opts, say) {
  const data = fileBytes(bytes);
  if (data === null) {
    say('error', 'ce.file.syxSplit: bytes must be a list of numbers 0 to 255, or hex text, so nothing was split.');
    return [];
  }
  let prefix = [];
  const givenPrefix = opt(opts, 'prefix');
  if (givenPrefix !== undefined && givenPrefix !== null) {
    const p = fileBytes(givenPrefix);
    if (p === null) {
      say('error', 'ce.file.syxSplit: prefix must be bytes, a list or hex text, so nothing was split.');
      return [];
    }
    prefix = p;
  }
  const out = [];
  let current = null;
  let start = 0;
  let stray = 0;
  let firstStray = -1;
  for (let i = 0; i < data.length; i += 1) {
    const b = data[i];
    if (b === 0xF0) {
      if (current !== null) say('warn', `ce.file.syxSplit: the message at byte ${start} has no F7 before the next F0, so it was left out.`);
      current = [b];
      start = i;
    } else if (current === null) {
      stray += 1;
      if (firstStray < 0) firstStray = i;
    } else {
      current.push(b);
      if (b === 0xF7) {
        if (startsWith(current, prefix)) out.push(current);
        current = null;
      }
    }
  }
  if (current !== null) {
    if (opt(opts, 'partial') === true) {
      if (startsWith(current, prefix)) out.push(current);
    } else {
      say('warn', `ce.file.syxSplit: the last message, from byte ${start}, has no F7, so it was left out.`);
    }
  }
  if (stray > 0) say('warn', `ce.file.syxSplit: ${stray} ${stray === 1 ? 'byte' : 'bytes'} outside any message ${stray === 1 ? 'was' : 'were'} left out, the first at byte ${firstStray}.`);
  return out;
}

/** Messages as one .syx file's bytes, in the order given. */
export function fileSyxJoin(messages, say) {
  if (!Array.isArray(messages)) {
    say('error', 'ce.file.syxJoin: messages must be a list of messages, so nothing was joined.');
    return undefined;
  }
  const out = [];
  for (let i = 0; i < messages.length; i += 1) {
    const m = fileBytes(messages[i]);
    if (m === null || m.length < 2 || m[0] !== 0xF0 || m[m.length - 1] !== 0xF7) {
      say('error', `ce.file.syxJoin: message ${i + 1} does not start with F0 and end with F7, so nothing was joined.`);
      return undefined;
    }
    for (const b of m) out.push(b);
  }
  return out;
}

/* ------------------------------------------------------------------------------ MIDI files */

function u16(d, at) { return d[at] * 256 + d[at + 1]; }
function u32(d, at) { return ((d[at] * 256 + d[at + 1]) * 256 + d[at + 2]) * 256 + d[at + 3]; }
function latin1(d, from, to) {
  let s = '';
  for (let i = from; i < to; i += 1) s += String.fromCharCode(d[i]);
  return s;
}

/** Text from bytes: UTF-8 when they are, else one character per byte (Latin-1), as old files are. */
function textOf(d, from, to) {
  let s = '';
  let i = from;
  while (i < to) {
    const b = d[i];
    let n = 0;
    let cp = 0;
    if (b < 0x80) { s += String.fromCharCode(b); i += 1; continue; }
    if (b >= 0xC2 && b <= 0xDF) { n = 1; cp = b & 0x1F; }
    else if (b >= 0xE0 && b <= 0xEF) { n = 2; cp = b & 0x0F; }
    else if (b >= 0xF0 && b <= 0xF4) { n = 3; cp = b & 0x07; }
    else return latin1(d, from, to);
    for (let k = 1; k <= n; k += 1) {
      const c = d[i + k];
      if (c === undefined || i + k >= to || (c & 0xC0) !== 0x80) return latin1(d, from, to);
      cp = cp * 64 + (c & 0x3F);
    }
    if ((n === 2 && cp < 0x800) || (n === 3 && (cp < 0x10000 || cp > 0x10FFFF)) || (cp >= 0xD800 && cp <= 0xDFFF)) return latin1(d, from, to);
    s += String.fromCodePoint(cp);
    i += n + 1;
  }
  return s;
}

/** Text as UTF-8 bytes. */
function utf8(text) {
  const out = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
    else if (cp < 0x10000) out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    else out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
  }
  return out;
}

/** Read a variable-length number at `at`: [value, next]. */
function varLen(d, at, end) {
  let value = 0;
  let i = at;
  for (let n = 0; n < 4; n += 1) {
    if (i >= end) return null;
    const b = d[i];
    i += 1;
    value = value * 128 + (b & 0x7F);
    if ((b & 0x80) === 0) return [value, i];
  }
  return null;
}

function midiRefuse(say, why) {
  say('error', `ce.file.midiRead: ${why}, so nothing was read.`);
  return undefined;
}

/** One track chunk's notes and events. */
function readTrack(d, from, to, tpb, index, song, say) {
  const track = { name: '', notes: [], events: [] };
  const open = {};      // channel:note -> notes still sounding, oldest first
  let at = from;
  let tick = 0;
  let status = 0;
  let endTick = 0;
  while (at < to) {
    const delta = varLen(d, at, to);
    if (delta === null) return null;
    tick += delta[0];
    at = delta[1];
    if (at >= to) return null;
    let b = d[at];
    if (b === 0xFF) {
      if (at + 1 >= to) return null;
      const type = d[at + 1];
      const len = varLen(d, at + 2, to);
      if (len === null || len[1] + len[0] > to) return null;
      const body = len[1];
      const bodyEnd = body + len[0];
      if (type === 0x03 && track.name === '') track.name = textOf(d, body, bodyEnd);
      else if (type === 0x51 && len[0] === 3) {
        const micro = (d[body] * 256 + d[body + 1]) * 256 + d[body + 2];
        if (micro > 0) song.tempos.push({ beat: tick / tpb, bpm: 60000000 / micro });
      } else if (type === 0x58 && len[0] >= 2 && song.timeSignature === null) {
        song.timeSignature = [d[body], Math.pow(2, d[body + 1])];
      } else if (type === 0x2F) {
        endTick = tick;
        at = bodyEnd;
        break;
      }
      at = bodyEnd;
      endTick = tick;
      continue;
    }
    if (b === 0xF0 || b === 0xF7) {
      const len = varLen(d, at + 1, to);
      if (len === null || len[1] + len[0] > to) return null;
      const bytes = b === 0xF0 ? [0xF0] : [];
      for (let i = len[1]; i < len[1] + len[0]; i += 1) bytes.push(d[i]);
      track.events.push({ beat: tick / tpb, bytes });
      at = len[1] + len[0];
      endTick = tick;
      continue;
    }
    if (b < 0x80) {
      if (status === 0) return null;
      b = status;          // running status: the data byte is read again below
    } else {
      status = b;
      at += 1;
    }
    const kind = b & 0xF0;
    const size = kind === 0xC0 || kind === 0xD0 ? 1 : 2;
    if (at + size > to) return null;
    const x = d[at];
    const y = size === 2 ? d[at + 1] : 0;
    at += size;
    endTick = tick;
    const channel = (b & 0x0F) + 1;
    if (kind === 0x90 && y > 0) {
      const note = { beat: tick / tpb, note: x, velocity: y, length: 0, channel };
      track.notes.push(note);
      const key = `${channel}:${x}`;
      if (!open[key]) open[key] = [];
      open[key].push({ note, tick });
    } else if (kind === 0x80 || kind === 0x90) {
      const key = `${channel}:${x}`;
      const waiting = open[key];
      if (waiting && waiting.length > 0) {
        const first = waiting.shift();
        first.note.length = (tick - first.tick) / tpb;
      }
    } else {
      track.events.push({ beat: tick / tpb, bytes: size === 2 ? [b, x, y] : [b, x] });
    }
  }
  for (const key of Object.keys(open).sort()) {
    for (const w of open[key]) {
      w.note.length = (endTick - w.tick) / tpb;
      say('warn', `ce.file.midiRead: note ${w.note.note} on channel ${w.note.channel} at beat ${w.note.beat} in track ${index} never ends, so it lasts to the end of its track.`);
    }
  }
  return track;
}

/** A Standard MIDI File, types 0 and 1, as a song: tracks of notes and events, times in beats. */
export function fileMidiRead(bytes, opts, say) {
  const d = fileBytes(bytes);
  if (d === null) return midiRefuse(say, 'bytes must be a list of numbers 0 to 255, or hex text');
  if (d.length < 14 || latin1(d, 0, 4) !== 'MThd') return midiRefuse(say, 'that is not a MIDI file (it does not start with "MThd")');
  const headerLen = u32(d, 4);
  const format = u16(d, 8);
  const count = u16(d, 10);
  const division = u16(d, 12);
  if (format === 2) return midiRefuse(say, 'it is a type 2 file (separate songs in one file), which is not read');
  if (format > 2) return midiRefuse(say, `it says it is a type ${format} file, which does not exist`);
  if (division >= 0x8000) return midiRefuse(say, 'its times are in SMPTE frames, not beats');
  if (division === 0) return midiRefuse(say, 'it gives 0 ticks per beat');
  const only = opt(opts, 'track');
  if (only !== undefined && only !== null && (!finite(only) || Math.floor(only) !== only || only < 1 || only > count)) {
    return midiRefuse(say, `track ${String(only)} is not a track of the file, which has ${count}`);
  }
  const song = { ticksPerBeat: division, tempo: 120, tempos: [], timeSignature: null, tracks: [] };
  let at = 8 + headerLen;
  let index = 0;
  while (at + 8 <= d.length && index < count) {
    const id = latin1(d, at, at + 4);
    const len = u32(d, at + 4);
    const from = at + 8;
    const to = Math.min(d.length, from + len);
    at = from + len;
    if (id !== 'MTrk') continue;
    index += 1;
    const track = readTrack(d, from, to, division, index, song, say);
    if (track === null) return midiRefuse(say, `track ${index} is cut short or damaged`);
    if (only === undefined || only === null || only === index) song.tracks.push(track);
  }
  song.tempos.sort((a, b) => a.beat - b.beat);
  if (song.tempos.length > 0 && song.tempos[0].beat === 0) song.tempo = song.tempos[0].bpm;
  if (song.timeSignature === null) song.timeSignature = [4, 4];
  return song;
}

function pushVarLen(out, value) {
  let v = Math.max(0, Math.floor(value));
  const groups = [v & 0x7F];
  v = Math.floor(v / 128);
  while (v > 0) {
    groups.push((v & 0x7F) | 0x80);
    v = Math.floor(v / 128);
  }
  for (let i = groups.length - 1; i >= 0; i -= 1) out.push(groups[i]);
}

function pushU32(out, v) {
  out.push(Math.floor(v / 16777216) % 256, Math.floor(v / 65536) % 256, Math.floor(v / 256) % 256, v % 256);
}

function noteFrom(n, channel, index, say) {
  if (!n || typeof n !== 'object' || !finite(n.beat) || n.beat < 0 || !finite(n.note)) {
    say('error', `ce.file.midiWrite: note ${index} needs a beat of 0 or more and a note number, so nothing was written.`);
    return null;
  }
  return {
    beat: n.beat,
    note: clampInt(n.note, 0, 127, 60),
    velocity: clampInt(n.velocity, 1, 127, 100),
    length: finite(n.length) && n.length > 0 ? n.length : 0.25,
    channel: clampInt(n.channel, 1, 16, channel),
  };
}

/** The song a midiWrite argument stands for: a song, a list of notes, or a Phrase Recorder's section. */
function songFrom(song, opts, clock, say) {
  const channel = clampInt(opt(opts, 'channel'), 1, 16, 1);
  if (Array.isArray(song)) {
    const notes = [];
    for (let i = 0; i < song.length; i += 1) {
      const n = noteFrom(song[i], channel, i + 1, say);
      if (n === null) return null;
      notes.push(n);
    }
    return { ticksPerBeat: DEFAULT_TICKS, tempo: null, tempos: [], timeSignature: null, tracks: [{ name: '', notes, events: [] }] };
  }
  if (song && typeof song === 'object' && Array.isArray(song.tracks)) {
    const tracks = [];
    for (const t of song.tracks) {
      const notes = [];
      const list = t && typeof t === 'object' && Array.isArray(t.notes) ? t.notes : [];
      for (let i = 0; i < list.length; i += 1) {
        const n = noteFrom(list[i], channel, i + 1, say);
        if (n === null) return null;
        notes.push(n);
      }
      const events = [];
      for (const e of t && typeof t === 'object' && Array.isArray(t.events) ? t.events : []) {
        const bytes = e && typeof e === 'object' ? fileBytes(e.bytes) : null;
        if (bytes === null || bytes.length === 0 || !finite(e.beat) || e.beat < 0) {
          say('error', 'ce.file.midiWrite: an event needs a beat of 0 or more and its bytes, so nothing was written.');
          return null;
        }
        events.push({ beat: e.beat, bytes });
      }
      tracks.push({ name: t && typeof t.name === 'string' ? t.name : '', notes, events });
    }
    const tpb = clampInt(song.ticksPerBeat, 1, 32767, DEFAULT_TICKS);
    const sig = Array.isArray(song.timeSignature) && song.timeSignature.length >= 2 ? song.timeSignature : null;
    return { ticksPerBeat: tpb, tempo: finite(song.tempo) && song.tempo > 0 ? song.tempo : null, tempos: Array.isArray(song.tempos) ? song.tempos : [], timeSignature: sig, tracks };
  }
  if (song && typeof song === 'object' && song.take && typeof song.take === 'object' && Array.isArray(song.take.events)) {
    // A take is stored as places in the recorder's loop: t and dur are parts of the loop.
    const perBar = clampInt(clock.beatsPerBar, 1, 32, 4);
    const loop = clampInt(song.bars, 1, 16, 2) * perBar;
    const notes = [];
    const own = clampInt(song.channel, 1, 16, channel);
    for (const e of song.take.events) {
      if (!e || typeof e !== 'object' || !finite(e.t) || !finite(e.note)) continue;
      notes.push({
        beat: e.t * loop,
        note: clampInt(e.note, 0, 127, 60),
        velocity: clampInt(e.velocity, 1, 127, 100),
        length: (finite(e.dur) && e.dur > 0 ? e.dur : 0.1) * loop,
        channel: own,
      });
    }
    return { ticksPerBeat: DEFAULT_TICKS, tempo: null, tempos: [], timeSignature: [perBar, 4], tracks: [{ name: '', notes, events: [] }] };
  }
  say('error', 'ce.file.midiWrite: song must be a song as midiRead gives it, a list of notes, or a Phrase Recorder\'s section, so nothing was written.');
  return null;
}

/** The bytes of one track chunk. */
function trackChunk(track, tpb, metas) {
  const items = [];    // { tick, order, seq, bytes }
  let seq = 0;
  const add = (tick, order, bytes) => {
    items.push({ tick: Math.max(0, Math.floor(tick + 0.5)), order, seq, bytes });
    seq += 1;
  };
  for (const m of metas) add(m.tick, 0, m.bytes);
  if (track.name !== '') {
    const text = utf8(track.name);
    const name = [0xFF, 0x03];
    pushVarLen(name, text.length);
    for (const b of text) name.push(b);
    add(0, 0, name);
  }
  for (const e of track.events) {
    let bytes;
    if (e.bytes[0] === 0xF0) {
      bytes = [0xF0];
      pushVarLen(bytes, e.bytes.length - 1);
      for (let i = 1; i < e.bytes.length; i += 1) bytes.push(e.bytes[i]);
    } else {
      bytes = e.bytes.slice();
    }
    add(e.beat * tpb, 2, bytes);
  }
  for (const n of track.notes) {
    const on = n.beat * tpb;
    add(on, 3, [0x90 + n.channel - 1, n.note, n.velocity]);
    add((n.beat + n.length) * tpb, 1, [0x80 + n.channel - 1, n.note, 0]);
  }
  // Note-offs before anything else at the same tick, so a note played again at once is not cut.
  items.sort((a, b) => a.tick - b.tick || a.order - b.order || a.seq - b.seq);
  const body = [];
  let last = 0;
  for (const item of items) {
    pushVarLen(body, item.tick - last);
    last = item.tick;
    for (const b of item.bytes) body.push(b);
  }
  body.push(0x00, 0xFF, 0x2F, 0x00);
  const out = [0x4D, 0x54, 0x72, 0x6B];
  pushU32(out, body.length);
  for (const b of body) out.push(b);
  return out;
}

function tempoMeta(tick, bpm) {
  const micro = Math.max(1, Math.min(16777215, Math.floor(60000000 / bpm + 0.5)));
  return { tick, bytes: [0xFF, 0x51, 0x03, Math.floor(micro / 65536) % 256, Math.floor(micro / 256) % 256, micro % 256] };
}

/**
 * A MIDI file's bytes. `clock` is the runtime's transport: `{ tempo, beatsPerBar }`, `tempo` null
 * when nothing reports one.
 */
export function fileMidiWrite(song, opts, clock, say) {
  const s = songFrom(song, opts, clock || {}, say);
  if (s === null) return undefined;
  const given = opt(opts, 'tempo');
  let bpm = 120;
  if (finite(given) && given > 0) bpm = given;
  else if (s.tempo !== null) bpm = s.tempo;
  else if (clock && finite(clock.tempo) && clock.tempo > 0) bpm = clock.tempo;
  const name = opt(opts, 'name');
  if (typeof name === 'string' && name !== '') s.tracks[0].name = name;
  const tpb = s.ticksPerBeat;
  const sig = s.timeSignature ?? [clampInt(clock?.beatsPerBar, 1, 32, 4), 4];
  let denomPower = 0;
  let denom = clampInt(sig[1], 1, 64, 4);
  while (denom > 1) { denom = Math.floor(denom / 2); denomPower += 1; }
  const metas = [tempoMeta(0, bpm), { tick: 0, bytes: [0xFF, 0x58, 0x04, clampInt(sig[0], 1, 32, 4), denomPower, 24, 8] }];
  for (const t of s.tempos) {
    if (t && typeof t === 'object' && finite(t.beat) && t.beat > 0 && finite(t.bpm) && t.bpm > 0) metas.push(tempoMeta(t.beat * tpb, t.bpm));
  }
  const out = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, s.tracks.length > 1 ? 1 : 0];
  out.push(Math.floor(s.tracks.length / 256) % 256, s.tracks.length % 256, Math.floor(tpb / 256) % 256, tpb % 256);
  s.tracks.forEach((track, i) => {
    for (const b of trackChunk(track, tpb, i === 0 ? metas : [])) out.push(b);
  });
  return out;
}

/** The four commands, over a runtime's `say` and its transport. */
export function fileCommands(host) {
  const say = (level, text) => host.say(level, text);
  return {
    syxSplit: (bytes, opts) => fileSyxSplit(bytes, opts, say),
    syxJoin: (messages) => fileSyxJoin(messages, say),
    midiRead: (bytes, opts) => fileMidiRead(bytes, opts, say),
    midiWrite: (song, opts) => fileMidiWrite(song, opts, host.clock(), say),
  };
}
