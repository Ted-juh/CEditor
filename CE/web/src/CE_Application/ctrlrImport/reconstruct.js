// reconstruct.js — S3 of the Ctrlr import: the panel's layout, in CEditor's own vocabulary.
//
// The aim is a panel a Ctrlr user recognises at once and can edit straight away: every control where
// it was, the type it was, with the caption, words, colours and pictures it had, bound to the
// parameter its modulator became (harvest.js). Fonts and drawing will not match pixel for pixel —
// JUCE's look-and-feel is not CEditor's — and Lua paint callbacks cannot come across at all; the
// notes say both.
//
// HOW CTRLR LAYS A PANEL OUT, from 482 public panels (design record, "What real panels showed"):
//
//   A component inside a GROUP (componentGroupName) or on a TAB page (componentTabName, componentTabId)
//   is positioned relative to it — the group's top-left, or the tab page under the tab bar. CEditor's
//   containers work the same way (Children, Core.tabPageId; utils/containment.js), so the tree comes
//   across as a tree and every rectangle is copied as written. Groups sit inside tabs, and controls
//   inside both.
//
//   A component's rectangle INCLUDES its caption: with componentLabelVisible, the visible name takes
//   componentLabelHeight at the top (or the bottom, or a width at the side) and the control draws in
//   what is left. So each such control becomes a caption Label attached to it and the control below.
//
//   Colours are JUCE's Colour::fromString: every hex digit in the text, the low 32 bits as ARGB —
//   "0xffff0000", "ffff0000" and the occasional "fad3d" (transparent) alike.
//
// This module stays a pure translation of the document: it imports nothing from the editor's model.
// buildPanel.js stands the result up.

import { attr, attrNumber } from './xml.js';
import { componentValueList } from './harvest.js';
import { decodeJuceBase64, pictureSize, pictureType } from './binary.js';

const NO_RESOURCE = new Set(['', '-- None', '--None', 'None']);

/** JUCE's Colour::fromString, as 'AARRGGBB', or `fallback` when there is nothing to read. */
export function readColour(text, fallback = '') {
  const source = String(text ?? '').trim();
  if (!source) return fallback;
  let value = 0;
  let digits = 0;
  for (const c of source) {
    const digit = Number.parseInt(c, 16);
    if (Number.isNaN(digit)) continue;
    value = ((value << 4) | digit) >>> 0;
    digits += 1;
  }
  return digits ? value.toString(16).toUpperCase().padStart(8, '0') : fallback;
}

/** A Ctrlr font, "<Sans-Serif>;12;1;0;0;0;1;3" → { family, size, bold, italic, underline }. */
export function readFont(text) {
  const parts = String(text ?? '').split(';');
  if (parts.length < 2) return null;
  const name = parts[0].trim();
  const generic = { '<Sans-Serif>': 'sans-serif', '<Serif>': 'serif', '<Monospaced>': 'monospace' }[name];
  return {
    family: generic ?? name,
    generic: !!generic,
    size: Math.max(6, Number(parts[1]) || 12),
    bold: parts[2] === '1',
    italic: parts[3] === '1',
    underline: parts[4] === '1',
  };
}

/** `componentRectangle` → { x, y, width, height }, or null for anything that is not four numbers. */
export function readRectangle(text) {
  const parts = String(text ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** Kept for callers that read a plain list; value lists are read by harvest.js readValueList. */
export function readItemList(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

const ROTARY = /rotary/i;

/** A Ctrlr component → the CEditor control it becomes, and why. */
export function componentForCtrlr(node) {
  const type = String(attr(node, 'uiType', '') || attr(node, 'componentType', ''));
  const lower = type.toLowerCase();
  const style = String(attr(node, 'uiSliderStyle', ''));
  const slider = () => {
    if (/incdec/i.test(style)) return { type: 'Number', reason: `${type} with ${style}` };
    if (ROTARY.test(style)) return { type: 'Knob', reason: `${type}, ${style}` };
    return { type: 'Slider', reason: `${type}, ${style || 'linear'}`, vertical: !/horizontal/i.test(style) && !/LinearBar$/i.test(style) };
  };
  switch (lower) {
    case 'uislider':
    case 'uifixedslider':
      return slider();
    case 'uiimageslider':
    case 'uifixedimageslider':
      return { ...slider(), picture: 'strip' };
    case 'uibutton':
    case 'uitogglebutton': {
      const toggle = lower === 'uitogglebutton' || ['1', 'true'].includes(String(attr(node, 'uiButtonIsToggle', '')).toLowerCase());
      return { type: toggle ? 'ToggleButton' : 'Button', reason: `${type}${toggle ? ', toggles' : ''}` };
    }
    case 'uiimagebutton':
      return { type: 'ToggleButton', reason: type, picture: 'states' };
    case 'uicombo': return { type: 'Combobox', reason: type };
    case 'uilistbox': return { type: 'Listbox', reason: type };
    case 'uilabel': return { type: 'Label', reason: type };
    case 'uilcdlabel': return { type: 'LcdDisplay', reason: type };
    case 'uigroup': return { type: 'Group', reason: type, container: true };
    case 'uitabs': return { type: 'TabContainer', reason: type, container: true };
    case 'uiimage': return { type: 'Image', reason: type, picture: 'image' };
    case 'uimidikeyboard': return { type: 'Keyboard', reason: type };
    case 'uiprogressbar': return { type: 'ProgressBar', reason: type };
    case 'uicustomcomponent': return { type: 'Label', reason: `${type}, drawn by Lua`, paint: true };
    default:
      return { type: 'Label', reason: `uiType "${type || '(none)'}" has no CEditor equivalent yet`, unknown: true };
  }
}

/** The picture a resource holds: { name, bytes, mime, size } or { name, missing } — read once each. */
function pictureLibrary(read) {
  // One name can be listed twice — by the panel, and with its data in a program's resource list —
  // and the entry carrying the picture wins.
  const byName = new Map();
  for (const resource of read.resources) {
    const known = byName.get(resource.name);
    if (!known || (!(known.data || known.blob) && (resource.data || resource.blob))) byName.set(resource.name, resource);
  }
  const cache = new Map();
  return (name) => {
    if (NO_RESOURCE.has(String(name ?? '').trim())) return null;
    if (cache.has(name)) return cache.get(name);
    const resource = byName.get(name);
    let entry;
    if (!resource) {
      entry = { name, missing: 'the panel lists no picture by that name' };
    } else {
      const bytes = resource.blob ?? (resource.data ? decodeJuceBase64(resource.data) : null);
      const mime = bytes ? pictureType(bytes) : '';
      entry = bytes && mime
        ? { name, bytes, mime, size: pictureSize(bytes), file: resource.file }
        : { name, missing: resource.file ? `it was on the author's computer (${resource.file}), not in the file` : 'the file does not carry it' };
    }
    cache.set(name, entry);
    return entry;
  };
}

/** How a strip of frames lies in its picture, from the picture's size and the frame size. */
function stripOf(picture, frameWidth, frameHeight, orientation) {
  const size = picture?.size;
  if (!size || frameWidth <= 0 || frameHeight <= 0) return null;
  const down = size.height % frameHeight === 0 ? size.height / frameHeight : 0;
  const across = size.width % frameWidth === 0 ? size.width / frameWidth : 0;
  // The picture's own size decides; the orientation flag only breaks a tie.
  if (down > 1 && (across <= 1 || orientation !== '0')) return { frames: down, orientation: 'vertical' };
  if (across > 1) return { frames: across, orientation: 'horizontal' };
  if (down === 1 && across === 1) return { frames: 1, orientation: 'vertical' };
  return null;
}

/**
 * The placement plan: `{ ok, placed, skipped, unbound, notes, background }`. `placed` is in
 * document order, each entry naming its parent (`parentKey`, a group or tabs entry) and its page.
 * `parameterIdOf` (harvest.js) says which parameter each modulator became; a control whose modulator
 * became none is placed unbound and listed, because a binding to nothing looks connected and sends
 * nothing.
 */
export function planReconstruction(read, { profileId = '', deviceRole = 'primary', parameterIdOf = null, profile = null } = {}) {
  if (!read?.ok) return { ok: false, error: read?.error ?? 'The panel could not be read.' };

  const picture = pictureLibrary(read);
  // Layers by uid. A component writes its layer's uid at full length and the layer list a shorter
  // form of it, so they are matched by prefix. Names are made unique: CEditor keys layers by name.
  const layers = [];
  const usedLayerNames = new Set();
  for (const layer of read.panel.layers ?? []) {
    let layerName = String(layer.name || 'Layer').trim() || 'Layer';
    for (let n = 2; usedLayerNames.has(layerName.toLowerCase()); n += 1) layerName = `${layer.name || 'Layer'} ${n}`;
    usedLayerNames.add(layerName.toLowerCase());
    layers.push({ ...layer, name: layerName });
  }
  const layerOf = (uid) => {
    const text = String(uid ?? '').trim();
    if (!text) return null;
    return layers.find((layer) => layer.uid && (text.startsWith(layer.uid) || layer.uid.startsWith(text))) ?? null;
  };
  const parameters = new Map((profile?.parameters ?? []).map((p) => [p.id, p]));
  const placed = [];
  const skipped = [];
  const unbound = [];
  const missingPictures = new Map();
  const notes = [];
  const byName = new Map();

  const modulators = [];
  const collect = (node) => {
    for (const child of node.children ?? []) {
      if (child.name === 'modulator') modulators.push(child);
      collect(child);
    }
  };
  collect(read.root);

  // Components outside a modulator (hand-written panels have them), for completeness.
  const loose = [];
  const collectLoose = (node, inModulator) => {
    for (const child of node.children ?? []) {
      if (child.name === 'uiComponent' && !inModulator) loose.push(child);
      collectLoose(child, inModulator || child.name === 'modulator');
    }
  };
  collectLoose(read.root, false);

  const sources = [
    ...modulators.map((node, index) => ({ node, component: (node.children ?? []).find((c) => c.name === 'component' || c.name === 'uiComponent'), index })),
    ...loose.map((component, index) => ({ node: null, component, index: modulators.length + index })),
  ];

  for (const { node, component, index } of sources) {
    if (!component) continue;
    const name = (node && (attr(node, 'name') || attr(node, 'modulatorName'))) || `unnamed ${index + 1}`;
    const visible = attr(component, 'componentVisibleName') || attr(component, 'uiLabelText') || name;
    const rect = readRectangle(attr(component, 'componentRectangle', ''));
    const mapping = componentForCtrlr(component);
    if (!rect) {
      // By its modulator's name: a label's visible name is its text, and the modulator list is where to look.
      skipped.push({ name, reason: `componentRectangle is not four numbers ("${attr(component, 'componentRectangle', '')}")` });
      continue;
    }

    const parameterId = node && parameterIdOf instanceof Map ? (parameterIdOf.get(node) ?? '') : '';
    const sends = node && node.children?.some((c) => c.name === 'midi' && !['9', '9.0', '', 'None'].includes(String(attr(c, 'midiMessageType', '')).trim()));
    if (!parameterId && sends && !mapping.container && mapping.type !== 'Label') {
      unbound.push({ name: visible, reason: 'its modulator did not become a parameter (the profile\'s report says why)' });
    }

    // The caption, inside the component's own rectangle.
    let control = { ...rect };
    let caption = null;
    const labelVisible = ['1', 'true'].includes(String(attr(component, 'componentLabelVisible', '')).toLowerCase());
    if (labelVisible && !mapping.container && mapping.type !== 'Label' && visible) {
      const position = String(attr(component, 'componentLabelPosition', 'top')).toLowerCase();
      const height = Math.max(8, attrNumber(component, 'componentLabelHeight', 14));
      const width = attrNumber(component, 'componentLabelWidth', 0) || Math.min(rect.width / 2, visible.length * 7 + 6);
      const band = position === 'bottom' ? { x: 0, y: rect.height - height, width: rect.width, height }
        : position === 'left' ? { x: 0, y: 0, width, height: rect.height }
          : position === 'right' ? { x: rect.width - width, y: 0, width, height: rect.height }
            : position === 'over' || position === 'none' ? null
              : { x: 0, y: 0, width: rect.width, height };
      const side = position === 'left' || position === 'right';
      if (band && (side ? band.width < rect.width : band.height < rect.height)) {
        caption = {
          text: visible,
          rect: { x: rect.x + band.x, y: rect.y + band.y, width: band.width, height: band.height },
          colour: readColour(attr(component, 'componentLabelColour', ''), 'FF000000'),
          font: readFont(attr(component, 'componentLabelFont', '')),
          justification: attr(component, 'componentLabelJustification', 'centred'),
        };
        control = position === 'bottom' ? { ...rect, height: rect.height - height }
          : position === 'left' ? { ...rect, x: rect.x + width, width: rect.width - width }
            : position === 'right' ? { ...rect, width: rect.width - width }
              : { ...rect, y: rect.y + height, height: rect.height - height };
      }
    }

    const uiType = String(attr(component, 'uiType', '')).toLowerCase();
    const entry = {
      key: name,
      name: visible,
      modulator: name,
      type: mapping.type,
      ctrlrType: attr(component, 'uiType', ''),
      reason: mapping.reason,
      rect: control,
      caption,
      vertical: !!mapping.vertical,
      container: !!mapping.container,
      parameterId,
      parameter: parameterId ? parameters.get(parameterId) ?? null : null,
      deviceRole,
      profileId,
      alpha: Math.min(1, Math.max(0, attrNumber(component, 'componentAlpha', 255) / 255)),
      visible: !['0', '0.0', 'false'].includes(String(attr(component, 'componentVisibility', '1')).trim().toLowerCase()),
      layer: layerOf(attr(component, 'componentLayerUid', ''))?.name ?? '',
      enabled: attr(component, 'componentDisabled', '0') !== '1',
      customPaint: !!mapping.paint,
      unknownType: !!mapping.unknown,
      group: attr(component, 'componentGroupName', '').trim(),
      tab: attr(component, 'componentTabName', '').trim(),
      page: Math.max(0, Math.round(attrNumber(component, 'componentTabId', 0))),
      items: componentValueList(component).map((entryItem) => entryItem.label || String(entryItem.value)),
      step: Math.abs(attrNumber(component, 'uiSliderInterval', 1)) || 1,
      momentary: ['1', 'true'].includes(String(attr(component, 'uiButtonIsMomentary', '')).toLowerCase()),
    };

    // Words and colours, by type — what each Ctrlr type draws itself with.
    if (uiType === 'uilabel' || uiType === 'uilcdlabel') {
      entry.text = {
        content: attr(component, 'uiLabelText', ''),
        colour: readColour(attr(component, 'uiLabelTextColour', ''), 'FF000000'),
        font: readFont(attr(component, 'uiLabelFont', '')),
        justification: attr(component, 'uiLabelJustification', 'centred'),
      };
      entry.background = readColour(attr(component, 'uiLabelBgColour', ''), '00000000');
      const outline = readColour(attr(component, 'uiLabelOutlineColour', ''), '00000000');
      if (!outline.startsWith('00')) entry.border = { colour: outline, thickness: 1, radius: 0 };
    } else if (uiType === 'uibutton' || uiType === 'uitogglebutton') {
      const states = String(attr(component, 'uiButtonContent', '')).split('\n').map((line) => line.split('=')[0].trim()).filter(Boolean);
      entry.text = {
        content: states[0] ?? visible,
        onContent: states[1] ?? '',
        colour: readColour(attr(component, 'uiButtonTextColourOff', ''), 'FF000000'),
        onColour: readColour(attr(component, 'uiButtonTextColourOn', ''), ''),
        font: readFont(attr(component, 'uiButtonFont', '')),
      };
      entry.background = readColour(attr(component, 'uiButtonColourOff', ''), '');
      entry.onBackground = readColour(attr(component, 'uiButtonColourOn', ''), '');
    } else if (uiType === 'uicombo') {
      entry.text = {
        colour: readColour(attr(component, 'uiComboTextColour', ''), 'FF000000'),
        font: readFont(attr(component, 'uiComboFont', '')),
        justification: attr(component, 'uiComboTextJustification', 'centred'),
      };
      entry.background = readColour(attr(component, 'uiComboBgColour', ''), '');
      const outline = readColour(attr(component, 'uiComboOutlineColour', ''), '');
      if (outline && !outline.startsWith('00')) entry.border = { colour: outline, thickness: 1, radius: 0 };
    } else if (uiType === 'uigroup') {
      entry.text = {
        content: attr(component, 'uiGroupText', ''),
        colour: readColour(attr(component, 'uiGroupTextColour', ''), 'FF000000'),
        font: readFont(attr(component, 'uiGroupTextFont', '')),
        placement: attr(component, 'uiGroupTextPlacement', 'top'),
      };
      entry.background = readColour(attr(component, 'uiGroupBackgroundColour1', ''), '00000000');
      const thickness = attrNumber(component, 'uiGroupOutlineThickness', 0);
      if (thickness > 0) {
        entry.border = {
          colour: readColour(attr(component, 'uiGroupOutlineColour1', ''), 'FF000000'),
          thickness,
          radius: attrNumber(component, 'uiGroupOutlineRoundAngle', 0),
        };
      }
      const image = picture(attr(component, 'uiGroupBackgroundImage', ''));
      if (image?.bytes) entry.picture = { kind: 'image', ...image };
      else if (image?.missing) missingPictures.set(image.name, image.missing);
    } else if (uiType === 'uitabs') {
      const pages = (component.children ?? []).filter((c) => c.name === 'uiTabsTab').map((tab, pageIndex) => ({
        id: `p${pageIndex}`,
        label: attr(tab, 'uiTabsTabName', `Page ${pageIndex + 1}`),
        colour: readColour(attr(tab, 'uiTabsTabBackgroundColour', ''), ''),
        contentColour: readColour(attr(tab, 'uiTabsTabContentBackgroundColour', ''), ''),
      }));
      const orientation = String(attr(component, 'uiTabsOrientation', '0'));
      entry.tabs = {
        pages: pages.length ? pages : [{ id: 'p0', label: 'Page 1' }],
        current: Math.max(0, Math.round(attrNumber(component, 'uiTabsCurrentTab', 0))),
        depth: Math.max(0, attrNumber(component, 'uiTabsDepth', 26)),
        edge: { 0: 'top', 1: 'bottom', 2: 'left', 3: 'right' }[orientation] ?? 'top',
        labelColour: readColour(attr(component, 'uiTabsTextTabColour', ''), ''),
        activeLabelColour: readColour(attr(component, 'uiTabsFrontTabTextColour', ''), ''),
        outlineColour: readColour(attr(component, 'uiTabsOutlineTabColour', ''), ''),
      };
    }

    // Pictures: a strip of frames for an image slider or button, a picture for an image.
    if (mapping.picture) {
      const resourceName = attr(component, mapping.picture === 'states' ? 'uiImageButtonResource' : mapping.picture === 'image' ? 'uiImageResource' : 'uiImageSliderResource', '');
      const image = picture(resourceName);
      if (image?.bytes) {
        if (mapping.picture === 'image') {
          entry.picture = { kind: 'image', ...image };
        } else {
          const frameWidth = attrNumber(component, 'resourceImageWidth', image.size?.width ?? 0);
          const frameHeight = attrNumber(component, 'resourceImageHeight', image.size?.height ?? 0);
          const strip = stripOf(image, frameWidth, frameHeight, String(attr(component, 'resourceImageOrientation', '1')));
          if (strip) entry.picture = { kind: 'strip', ...image, frameWidth, frameHeight, ...strip };
          else notes.push(`"${visible}": the picture ${image.name} is not a strip of ${frameWidth}×${frameHeight} frames, so it is drawn as a plain control.`);
        }
      } else if (image?.missing) {
        missingPictures.set(image.name, image.missing);
      }
      if (mapping.picture === 'states' && !entry.picture) {
        const states = String(attr(component, 'uiImageButtonContent', '')).split('\n').map((line) => line.split('=')[0].trim()).filter(Boolean);
        entry.text = { content: states[0] ?? visible, onContent: states[1] ?? '', colour: readColour(attr(component, 'uiImageButtonTextColour', ''), 'FF000000') };
      }
    }

    placed.push(entry);
    byName.set(name, entry);
  }

  // Parents: a group first (a control in a group in a tab names both), else a tab.
  for (const entry of placed) {
    const group = entry.group && byName.get(entry.group);
    const tabs = entry.tab && byName.get(entry.tab);
    if (group && group !== entry && group.type === 'Group') entry.parentKey = group.key;
    else if (tabs && tabs !== entry && tabs.type === 'TabContainer') entry.parentKey = tabs.key;
    else entry.parentKey = null;
  }
  // A loop of groups naming each other would hide them all: break it at the top.
  for (const entry of placed) {
    const seen = new Set([entry.key]);
    let up = entry.parentKey ? byName.get(entry.parentKey) : null;
    while (up) {
      if (seen.has(up.key)) { entry.parentKey = null; break; }
      seen.add(up.key);
      up = up.parentKey ? byName.get(up.parentKey) : null;
    }
  }

  const editor = read.panel.background ?? {};
  const backgroundPicture = picture(editor.image);
  if (backgroundPicture?.missing) missingPictures.set(backgroundPicture.name, backgroundPicture.missing);

  const strips = placed.filter((entry) => entry.picture?.kind === 'strip').length;
  const painted = placed.filter((entry) => entry.customPaint).length;
  const unknown = placed.filter((entry) => entry.unknownType);
  notes.push('Fonts and drawing follow CEditor, not JUCE: the panel is laid out as it was and will look close, not identical.');
  if (strips) notes.push(`${strips} picture control(s) use the panel's own frames.`);
  if (missingPictures.size) {
    notes.push(`${missingPictures.size} picture(s) are not in the file, so their controls are drawn plainly: `
      + [...missingPictures].map(([pictureName, why]) => `${pictureName} — ${why}`).join('; ') + '.');
  }
  if (painted) notes.push(`${painted} component(s) drew themselves with a Lua paint callback. They are placed as plain boxes: rebuild that look in the Component Designer if it matters.`);
  if (unknown.length) notes.push(`${unknown.length} component(s) of a kind CEditor has no control for are placed as labels: ${[...new Set(unknown.map((e) => e.ctrlrType))].join(', ')}.`);
  if (unbound.length) notes.push(`${unbound.length} control(s) are placed but bound to nothing: their modulator did not become a parameter.`);

  const hiddenLayers = layers.filter((layer) => !layer.visible);
  if (hiddenLayers.length) {
    notes.push(`${hiddenLayers.length} of the panel's ${layers.length} layers start hidden, as in Ctrlr: ${hiddenLayers.map((layer) => layer.name).join(', ')}. `
      + 'The panel showed them from Lua; show them from the Layers list to see or edit what is on them.');
  }

  return {
    ok: true,
    placed,
    skipped,
    unbound,
    notes,
    layers: layers.map(({ name: layerName, visible }) => ({ name: layerName, visible })),
    background: {
      colour: readColour(editor.colour, ''),
      picture: backgroundPicture?.bytes ? backgroundPicture : null,
    },
  };
}
