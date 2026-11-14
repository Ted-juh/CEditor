// crosscheck-midi-guide.mjs — compare every device profile's controller and NRPN numbers with MIDI
// Guide's dataset (https://github.com/pencilresearch/midi, CC BY-SA 4.0), a community transcription
// made independently of ours.
//
//   git clone --depth 1 https://github.com/pencilresearch/midi /tmp/midi-guide
//   node tools/profiles/crosscheck-midi-guide.mjs /tmp/midi-guide            # a summary per device
//   node tools/profiles/crosscheck-midi-guide.mjs /tmp/midi-guide --detail   # and each disagreement
//   node tools/profiles/crosscheck-midi-guide.mjs /tmp/midi-guide --json out.json
//
// It is a check, not a source: a profile cites its maker's own document, and nothing from the dataset
// is copied into one or committed here. Two transcriptions made apart from each other rarely misread
// the same row the same way, so where they disagree, one of them misread the document, the document
// changed between firmware versions, or the two read it differently on purpose (a performance
// controller one leaves out). Each disagreement is a row to look up in the maker's document, which
// decides.
//
// For a device both describe, it reports the numbers only one has, and the numbers both have under
// names that share no word. Channels are not compared (a part's parameters sit on the part's channel
// in some profiles); a 14-bit pair is its MSB.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILES = path.resolve(HERE, '../../CE/profiles/test');

// The dataset's manufacturer folders that are ours under another name.
const MAKERS = { KORG: 'Korg', 'Dave Smith Instruments': 'Sequential', 'Radikal Technologies': 'Radikal Technologies' };
// Devices whose names do not match ours word for word: dataset `maker/device` -> profile id.
export const ALIASES = {
  'Roland/Jupiter-X (Jupiter-Xm)': 'roland-jupiter-x',
  'Roland/System-1 (System-1M)': 'roland-system-1',
  'Novation/Summit and Peak': 'novation-summit',
  'Nord/Lead 4 (Lead 4R)': 'nord-lead-4',
  'Nord/Lead (Rack) 2X': 'nord-lead-2x',
  'Kodamo/MASK1EX': 'kodamo-mask1',
};

const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const squash = (s) => words(s).join('');

/** The dataset's rows: [{ maker, device, file, rows: [{ name, cc, ccLsb, nrpn, min, max }] }]. */
export function readDataset(root) {
  const out = [];
  for (const maker of readdirSync(root)) {
    const dir = path.join(root, maker);
    if (!statSync(dir).isDirectory() || maker.startsWith('.')) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv') && !f.includes('triggers'))) {
      const lines = parseCsv(readFileSync(path.join(dir, file), 'utf8'));
      const head = lines.shift() ?? [];
      const at = (name) => head.indexOf(name);
      const num = (v) => (v === undefined || v === '' ? null : Number(v));
      const rows = lines.filter((r) => r.length > 1).map((r) => ({
        name: r[at('parameter_name')], section: r[at('section')],
        cc: num(r[at('cc_msb')]), ccLsb: num(r[at('cc_lsb')]),
        nrpn: num(r[at('nrpn_msb')]) != null && num(r[at('nrpn_lsb')]) != null ? num(r[at('nrpn_msb')]) * 128 + num(r[at('nrpn_lsb')]) : null,
        min: num(r[at('cc_min_value')]), max: num(r[at('cc_max_value')]),
      }));
      out.push({ maker: MAKERS[maker] ?? maker, folder: maker, device: file.replace(/\.csv$/, ''), rows });
    }
  }
  return out;
}

/** RFC 4180 CSV: quoted fields with commas, quotes and line breaks. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** A profile's numbers: { cc: Map(number -> [names]), nrpn: Map(number -> [names]), notes }. */
export function profileNumbers(profile) {
  const recipes = new Map((profile.messageRecipes ?? []).map((r) => [r.id, r]));
  const cc = new Map();
  const nrpn = new Map();
  const add = (map, key, name) => (map.get(key) ?? map.set(key, []).get(key)).push(name);
  for (const p of profile.parameters ?? []) {
    const r = recipes.get(p.messageRecipe);
    if (!r) continue;
    if (r.kind === 'cc' && Number.isInteger(r.controller)) add(cc, r.controller, p.name);
    if (r.kind === 'nrpn' && Number.isInteger(r.parameterMsb) && Number.isInteger(r.parameterLsb)) add(nrpn, r.parameterMsb * 128 + r.parameterLsb, p.name);
  }
  return { cc, nrpn, notes: (profile.authoringNotes ?? []).join('\n') };
}

/** Which profile a dataset device is: an alias, or the profile whose model name is the device's. */
export function matchDevices(dataset, profiles) {
  const pairs = [];
  for (const d of dataset) {
    const alias = ALIASES[`${d.folder}/${d.device}`];
    const found = alias ? profiles.find((p) => p.id === alias)
      : profiles.find((p) => p.manufacturer === d.maker && squash(p.name.replace(new RegExp(`^${d.maker}\\s+`, 'i'), '')) === squash(d.device));
    if (found) pairs.push({ device: d, profile: found });
  }
  return pairs;
}

const STOP = new Set(['the', 'and', 'of', 'a', 'to', 'on', 'cc', 'nrpn', 'msb', 'lsb', 'coarse', 'select', 'param', 'parameter', 'voice', 'count', 'time', 'control', 'value', 'on/off', 'switch', 'type', 'mode']);
// The abbreviations both sides use, each read as the word it stands for (`ENV DEC` is envelope decay).
const WORDS = {
  wf: 'waveform', wave: 'waveform', wav: 'waveform', ct: 'coarse tune', ft: 'fine tune', flt: 'filter', filt: 'filter', vcf: 'filter',
  frq: 'frequency', freq: 'frequency', cutoff: 'frequency', cut: 'frequency', res: 'resonance', reso: 'resonance', q: 'resonance',
  vol: 'volume', env: 'envelope', eg: 'envelope', atk: 'attack', att: 'attack', dec: 'decay', dcy: 'decay', sus: 'sustain', rel: 'release',
  slp: 'slope', dcm: 'decimation', dist: 'distortion', drv: 'drive', mod: 'modulation', amt: 'amount', depth: 'amount', dest: 'destination',
  pw: 'pulse width', pwm: 'pulse width modulation', kbd: 'keyboard', kb: 'keyboard', key: 'keyboard', keyb: 'keyboard', keytrack: 'keyboard tracking',
  lvl: 'level', lev: 'level', osc: 'oscillator', vco: 'oscillator', fx: 'effect', efx: 'effect', porta: 'portamento', glide: 'portamento',
  trk: 'tracking', track: 'tracking', semi: 'semitone', oct: 'octave', fb: 'feedback', fdbk: 'feedback', fbk: 'feedback', spd: 'rate', speed: 'rate',
  vel: 'velocity', velo: 'velocity', at: 'aftertouch', mw: 'modwheel', pan: 'pan', rev: 'reverb', dly: 'delay', ch: 'channel', sync: 'sync',
  num: 'number', no: 'number', nse: 'noise', rpt: 'repeat', cyc: 'cycle', inv: 'invert', bal: 'balance', bpm: 'tempo', hp: 'high pass', lp: 'low pass', hpf: 'high pass', lpf: 'low pass', sub: 'sub', xmod: 'cross modulation', xfade: 'crossfade', ringmod: 'ring modulation', exp: 'expression', ped: 'pedal', sens: 'sensitivity', int: 'intensity', fine: 'fine', tune: 'tune', tun: 'tune', dtn: 'detune', vib: 'vibrato', lfo1: 'lfo 1', lfo2: 'lfo 2', lfo3: 'lfo 3', vca: 'amplifier', amp: 'amplifier',
};
const tokens = (s) => new Set(words(String(s).replace(/([a-z])(\d)/gi, '$1 $2').replace(/(\d)([a-z])/gi, '$1 $2'))
  .flatMap((w) => (WORDS[w] ?? WORDS[w.replace(/s$/, '')] ?? w.replace(/(?<=\w{3})s$/, '')).split(' '))
  .filter((w) => !STOP.has(w)));
// One name abbreviates the other: its letters and digits appear in the other's, in order (`Lforate`
// in `LFO Rate`, `O1 Wave` in `Osc 1 Waveform`, `PWM A` in `Pulse width modulation amount I`).
const within = (short, long) => { let k = 0; for (const c of long) if (c === short[k]) k++; return k === short.length; };
/**
 * Whether two names can be the same parameter: one's words (abbreviations read out) all among the
 * other's, ignoring what is only a voice or part prefix; or one abbreviating the other. A word in
 * common is not enough: `V3 VOL ENV DEC` and `Mod. Envelope decay` share two and are not the same.
 */
export function sameName(a, b) {
  const [ta, tb] = [tokens(a), tokens(b)];
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size && [...small].every((w) => large.has(w))) return true;
  const [x, y] = [squash(a), squash(b)].sort((m, n) => m.length - n.length);
  return x.length >= 3 && within(x, y);
}

/** One device against its profile: the numbers only one has, and those both have under unrelated names. */
export function compare(device, profile) {
  const ours = profileNumbers(profile);
  const theirs = { cc: new Map(), nrpn: new Map() };
  for (const r of device.rows) {
    if (r.cc != null) (theirs.cc.get(r.cc) ?? theirs.cc.set(r.cc, []).get(r.cc)).push(r.name);
    if (r.nrpn != null) (theirs.nrpn.get(r.nrpn) ?? theirs.nrpn.set(r.nrpn, []).get(r.nrpn)).push(r.name);
  }
  const sysex = (profile.messageRecipes ?? []).some((r) => r.kind === 'sysex');
  const report = { id: profile.id, device: `${device.folder}/${device.device}`, sysex, cc: { both: 0, onlyTheirs: [], onlyOurs: [], named: [], renamed: [] }, nrpn: { both: 0, onlyTheirs: [], onlyOurs: [], named: [], renamed: [] } };
  for (const kind of ['cc', 'nrpn']) {
    const label = (n) => (kind === 'cc' ? `CC ${n}` : `NRPN ${n >> 7}/${n & 127}`);
    for (const [n, names] of theirs[kind]) {
      if (!ours[kind].has(n)) {
        // Left out on purpose, and said so: the profile's notes name the number.
        const named = new RegExp(`\\b${kind === 'cc' ? `CC ${n}\\b` : `${n >> 7}/${n & 127}\\b|NRPN ${n}\\b`}`).test(ours.notes);
        report[kind][named ? 'named' : 'onlyTheirs'].push({ number: label(n), theirs: names });
        continue;
      }
      report[kind].both++;
      const mine = ours[kind].get(n);
      if (!names.some((a) => mine.some((b) => sameName(a, b)))) report[kind].renamed.push({ number: label(n), theirs: names, ours: mine });
    }
    // Numbers only ours has count where the dataset lists that kind for the device at all.
    if (theirs[kind].size) for (const [n, names] of ours[kind]) if (!theirs[kind].has(n)) report[kind].onlyOurs.push({ number: label(n), ours: names });
  }
  return report;
}

export function loadProfiles(dir = PROFILES) {
  return readdirSync(dir).filter((f) => f.endsWith('.ceditor-device.json')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

function main() {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--'));
  if (!root) {
    console.error('usage: node tools/profiles/crosscheck-midi-guide.mjs <clone of pencilresearch/midi> [--detail] [--json out.json]');
    process.exitCode = 2;
    return;
  }
  const pairs = matchDevices(readDataset(root), loadProfiles());
  const reports = pairs.map(({ device, profile }) => compare(device, profile));
  const detail = args.includes('--detail');
  for (const r of reports) {
    const line = (k) => `${k.toUpperCase()} both ${r[k].both}, only theirs ${r[k].onlyTheirs.length}, only ours ${r[k].onlyOurs.length}, names differ ${r[k].renamed.length}, left out and named ${r[k].named.length}`;
    console.log(`${r.id}  <->  ${r.device}${r.sysex ? '  (the profile also sets parameters by SysEx)' : ''}\n    ${line('cc')}\n    ${line('nrpn')}`);
    if (!detail) continue;
    for (const k of ['cc', 'nrpn']) {
      for (const x of r[k].onlyTheirs) console.log(`      only theirs  ${x.number}: ${x.theirs.join(' / ')}`);
      for (const x of r[k].onlyOurs) console.log(`      only ours    ${x.number}: ${x.ours.join(' / ')}`);
      for (const x of r[k].renamed) console.log(`      names differ ${x.number}: theirs ${x.theirs.join(' / ')} | ours ${x.ours.join(' / ')}`);
    }
  }
  const jsonAt = args.indexOf('--json');
  if (jsonAt >= 0) writeFileSync(args[jsonAt + 1], `${JSON.stringify(reports, null, 2)}\n`);
  const sum = (k, what) => reports.reduce((n, r) => n + (Array.isArray(r[k][what]) ? r[k][what].length : r[k][what]), 0);
  console.log(`\n${pairs.length} devices compared. CC: ${sum('cc', 'both')} numbers both have, ${sum('cc', 'renamed')} of them under unrelated names; ${sum('cc', 'onlyOurs')} only ours, ${sum('cc', 'onlyTheirs')} only theirs, ${sum('cc', 'named')} left out and named. NRPN: ${sum('nrpn', 'both')} both, ${sum('nrpn', 'renamed')} unrelated names, ${sum('nrpn', 'onlyOurs')} only ours, ${sum('nrpn', 'onlyTheirs')} only theirs.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
