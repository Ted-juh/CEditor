// festivalKit.js — what the Film Festival (filmFestivalPanels.js) and the Song Book
// (songBookPanels.js) build their panels with: a panel whose controls are numbered from a hash of
// its id, so its file only changes when it does; Labels in a face, a size and a colour; clips on
// one or more scenes; and the paint the panels are drawn in (patterns, gradients, pictures, glows,
// seeded drawings). Nothing here is a panel of its own.

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { normalizeControlSet } from '../src/CE_Application/models/controlSets.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';

export const W = 720;
export const H = 405;

export const svg = (body, w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
export const fx = (id, over = {}) => ({ ...sceneEffect(id).effect, ...over });
export const frames = (list, over = {}) => ({ kind: 'keyframes', easing: 'linear', iterations: 1, direction: 'normal', frames: list, ...over });
export const text = (effect, way, over = {}) => ({ kind: 'text', effect, way, iterations: 1, ...over });

/** How a collection names what it makes: the hash's seed, the script id's prefix, the GUID's middle. */
export const FILM_KIND = Object.freeze({ seed: 'ceditor-film', script: 'film', guid: 'f11d-4fe5-a5e5' });
export const SONG_KIND = Object.freeze({ seed: 'ceditor-song', script: 'song', guid: '50e9-4b00-8c5d' });
export const MECHANISM_KIND = Object.freeze({ seed: 'ceditor-mechanism', script: 'mechanism', guid: '3c4a-4d17-9e21' });
export const GALLERY_KIND = Object.freeze({ seed: 'ceditor-gallery', script: 'gallery', guid: '9a11-4e7b-b3c0' });

/**
 * One panel of a collection, its controls numbered from a hash of its id. `clip` puts a clip on the
 * first scene unless told which; `done` makes the panel with one looping scene played when it opens,
 * `scenes` with several, each of them { name, length, trigger?, loop?, clock?, markers? }. `script`
 * gives the panel a script of its own, in JavaScript.
 */
export function panelMaker(id, name, { set = 'carbon-pro', bg = 'FF000000', kind = FILM_KIND } = {}) {
  let hash = 5381;
  for (const ch of `${kind.seed}:${id}`) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  let n = 1_700_000_000_000 + (hash % 90_000_000) * 1000;
  const controls = [];
  const clipsByScene = [[]];
  let clipCount = 0;
  const ids = {};
  const scripts = [];
  const add = (type, cname, x, y, w, h, over = {}) => {
    const control = createControl(type, { Transform: { x, y, width: w, height: h }, ...over });
    control._children.Core.id = `ctrl_${n++}`;
    control._children.Core.name = cname;
    ids[cname] = control._children.Core.id;
    controls.push(control);
    return control;
  };
  /** A Label: its words in a face, a size and a colour; no border; a fill only when given one. */
  const label = (cname, words, x, y, w, h, { size = 14, colour = 'FFFFFFFF', family = 'Space Grotesk', weight = 700, fill = null, radius = 0, align = null, spacing = null, lineHeight = null, rotation = null } = {}) => {
    const control = add('Label', cname, x, y, w, h, {
      Text: { content: words, _children: { Font: { family, size, weight: weight >= 700 ? 'Bold' : weight >= 500 ? 'Medium' : weight >= 400 ? 'Regular' : 'Light', weightValue: weight }, Fill: { colour } } },
    });
    const bgc = control._children.Background._children;
    bgc.Fill = { ...bgc.Fill, colour: fill ?? '00000000' };
    bgc.Border = { ...(bgc.Border ?? {}), enabled: false };
    bgc.Corners = { ...(bgc.Corners ?? {}), radius };
    const words_ = control._children.Text._children;
    if (align) words_.Position = { ...words_.Position, justification: align };
    if (spacing !== null) words_.Font = { ...words_.Font, letterSpacing: spacing };
    if (lineHeight !== null) words_.Multiline = { ...words_.Multiline, lineHeight };
    if (rotation !== null) control._children.Transform.rotation = rotation;
    return control;
  };
  const clip = (cname, target, start, effect, length, scene = 0) => {
    while (clipsByScene.length <= scene) clipsByScene.push([]);
    clipCount += 1;
    clipsByScene[scene].push({ id: `cl_${id}_${clipCount}`, controlId: ids[cname], target, start, length, effect });
  };
  const make = (sceneList) => {
    const panel = createPanel(name);
    const h = (hash >>> 0).toString(16).padStart(8, '0');
    Object.assign(panel, {
      name, width: W, height: H, bgColour: bg, controls,
      panelGuid: `${h}-${kind.guid}-${h}${h.slice(0, 4)}`,
      scriptId: `${kind.script}_${id}`,
      filePath: null,
      controlSet: normalizeControlSet(set),
      animationScenes: sceneList,
      ...(scripts.length ? { scripts } : {}),
    });
    return panel;
  };
  const script = (scriptName, source) => {
    scripts.push({ id: `${kind.script}_${id}_${scripts.length + 1}`, name: scriptName, language: 'javascript', source });
  };
  const done = (sceneName, length) => make([{ id: `sc_${id}`, name: sceneName, trigger: { type: 'panelOpen' }, length, loop: true, clips: clipsByScene[0] }]);
  const scenes = (list) => make(list.map(({ name: sceneName, length, trigger = { type: 'panelOpen' }, loop = true, clock = null, markers = null }, i) => ({
    id: i === 0 ? `sc_${id}` : `sc_${id}_${i + 1}`, name: sceneName, trigger, length, loop,
    clips: clipsByScene[i] ?? [],
    ...(clock ? { clock: { ...clock, controlId: ids[clock.control] ?? clock.controlId } } : {}),
    ...(markers ? { markers: markers.map((marker, k) => ({ id: `mk_${id}_${i + 1}_${k + 1}`, ...marker })) } : {}),
  })));
  const controlById = (controlId) => controls.find((control) => control._children.Core.id === controlId);
  return { add, label, clip, done, scenes, script, ids, controlById };
}

/** A pattern on a control's background (or a part's), with these settings. */
export function pattern(control, fields) {
  const background = control._children.Background;
  const { patch } = addPatternPatch(background, 'Background', fields);
  const key = Object.keys(patch)[0];
  if (key.endsWith('.Patterns')) background._children.Patterns = patch[key];
  else background._children.Patterns._children[key.split('.').pop()] = patch[key];
  return control;
}
/** The names of a control's background patterns, in the order they were laid: what a pattern clip's
 *  target names ('Patterns.<name>'). */
export const patternNames = (control) => Object.keys(control._children.Background._children.Patterns?._children ?? {});
export const gradient = (control, angle, stops) => {
  Object.assign(control._children.Background._children.Fill, { solidEnabled: false, gradientEnabled: true,
    gradient: { type: 'linear', angle, stops: stops.map(([position, color]) => ({ position, color })) } });
  return control;
};
/** A radial gradient, its centre where given (percent of the box). */
export const radial = (control, stops, { centerX = 50, centerY = 50 } = {}) => {
  Object.assign(control._children.Background._children.Fill, { solidEnabled: false, gradientEnabled: true,
    gradient: { type: 'radial', centerX, centerY, stops: stops.map(([position, color]) => ({ position, color })) } });
  return control;
};
export const picture = (control, src, fit = 'cover') => {
  Object.assign(control._children.Background._children.Fill, { imageEnabled: true, imageSrc: src, imageFit: fit });
  return control;
};
export const glow = (control, colour, blur = 14) => {
  control._children.Effects._children.Shadows = { _type: 'Shadows', items: [{ enabled: true, type: 'outer-glow', offsetX: 0, offsetY: 0, blur, spread: 1, colour }] };
  return control;
};

/** A seeded run of numbers, so a picture draws the same every export. */
export function seeded(seed) {
  let n = seed >>> 0;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}
export function starTile(seed, count, rmin, rmax, w, h) {
  const next = seeded(seed);
  return svg(Array.from({ length: count }, () => `<circle cx="${(2 + next() * (w - 4)).toFixed(1)}" cy="${(2 + next() * (h - 4)).toFixed(1)}" r="${(rmin + next() * (rmax - rmin)).toFixed(2)}" fill="#fff"/>`).join(''), w, h);
}
export const RING = svg('<circle cx="50" cy="50" r="46" fill="none" stroke="#fff" stroke-width="3"/>', 100, 100);
/** A shake: out and back in five small jumps, `amp` px at most. */
export const jitter = (amp, extra = {}) => frames([{ at: 0, x: 0, y: 0 }, { at: 0.2, x: -amp, y: amp / 2 }, { at: 0.4, x: amp, y: -amp / 2 }, { at: 0.6, x: -amp / 2, y: amp }, { at: 0.8, x: amp / 2, y: -amp / 2 }, { at: 1, x: 0, y: 0 }], extra);
/** Hidden until `at` ms, then there: a clip from the scene's start that holds opacity 0 till then. */
export const hiddenUntil = (f, cname, at, scene = 0) => f.clip(cname, 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.999, opacity: 0 }, { at: 1, opacity: 1 }]), at, scene);
