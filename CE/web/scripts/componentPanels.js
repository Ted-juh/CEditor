// componentPanels.js — the Components showcase: a folder a component, a panel for each group of that
// component's built-in animation presets (docs/design/component-presets.md). The Knob is the first:
// CE/panels/Components/Knob/, one panel a group, each in a control set of its own, every knob wearing
// one built-in preset, applied as the library applies it (linked, and carried by the panel), with a
// caption under it: the preset's name, what plays it and what you see.
//
// The presets are utils/knobPresets.js; this only lays them out. Change a preset there, run
// export-showcases.mjs, and the panels follow.

import { panelMaker, COMPONENT_KIND } from './festivalKit.js';
import { KNOB_PRESETS, KNOB_PRESET_GROUPS } from '../src/CE_Application/utils/knobPresets.js';
import { SLIDER_PRESETS, SLIDER_PRESET_GROUPS } from '../src/CE_Application/utils/sliderPresets.js';
import { applyPresetPatch } from '../src/CE_Application/utils/animationPresetModel.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { knobTrackOf } from '../src/CE_Application/utils/knobTrack.js';

/** Write a patch as the editor writes one (stores/controls.js applyControlPatch, one path at a time). */
function applyPatch(control, patch) {
  for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
}

/** Put a built-in preset on a control as Apply does; the panel carries what it puts on. */
function wear(control, entry, carried) {
  const { patch, reason } = applyPresetPatch(control, entry.preset);
  if (!patch) throw new Error(`${entry.id} does not fit ${control._children.Core.name}: ${reason}`);
  applyPatch(control, patch);
  carried.set(entry.preset.id, entry.preset);
}

const pascal = (slug) => slug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());

// Each group's panel: its control set, the panel's colour and its words' colours, and where each knob
// starts (a knob that stamps MAX starts near the top, one that overloads just under 90%).
const LOOKS = {
  numbers: { set: 'graphite-studio', bg: 'FF16181B', ink: 'FFE8EAED', how: 'FF5AB4FF', what: 'FF9AA3AD' },
  ticks: { set: 'chronograph', bg: 'FF121416', ink: 'FFEDEDE8', how: 'FFFFC857', what: 'FFA2A7AD' },
  touch: { set: 'edge-light', bg: 'FF1B1D20', ink: 'FFEDEFF2', how: 'FF7FD1C7', what: 'FFA0A8B0' },
  turning: { set: 'arc-line', bg: 'FF15171A', ink: 'FFE9ECEF', how: 'FFFF9F5A', what: 'FF9EA6AE' },
  attention: { set: 'touch-encoder', bg: 'FF101317', ink: 'FFE6EEF6', how: 'FF8FD3FF', what: 'FF98A4B0' },
  gestures: { set: 'hex-drive', bg: 'FF17181A', ink: 'FFEDEDED', how: 'FFFFD166', what: 'FFA3A3A3' },
  words: { set: 'heritage', bg: 'FF1C1A17', ink: 'FFF1EADC', how: 'FFE0B062', what: 'FFAFA594' },
};
const STARTS = { 'max-stamp': 0.9, overload: 0.8, 'rise-to-value': 0.65, 'fall-to-value': 0.3, 'ring-sweep': 0.4, 'from-the-synth': 0.4 };

const TILE_W = 270;
const TILE_H = 262;
const KNOB = 136;
const TOP = 96;
const READOUT_ROOM = 30;
const THROW_ROOM = 46;      // a word thrown from the tip: 14 px out, its flight, and half its height

/** The small scripts a group's panel runs: a stand-in synth for From the synth, and "look here". */
function addScripts(f, entries, noun) {
  if (entries.some((entry) => entry.slug === 'from-the-synth')) {
    // Nothing is plugged in, so a script plays the synth: a new value every two and a half seconds,
    // which the control hears as one from outside. Moving it yourself flashes nothing.
    f.script('The synth', `// Stands in for a synth sending this ${noun} new values: a value from outside, which the
// From the synth preset answers and ${noun === 'knob' ? 'a turn' : 'a move'} by hand does not.
function send() {
  set('FromTheSynth.normalizedValue', 0.15 + Math.random() * 0.7);
  after(2500, send);
}
after(1200, send);
`);
  }
  if (entries.some((entry) => entry.slug === 'reach-full')) {
    // Reach full is played by a script, as a panel would play it to say "look here".
    f.script('Look here', `// Plays the Reach full ${noun}'s own animation every four seconds, as a panel would to draw
// the eye to one control: ce.anim.play(control, animation).
function lookHere() {
  ce.anim.play('ReachFull', 'reachFull');
  after(4000, lookHere);
}
after(1500, lookHere);
`);
  }
}

/** A panel of one group: its knobs in rows of three, or four when there are more than nine, each with its caption. */
function groupPanel(group) {
  const look = LOOKS[group.id];
  const entries = KNOB_PRESETS.filter((entry) => entry.group === group.id);
  const columns = entries.length > 9 ? 4 : 3;
  const rows = Math.ceil(entries.length / columns);
  const width = columns * TILE_W + 60;
  const height = TOP + rows * TILE_H + 24;
  const f = panelMaker(`knob-${group.id}`, `Knob ${group.label}`, { set: look.set, bg: look.bg, kind: COMPONENT_KIND, width, height, fields: { gridEnabled: false } });
  const carried = new Map();
  f.label('Title', `Knob · ${group.label}`, 30, 22, 520, 34, { size: 24, colour: look.ink, align: 'left' });
  f.label('Note', `${group.note}. Each knob wears one built-in preset: Preview (F5) plays it.`, 30, 58, width - 60, 22, { size: 13, colour: look.what, weight: 400, align: 'left' });

  entries.forEach((entry, i) => {
    const x = 30 + (i % columns) * TILE_W;
    const y = TOP + Math.floor(i / columns) * TILE_H;
    const name = { 'name-value': 'Cutoff', decode: 'Resonance' }[entry.slug] ?? pascal(entry.slug);
    // A preset that shows the readout hangs it past the dial, and one that throws words from the
    // pointer's tip throws them past it, where the knob's own box would cut them off: such a knob
    // gets a box with room round the dial, the dial kept the size the others are.
    const readout = entry.preset.fields['Behavior.showHandleLabels'] === true;
    const throws = Object.values(entry.preset.animations).some((node) => node.kind === 'emit' && node.from !== 'centre');
    const room = throws ? THROW_ROOM : readout ? READOUT_ROOM : 0;
    const box = KNOB + 2 * room;
    const knob = f.add('Knob', name, Math.round(x + (TILE_W - box) / 2), y - (box - KNOB) / 2, box, box);
    const behavior = knob._children.Behavior;
    Object.assign(behavior, entry.knob);
    // Where it starts, as a share of its range: a knob of 0 to 100 starts at 50, not at 0.5.
    const [low, high] = [Number(behavior.min ?? 0), Number(behavior.max ?? 1)];
    behavior.defaultCurrentValue = low + (high - low) * (STARTS[entry.slug] ?? 0.5);
    if (room) behavior.circularDiameter = Math.round(2 * knobTrackOf(resolveControlForSet(knob, getControlSet(look.set)), KNOB, KNOB).radius);
    // Large enough to read from across the panel; a knob's own readout is set for a cramped one.
    if (readout) knob._children.Parts._children.labelCurrent._children.Text._children.Font.size = 14;
    knob._children.Core.description = `${entry.name}: ${entry.what}.`;
    let captionTop = y + KNOB + 10;
    if (entry.on === 'label') {
      // A knob has no words of its own: its name is a Label, and that Label wears the preset.
      const shows = f.label(`${name}Name`, '', x + 25, y + KNOB + 4, TILE_W - 50, 22, { size: 14, colour: look.how, family: 'JetBrains Mono', weight: 600 });
      shows._children.Text.shows = entry.label?.shows ?? 'name';
      shows._children.Text.showsControl = knob._children.Core.id;
      shows._children.Core.attachedTo = knob._children.Core.id;
      wear(shows, entry, carried);
      captionTop += 22;
    } else {
      wear(knob, entry, carried);
    }
    f.label(`${name}Caption`, entry.name, x + 10, captionTop, TILE_W - 20, 22, { size: 16, colour: look.ink });
    f.label(`${name}How`, entry.how.toUpperCase(), x + 10, captionTop + 22, TILE_W - 20, 16, { size: 10, colour: look.how, spacing: 1.5, weight: 600 });
    f.label(`${name}What`, entry.what, x + 14, captionTop + 40, TILE_W - 28, 36, { size: 12, colour: look.what, weight: 400, lineHeight: 1.25 });
  });

  addScripts(f, entries, 'knob');
  const panel = f.scenes([]);
  panel.animationPresets = [...carried.values()];
  return panel;
}

/**
 * Together: scenes over a row of knobs rather than a preset on one. Sweep in is the built-in scene
 * preset Knobs sweep in, repeated over the row; Wave runs a wiggle along it, over and over; Follow the
 * leader moves four knobs' drawings after the first one's value, on a spring.
 */
function together() {
  const look = { set: 'diesel', bg: 'FF141518', ink: 'FFEDEEF0', how: 'FFB59CFF', what: 'FF9FA4AB' };
  const width = 900;
  const height = 560;
  const f = panelMaker('knob-together', 'Knob Together', { set: look.set, bg: look.bg, kind: COMPONENT_KIND, width, height, fields: { gridEnabled: false } });
  f.label('Title', 'Knob · Together', 30, 22, 520, 34, { size: 24, colour: look.ink, align: 'left' });
  f.label('Note', 'scenes over a row of knobs: a scene preset plays one effect on many, each a little after the last.', 30, 58, width - 60, 22, { size: 13, colour: look.what, weight: 400, align: 'left' });
  const lanes = [
    ['Sweep', 'Sweep in', 'PANEL OPENS', 'each knob sweeps in, 150 ms after the last'],
    ['Wave', 'Wave', 'ALWAYS', 'a wiggle runs along the row'],
    ['Follow', 'Follow the leader', 'TURN THE FIRST', 'the others\' drawings follow it, on a spring'],
  ];
  const D = 84;
  lanes.forEach(([key, name, how, what], lane) => {
    const y = 104 + lane * 148;
    f.label(`${key}Caption`, name, 30, y + 12, 200, 22, { size: 16, colour: look.ink, align: 'left' });
    f.label(`${key}How`, how, 30, y + 36, 200, 16, { size: 10, colour: look.how, spacing: 1.5, weight: 600, align: 'left' });
    f.label(`${key}What`, what, 30, y + 54, 200, 36, { size: 12, colour: look.what, weight: 400, lineHeight: 1.25, align: 'left' });
    for (let k = 0; k < 5; k += 1) {
      const knob = f.add('Knob', `${key}${k + 1}`, 250 + k * 124, y, D, D);
      knob._children.Behavior.defaultCurrentValue = key === 'Sweep' ? [0.7, 0.55, 0.4, 0.62, 0.3][k] : 0.5;
      if (key === 'Follow' && k === 0) knob._children.Core.description = 'The leader: turn it.';
    }
  });
  const sweep = { kind: 'value', easing: 'inOutCubic', iterations: 1, frames: [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }] };
  const wiggle = { kind: 'value', easing: 'inOutSine', iterations: 1, frames: [{ at: 0 }, { at: 0.15, by: 0.08 }, { at: 0.35, by: -0.08 }, { at: 0.55, by: 0.05 }, { at: 0.75, by: -0.02 }, { at: 1 }] };
  const follow = { kind: 'value', easing: 'linear', iterations: 1, frames: [{ at: 0, value: 0 }, { at: 1, value: 1 }] };
  for (let k = 0; k < 5; k += 1) {
    f.clip(`Sweep${k + 1}`, 'Value', 300 + k * 150, sweep, 1200, 0);
    f.clip(`Wave${k + 1}`, 'Value', 400 + k * 140, wiggle, 700, 1);
    if (k > 0) f.clip(`Follow${k + 1}`, 'Value', 0, follow, 1000, 2);
  }
  return f.scenes([
    { name: 'Sweep in', length: 300 + 4 * 150 + 1200, loop: false },
    { name: 'Wave', length: 3200, loop: true },
    { name: 'Follow the leader', length: 1000, trigger: { type: 'script' }, loop: false, clock: { source: 'value', control: 'Follow1', follow: 'spring' } },
  ]);
}

export const KNOB_PANELS = [
  ...KNOB_PRESET_GROUPS.map((group) => [`knob-${group.id}`, () => groupPanel(group)]),
  ['knob-together', together],
];

// --- The Slider ----------------------------------------------------------------------------------
//
// Vertical faders, a row of tiles a panel, each in a set of its own: a fader's own looks (a dot, a
// console cap, a billet, a lens) and its fill colours differ from set to set as much as a knob's.

const SLIDER_LOOKS = {
  numbers: { set: 'soft', bg: 'FF16171D', ink: 'FFE8E9F2', how: 'FF9C93FF', what: 'FF9EA0B3' },
  // Small ticks between the big ones, so "big, then small" has both.
  ticks: { set: 'dual-scale', bg: 'FF121416', ink: 'FFEDEDE8', how: 'FFFFC857', what: 'FFA2A7AD', settings: { showTicks: true, majorTickCount: 6, minorTickCount: 4 } },
  touch: { set: 'broadcast', bg: 'FF1B1D20', ink: 'FFEDEFF2', how: 'FF7FD1C7', what: 'FFA0A8B0' },
  moving: { set: 'pop', bg: 'FF15171A', ink: 'FFE9ECEF', how: 'FFFF9F5A', what: 'FF9EA6AE' },
  attention: { set: 'backlit', bg: 'FF101317', ink: 'FFE6EEF6', how: 'FF8FD3FF', what: 'FF98A4B0' },
  gestures: { set: 'anodised', bg: 'FF17181A', ink: 'FFEDEDED', how: 'FFFFD166', what: 'FFA3A3A3', settings: { showTicks: true } },
  words: { set: 'blueprint', bg: 'FF141A22', ink: 'FFE6EEF6', how: 'FF8EC5FF', what: 'FF9FB0C2' },
};
const SLIDER_STARTS = { 'max-stamp': 0.9, overload: 0.8, 'rise-to-value': 0.65, 'fall-to-value': 0.3, 'fill-sweep': 0.4, 'from-the-synth': 0.4 };
const SLIDER_TILE_W = 230;
const SLIDER_TILE_H = 340;
const FADER_W = 64;
const FADER_H = 220;
const SIDE_ROOM = 70;       // a readout, or a word thrown, beside the cap: to the right of the track

/** A panel of one group of the Slider's presets: its faders in a row, or two rows of six or four. */
function sliderGroupPanel(group) {
  const look = SLIDER_LOOKS[group.id];
  const entries = SLIDER_PRESETS.filter((entry) => entry.group === group.id);
  const columns = entries.length <= 6 ? entries.length : entries.length > 8 ? 6 : 4;
  const rows = Math.ceil(entries.length / columns);
  const width = columns * SLIDER_TILE_W + 60;
  const height = TOP + rows * SLIDER_TILE_H + 24;
  const f = panelMaker(`slider-${group.id}`, `Slider ${group.label}`, { set: look.set, bg: look.bg, kind: COMPONENT_KIND, width, height, fields: { gridEnabled: false } });
  const carried = new Map();
  f.label('Title', `Slider · ${group.label}`, 30, 22, 520, 34, { size: 24, colour: look.ink, align: 'left' });
  f.label('Note', `${group.note}. Each slider wears one built-in preset: Preview (F5) plays it.`, 30, 58, width - 60, 22, { size: 13, colour: look.what, weight: 400, align: 'left' });

  entries.forEach((entry, i) => {
    const x = 30 + (i % columns) * SLIDER_TILE_W;
    const y = TOP + Math.floor(i / columns) * SLIDER_TILE_H;
    const name = { 'name-value': 'Level', decode: 'Pan' }[entry.slug] ?? pascal(entry.slug);
    // A readout rides beside the cap, and words are thrown out to that side: such a fader's box has
    // room beside its track. A vertical track is centred across its box, so the box grows both ways
    // and the track stays in line with the others'.
    const readout = entry.preset.fields['Behavior.showHandleLabels'] === true;
    const throws = Object.values(entry.preset.animations).some((node) => node.kind === 'emit');
    const box = FADER_W + 2 * (readout || throws ? SIDE_ROOM : 0);
    const fader = f.add('Slider', name, Math.round(x + (SLIDER_TILE_W - box) / 2), y, box, FADER_H);
    const behavior = fader._children.Behavior;
    behavior.orientation = 'vertical';
    Object.assign(behavior, look.settings ?? {}, entry.knob);
    const [low, high] = [Number(behavior.min ?? 0), Number(behavior.max ?? 1)];
    behavior.defaultCurrentValue = low + (high - low) * (SLIDER_STARTS[entry.slug] ?? 0.5);
    if (readout) fader._children.Parts._children.labelCurrent._children.Text._children.Font.size = 14;
    fader._children.Core.description = `${entry.name}: ${entry.what}.`;
    let captionTop = y + FADER_H + 12;
    if (entry.on === 'label') {
      // Its name is a Label, and that Label wears the preset.
      const shows = f.label(`${name}Name`, '', x + 15, y + FADER_H + 6, SLIDER_TILE_W - 30, 22, { size: 14, colour: look.how, family: 'JetBrains Mono', weight: 600 });
      shows._children.Text.shows = entry.label?.shows ?? 'name';
      shows._children.Text.showsControl = fader._children.Core.id;
      shows._children.Core.attachedTo = fader._children.Core.id;
      wear(shows, entry, carried);
      captionTop += 22;
    } else {
      wear(fader, entry, carried);
    }
    f.label(`${name}Caption`, entry.name, x + 8, captionTop, SLIDER_TILE_W - 16, 22, { size: 16, colour: look.ink });
    f.label(`${name}How`, entry.how.toUpperCase(), x + 8, captionTop + 22, SLIDER_TILE_W - 16, 16, { size: 10, colour: look.how, spacing: 1.5, weight: 600 });
    f.label(`${name}What`, entry.what, x + 10, captionTop + 40, SLIDER_TILE_W - 20, 52, { size: 12, colour: look.what, weight: 400, lineHeight: 1.25 });
  });
  addScripts(f, entries, 'slider');
  const panel = f.scenes([]);
  panel.animationPresets = [...carried.values()];
  return panel;
}

/**
 * Together, on faders: a mixing desk's row. Sweep in sends each fader up to full and back, one after
 * another; Wave runs a wiggle along the row, over and over; Follow the leader moves the other faders'
 * drawings after the first one's value, on a spring.
 */
function sliderTogether() {
  const look = { set: 'aerospace', bg: 'FF121417', ink: 'FFEDEEF0', how: 'FF7FC8FF', what: 'FF9FA4AB' };
  const width = 1100;
  const height = 860;
  const f = panelMaker('slider-together', 'Slider Together', { set: look.set, bg: look.bg, kind: COMPONENT_KIND, width, height, fields: { gridEnabled: false } });
  f.label('Title', 'Slider · Together', 30, 22, 520, 34, { size: 24, colour: look.ink, align: 'left' });
  f.label('Note', 'scenes over a row of faders: one effect on many, each a little after the last.', 30, 58, width - 60, 22, { size: 13, colour: look.what, weight: 400, align: 'left' });
  const lanes = [
    ['Sweep', 'Sweep in', 'PANEL OPENS', 'each fader sweeps up and back, 150 ms after the last'],
    ['Wave', 'Wave', 'ALWAYS', 'a wiggle runs along the row'],
    ['Follow', 'Follow the leader', 'MOVE THE FIRST', 'the others\' drawings follow it, on a spring'],
  ];
  const H = 210;
  lanes.forEach(([key, name, how, what], lane) => {
    const y = 100 + lane * 250;
    f.label(`${key}Caption`, name, 30, y + 70, 220, 22, { size: 16, colour: look.ink, align: 'left' });
    f.label(`${key}How`, how, 30, y + 94, 220, 16, { size: 10, colour: look.how, spacing: 1.5, weight: 600, align: 'left' });
    f.label(`${key}What`, what, 30, y + 112, 220, 36, { size: 12, colour: look.what, weight: 400, lineHeight: 1.25, align: 'left' });
    for (let k = 0; k < 8; k += 1) {
      const fader = f.add('Slider', `${key}${k + 1}`, 280 + k * 100, y, 60, H);
      fader._children.Behavior.orientation = 'vertical';
      fader._children.Behavior.defaultCurrentValue = key === 'Sweep' ? [0.7, 0.55, 0.4, 0.62, 0.3, 0.5, 0.66, 0.45][k] : 0.5;
      if (key === 'Follow' && k === 0) fader._children.Core.description = 'The leader: move it.';
    }
  });
  const sweep = { kind: 'value', easing: 'inOutCubic', iterations: 1, frames: [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }] };
  const wiggle = { kind: 'value', easing: 'inOutSine', iterations: 1, frames: [{ at: 0 }, { at: 0.15, by: 0.08 }, { at: 0.35, by: -0.08 }, { at: 0.55, by: 0.05 }, { at: 0.75, by: -0.02 }, { at: 1 }] };
  const follow = { kind: 'value', easing: 'linear', iterations: 1, frames: [{ at: 0, value: 0 }, { at: 1, value: 1 }] };
  for (let k = 0; k < 8; k += 1) {
    f.clip(`Sweep${k + 1}`, 'Value', 300 + k * 150, sweep, 1200, 0);
    f.clip(`Wave${k + 1}`, 'Value', 400 + k * 120, wiggle, 700, 1);
    if (k > 0) f.clip(`Follow${k + 1}`, 'Value', 0, follow, 1000, 2);
  }
  return f.scenes([
    { name: 'Sweep in', length: 300 + 7 * 150 + 1200, loop: false },
    { name: 'Wave', length: 3400, loop: true },
    { name: 'Follow the leader', length: 1000, trigger: { type: 'script' }, loop: false, clock: { source: 'value', control: 'Follow1', follow: 'spring' } },
  ]);
}

export const SLIDER_PANELS = [
  ...SLIDER_PRESET_GROUPS.map((group) => [`slider-${group.id}`, () => sliderGroupPanel(group)]),
  ['slider-together', sliderTogether],
];

