// autoPanel.js — a whole editor, generated from a device profile.
//
// THE ADOPTION PROBLEM this solves, stated plainly: a profile already knows every parameter a synth
// has, its range, its choices, its group and the bytes to send. Until now the only way to get those
// onto a screen was to place 793 controls by hand and bind each one. Nobody does that, so the
// profile — the hardest part, the part that took a manual and a weekend — bought nothing until the
// user had spent another weekend on layout.
//
// PRIOR ART, and why this file is not a fourth copy of it. Three generators already build panels
// from a profile: QA-06 (`tools/scripts/qa/sheets/gaia.mjs`) flows parameters by group, and the two
// shipped hardware panels (`tools/scripts/gaia-panel`, `tools/scripts/an1x-panel`) place them by
// hand in the instrument's own layout. QA-06 is the algorithm this feature needs — it is just
// trapped in a Node script that reads a file off disk, hardcodes the GAIA's tone sections, and
// cannot be called from the editor. So the algorithm moves here, generalised, and the sheet's
// GAIA-specific ordering stays where it belongs.
//
// PURE, like the adoption rules it uses and for the same reason: the editor command calls it, tests
// call it, and a Node script could. No store, no bridge, no filesystem.
//
// WHAT IT DOES NOT DO — merge. Re-running over a panel the user has since edited would have to
// decide, per control, whether a moved knob is a deliberate layout or a stale position, and there
// is no honest answer. It generates a NEW panel instead. What makes a future merge possible is that
// the control ids are DERIVED from the profile and parameter ids rather than minted: run it twice
// and you get the same ids, so the two panels diff.

import { COMPONENT_TYPES, createControl } from '../models/componentTypes.js';
import { getPreferredPort } from '../models/componentPorts.js';
import { parameterAdoptionPatches } from './parameterAdoptionRules.js';

/**
 * The component to reach for when the profile does not name one, by parameter type.
 *
 * A profile normally does name one — `ui.preferredComponent` is filled in for all but two of the
 * 4936 parameters across the shipped profiles — so this is the floor, not the policy. It is still
 * needed: a hand-written profile is allowed to omit it, and a `preferredComponent` naming a type
 * this build does not have has to land somewhere.
 */
export const FALLBACK_COMPONENT = {
  integer: 'Knob',
  float: 'Knob',
  bipolar: 'Knob',
  normalized: 'Knob',
  time: 'Knob',
  choice: 'Combobox',
  'choice-stepped': 'Combobox',
  enum: 'Combobox',
  boolean: 'ToggleButton',
  action: 'Button',
  momentary: 'MomentaryButton',
  dumpRequest: 'Button',
  rawMidiAction: 'Button',
  text: 'TextInput',
  patchName: 'TextInput',
};

/**
 * Above this many options, a radio group stops being a control and becomes a wall.
 *
 * The same number `getBindingCompatibility` warns at, and taken from there deliberately: a profile
 * that asks for a RadioButtonGroup on a 32-choice parameter would otherwise generate a panel the
 * editor immediately warns about, which is a strange thing for the editor to have built itself.
 */
const RADIO_CHOICE_LIMIT = 8;

/** Two densities, because the useful difference is "see the whole synth" vs "read the labels". */
export const AUTO_PANEL_DENSITY = {
  comfortable: { cellWidth: 108, cellHeight: 62, captionHeight: 15, cellGap: 8, rowGap: 12 },
  compact: { cellWidth: 84, cellHeight: 44, captionHeight: 13, cellGap: 6, rowGap: 8 },
};

export const AUTO_PANEL_DEFAULTS = {
  density: 'comfortable',
  /** How wide the panel is allowed to get before a group wraps to a new row. */
  contentWidth: 1200,
  margin: 20,
  groupHeaderHeight: 22,
  groupGap: 18,
  deviceRole: 'primary',
  /** Restrict to these profile groups; empty means every group the profile has. */
  groups: [],
};

const slug = (value) => String(value ?? '').replace(/\W+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

const parameterLabel = (parameter) =>
  parameter?.display?.shortLabel || parameter?.name || parameter?.id || '';

/**
 * Which component to build for a parameter, and why.
 *
 * The reason is returned rather than logged because it is the thing a user asks about the result:
 * "why is this a dropdown". Three answers are possible and they are genuinely different — the
 * profile asked for it, the profile asked for something impossible, or the profile said nothing.
 */
export function componentForParameter(parameter, componentTypes = COMPONENT_TYPES) {
  const type = String(parameter?.type ?? '').trim();
  const fallback = FALLBACK_COMPONENT[type] ?? null;
  const asked = String(parameter?.ui?.preferredComponent ?? '').trim();

  // Case-insensitive, because the shipped profiles disagree with themselves: 72 parameters say
  // "Combobox" and 53 say "ComboBox", and the second spelling is not a component this build has.
  // Refusing it would put a knob where a dropdown belongs over a capital letter.
  const known = asked
    ? Object.keys(componentTypes).find((name) => name.toLowerCase() === asked.toLowerCase())
    : null;

  if (asked && !known) {
    return { type: fallback, reason: `profile asked for "${asked}", which this build has no component for` };
  }

  if (known) {
    // A radio group with thirty options is not a radio group. The editor already warns about this
    // on a drop; generating one and then warning about it would be silly.
    if (known === 'RadioButtonGroup' && (parameter?.choices?.length ?? 0) > RADIO_CHOICE_LIMIT) {
      return {
        type: 'Combobox',
        reason: `profile asked for a RadioButtonGroup, but ${parameter.choices.length} choices is past the ${RADIO_CHOICE_LIMIT} the editor warns at`,
      };
    }
    return { type: known, reason: 'the profile asked for it' };
  }

  return fallback
    ? { type: fallback, reason: `the profile named no component, so "${type}" fell back to ${fallback}` }
    : { type: null, reason: `no component fits parameter type "${type || '(none)'}"` };
}

/** Set a dotted 'Section.path' on a freshly built control, creating sections as needed. */
function setPath(control, path, value) {
  const keys = path.split('.');
  let node = control._children;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!node[keys[i]]) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function captionControl(text, box, id, density) {
  return createControl('Label', {
    Core: { id, name: id },
    Transform: { x: box.x, y: box.y, width: box.width, height: box.height },
    Text: {
      content: text,
      _children: { Font: { size: density === 'compact' ? 9 : 10 }, Fill: { colour: 'FFAAB4BE' } },
    },
    Background: { _children: { Fill: { colour: '00000000' } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', paddingLeft: 2, paddingRight: 2 },
  });
}

function headerControl(text, box, id) {
  return createControl('Label', {
    Core: { id, name: id },
    Transform: { x: box.x, y: box.y, width: box.width, height: box.height },
    Text: {
      content: text,
      _children: { Font: { size: 12, bold: true, weight: 'Bold', weightValue: 700 }, Fill: { colour: 'FFBFD4E6' } },
    },
    Background: { _children: { Fill: { colour: 'FF262C31' } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', paddingLeft: 8, paddingRight: 4 },
  });
}

/**
 * One control, bound to one parameter and shaped by it.
 *
 * The binding alone is not enough — that mistake is written up in the QA sheet this came from:
 * `adoptMetadata: true` is a flag the editor reads when a parameter is DROPPED, and a generated
 * panel has no drop, so every knob read 0.00–1.00 and every combobox said "Option 1". The rules run
 * here explicitly, out of the module the canvas uses.
 */
function boundControl(parameter, componentType, box, id, deviceRole) {
  const port = getPreferredPort(componentType, parameter?.type)?.id ?? 'value';

  const control = createControl(componentType, {
    Core: {
      id,
      name: id,
      description: `${parameter.name ?? parameter.id} — ${parameter.address ?? parameter.messageRecipe ?? ''}`.trim(),
    },
    Transform: { x: box.x, y: box.y, width: box.width, height: box.height },
    DeviceBindings: {
      bindings: [{
        kind: 'deviceParameter',
        port,
        deviceRole,
        parameterId: parameter.id,
        parameterType: parameter.type,
        adoptMetadata: true,
        dryRun: false,
        feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
      }],
    },
  });

  for (const [path, value] of Object.entries(parameterAdoptionPatches(componentType, parameter))) {
    setPath(control, path, value);
  }

  return control;
}

/** The profile's groups in first-appearance order — the order its author wrote them in. */
export function profileGroups(profile) {
  const seen = [];
  for (const parameter of profile?.parameters ?? []) {
    const group = String(parameter?.group ?? '').trim() || 'Ungrouped';
    if (!seen.includes(group)) seen.push(group);
  }
  return seen;
}

/**
 * Everything needed to build a panel from a profile, without building one.
 *
 * Returned rather than applied so a caller can show the count before committing — 1296 parameters
 * is 2592 controls, and a user is entitled to know that before it lands in a tab.
 *
 * @returns {{controls: object[], width: number, height: number, requiredProfiles: object[],
 *            placed: number, skipped: {id: string, reason: string}[], substitutions: object[],
 *            groups: string[]}}
 */
export function autoPanelPlan(profile, options = {}) {
  const config = { ...AUTO_PANEL_DEFAULTS, ...options };
  const density = AUTO_PANEL_DENSITY[config.density] ?? AUTO_PANEL_DENSITY.comfortable;
  const profileId = slug(profile?.id) || 'profile';

  const wanted = new Set((config.groups ?? []).map((g) => String(g)));
  const groups = profileGroups(profile).filter((g) => wanted.size === 0 || wanted.has(g));

  const byGroup = new Map(groups.map((g) => [g, []]));
  for (const parameter of profile?.parameters ?? []) {
    const group = String(parameter?.group ?? '').trim() || 'Ungrouped';
    byGroup.get(group)?.push(parameter);
  }

  const controls = [];
  const skipped = [];
  const substitutions = [];
  const usedIds = new Set();
  const innerWidth = Math.max(density.cellWidth, config.contentWidth - config.margin * 2);
  const perRow = Math.max(1, Math.floor((innerWidth + density.cellGap) / (density.cellWidth + density.cellGap)));

  let y = config.margin;

  for (const group of groups) {
    const parameters = byGroup.get(group) ?? [];
    if (parameters.length === 0) continue;

    controls.push(headerControl(group.toUpperCase(),
      { x: config.margin, y, width: innerWidth, height: config.groupHeaderHeight },
      `${profileId}__grp_${slug(group)}`));
    y += config.groupHeaderHeight + 8;

    let column = 0;
    let placedInGroup = 0;
    for (const parameter of parameters) {
      const { type, reason } = componentForParameter(parameter);
      if (!type) {
        skipped.push({ id: String(parameter?.id ?? ''), reason });
        continue;
      }
      if (reason !== 'the profile asked for it') {
        substitutions.push({ id: String(parameter?.id ?? ''), type, reason });
      }

      if (placedInGroup > 0 && column >= perRow) {
        column = 0;
        y += density.cellHeight + density.captionHeight + density.rowGap;
      }

      const x = config.margin + column * (density.cellWidth + density.cellGap);
      // Derived, never minted: the same profile generates the same ids every time, so two runs
      // diff. A collision would silently drop a control, so it is made unique and recorded.
      let id = `${profileId}__${slug(parameter.id)}`;
      if (usedIds.has(id)) id = `${id}_${usedIds.size}`;
      usedIds.add(id);

      controls.push(captionControl(parameterLabel(parameter),
        { x, y, width: density.cellWidth, height: density.captionHeight }, `${id}_cap`, config.density));
      controls.push(boundControl(parameter, type,
        { x, y: y + density.captionHeight, width: density.cellWidth, height: density.cellHeight },
        id, config.deviceRole));

      column += 1;
      placedInGroup += 1;
    }

    if (placedInGroup > 0) y += density.cellHeight + density.captionHeight + config.groupGap;
  }

  return {
    controls,
    width: config.contentWidth,
    height: y + config.margin,
    // The panel says which profile it needs, exactly as the editor writes it when a parameter is
    // dropped — so opening it asks for the profile instead of rendering a wall of dead controls.
    requiredProfiles: profile?.id ? [{ role: config.deviceRole, profileId: String(profile.id), version: '*' }] : [],
    placed: usedIds.size,
    skipped,
    substitutions,
    groups,
  };
}
