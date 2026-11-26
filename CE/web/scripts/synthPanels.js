// synthPanels.js — Animated Synths: panels for real instruments, every knob and slider bound to a
// parameter of the instrument's device profile (CE/profiles/test/), and animation only where it says
// something about the sound. Written to CE/panels/Animated Synths/ by export-showcases.mjs.
//
//   Moog Subsequent 37   the signal path, drawn live: each mixer line glows with its level, the
//                        filter's curve slides with CUTOFF and peaks with RESONANCE, and every note
//                        sends a pulse down the path to the output (scenes on values, and MIDI in)
//   Roland JU-06A        time made visible: keys lit while they are held, echoes after each note as
//                        many as FEEDBACK leaves and as far apart as TIME sets, the chorus shimmering
//                        as far as CHORUS is turned, and a lamp on the transport's beat
//   Korg minilogue xd    the screen talks back: the scope shows VCO 1's wave, a touched knob's name
//                        and value come up on the screen, a program change rolls its number in, and
//                        the step lamps walk the bar in sixteenths at the transport's tempo (scripts)
//   Yamaha YC61          the organ's own physics: the wave the drawbars make, drawn by a script, and
//                        the rotary speaker's horn and drum turning at the speeds the YC61 is set to,
//                        ramping between SLOW and FAST at its acceleration (a script holds the scenes)
//
// What is drawn is what the profile knows. Where it does not know something (the JU-06A's switches
// are numbers until the instrument shows where their positions fall; the profiles say nothing of
// what SHAPE does to each wave) the panel shows the value, not a guess at what it means. The Yamaha
// was to be a reface DX, but Yamaha's manuals chart only one of its twelve algorithms.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { svg, frames, panelMaker, SYNTH_KIND, pattern, gradient, picture, glow } from './festivalKit.js';
import { getPreferredPort } from '../src/CE_Application/models/componentPorts.js';
import { parameterAdoptionPatches } from '../src/CE_Application/utils/parameterAdoptionRules.js';

const PROFILES = join(import.meta.dirname, '../../profiles/test');

/** A device profile as committed. */
export function loadProfile(id) {
  return JSON.parse(readFileSync(join(PROFILES, `${id}.ceditor-device.json`), 'utf8'));
}

/** A colour as SVG writes it: `AARRGGBB` to `#RRGGBB` and an opacity. */
const svgColour = (argb) => [`#${argb.slice(2)}`, (parseInt(argb.slice(0, 2), 16) / 255).toFixed(3)];
/** A rounded frame's line, `w` by `h`. */
function outline(w, h, line, { radius = 6, width = 1 } = {}) {
  const [colour, opacity] = svgColour(line);
  return svg(`<rect x="${width / 2}" y="${width / 2}" width="${w - width}" height="${h - width}" rx="${radius}" fill="none" stroke="${colour}" stroke-opacity="${opacity}" stroke-width="${width}"/>`, w, h);
}
/** A ring, `d` across. */
const ring = (d, line, width = 2) => {
  const [colour, opacity] = svgColour(line);
  return svg(`<circle cx="${d / 2}" cy="${d / 2}" r="${(d - width) / 2}" fill="none" stroke="${colour}" stroke-opacity="${opacity}" stroke-width="${width}"/>`, d, d);
};

function setPath(control, path, value) {
  const keys = path.split('.');
  let node = control._children;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)] = value;
}

/**
 * A panel for one instrument: the profile it needs, named by the instrument (the role a binding
 * names), and `bind`, which makes a control bound to one of its parameters as the editor binds a
 * dropped parameter: the binding, then the parameter's range and choices adopted (autoPanel.js).
 */
function synth(profileId, name, options) {
  const profile = loadProfile(profileId);
  const role = profile.name;
  const f = panelMaker(profileId, name, { ...options, kind: SYNTH_KIND, fields: { requiredProfiles: [{ role, profileId, version: '*' }], gridEnabled: false } });
  const byId = new Map(profile.parameters.map((parameter) => [parameter.id, parameter]));
  f.parameter = (parameterId) => byId.get(parameterId);
  f.bind = (type, cname, parameterId, x, y, w, h, { start = null, ...over } = {}) => {
    const parameter = byId.get(parameterId);
    if (!parameter) throw new Error(`${profileId} has no parameter ${parameterId}`);
    const port = getPreferredPort(type, parameter.type)?.id ?? 'value';
    const control = f.add(type, cname, x, y, w, h, {
      ...over,
      DeviceBindings: { bindings: [{
        kind: 'deviceParameter', port, deviceRole: role, parameterId, parameterType: parameter.type,
        adoptMetadata: true, dryRun: false, feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
      }] },
    });
    control._children.Core.description = `${parameter.name} — ${parameter.messageRecipe ?? ''}`.trim();
    for (const [path, value] of Object.entries(parameterAdoptionPatches(type, parameter))) setPath(control, path, value);
    // Where the panel starts: a patch to look at, not the profile's floor. Sent nowhere until touched.
    // A knob on a choice travels its whole turn across the choices, and starts on the profile's own.
    if (start !== null) control._children.Behavior.defaultCurrentValue = start;
    else if (parameter.type === 'choice' && parameter.choices?.length > 1) {
      const at = Math.max(0, parameter.choices.findIndex((choice) => choice.id === parameter.default));
      control._children.Behavior.defaultCurrentValue = at / (parameter.choices.length - 1);
    }
    return control;
  };
  /** A caption under (or over) a control, attached to it so it moves with it in the editor. */
  f.caption = (control, words, { size = 10, colour = 'FFCFD2D6', dy = 4, width = 96, above = false, family = 'Space Grotesk' } = {}) => {
    const t = control._children.Transform;
    const h = Math.round(size * 1.6);
    const label = f.label(`${control._children.Core.name}Name`, words, Math.round(t.x + t.width / 2 - width / 2),
      above ? t.y - h - dy : t.y + t.height + dy, width, h, { size, colour, family, weight: 600, spacing: 1 });
    label._children.Core.attachedTo = control._children.Core.id;
    return label;
  };
  /** A knob bound to a parameter, centred at (cx, cy), with its caption. */
  f.knob = (cname, parameterId, cx, cy, d, words, { start = null, size = 10, colour } = {}) => {
    const knob = f.bind('Knob', cname, parameterId, Math.round(cx - d / 2), Math.round(cy - d / 2), d, d, { start });
    f.caption(knob, words, { size, ...(colour ? { colour } : {}) });
    return knob;
  };
  /**
   * A section's frame, drawn (a control set dresses a Label's own border its way), and its title on a
   * patch of the panel's colour across the line.
   */
  f.section = (cname, title, x, y, w, h, { line = 'FF4A4D52', bg, colour = 'FFE8E8E4', size = 11 } = {}) => {
    const frame = picture(f.label(`${cname}Frame`, '', x, y, w, h), outline(w, h, line), 'fill');
    const width = Math.round(title.length * (size * 0.72 + 2) + 18);
    f.label(`${cname}Title`, title, x + 10, Math.round(y - size * 0.8), width, Math.round(size * 1.6), { size, colour, fill: bg, spacing: 2 });
    return frame;
  };
  return f;
}

// --- Moog Subsequent 37 -------------------------------------------------------------------------

const MOOG_ORANGE = '#ff9a3c';
/** A mixer channel's line into the bus and down to the rail, glowing: its picture, `h` tall. */
const mixerLine = (h) => svg(`<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>`
  + `<path d="M2 6 L66 6 Q78 6 78 18 L78 ${h - 2}" fill="none" stroke="${MOOG_ORANGE}" stroke-width="6" stroke-opacity=".55" filter="url(#g)"/>`
  + `<path d="M2 6 L66 6 Q78 6 78 18 L78 ${h - 2}" fill="none" stroke="#ffc07a" stroke-width="2.4"/>`, 84, h);
/** The filter's response over three widths of its display: flat, the knee at the middle, then the slope to the floor. */
function filterCurve(w, h, { peak = false } = {}) {
  const width = w * 3;
  const pass = h * 0.42;
  let d = '';
  for (let k = 0; k <= 240; k += 1) {
    const x = (k / 240) * width;
    const rel = (x - width / 2) / w;
    const fall = rel > 0 ? Math.min(h * 1.2, rel * h * 3.2) : 0;
    const bump = peak ? Math.exp(-((rel / 0.06) ** 2)) * h * 0.34 : 0;
    d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${(pass + fall - bump).toFixed(1)}`;
  }
  const stroke = peak
    ? `<path d="${d}" fill="none" stroke="#ffe2a8" stroke-width="7" stroke-opacity=".5" filter="url(#g)"/><path d="${d}" fill="none" stroke="#ffd08a" stroke-width="2.4"/>`
    : `<path d="${d}" fill="none" stroke="${MOOG_ORANGE}" stroke-width="6" stroke-opacity=".35" filter="url(#g)"/><path d="${d}" fill="none" stroke="#ffb35c" stroke-width="2.2"/>`;
  return svg(`<defs><filter id="g" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>${stroke}`, width, h);
}
const WOOD = svg(`<defs><linearGradient id="w" x1="0" x2="1"><stop offset="0" stop-color="#4a2c16"/><stop offset=".5" stop-color="#7a4a26"/><stop offset="1" stop-color="#4a2c16"/></linearGradient></defs>`
  + `<rect width="34" height="520" fill="url(#w)"/>`
  + Array.from({ length: 7 }, (_, i) => `<path d="M${5 + i * 4} 0 C${2 + i * 4} 130 ${9 + i * 4} 260 ${4 + i * 4} 390 S${6 + i * 4} 500 ${5 + i * 4} 520" fill="none" stroke="#2e1a0c" stroke-opacity=".35" stroke-width="1"/>`).join(''), 34, 520);

function moogSubsequent37() {
  const f = synth('moog-subsequent-37', 'Moog Subsequent 37', { set: 'deep-flute', bg: 'FF151618', width: 1200, height: 520 });
  const bg = 'FF151618';
  picture(f.label('CheekL', '', 0, 0, 34, 520), WOOD, 'cover');
  picture(f.label('CheekR', '', 1166, 0, 34, 520), WOOD, 'cover');
  f.label('Model', 'SUBSEQUENT 37', 60, 20, 300, 30, { size: 20, colour: 'FFF2F0EA', weight: 800, spacing: 3, align: 'left' });
  f.label('Kind', 'PARAPHONIC ANALOG SYNTHESIZER', 780, 25, 360, 22, { size: 11, colour: 'FF8E9298', weight: 600, spacing: 2, align: 'right' });

  f.section('Mod', 'MODULATION', 52, 66, 180, 360, { bg });
  f.knob('Lfo1Rate', 'lfo1.lfo1Rate', 100, 130, 44, 'LFO 1 RATE', { start: 7400 });
  f.knob('Lfo2Rate', 'lfo2.lfo2Rate', 184, 130, 44, 'LFO 2 RATE', { start: 4900 });
  f.knob('PitchAmt', 'mod1.mod1PitchAmt', 100, 232, 36, 'PITCH AMT', { start: 2400 });
  f.knob('FilterAmt', 'mod1.mod1FilterAmt', 184, 232, 36, 'FILTER AMT', { start: 5700 });
  f.knob('Glide', 'glide.glideTime', 142, 332, 36, 'GLIDE TIME', { start: 1600 });

  f.section('Osc', 'OSCILLATORS', 246, 66, 200, 360, { bg });
  f.knob('Osc1Octave', 'oscillators.osc1Octave', 300, 130, 48, 'OSC 1 OCT');
  f.knob('Osc1Wave', 'oscillators.osc1Wave', 392, 130, 48, 'OSC 1 WAVE', { start: 10200 });
  f.knob('Osc2Octave', 'oscillators.osc2Octave', 300, 250, 48, 'OSC 2 OCT');
  f.knob('Osc2Freq', 'oscillators.osc2Freq', 392, 250, 48, 'OSC 2 FREQ', { start: 9000 });
  f.knob('BeatFreq', 'oscillators.osc2BeatFreq', 300, 352, 36, 'BEAT FREQ', { start: 8192 });
  f.knob('Osc2Wave', 'oscillators.osc2Wave', 392, 352, 36, 'OSC 2 WAVE', { start: 4900 });

  // The mixer, and each channel's line into the bus: drawn first, so the knobs sit on them.
  const rail = 452;
  const mixer = [['Osc1Level', 'oscillators.osc1Level', 'OSC 1', 112], ['SubLevel', 'oscillators.osc1SubLevel', 'SUB 1', 64],
    ['Osc2Level', 'oscillators.osc2Level', 'OSC 2', 96], ['NoiseLevel', 'oscillators.noiseLevel', 'NOISE', 8], ['FeedbackLevel', 'oscillators.feedbackExtLevel', 'FB / EXT', 20]];
  f.section('Mix', 'MIXER', 460, 66, 140, 360, { bg });
  mixer.forEach((_, i) => {
    const y = 108 + i * 66;
    picture(f.label(`Line${i + 1}`, '', 522, y - 6, 84, rail - y + 8), mixerLine(rail - y + 8), 'fill');
  });
  mixer.forEach(([cname, parameterId, words, start], i) => f.knob(cname, parameterId, 505, 108 + i * 66, 34, words, { start, size: 9 }));

  f.section('Filter', 'FILTER', 614, 66, 250, 360, { bg });
  // The response display: a screen, its grid, then the curve and its resonant peak, each a picture
  // three widths wide shown a width at a time and slid by CUTOFF inside the screen.
  f.label('FilterScreen', '', 630, 88, 218, 96, { fill: 'FF07080A', radius: 5 });
  picture(f.label('FilterGrid', '', 630, 88, 218, 96, { radius: 5 }), svg(Array.from({ length: 5 }, (_, i) => `<line x1="${36 * (i + 1)}" y1="2" x2="${36 * (i + 1)}" y2="94" stroke="#151a1f"/>`).join('')
    + '<line x1="2" y1="40" x2="216" y2="40" stroke="#151a1f" stroke-dasharray="2 4"/><rect x=".5" y=".5" width="217" height="95" rx="5" fill="none" stroke="#2b2e33"/>', 218, 96), 'fill');
  picture(f.label('FilterCurve', '', 630, 88, 218, 96, { radius: 5 }), filterCurve(218, 96), 'contain');
  picture(f.label('FilterPeak', '', 630, 88, 218, 96, { radius: 5 }), filterCurve(218, 96, { peak: true }), 'contain');
  f.label('FilterNote', 'CUTOFF · RESONANCE', 630, 186, 218, 14, { size: 8, colour: 'FF5D6168', weight: 600, spacing: 2 });
  f.knob('Cutoff', 'filter.filterCutoff', 690, 266, 88, 'CUTOFF', { start: 9800, size: 11 });
  f.knob('Resonance', 'filter.filterResonance', 812, 236, 40, 'RESONANCE', { start: 9400 });
  f.knob('EgAmt', 'filterEg.filterEgAmt', 812, 322, 40, 'EG AMT', { start: 10400 });
  f.knob('Drive', 'filter.filterMultidrive', 656, 384, 30, 'DRIVE', { start: 4100, size: 9 });
  f.knob('KbAmt', 'filter.filterKbAmt', 728, 384, 30, 'KB AMT', { start: 8192, size: 9 });

  f.section('Env', 'ENVELOPES', 878, 66, 190, 360, { bg });
  f.label('FilterEgName', 'FILTER EG', 890, 84, 166, 16, { size: 9, colour: 'FF8E9298', weight: 700, spacing: 2 });
  [['A', 'filterEgAttackTime', 2600], ['D', 'filterEgDecayTime', 7200], ['S', 'filterEgSustainTime', 9800], ['R', 'filterEgReleaseTime', 6100]]
    .forEach(([n, id, start], i) => f.knob(`FilterEg${n}`, `filterEg.${id}`, 906 + i * 44, 130, 32, n, { start, size: 9 }));
  f.label('AmpEgName', 'AMP EG', 890, 194, 166, 16, { size: 9, colour: 'FF8E9298', weight: 700, spacing: 2 });
  [['A', 'ampEgAttackTime', 900], ['D', 'ampEgDecayTime', 8200], ['S', 'ampEgSustainTime', 12800], ['R', 'ampEgReleaseTime', 5400]]
    .forEach(([n, id, start], i) => f.knob(`AmpEg${n}`, `ampEg.${id}`, 906 + i * 44, 240, 32, n, { start, size: 9 }));
  f.label('DelayHoldName', 'DELAY · HOLD', 890, 304, 166, 16, { size: 9, colour: 'FF8E9298', weight: 700, spacing: 2 });
  [['FilterEgDelay', 'filterEg.filterEgDelay', 'F DLY'], ['FilterEgHold', 'filterEg.filterEgHold', 'F HLD'], ['AmpEgDelay', 'ampEg.ampEgDelay', 'A DLY'], ['AmpEgHold', 'ampEg.ampEgHold', 'A HLD']]
    .forEach(([cname, id, words], i) => f.knob(cname, id, 906 + i * 44, 350, 28, words, { size: 8 }));

  f.section('Out', 'OUT', 1082, 66, 80, 360, { bg });
  f.knob('Master', 'program.masterVolume', 1122, 150, 44, 'MASTER', { start: 11500 });
  // A lamp lit while a note is held: on a note, out on a note let go.
  f.label('Gate', '', 1112, 268, 20, 20, { fill: 'FF3A2414', radius: 10 });
  f.label('GateName', 'NOTE', 1092, 294, 60, 14, { size: 9, colour: 'FFCFD2D6', weight: 600, spacing: 1 });

  // The path from the bus to the output, its stations, and the pulse a note sends down it.
  f.label('Rail', '', 596, rail - 1.5, 528, 3, { fill: '8CFF9A3C' });
  f.label('RailUp', '', 1120.5, 316, 3, rail - 316, { fill: '8CFF9A3C' });
  for (const [cname, x, words] of [['Ladder', 690, 'LADDER'], ['Vca', 970, 'VCA'], ['OutNode', 1122, 'OUT']]) {
    picture(f.label(cname, '', x - 7, rail - 7, 14, 14, { fill: 'FF151618', radius: 7 }), ring(14, 'FFFF9A3C'), 'fill');
    f.label(`${cname}Name`, words, x - 40, rail + 12, 80, 14, { size: 9, colour: 'FF8E9298', weight: 700, spacing: 1 });
  }
  const pulse = [[14, 'FFFFE2A8', 1], [11, 'FFFFC07A', 0.7], [8, 'FFFF9A3C', 0.45], [6, 'FFFF9A3C', 0.25]];
  pulse.forEach(([size, fill], i) => {
    const dot = f.label(`Pulse${i + 1}`, '', 600 - size / 2, rail - size / 2, size, size, { fill, radius: size / 2 });
    dot._children.Transform.opacity = 0;
    if (i === 0) glow(dot, 'FFFF9A3C', 12);
  });
  f.label('Hint', 'every knob is bound to the Subsequent 37 profile · the lines are the mix, the curve is the filter, a note travels the path', 60, 488, 1080, 16,
    { size: 10, colour: 'FF6C7076', weight: 500, spacing: 1, align: 'left' });

  // Scenes 1-5, each on a mixer knob's value: its line, from barely there to full.
  mixer.forEach((_, i) => f.clip(`Line${i + 1}`, 'Transform', 0, frames([{ at: 0, opacity: 0.08 }, { at: 1, opacity: 1 }]), 1000, i));
  // Scene 6, on CUTOFF: the curve and its peak slid along the screen, the knee from left to right.
  const slide = frames([{ at: 0, zoom: 3, panX: -40, panY: 0 }, { at: 1, zoom: 3, panX: 40, panY: 0 }]);
  f.clip('FilterCurve', 'Transform', 0, slide, 1000, 5);
  f.clip('FilterPeak', 'Transform', 0, slide, 1000, 5);
  // Scene 7, on RESONANCE: the peak, from none to all of it. Its own property: CUTOFF still slides it.
  f.clip('FilterPeak', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.1, opacity: 0.05 }, { at: 1, opacity: 1 }]), 1000, 6);
  // Scene 8, on every note: the pulse from the bus to the output, a trail behind it.
  const run = 900;
  pulse.forEach((_, i) => f.clip(`Pulse${i + 1}`, 'Transform', i * 45, frames([
    { at: 0, x: 0, y: 0, opacity: 0 }, { at: 0.05, opacity: pulse[i][2] }, { at: 0.86, x: 522, y: 0, opacity: pulse[i][2] },
    { at: 0.96, x: 522, y: -40, opacity: 0 }, { at: 1, x: 0, y: 0, opacity: 0 },
  ], { easing: 'inOutQuad' }), run, 7));
  // Scenes 9 and 10: the note lamp, lit on a note and out on a note let go.
  f.clip('Gate', 'Transform', 0, frames([{ at: 0, fill: 'FFFFB35C' }, { at: 1, fill: 'FFFFB35C' }]), 40, 8);
  f.clip('Gate', 'Transform', 0, frames([{ at: 0, fill: 'FFFFB35C' }, { at: 1, fill: 'FF3A2414' }], { easing: 'outQuad' }), 260, 9);

  const value = (control) => ({ source: 'value', control, follow: 'smooth' });
  const anyNote = { type: 'midi', message: 'note', channel: 0, note: -1 };
  return f.scenes([
    ...mixer.map(([cname, , words]) => ({ name: `Mixer ${words}`, length: 1000, trigger: { type: 'script' }, loop: false, clock: value(cname) })),
    { name: 'Filter cutoff', length: 1000, trigger: { type: 'script' }, loop: false, clock: value('Cutoff') },
    { name: 'Filter resonance', length: 1000, trigger: { type: 'script' }, loop: false, clock: value('Resonance') },
    { name: 'Note pulse', length: run + 3 * 45, trigger: anyNote, loop: false },
    { name: 'Note on', length: 40, trigger: anyNote, loop: false },
    { name: 'Note off', length: 260, trigger: { ...anyNote, message: 'noteOff' }, loop: false },
  ]);
}

// --- Roland JU-06A ------------------------------------------------------------------------------

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
/** The keys from `low` to `high` (MIDI notes), each with its name and where it is drawn. */
function keyboard(low, high, x0, width) {
  const whites = [];
  for (let n = low; n <= high; n += 1) if (!BLACK.has(n % 12)) whites.push(n);
  const w = width / whites.length;
  return Array.from({ length: high - low + 1 }, (_, k) => {
    const note = low + k;
    const name = `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
    if (!BLACK.has(note % 12)) return { note, name, black: false, x: x0 + whites.indexOf(note) * w, w };
    return { note, name, black: true, x: x0 + whites.indexOf(note - 1) * w + w * 0.68, w: w * 0.64 };
  });
}

function rolandJu06a() {
  const f = synth('roland-ju-06a', 'Roland JU-06A', { set: 'bakelite', bg: 'FF2A2C2F', width: 1200, height: 600 });
  const bg = 'FF2A2C2F';
  f.label('Stripe', '', 0, 0, 1200, 8, { fill: 'FFE8762B' });
  f.label('Model', 'JU-06A', 40, 22, 200, 30, { size: 20, colour: 'FFF2F0EA', weight: 800, spacing: 3, align: 'left' });
  f.label('Kind', 'SOUND MODULE', 880, 27, 280, 22, { size: 11, colour: 'FF9A9EA4', weight: 600, spacing: 2, align: 'right' });

  const top = 92;
  const sh = 130;
  const slider = (cname, parameterId, cx, words, start) => {
    const control = f.bind('Slider', cname, parameterId, Math.round(cx - 14), top, 28, sh, { start });
    Object.assign(control._children.Behavior, { orientation: 'vertical', direction: 'btt', showTicks: false });
    f.caption(control, words, { size: 9, width: 60, colour: 'FFD6D6D2' });
    return control;
  };
  const line = { bg, line: 'FF4A4D52' };
  f.section('Lfo', 'LFO', 30, 66, 110, 230, line);
  slider('LfoRate', 'lfo.rate', 64, 'RATE', 70);
  slider('LfoDelay', 'lfo.delay', 106, 'DELAY', 38);
  f.section('Dco', 'DCO', 154, 66, 196, 230, line);
  slider('DcoLfo', 'dco.lfo', 186, 'LFO', 24);
  slider('DcoPwm', 'dco.pwm', 228, 'PWM', 52);
  slider('DcoSub', 'dco.sub', 270, 'SUB', 76);
  slider('DcoNoise', 'dco.noise', 312, 'NOISE', 12);
  f.section('Hpf', 'HPF', 364, 66, 70, 230, line);
  slider('HpfFreq', 'hpf.freq', 399, 'FREQ', 20);
  f.section('Vcf', 'VCF', 448, 66, 250, 230, line);
  [['VcfFreq', 'vcf.freq', 'FREQ', 72], ['VcfRes', 'vcf.res', 'RES', 44], ['VcfEnv', 'vcf.env', 'ENV', 64], ['VcfLfo', 'vcf.lfo', 'LFO', 14], ['VcfKybd', 'vcf.kybd', 'KYBD', 76]]
    .forEach(([cname, id, words, start], i) => slider(cname, id, 480 + i * 46, words, start));
  f.section('Vca', 'VCA', 712, 66, 80, 230, line);
  slider('VcaLevel', 'vca.level', 752, 'LEVEL', 90);
  f.section('Env', 'ENV', 806, 66, 230, 230, line);
  [['EnvA', 'env.a', 'A', 12], ['EnvD', 'env.d', 'D', 58], ['EnvS', 'env.s', 'S', 76], ['EnvR', 'env.r', 'R', 44]]
    .forEach(([cname, id, words, start], i) => slider(cname, id, 846 + i * 50, words, start));
  f.section('Perf', 'PERFORMANCE', 1050, 66, 120, 230, line);
  f.knob('Portamento', 'performance.portamentoTime', 1110, 130, 40, 'PORTA TIME', { start: 0, size: 9 });
  f.knob('Modulation', 'performance.modulation', 1110, 230, 40, 'MODULATION', { start: 0, size: 9 });

  // Chorus: two bands drifting against each other behind the knob, faded in as far as it is turned.
  const row = 334;
  f.section('Chorus', 'CHORUS', 30, row - 16, 330, 96, line);
  const bandSlow = f.label('BandSlow', '', 44, row, 220, 30, { radius: 4 });
  pattern(bandSlow, { src: 'builtin:sine', tint: 'FF7FC8FF', opacity: 75, repeat: 'x', scale: 1.4, speed: 14, direction: 0 });
  const bandFast = f.label('BandFast', '', 44, row + 30, 220, 30, { radius: 4 });
  pattern(bandFast, { src: 'builtin:sine', tint: 'FFC79BFF', opacity: 65, repeat: 'x', scale: 1, speed: 44, direction: 180 });
  f.knob('Chorus', 'chorus.offIIiIIi', 310, row + 26, 40, 'CHORUS', { start: 0, size: 9 });

  // Delay: an echo of each note, as many as FEEDBACK leaves, as far apart as TIME sets, as loud as LEVEL.
  f.section('Delay', 'DELAY', 374, row - 16, 400, 96, line);
  const echoes = 5;
  for (let k = 0; k < echoes; k += 1) {
    const h = 44 - k * 6;
    f.label(`Echo${k + 1}`, '', 392, row + 52 - h, 16, h, { fill: 'FF7A5A38', radius: 3 });
  }
  f.label('DelayVeil', '', 386, row - 4, 210, 70, { fill: bg });
  f.label('DelayNote', 'ECHOES OF EACH NOTE', 392, row + 56, 190, 14, { size: 8, colour: 'FF9A9EA4', weight: 600, spacing: 1, align: 'left' });
  f.knob('DelayTime', 'delay.time', 628, row + 26, 36, 'TIME', { start: 52, size: 9 });
  f.knob('DelayFeedback', 'delay.feedback', 682, row + 26, 36, 'FEEDBACK', { start: 70, size: 9 });
  f.knob('DelayLevel', 'delay.level', 736, row + 26, 36, 'LEVEL', { start: 88, size: 9 });

  // Tempo: a lamp on the transport's beat, the tempo the JU-06A follows when it is synced to it.
  f.section('Tempo', 'TEMPO', 788, row - 16, 120, 96, line);
  picture(f.label('TempoRing', '', 830, row + 4, 36, 36), ring(36, 'FFFF5A3C'), 'fill')._children.Transform.opacity = 0;
  f.label('TempoLamp', '', 840, row + 14, 16, 16, { fill: 'FF4A1E16', radius: 8 });
  f.label('TempoName', 'ON THE BEAT', 800, row + 52, 96, 14, { size: 8, colour: 'FF9A9EA4', weight: 600, spacing: 1 });
  f.section('Notes', 'NOTES IN', 922, row - 16, 248, 96, line);
  f.label('NotesSay', 'play the JU-06A, a keyboard or the DAW: each key lights while it is held', 934, row + 4, 224, 60, { size: 10, colour: 'FFB4B8BE', weight: 500, lineHeight: 1.35 });

  // The keys, C3 to C5: white ones first, so the black ones are drawn on top.
  const keys = keyboard(48, 72, 30, 1140);
  const keyTop = 440;
  const whiteRest = 'FFE9E7E2';
  const blackRest = 'FF1B1C1E';
  for (const key of keys.filter((k) => !k.black)) {
    f.label(`Key${key.name}`, '', Math.round(key.x + 1), keyTop, Math.round(key.w - 2), 140, { fill: whiteRest, radius: 4 });
    if (key.name.startsWith('C') && !key.name.startsWith('C#')) f.label(`Key${key.name}Name`, key.name, Math.round(key.x + 1), keyTop + 116, Math.round(key.w - 2), 16, { size: 10, colour: 'FF77777A', weight: 600 });
  }
  for (const key of keys.filter((k) => k.black)) f.label(`Key${key.name}`, '', Math.round(key.x), keyTop, Math.round(key.w), 86, { fill: blackRest, radius: 3 });

  // Scene 1, on CHORUS: both bands from none to their full shimmer.
  f.clip('BandSlow', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }]), 1000, 0);
  f.clip('BandFast', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }]), 1000, 0);
  // Scene 2, on TIME: the echoes from close together to far apart.
  for (let k = 0; k < echoes; k += 1) f.clip(`Echo${k + 1}`, 'Transform', 0, frames([{ at: 0, x: k * 12 }, { at: 1, x: k * 38 }]), 1000, 1);
  // Scene 3, on FEEDBACK: the first echo always, each later one as the feedback reaches it, fainter.
  for (let k = 0; k < echoes; k += 1) {
    const full = Math.round((1 - k * 0.16) * 100) / 100;
    f.clip(`Echo${k + 1}`, 'Transform', 0, frames(k === 0 ? [{ at: 0, opacity: 1 }, { at: 1, opacity: 1 }]
      : [{ at: 0, opacity: 0 }, { at: (k - 0.6) / echoes, opacity: 0 }, { at: k / echoes, opacity: full }, { at: 1, opacity: full }]), 1000, 2);
  }
  // Scene 4, on LEVEL: the veil over the echoes lifted.
  f.clip('DelayVeil', 'Transform', 0, frames([{ at: 0, opacity: 0.94 }, { at: 1, opacity: 0 }]), 1000, 3);
  // Scene 5, on every note: the echoes step out one after another, each a flash of its own.
  const step = 150;
  for (let k = 0; k < echoes; k += 1) f.clip(`Echo${k + 1}`, 'Transform', k * step, frames([{ at: 0, scale: 1, fill: 'FF7A5A38' }, { at: 0.12, scale: 1.25, fill: 'FFFFC98A' }, { at: 1, scale: 1, fill: 'FF7A5A38' }], { easing: 'outQuad' }), 420, 4);
  // Scene 6, on the beat: the lamp, and a ring opening from it.
  f.clip('TempoLamp', 'Transform', 0, frames([{ at: 0, fill: 'FFFF5A3C' }, { at: 1, fill: 'FF4A1E16' }], { easing: 'outQuad' }), 320, 5);
  f.clip('TempoRing', 'Transform', 0, frames([{ at: 0, scale: 0.5, opacity: 1 }, { at: 1, scale: 1.3, opacity: 0 }], { easing: 'outQuad' }), 420, 5);
  // Then a scene for each key held and one for it let go.
  keys.forEach((key, i) => {
    const [rest, lit] = key.black ? [blackRest, 'FFFF9A3C'] : [whiteRest, 'FFFFC98A'];
    f.clip(`Key${key.name}`, 'Transform', 0, frames([{ at: 0, fill: lit }, { at: 1, fill: lit }]), 40, 6 + i * 2);
    f.clip(`Key${key.name}`, 'Transform', 0, frames([{ at: 0, fill: lit }, { at: 1, fill: rest }], { easing: 'outQuad' }), 220, 7 + i * 2);
  });

  const value = (control) => ({ source: 'value', control, follow: 'smooth' });
  return f.scenes([
    { name: 'Chorus', length: 1000, trigger: { type: 'script' }, loop: false, clock: value('Chorus') },
    { name: 'Delay time', length: 1000, trigger: { type: 'script' }, loop: false, clock: value('DelayTime') },
    { name: 'Delay feedback', length: 1000, trigger: { type: 'script' }, loop: false, clock: value('DelayFeedback') },
    { name: 'Delay level', length: 1000, trigger: { type: 'script' }, loop: false, clock: value('DelayLevel') },
    { name: 'Echoes', length: (echoes - 1) * step + 420, trigger: { type: 'midi', message: 'note', channel: 0, note: -1 }, loop: false },
    { name: 'Beat', length: 420, trigger: { type: 'beat', every: 1 }, loop: false },
    ...keys.flatMap((key) => [
      { name: `Key ${key.name}`, length: 40, trigger: { type: 'midi', message: 'note', channel: 0, note: key.note }, loop: false },
      { name: `Key ${key.name} let go`, length: 220, trigger: { type: 'midi', message: 'noteOff', channel: 0, note: key.note }, loop: false },
    ]),
  ]);
}

// --- Korg minilogue xd --------------------------------------------------------------------------

/** One wave as the scope draws it: three periods of a square, a triangle or a saw. */
function scopeWave(kind, w, h) {
  const mid = h / 2;
  const amp = h * 0.38;
  const period = w / 3;
  let d = '';
  for (let k = 0; k <= 360; k += 1) {
    const x = (k / 360) * w;
    const ph = (x / period) % 1;
    const y = kind === 'sqr' ? (ph < 0.5 ? 1 : -1) : kind === 'tri' ? (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4) : 1 - ph * 2;
    d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${(mid - y * amp).toFixed(1)}`;
  }
  return svg(`<defs><filter id="g" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="1.8"/></filter></defs>`
    + `<line x1="0" y1="${mid}" x2="${w}" y2="${mid}" stroke="#1b2229"/>`
    + `<path d="${d}" fill="none" stroke="#e8f4ff" stroke-width="4" stroke-opacity=".35" filter="url(#g)"/><path d="${d}" fill="none" stroke="#e8f4ff" stroke-width="1.8" stroke-linejoin="round"/>`, w, h);
}

// The screen's script, set up once as it loads: a script answers one event of its own, so the three
// it needs are listeners. A touched control's name comes up, pushed in when it is a new one, and its
// value under it; a program change rolls its number in, counted as the profile's banks count; and on
// each beat the step lamps walk a bar of sixteen, a sixteenth at a time at the transport's tempo.
export const minilogueScript = (names) => `// The screen talks back, as the minilogue xd's does.
const NAMES = ${JSON.stringify(names)};
let showing = '';

// A knob on a choice turns across its choices, 0 to 1: the one it is nearest is the one it says.
const shown = (entry, value) => entry.choices
  ? entry.choices[Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * (entry.choices.length - 1))]
  : String(typeof value === 'number' ? Math.round(value) : value);

// A new name is pushed in, and the value comes up once it has arrived: written while the old name was
// still leaving, it read as that control's.
let pushing = false;
let latest = '';
on('*', 'onControlChanged', (info) => {
  const entry = NAMES[info.target];
  if (!entry) return;
  const name = entry.name ?? entry;
  latest = shown(entry, info.value);
  if (name !== showing) {
    showing = name;
    pushing = true;
    set('ScreenValue.Text.content', '');
    const started = animateSwap('ScreenName', name, 'push', { done: (arrived) => {
      if (!arrived) return; // a newer name took over, and brings its own value
      pushing = false;
      set('ScreenValue.Text.content', latest);
    } });
    if (started === false) { pushing = false; set('ScreenValue.Text.content', latest); }
    return;
  }
  if (!pushing) set('ScreenValue.Text.content', latest);
});

// Programs 1-100 are bank 0, 101-200 bank 1, and so on (the profile's preset banks).
on('*', 'onProgramIn', (program) => {
  const number = (program.bankLsb || 0) * 100 + program.program + 1;
  animateSwap('ScreenProgram', 'PROGRAM ' + String(number).padStart(3, '0'), 'roll');
});

// Four sixteenths a beat: the first now, the rest a sixteenth apart at the tempo the beat came at.
on('*', 'onBeat', (time) => {
  const quarter = Math.floor(time.beats) % 4;
  const sixteenth = 60000 / (time.bpm || 120) / 4;
  for (let k = 0; k < 4; k += 1) {
    const scene = 'Step ' + (quarter * 4 + k + 1);
    if (k === 0) animatePlay(scene);
    else after(Math.round(k * sixteenth), () => animatePlay(scene));
  }
});
`;

function korgMinilogueXd() {
  const f = synth('korg-minilogue-xd', 'Korg minilogue xd', { set: 'switchboard', bg: 'FF111214', width: 1200, height: 520 });
  const bg = 'FF111214';
  gradient(f.label('Alu', '', 0, 450, 1200, 70), 180, [[0, '#c9cdd1'], [100, '#8e9398']]);
  f.label('Model', 'minilogue xd', 36, 18, 300, 30, { size: 19, colour: 'FFF2F0EA', weight: 800, spacing: 2.5, align: 'left' });
  f.label('Kind', 'POLYPHONIC ANALOGUE SYNTHESIZER', 800, 23, 364, 22, { size: 11, colour: 'FF8E9298', weight: 600, spacing: 2, align: 'right' });
  const line = { bg, line: 'FF34373C' };
  const names = {};
  // What the screen calls each control; a choice's labels with it, so the screen names the choice.
  const knob = (cname, id, cx, cy, d, words, screen, start = null) => {
    const choices = f.parameter(id)?.choices;
    names[cname] = choices ? { name: screen, choices: choices.map((choice) => choice.label) } : screen;
    return f.knob(cname, id, cx, cy, d, words, { start, size: 9 });
  };

  f.section('Vco', 'VCO 1 · VCO 2', 28, 62, 200, 340, line);
  knob('Vco1Wave', 'oscillator1.wave', 68, 120, 34, 'WAVE', 'VCO1 WAVE');
  knob('Vco1Pitch', 'oscillator1.pitch', 128, 120, 40, 'PITCH', 'VCO1 PITCH', 64);
  knob('Vco1Shape', 'oscillator1.shape', 188, 120, 40, 'SHAPE', 'VCO1 SHAPE', 40);
  knob('Vco2Wave', 'oscillator2.wave', 68, 220, 34, 'WAVE', 'VCO2 WAVE');
  knob('Vco2Pitch', 'oscillator2.pitch', 128, 220, 40, 'PITCH', 'VCO2 PITCH', 70);
  knob('Vco2Shape', 'oscillator2.shape', 188, 220, 40, 'SHAPE', 'VCO2 SHAPE', 20);
  knob('CrossMod', 'oscillators.crossModDepth', 98, 322, 32, 'CROSS MOD', 'CROSS MOD', 0);
  knob('EgInt', 'envelope.int', 158, 322, 32, 'EG INT', 'EG INT', 64);

  f.section('Multi', 'MULTI · MIXER', 242, 62, 160, 340, line);
  knob('MultiShape', 'multiEngine.shape', 322, 120, 40, 'SHAPE', 'MULTI SHAPE', 30);
  knob('Vco1Level', 'oscillator1.level', 272, 222, 30, 'VCO 1', 'VCO1 LEVEL', 110);
  knob('Vco2Level', 'oscillator2.level', 322, 222, 30, 'VCO 2', 'VCO2 LEVEL', 84);
  knob('MultiLevel', 'multiEngine.level', 372, 222, 30, 'MULTI', 'MULTI LEVEL', 30);
  knob('MultiType', 'multiEngine.type', 322, 322, 32, 'TYPE', 'MULTI TYPE');

  // The screen: the program at the top, VCO 1's wave on the scope, and what was touched last.
  f.label('Screen', '', 420, 62, 300, 200, { fill: 'FF030405', radius: 8 });
  picture(f.label('ScreenEdge', '', 420, 62, 300, 200), outline(300, 200, 'FF2A2D33', { radius: 8 }), 'fill');
  f.label('ScreenProgram', 'PROGRAM 001', 436, 72, 268, 22, { size: 13, colour: 'FFE8F4FF', family: 'JetBrains Mono', weight: 700, align: 'left' });
  f.label('ScreenRule', '', 436, 98, 268, 1, { fill: 'FF1B2229' });
  for (const kind of ['sqr', 'tri', 'saw']) picture(f.label(`Scope${kind.toUpperCase()}`, '', 436, 106, 268, 104), scopeWave(kind, 268, 104), 'fill');
  f.label('ScreenBar', '', 436, 222, 268, 28, { fill: 'FF0D1116', radius: 3 });
  f.label('ScreenName', 'TOUCH A KNOB', 446, 225, 160, 22, { size: 12, colour: '73E8F4FF', family: 'JetBrains Mono', weight: 400, align: 'left' });
  f.label('ScreenValue', '', 610, 224, 86, 24, { size: 15, colour: 'FFE8F4FF', family: 'JetBrains Mono', weight: 700, align: 'right' });

  f.section('Filter', 'FILTER', 736, 62, 200, 200, line);
  knob('Cutoff', 'filter.cutoff', 800, 146, 64, 'CUTOFF', 'CUTOFF', 76);
  knob('Resonance', 'filter.resonance', 890, 112, 32, 'RESONANCE', 'RESONANCE', 40);
  knob('Drive', 'filter.drive', 890, 196, 32, 'DRIVE', 'CUTOFF DRIVE');

  f.section('Eg', 'AMP EG · EG', 950, 62, 222, 200, line);
  const fader = (cname, id, cx, y, h, words, screenName, start) => {
    names[cname] = screenName;
    const control = f.bind('Slider', cname, id, Math.round(cx - 11), y, 22, h, { start });
    Object.assign(control._children.Behavior, { orientation: 'vertical', direction: 'btt', showTicks: false });
    f.caption(control, words, { size: 9, width: 40, dy: 2 });
  };
  [['AmpA', 'ampEnvelope.attack', 'A', 'AMP ATTACK', 4], ['AmpD', 'ampEnvelope.decay', 'D', 'AMP DECAY', 70], ['AmpS', 'ampEnvelope.sustain', 'S', 'AMP SUSTAIN', 96], ['AmpR', 'ampEnvelope.release', 'R', 'AMP RELEASE', 50]]
    .forEach(([cname, id, words, screenName, start], i) => fader(cname, id, 986 + i * 50, 80, 66, words, screenName, start));
  [['EgA', 'envelope.attack', 'A', 'EG ATTACK', 10], ['EgD', 'envelope.decay', 'D', 'EG DECAY', 60]]
    .forEach(([cname, id, words, screenName, start], i) => fader(cname, id, 986 + i * 50, 172, 50, words, screenName, start));

  f.section('Lfo', 'LFO', 420, 280, 300, 122, line);
  knob('LfoRate', 'lfo.rate', 480, 334, 36, 'RATE', 'LFO RATE', 56);
  knob('LfoInt', 'lfo.int', 570, 334, 36, 'INT', 'LFO INT', 24);
  knob('LfoWave', 'lfo.wave', 660, 334, 36, 'WAVE', 'LFO WAVE');
  f.section('Fx', 'EFFECTS', 736, 280, 436, 122, line);
  [['ModTime', 'effects.time', 'MOD TIME', 50], ['ModDepth', 'effects.depth', 'MOD DEPTH', 40], ['DelayTime', 'effects.timeCc105', 'DELAY TIME', 70], ['DelayDepth', 'effects.depthCc106', 'DELAY DEPTH', 44], ['ReverbTime', 'effects.timeCc108', 'REVERB TIME', 80]]
    .forEach(([cname, id, words, start], i) => knob(cname, id, 790 + i * 86, 334, 36, words, words, start));

  // The sixteen step keys on the aluminium, each with its lamp.
  for (let s = 0; s < 16; s += 1) {
    const x = 40 + s * 70;
    f.label(`StepKey${s + 1}`, String(s + 1), x, 470, 54, 34, { size: 10, colour: 'FFC9CDD1', fill: 'FF2A2D31', radius: 4 });
    f.label(`Step${s + 1}`, '', x + 23, 456, 8, 8, { fill: 'FF4A2222', radius: 4 });
  }

  // Scene 1, on VCO 1's WAVE: the scope shows the square, the triangle or the saw.
  const show = (from, to) => frames([
    ...(from > 0 ? [{ at: 0, opacity: 0 }, { at: from - 0.08, opacity: 0 }] : []), { at: Math.max(0, from), opacity: 1 },
    { at: Math.min(1, to), opacity: 1 }, ...(to < 1 ? [{ at: to + 0.08, opacity: 0 }, { at: 1, opacity: 0 }] : []),
  ]);
  f.clip('ScopeSQR', 'Transform', 0, show(0, 0.22), 1000, 0);
  f.clip('ScopeTRI', 'Transform', 0, show(0.3, 0.7), 1000, 0);
  f.clip('ScopeSAW', 'Transform', 0, show(0.78, 1), 1000, 0);
  // Scene 2, on a program change: the screen's frame flashes as the number rolls in (the script).
  f.clip('Screen', 'Transform', 0, frames([{ at: 0, fill: 'FF1A2A3A' }, { at: 1, fill: 'FF030405' }], { easing: 'outQuad' }), 500, 1);
  // Scenes 3-18, each a step lamp, played by the script on the beat.
  for (let s = 0; s < 16; s += 1) f.clip(`Step${s + 1}`, 'Transform', 0, frames([{ at: 0, fill: 'FFFF3B30' }, { at: 1, fill: 'FF4A2222' }], { easing: 'inQuad' }), 220, 2 + s);
  f.script('Screen and steps', minilogueScript(names));

  return f.scenes([
    { name: 'Scope wave', length: 1000, trigger: { type: 'script' }, loop: false, clock: { source: 'value', control: 'Vco1Wave', follow: 'smooth' } },
    { name: 'Program change', length: 500, trigger: { type: 'midi', message: 'program', channel: 0, program: -1 }, loop: false },
    ...Array.from({ length: 16 }, (_, s) => ({ name: `Step ${s + 1}`, length: 220, trigger: { type: 'script' }, loop: false })),
  ]);
}

// --- Yamaha YC61 ---------------------------------------------------------------------------------

// The YC61's manual prints each rotary speed's range and default: horn fast 209.4 - 817.6 rpm, 413.8
// at its default of 64, and so on. Each default is the range's geometric middle, so a value v (1 - 127)
// is low * (high / low) ^ ((v - 1) / 126) rpm. The ramps are printed as factors, 0.21 - 1.00 - 2.00 for
// 14 - 64 - 127, which is (v - 1) / 63; the time they are factors of is not printed.
export const YC61_SPEEDS = Object.freeze({
  hornFast: [209.4, 817.6], drumFast: [189.3, 736.8], hornSlow: [23.0, 89.6], drumSlow: [22.7, 88.3],
});
/** The rotor's speed in rpm for a parameter value, by the printed range. */
export const yc61Rpm = (value, [low, high]) => low * (high / low) ** ((Math.min(127, Math.max(1, value)) - 1) / 126);
/** An acceleration or deceleration factor for a parameter value. */
export const yc61Factor = (value) => (Math.min(127, Math.max(14, value)) - 1) / 63;
/** A drawbar's step, 0 - 8, for a parameter value: the manual's table (0; 1 - 18; 19 - 36; ... 127). */
export const yc61Step = (value) => (value <= 0 ? 0 : value >= 127 ? 8 : Math.floor((value - 1) / 18) + 1);

// The rotary speaker's script. Each rotor's speed eases toward the one SLOW/FAST and ROTATION ask for,
// at its own acceleration or deceleration factor, and its angle is the speed run on; the turning scene
// is held at that angle, and the blur scene at how fast it goes. RAMP is this panel's own: the time at
// a factor of 1.00, which the manual does not give.
export const yc61RotaryScript = (speeds) => `// The rotary speaker, turned as the YC61 turns it.
const SPEEDS = ${JSON.stringify(speeds)};
const RAMP = 1.2;   // seconds at a factor of 1.00: this panel's own figure; the manual gives only factors
const rpm = (v, r) => r[0] * Math.pow(r[1] / r[0], (Math.min(127, Math.max(1, Number(v) || 1)) - 1) / 126);
const factor = (v) => (Math.min(127, Math.max(14, Number(v) || 64)) - 1) / 63;
const is = (v, word) => v === 1 || v === true || String(v).toLowerCase() === word;

const values = {};
for (const name of ['HornFast', 'HornSlow', 'DrumFast', 'DrumSlow', 'HornAcc', 'HornDec', 'DrumAcc', 'DrumDec', 'SlowFast', 'Rotation']) values[name] = get(name);
on('*', 'onControlChanged', (info) => { if (info.target in values) values[info.target] = info.value; });

const rotors = [
  { name: 'Horn', fast: 'HornFast', slow: 'HornSlow', acc: 'HornAcc', dec: 'HornDec', speeds: [SPEEDS.hornFast, SPEEDS.hornSlow], speed: 0, angle: 0 },
  { name: 'Drum', fast: 'DrumFast', slow: 'DrumSlow', acc: 'DrumAcc', dec: 'DrumDec', speeds: [SPEEDS.drumFast, SPEEDS.drumSlow], speed: 0, angle: 0 },
];
const wanted = (r) => !is(values.Rotation, 'on') ? 0
  : is(values.SlowFast, 'fast') ? rpm(values[r.fast], r.speeds[0]) : rpm(values[r.slow], r.speeds[1]);
for (const r of rotors) r.speed = wanted(r);   // already turning when the panel opens

let last = Date.now();
let ticks = 0;
function turn() {
  const now = Date.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  for (const r of rotors) {
    const target = wanted(r);
    const f = factor(target > r.speed ? values[r.acc] : values[r.dec]);
    r.speed += (target - r.speed) * (1 - Math.exp(-dt * f / RAMP));
    r.angle = (r.angle + (r.speed / 60) * 360 * dt) % 360;
    animateSeek(r.name + ' turn', r.angle / 360);
    animateSeek(r.name + ' blur', Math.min(1, Math.max(0, (r.speed - 100) / 200)));
    if (ticks % 5 === 0) set(r.name + 'Rpm.Text.content', Math.round(r.speed) + ' rpm');
  }
  ticks += 1;
  after(40, turn);
}
turn();
`;

// The wave's script, attached to the screen it paints: the nine footages' sines, each as loud as its
// drawbar's step, and their sum. A control is painted only when asked to be, so the script asks as it
// starts and again whenever a drawbar moves.
export const yc61WaveScript = (bars) => `// The wave the drawbars make: each footage a sine at its pitch, as loud as its drawbar's step.
const BARS = ${JSON.stringify(bars)};
const step = (v) => (v <= 0 ? 0 : v >= 127 ? 8 : Math.floor((v - 1) / 18) + 1);

on('*', 'onControlChanged', (info) => { if (String(info.target).startsWith('Drawbar')) drawRedraw(); });
after(50, () => drawRedraw());

function onDraw(info) {
  drawClear();
  const steps = BARS.map((b) => step(Number(get(b.name)) || 0));
  const w = info.width;
  const mid = info.height * 0.52;
  const amp = info.height * 0.17;
  const wave = (partials) => {
    const pts = [];
    for (let i = 0; i <= 180; i += 1) {
      const t = (i / 180) * Math.PI * 4;   // two periods of the 8' pitch
      let y = 0;
      for (const [k, gain] of partials) y += gain * Math.sin(BARS[k].ratio * t);
      pts.push(12 + (i / 180) * (w - 24), mid - y * amp);
    }
    return pts;
  };
  drawOpacity(0.28);
  drawStroke('#8FD0FF', 1);
  steps.forEach((s, k) => { if (s) drawPath(wave([[k, s / 8]])); });
  const total = steps.reduce((a, s) => a + s, 0);
  drawOpacity(1);
  drawStroke('#E8F4FF', 2, { join: 'round' });
  if (total) drawPath(wave(steps.map((s, k) => [k, (s / 8) * Math.min(1, 2.2 / (total / 8))])));
  // The registration as organists write it: 88 8000 000.
  drawStroke();
  drawFill('#8FD0FF');
  drawText(12, info.height - 10, steps.slice(0, 2).join('') + ' ' + steps.slice(2, 6).join('') + ' ' + steps.slice(6).join(''), { size: 11, family: 'JetBrains Mono' });
}
`;

/** A rotor seen from above: the horn's two bells, or the drum and its scoop. */
const HORN = svg('<defs><linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#f0f2f4"/><stop offset="1" stop-color="#9aa0a8"/></linearGradient></defs>'
  + '<path d="M4 34 L72 46 L72 54 L4 66 Z" fill="url(#b)" stroke="#4a4d52"/><path d="M196 34 L128 46 L128 54 L196 66 Z" fill="#3a3d42" stroke="#4a4d52"/>'
  + '<rect x="70" y="44" width="60" height="12" rx="3" fill="#6c7076"/><circle cx="100" cy="50" r="13" fill="#7a7f86" stroke="#2a2d31"/><circle cx="100" cy="50" r="4" fill="#2a2d31"/>', 200, 100);
const HORN_BLUR = svg('<defs><radialGradient id="g"><stop offset=".12" stop-color="#7a7f86" stop-opacity=".9"/><stop offset=".2" stop-color="#c9cdd1" stop-opacity=".35"/><stop offset=".98" stop-color="#c9cdd1" stop-opacity=".18"/><stop offset="1" stop-color="#c9cdd1" stop-opacity="0"/></radialGradient></defs>'
  + '<circle cx="100" cy="100" r="98" fill="url(#g)"/><circle cx="100" cy="100" r="98" fill="none" stroke="#c9cdd1" stroke-opacity=".25" stroke-dasharray="3 9"/><circle cx="100" cy="100" r="13" fill="#7a7f86"/>', 200, 200);
const DRUM = svg('<circle cx="70" cy="70" r="66" fill="#2a2d31" stroke="#5a5e64" stroke-width="2"/>'
  + '<path d="M70 70 L134 46 A66 66 0 0 1 134 94 Z" fill="#c9cdd1" fill-opacity=".85"/><path d="M70 70 L6 46 A66 66 0 0 0 6 94 Z" fill="#3a3d42"/>'
  + '<circle cx="70" cy="70" r="10" fill="#7a7f86"/><circle cx="70" cy="70" r="3.5" fill="#2a2d31"/>', 140, 140);
const DRUM_BLUR = svg('<defs><radialGradient id="g"><stop offset=".14" stop-color="#7a7f86"/><stop offset=".16" stop-color="#5a5e64" stop-opacity=".9"/><stop offset=".97" stop-color="#8a8f96" stop-opacity=".55"/><stop offset="1" stop-color="#5a5e64" stop-opacity=".2"/></radialGradient></defs>'
  + '<circle cx="70" cy="70" r="66" fill="url(#g)" stroke="#5a5e64" stroke-width="2"/><circle cx="70" cy="70" r="10" fill="#7a7f86"/>', 140, 140);

function yamahaYc61() {
  const f = synth('yamaha-yc61', 'Yamaha YC61', { set: 'graphite', bg: 'FF18191B', width: 1200, height: 620 });
  const bg = 'FF18191B';
  f.label('Stripe', '', 0, 0, 1200, 6, { fill: 'FFB3262B' });
  f.label('Model', 'YC61', 36, 20, 200, 30, { size: 20, colour: 'FFF2F0EA', weight: 800, spacing: 3, align: 'left' });
  f.label('Kind', 'STAGE KEYBOARD', 880, 25, 284, 22, { size: 11, colour: 'FF8E9298', weight: 600, spacing: 2, align: 'right' });
  const line = { bg };
  // A switch: its choices side by side in a strip, each change reported to the scripts (both a
  // choice group's own defaults: docs/design/choice-group.md).
  const group = (cname, parameterId, x, y, w, h, words) => {
    const control = f.bind('RadioButtonGroup', cname, parameterId, x, y, w, h);
    control._children.Text._children.Font = { ...control._children.Text._children.Font, size: 10 };
    if (words) f.caption(control, words, { size: 9, width: Math.max(w, 60) });
    return control;
  };

  // Organ: the upper manual's nine drawbars, pulled down for more, then vibrato/chorus and percussion.
  f.section('Organ', 'ORGAN · UPPER', 28, 66, 392, 420, line);
  const BARS = [["16'", 'drawbar16', 0.5, 'FF7A4A26', 127], ["5⅓'", 'drawbar513', 1.5, 'FF7A4A26', 127], ["8'", 'drawbar8', 1, 'FFE9E7E2', 109],
    ["4'", 'drawbar4', 2, 'FFE9E7E2', 0], ["2⅔'", 'drawbar223', 3, 'FF1B1C1E', 55], ["2'", 'drawbar2', 4, 'FFE9E7E2', 0],
    ["1⅗'", 'drawbar135', 5, 'FF1B1C1E', 0], ["1⅓'", 'drawbar113', 6, 'FF1B1C1E', 0], ["1'", 'drawbar1', 8, 'FFE9E7E2', 19]];
  const barNames = [];
  BARS.forEach(([words, id, ratio, tab, start], i) => {
    const cx = 62 + i * 40;
    const name = `Drawbar${id.slice('drawbar'.length)}`;
    barNames.push({ name, ratio });
    f.label(`${name}Tab`, '', cx - 11, 86, 22, 8, { fill: tab, radius: 2 });
    const control = f.bind('Slider', name, `organUpper.${id}`, cx - 13, 98, 26, 176, { start });
    // Pulled down for more, as a drawbar is.
    Object.assign(control._children.Behavior, { orientation: 'vertical', direction: 'ttb', showTicks: true, majorTickCount: 9, minorTickCount: 0 });
    f.caption(control, words, { size: 10, width: 40 });
  });
  group('VibChoType', 'organ.vibratoChorusType', 44, 310, 360, 26, 'VIBRATO / CHORUS');
  group('VibChoOn', 'organUpper.vibratoChorusSwitch', 44, 364, 100, 26, 'VIB/CHO');
  group('Perc', 'organ.percussionSwitch', 156, 364, 108, 26, 'PERCUSSION');
  group('PercHarmonic', 'organ.percussionType', 276, 364, 128, 26, 'HARMONIC');
  group('PercDecay', 'organ.percussionDecay', 44, 418, 170, 26, 'DECAY');
  group('PercVolume', 'organ.percussionVolume', 234, 418, 170, 26, 'VOLUME');

  // The wave the drawbars make, drawn by a script on this screen.
  f.label('Wave', '', 436, 66, 330, 230, { fill: 'FF050607', radius: 8 });
  picture(f.label('WaveEdge', '', 436, 66, 330, 230), outline(330, 230, 'FF2A2D33', { radius: 8 }), 'fill');
  f.label('WaveName', 'ORGAN WAVE', 452, 74, 200, 18, { size: 11, colour: 'FF8FD0FF', family: 'JetBrains Mono', weight: 700, align: 'left' });
  f.label('WaveNote', 'each footage a sine at its pitch, as loud as its drawbar\'s step in eighths (this panel\'s law, not a measurement); the faint lines are the nine on their own', 436, 304, 330, 44,
    { size: 9, colour: 'FF6C7076', weight: 500, lineHeight: 1.3 });

  // The rotary speaker from above: horn on top, drum below, each with its blur for when it is fast.
  f.section('Rotary', 'ROTARY SPEAKER', 782, 66, 390, 420, line);
  picture(f.label('HornBlur', '', 798, 84, 164, 164), HORN_BLUR, 'contain')._children.Transform.opacity = 0;
  picture(f.label('Horn', '', 798, 125, 164, 82), HORN, 'contain');
  f.label('HornName', 'HORN', 840, 250, 80, 14, { size: 9, colour: 'FF9AA0A8', weight: 700, spacing: 1 });
  picture(f.label('DrumBlur', '', 815, 290, 130, 130), DRUM_BLUR, 'contain')._children.Transform.opacity = 0;
  picture(f.label('Drum', '', 815, 290, 130, 130), DRUM, 'contain');
  f.label('DrumName', 'DRUM', 840, 426, 80, 14, { size: 9, colour: 'FF9AA0A8', weight: 700, spacing: 1 });
  f.label('RpmScreen', '', 976, 86, 182, 58, { fill: 'FF050607', radius: 5 });
  f.label('HornRpm', '', 988, 92, 160, 22, { size: 14, colour: 'FFE8F4FF', family: 'JetBrains Mono', weight: 700, align: 'right' });
  f.label('DrumRpm', '', 988, 116, 160, 22, { size: 14, colour: 'B3E8F4FF', family: 'JetBrains Mono', weight: 700, align: 'right' });
  f.label('HornRpmName', 'HORN', 988, 94, 60, 18, { size: 10, colour: 'FF8E9298', family: 'JetBrains Mono', weight: 700, align: 'left' });
  f.label('DrumRpmName', 'DRUM', 988, 118, 60, 18, { size: 10, colour: 'FF8E9298', family: 'JetBrains Mono', weight: 700, align: 'left' });
  group('SlowFast', 'liveSetSoundCommon.rotarySpeakerSlowFast', 976, 160, 182, 28, 'SPEED');
  group('Rotation', 'liveSetSoundCommon.rotarySpeakerRotationSwitch', 976, 216, 182, 28, 'ROTATION');
  [['HornFast', 'rotarySpeakerHornSpeedFast', 'H FAST'], ['HornSlow', 'rotarySpeakerHornSpeedSlow', 'H SLOW'], ['HornAcc', 'rotarySpeakerHornAcceleration', 'H ACC'], ['HornDec', 'rotarySpeakerHornDeceleration', 'H DEC'],
    ['DrumFast', 'rotarySpeakerRotorSpeedFast', 'D FAST'], ['DrumSlow', 'rotarySpeakerRotorSpeedSlow', 'D SLOW'], ['DrumAcc', 'rotarySpeakerRotorAcceleration', 'D ACC'], ['DrumDec', 'rotarySpeakerRotorDeceleration', 'D DEC']]
    .forEach(([cname, id, words], i) => f.knob(cname, `liveSetSoundCommon.${id}`, 996 + (i % 4) * 46, 304 + Math.floor(i / 4) * 86, 30, words, { size: 8 }));
  f.label('RotaryNote', 'speeds and ramps as the YC61 manual prints them; a ramp at 1.00 here takes 1.2 s, the manual gives no time', 970, 438, 194, 40,
    { size: 8, colour: 'FF6C7076', weight: 500, lineHeight: 1.3 });

  // The keys, as the YC61's 61.
  const keys = keyboard(36, 96, 28, 1144);
  for (const key of keys.filter((k) => !k.black)) f.label(`Key${key.name}`, '', Math.round(key.x + 1), 504, Math.max(1, Math.round(key.w - 2)), 100, { fill: 'FFE9E7E2', radius: 3 });
  for (const key of keys.filter((k) => k.black)) f.label(`Key${key.name}`, '', Math.round(key.x), 504, Math.round(key.w), 62, { fill: 'FF1B1C1E', radius: 2 });

  // Scenes the script holds: each rotor turned to its angle, and blurred by its speed.
  f.clip('Horn', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 0);
  f.clip('HornBlur', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 0);
  f.clip('Horn', 'Transform', 0, frames([{ at: 0, opacity: 1 }, { at: 1, opacity: 0.12 }]), 1000, 1);
  f.clip('HornBlur', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }]), 1000, 1);
  f.clip('Drum', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 2);
  f.clip('DrumBlur', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 2);
  f.clip('Drum', 'Transform', 0, frames([{ at: 0, opacity: 1 }, { at: 1, opacity: 0.15 }]), 1000, 3);
  f.clip('DrumBlur', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }]), 1000, 3);

  f.script('Rotary speaker', yc61RotaryScript(YC61_SPEEDS));
  f.script('Organ wave', yc61WaveScript(barNames), { event: 'onDraw', target: 'Wave' });

  return f.scenes([
    { name: 'Horn turn', length: 1000, trigger: { type: 'script' }, loop: false },
    { name: 'Horn blur', length: 1000, trigger: { type: 'script' }, loop: false },
    { name: 'Drum turn', length: 1000, trigger: { type: 'script' }, loop: false },
    { name: 'Drum blur', length: 1000, trigger: { type: 'script' }, loop: false },
  ]);
}

/** [id, make] for each panel, in the order the collection lists them. */
export const SYNTHS = [
  ['moog-subsequent-37', moogSubsequent37],
  ['roland-ju-06a', rolandJu06a],
  ['korg-minilogue-xd', korgMinilogueXd],
  ['yamaha-yc61', yamahaYc61],
];
