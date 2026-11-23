// buildPanel.js — S3's placement plan (reconstruct.js) made into a CEditor panel.
//
// Shared by File → New Panel from Ctrlr Panel... (stores/ctrlrImportActions.js) and the command line
// (tools/scripts/ctrlr-import.mjs), so the two cannot make different panels from one file.
//
// What it makes, per Ctrlr component:
//
//   the control       of the plan's type, where the plan puts it inside its group or tab page, with
//                     its words, colours, opacity, visibility, and its binding — and the bound
//                     parameter's range, steps, rows and readout adopted at once (parameterAdoption),
//                     so the control is right before anybody opens it
//   its caption       a Label attached to it (Core.attachedTo), in the band Ctrlr drew its name in
//   a picture strip   for an image slider or button, a Custom Component whose filmstrip is the
//                     panel's own picture: the frames follow the value, as in Ctrlr
//   a container       a Group or a Tabbed Container holding its children, with its pages

import { createControl } from '../models/componentTypes.js';
import { createPanel } from '../stores/panelModel.js';
import { parameterAdoptionPatches } from '../utils/parameterAdoptionRules.js';
import { createCustomComponentStarterPatch, createPartNode, createValueChannel } from '../utils/customComponentFactory.js';
import { dataUrlOf } from './binary.js';

const idPart = (text) => String(text ?? '').replace(/\W+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 40) || 'control';

/** Write `value` at 'Section.child.field' — through `_children` where a section nests. */
function set(control, path, value) {
  const parts = path.split('.');
  if (parts.length === 1) { control._children[parts[0]] = value; return; }
  let node = control._children[parts[0]];
  if (!node) return;
  for (const key of parts.slice(1, -1)) {
    const next = node._children?.[key] ?? node[key];
    if (!next || typeof next !== 'object') return;
    node = next;
  }
  node[parts.at(-1)] = value;
}

const JUSTIFY = { left: 'left', centredleft: 'left', right: 'right', centredright: 'right', centred: 'center', centre: 'center', center: 'center' };
const alignOf = (justification) => JUSTIFY[String(justification ?? '').toLowerCase().replace(/\s|-/g, '')] ?? 'center';

function applyText(control, text, { caption = false } = {}) {
  if (!text || !control._children.Text) return;
  if (text.content !== undefined) set(control, 'Text.content', text.content);
  if (text.colour) set(control, 'Text.Fill.colour', text.colour);
  if (text.font) {
    // JUCE's font height is the line's, a little more than a CSS font size.
    set(control, 'Text.Font.size', Math.max(6, Math.round(text.font.size * 0.85)));
    if (!text.font.generic && text.font.family) set(control, 'Text.Font.family', text.font.family);
    if (text.font.bold) { set(control, 'Text.Font.weight', 'Bold'); set(control, 'Text.Font.weightValue', 700); }
    if (text.font.italic) set(control, 'Text.Font.style', 'Italic');
  }
  if (control._children.ContentLayout) {
    set(control, 'ContentLayout.horizontalAlign', alignOf(text.justification));
    if (caption) set(control, 'ContentLayout.mode', 'text_only');
  }
}

function applyBox(control, entry) {
  if (!control._children.Background) return;
  if (entry.background) {
    set(control, 'Background.Fill.colour', entry.background);
    set(control, 'Background.Fill.solidEnabled', true);
  }
  if (entry.border) {
    set(control, 'Background.Border.enabled', true);
    set(control, 'Background.Border.colour', entry.border.colour);
    set(control, 'Background.Border.thickness', entry.border.thickness);
    set(control, 'Background.Border.radius', entry.border.radius);
  }
  if (entry.picture?.kind === 'image') {
    set(control, 'Background.Fill.imageEnabled', true);
    set(control, 'Background.Fill.imageSrc', dataUrlOf(entry.picture.bytes, entry.picture.mime));
    set(control, 'Background.Fill.imageFit', control._children.Core.controlType === 'Image' ? 'stretch' : 'fill');
  }
}

/** The values a control moves through: the bound parameter's, else its list's positions, else 0..127. */
function valueRange(entry) {
  const parameter = entry.parameter;
  if (parameter?.type === 'choice') return { min: 0, max: Math.max(0, parameter.choices.length - 1), step: 1, value: 0 };
  if (parameter?.range) {
    return { min: parameter.range.min, max: parameter.range.max, step: parameter.ui?.step ?? 1, value: parameter.default ?? parameter.range.min };
  }
  if (entry.items.length) return { min: 0, max: entry.items.length - 1, step: 1, value: 0 };
  return { min: 0, max: 127, step: entry.step || 1, value: 0 };
}

/**
 * An image slider or button: a Custom Component showing the panel's own strip of frames, the frame
 * following the value as Ctrlr's does.
 *
 * The picture is ONE stored part (an Image in filmstrip mode) driven by a range binding from the
 * value to its frame index, rather than a per-control asset and generator: two controls using the
 * same strip then have identical Parts, which the saved document writes once (documentDrawings.js).
 * The CTX81Z's 133 knobs share four strips; written per control they made a 6.4 MB file.
 */
function pictureStrip(entry, id) {
  const control = createControl('CustomComponent', { Core: { id, name: id } });
  for (const [path, value] of Object.entries(createCustomComponentStarterPatch('starter.filmstripKnob'))) set(control, path, value);
  const range = valueRange(entry);
  const states = entry.ctrlrType.toLowerCase() === 'uiimagebutton';
  const frames = entry.picture.frames;

  control._children.Parts._children = {
    frames: createPartNode('frames', {
      role: 'filmstrip',
      kind: 'image',
      zIndex: 5,
      layout: { mode: 'fill', xUnit: 'percent', yUnit: 'percent', widthUnit: 'percent', heightUnit: 'percent' },
      sections: {
        Image: {
          _type: 'Image',
          source: dataUrlOf(entry.picture.bytes, entry.picture.mime),
          mode: 'filmstrip',
          frameIndex: 0,
          frameCount: frames,
          frameWidth: entry.picture.frameWidth,
          frameHeight: entry.picture.frameHeight,
          orientation: entry.picture.orientation,
          interpolation: 'nearest',
          fit: 'cover',
        },
      },
    }),
  };
  control._children.Assets.filmstrips = {};
  control._children.Generators._children = {};
  control._children.Bindings._children = {
    frame: {
      _type: 'Binding', name: 'frame', enabled: true,
      source: 'channel.mainValue.normalized', mapMode: 'range', target: 'Parts.frames.Image.frameIndex',
      outputUnit: '', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: Math.max(0, frames - 1),
      falseValue: 0, trueValue: Math.max(0, frames - 1), enumMap: {}, clamp: true, round: false, invert: false,
    },
  };

  const channel = createValueChannel('mainValue', {
    label: entry.name,
    min: range.min,
    max: range.max,
    step: range.step,
    defaultValue: range.value,
    ...(states ? { type: 'enum' } : {}),
  });
  if (states) channel.values = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i);
  control._children.ValueChannels._children = { mainValue: channel };

  if (states) {
    // A press steps to the next state, as Ctrlr's image button does.
    const behaviors = control._children.Behaviors._children;
    behaviors.knobDrag = { ...behaviors.knobDrag, type: 'cycle', role: 'button' };
    const zone = control._children.HitZones._children.knobZone;
    Object.assign(zone, { action: 'cycleValue', shape: 'rectangle', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } });
  } else {
    const zone = control._children.HitZones._children.knobZone;
    Object.assign(zone, { bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } });
  }
  return control;
}

function controlFor(entry, id) {
  if (entry.picture?.kind === 'strip') return pictureStrip(entry, id);
  const control = createControl(entry.type, { Core: { id, name: id } });
  if (entry.type === 'Slider') set(control, 'Behavior.orientation', entry.vertical ? 'vertical' : 'horizontal');

  // The bound parameter's range, rows, steps and readout, as binding it in the editor would write.
  if (entry.parameter) {
    for (const [path, value] of Object.entries(parameterAdoptionPatches(entry.type, entry.parameter))) {
      if (value !== undefined) set(control, path, value);
    }
    if (entry.parameter.ui?.step && control._children.Behavior) set(control, 'Behavior.step', entry.parameter.ui.step);
  } else if (entry.items.length && control._children.Value) {
    set(control, 'Value.rows', entry.items.map((label, row) => ({
      id: `row_${row}`, displayText: label, internalValue: label,
      sendValue: row, receiveValue: row, selectedByDefault: row === 0, enabled: true, visualOverrides: {},
    })));
  }

  applyBox(control, entry);
  if (entry.text) applyText(control, entry.text);
  else if (entry.type === 'Label') set(control, 'Text.content', entry.customPaint ? '' : entry.unknownType ? entry.ctrlrType : entry.name);

  if (entry.tabs) {
    const tab = control._children.TabContainer;
    tab.pages = entry.tabs.pages.map(({ id: pageId, label }) => ({ id: pageId, label }));
    tab.pageIndex = Math.min(entry.tabs.current, tab.pages.length - 1);
    tab.stripSize = entry.tabs.depth;
    tab.edge = entry.tabs.edge;
    const first = entry.tabs.pages[0];
    if (first?.colour) tab.tabColour = first.colour;
    if (first?.contentColour) set(control, 'Background.Fill.colour', first.contentColour);
    if (entry.tabs.labelColour) tab.labelColour = entry.tabs.labelColour;
    if (entry.tabs.activeLabelColour) tab.activeLabelColour = entry.tabs.activeLabelColour;
  }
  return control;
}

function bindingFor(entry) {
  const parameter = entry.parameter;
  const port = entry.picture?.kind === 'strip' ? 'mainValue'
    : entry.type === 'Combobox' || entry.type === 'Listbox' ? (parameter?.type === 'choice' ? 'selectedChoice' : 'value')
      : entry.type === 'ToggleButton' && parameter?.range && parameter.range.max - parameter.range.min === 1 ? 'state'
        : 'value';
  return {
    enabled: true,
    bindings: [{
      kind: 'deviceParameter',
      port,
      deviceRole: entry.deviceRole,
      parameterId: entry.parameterId,
      adoptMetadata: true,
      dryRun: false,
      feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    }],
  };
}

function captionFor(entry, ownerId) {
  const label = createControl('Label', {
    Core: { id: `${ownerId}_cap`, name: `${ownerId}_cap`, attachedTo: ownerId },
    Transform: { ...entry.caption.rect },
    Text: { content: entry.caption.text, _children: { Multiline: { wrapMode: 'none' } } },
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false } } },
  });
  applyText(label, { colour: entry.caption.colour, font: entry.caption.font, justification: entry.caption.justification }, { caption: true });
  return label;
}

/**
 * A panel `{ name, width, height }` with the plan's controls, nested as Ctrlr nested them, bound to
 * the harvested profile `profileId` where the plan says so.
 */
export function buildCtrlrPanel(plan, { name, width, height, profileId }) {
  const panel = createPanel(name);
  panel.width = Math.max(320, width || 0);
  panel.height = Math.max(240, height || 0);
  panel.requiredProfiles = profileId ? [{ role: 'primary', profileId, version: '*' }] : [];
  if (plan.background?.colour) panel.bgColour = plan.background.colour;
  if (plan.layers?.length) {
    // Ctrlr's layers, back to front, the hidden ones hidden; anything on no layer goes on the first.
    panel.layers = plan.layers.map((layer) => ({ _type: 'Layer', kind: 'controls', visible: layer.visible, locked: false, name: layer.name }));
  }
  if (plan.background?.picture) {
    panel.bgImageEnabled = true;
    panel.bgImage = dataUrlOf(plan.background.picture.bytes, plan.background.picture.mime);
    panel.bgImageFit = 'fill';
  }

  const controls = new Map();
  const top = [];
  const childrenOf = new Map();
  plan.placed.forEach((entry, index) => {
    const id = `ctrlr_${index}_${idPart(entry.modulator || entry.name)}`;
    const control = controlFor(entry, id);
    Object.assign(control._children.Core, {
      ...(plan.layers?.length ? { layer: entry.layer || plan.layers[0].name } : {}),
      name: entry.modulator || entry.name,
      description: `${entry.name} — from Ctrlr (${entry.reason})`,
      visible: entry.visible,
      enabled: entry.enabled,
    });
    Object.assign(control._children.Transform, {
      x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height,
      opacity: Number.isFinite(entry.alpha) ? entry.alpha : 1,
    });
    if (entry.parameterId && entry.profileId) control._children.DeviceBindings = { ...(control._children.DeviceBindings ?? {}), ...bindingFor(entry) };
    const made = [control];
    if (entry.caption) {
      const caption = captionFor(entry, id);
      caption._children.Core.visible = entry.visible;
      if (plan.layers?.length) caption._children.Core.layer = entry.layer || plan.layers[0].name;
      made.unshift(caption);
    }
    controls.set(entry.key, { control, entry });
    if (entry.parentKey) {
      if (!childrenOf.has(entry.parentKey)) childrenOf.set(entry.parentKey, []);
      childrenOf.get(entry.parentKey).push({ made, entry });
    } else {
      top.push(...made);
    }
  });

  // Each container holds its children, on their tab page where it has pages.
  for (const [parentKey, kids] of childrenOf) {
    const parent = controls.get(parentKey)?.control;
    if (!parent?._children?.Children) {
      for (const { made } of kids) top.push(...made);
      continue;
    }
    const map = parent._children.Children._children ?? (parent._children.Children._children = {});
    const pages = parent._children.TabContainer?.pages ?? null;
    for (const { made, entry } of kids) {
      for (const child of made) {
        if (pages) child._children.Core.tabPageId = pages[Math.min(entry.page, pages.length - 1)]?.id ?? 'p0';
        map[child._children.Core.id] = child;
      }
    }
  }

  panel.controls = top;
  // Ctrlr's canvas scrolls; a CEditor panel is as big as it says. So it grows to hold every control
  // a Ctrlr user could scroll to (genesynth's keyboard sits below its 600×600 canvas).
  for (const control of top) {
    const t = control._children.Transform;
    panel.width = Math.max(panel.width, Math.ceil((t.x ?? 0) + (t.width ?? 0)));
    panel.height = Math.max(panel.height, Math.ceil((t.y ?? 0) + (t.height ?? 0)));
  }
  return panel;
}
