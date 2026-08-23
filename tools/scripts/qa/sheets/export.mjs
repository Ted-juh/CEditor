// export.mjs — QA-08: the parameter list the exported plugin will actually have.
//
// The gap this closes, and why it is the worst one in the suite. Every other sheet shows something
// that is wrong on screen. This one shows something that is wrong in three weeks, in a DAW, on
// somebody else's machine: a control that automates beautifully in the editor and exports as no
// parameter at all, or as a parameter with the wrong range, or as one that moves and sends nothing
// to the synth because the window is closed. None of that is visible while you are authoring. The
// panel looks finished.
//
// `collectExportParameters(panel)` is the whole contract. It runs in the editor for the automation
// UI and is read by the C++ processor at export to build its APVTS, so what it returns IS the
// plugin's parameter list — there is no second opinion later. This sheet prints it.
//
// Two halves, because there are two ways to get this wrong:
//
//   1. WHICH TYPES EXPORT ANYTHING. Ten of the fifty component types produce a parameter at their
//      defaults. That is a fact worth having on a sheet rather than in someone's head, because the
//      forty that do not are not all deliberate: a type with no `Behavior` section is a type the
//      deriver never looks at, and several of those are things a user would expect to automate.
//      The sheet says which, and why, and leaves the judgement to the person reading it.
//   2. THE BRANCHES DEFAULTS NEVER REACH. Named-choice export, device-bound parameters, raw MIDI
//      wires, the inbound-only messages that must NOT get a wire, degenerate ranges, an author's
//      explicit list overriding derivation. Each is a recipe below, built and printed.
//
// THE RATCHET is the committed file. Every derived parameter is printed onto the sheet as text, so
// a change to derivation makes the committed copy stale and `--check` fails — naming the sheet
// rather than letting the difference reach an export. `qaPanels.test.js` additionally asserts that
// every type in COMPONENT_TYPES is accounted for here, and that every recipe still exercises the
// branch it claims to.

import { COMPONENT_TYPES, createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import { collectExportParameters } from '../../../../CE/web/src/CE_Application/utils/exportParameters.js';
import { flowGroups, styleSheet } from '../layout.mjs';

/** Run the real contract over a throwaway one-control panel. */
export function parametersFor(control, panelExtras = {}) {
  return collectExportParameters({ controls: [control], ...panelExtras });
}

/**
 * What a type exports, and — when it exports nothing — the model's own reason.
 *
 * Three verdicts, and the difference between the last two is the point of the sheet:
 *   'exports'    the deriver produced a parameter
 *   'declined'   the type has RULED that it exports nothing, and says why — either a Behavior whose
 *                value model is not a value (trigger, text), or an empty `exportValues` list
 *   'unseen'     nothing in the type says anything, so the deriver never looked at it
 *
 * A type that should export nothing must land in 'declined', not 'unseen'. That is the whole
 * difference between a decision and an oversight, and it is why `exportValues: []` is written out
 * on Meter, Matrix and Envelope rather than left absent.
 */
export function classifyType(type) {
  const control = createControl(type, { Core: { id: `qa08_${type}`, name: `qa08_${type}` } });
  const params = parametersFor(control);
  if (params.length) return { type, verdict: 'exports', params, control };

  const behavior = control._children?.Behavior;
  if (behavior) {
    const family = String(behavior.family ?? '-');
    const valueType = String(behavior.valueType ?? '-');
    return { type, verdict: 'declined', reason: `family=${family} valueType=${valueType}`, params, control };
  }

  // An explicit empty list is a ruling: this type exports nothing, on purpose.
  if (Array.isArray(COMPONENT_TYPES[type]?.exportValues)) {
    return { type, verdict: 'declined', reason: 'exportValues: [] — ruled, not overlooked', params, control };
  }
  // A Value section without a Behavior is the sharper case: the type stores a value and the
  // deriver still cannot see it, because it only ever reads Behavior. Worth calling out separately
  // rather than lumping it in with the decorative types.
  const reason = control._children?.Value ? 'Value section, but no Behavior' : 'no Behavior section';
  return { type, verdict: 'unseen', reason, params, control };
}

/** Every type, classified. The order is COMPONENT_TYPES' own, so it is the model's list. */
export function classifyAllTypes() {
  return Object.keys(COMPONENT_TYPES).map(classifyType);
}

/** Every type this sheet names. Used by the coverage ratchet. */
export function coveredTypes() {
  return classifyAllTypes().map((entry) => entry.type);
}

// ── Printing ──────────────────────────────────────────────────────────────────────────────────

/** One parameter, on one or two lines. Deliberately terse: a sheet, not a log. */
function describeParam(param) {
  // The id is what a host shows and stores. It matches the path for a derived parameter and
  // usually does not for an authored one, and that difference is the whole of the explicit path.
  const identity = param.id === param.path ? param.path : `${param.id}  →  ${param.path}`;
  // The host class this becomes. Printed first because it is the thing that decides whether the
  // parameter shows up in a DAW as a named menu, a switch, or an anonymous number.
  const HOST_CLASS = { choice: 'AudioParameterChoice', bool: 'AudioParameterBool', float: 'AudioParameterFloat' };
  const bits = [`${identity}  [${param.min} … ${param.max}]  default ${param.defaultValue}`,
                `  ${HOST_CLASS[param.valueKind] ?? `?? (valueKind=${param.valueKind})`}`];
  if (param.unit) bits[0] += `  ${param.unit}`;
  const wire = [];
  if (param.deviceParameterId) wire.push(`device ${param.deviceRole}:${param.deviceParameterId}`);
  if (param.midiControl) {
    const m = param.midiControl;
    const detail = m.kind === 'cc' ? `CC${m.controller}`
      : m.kind === 'nrpn' || m.kind === 'rpn' ? `${m.kind.toUpperCase()} ${m.parameterMsb}:${m.parameterLsb}`
        : m.kind;
    wire.push(`midi ${detail} ch${m.channel} ${m.valueResolution}-bit`);
  } else if (param.deviceRole && !param.deviceParameterId) {
    wire.push(`role ${param.deviceRole}, no wire`);
  }
  if (param.choiceLabels?.length) wire.push(`menu: ${param.choiceLabels.join(' / ')}`);
  if (param.choiceMode === 'value') {
    wire.push(`stored by name: ${param.choiceValues.join('/')} → default "${param.defaultChoice}"`);
  }
  if (wire.length) bits.push(`  ${wire.join('  ·  ')}`);
  return bits.join('\n');
}

/** A bordered text card. Red when it is a finding, amber when it wants a human's judgement. */
function card(id, text, { width = 340, height = 66, tone = 'ok' } = {}) {
  const fill = tone === 'bad' ? 'FF3A1F1F' : tone === 'warn' ? 'FF2E2718' : 'FF181D22';
  const border = tone === 'bad' ? 'AAE06C6C' : tone === 'warn' ? 'AAD8B45C' : '3389C2FF';
  return createControl('Label', {
    Core: { id, name: id },
    Transform: { width, height },
    Text: { content: text, _children: { Font: { size: 10, family: 'monospace' } } },
    Background: {
      _children: {
        Fill: { colour: fill },
        Border: { enabled: true, thickness: 1, colour: border },
        Corners: { radius: 4 },
      },
    },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', verticalAlign: 'top', paddingLeft: 8, paddingTop: 5 },
  });
}

/**
 * A roster card: many type names in columns, for the types that export nothing.
 *
 * `showReason` off when every entry gives the same one — the group header already says it, and a
 * column of identical text is the fastest way to make a reader stop reading a sheet.
 */
function rosterCard(id, entries, columns, { showReason = true } = {}) {
  const lines = entries.map((entry) => (showReason ? `${entry.type.padEnd(17)}${entry.reason}` : entry.type));
  const width = Math.max(...lines.map((line) => line.length)) + 3;
  const perColumn = Math.ceil(lines.length / columns);
  const rows = [];
  for (let i = 0; i < perColumn; i++) {
    rows.push(Array.from({ length: columns }, (_, c) => (lines[i + c * perColumn] ?? '').padEnd(width)).join('').trimEnd());
  }
  return card(id, rows.join('\n'), {
    width: GRID_FULL,
    height: Math.max(54, 14 + perColumn * 13),
    tone: 'ok',
  });
}

const GRID_FULL = 1544; // sheetWidth - 2 * marginX, so a roster spans the sheet.

// ── The branch recipes ────────────────────────────────────────────────────────────────────────

const deviceBinding = (parameterId, deviceRole = 'primary') => ({
  enabled: true,
  bindings: [{ kind: 'deviceParameter', parameterId, deviceRole }],
});

const midiBinding = (binding) => ({ enabled: true, bindings: [{ kind: 'midiControl', ...binding }] });

/**
 * The derivation branches a default-valued panel never reaches.
 *
 * Each recipe names the branch it exercises and the `expect` the test re-checks — so a recipe that
 * silently stops covering its branch (because the shape it builds no longer triggers it) fails
 * rather than sitting on the sheet looking like coverage.
 */
export const RECIPES = [
  {
    id: 'range_real',
    caption: 'range family, real min/max/unit',
    note: 'A knob authored 20 Hz–20 kHz. The DAW gets that range, not 0–1.',
    build: () => createControl('Knob', {
      Core: { id: 'qa08_range_real', name: 'Cutoff' },
      Behavior: { family: 'range', min: 20, max: 20000, defaultCurrentValue: 440, unit: 'Hz' },
    }),
    expect: (params) => params.length === 1 && params[0].max === 20000 && params[0].unit === 'Hz'
      && params[0].valueKind === 'float',
  },
  {
    id: 'range_degenerate',
    caption: 'degenerate range — min equals max',
    note: 'max is bumped to min+1. A zero-width parameter is one a host cannot represent.',
    build: () => createControl('Knob', {
      Core: { id: 'qa08_range_degenerate', name: 'Stuck' },
      Behavior: { family: 'range', min: 64, max: 64, defaultCurrentValue: 64 },
    }),
    expect: (params) => params.length === 1 && params[0].min === 64 && params[0].max === 65,
  },
  {
    id: 'bool_default_on',
    caption: 'bool, authored ON',
    note: 'defaultValue true → 1. A toggle that exports 0 comes up wrong in every saved session.',
    build: () => createControl('ToggleButton', {
      Core: { id: 'qa08_bool_on', name: 'Sync' },
      Behavior: { valueType: 'bool', defaultValue: true },
    }),
    expect: (params) => params.length === 1 && params[0].valueKind === 'bool' && params[0].defaultValue === 1,
  },
  {
    id: 'enum_index',
    caption: 'enum by index (the default mode)',
    note: 'Five rows, third selected → [0..4] default 2. The host stores the position, and gets\nthe five names for its menu — an index-mode selector needs labels just as much as a\nstore-by-name one, which is why they ride on every selector now.',
    build: () => createControl('Combobox', {
      Core: { id: 'qa08_enum_index', name: 'Waveform' },
      Value: { rows: enumRows(['Saw', 'Square', 'Triangle', 'Sine', 'Noise'], 2) },
    }),
    expect: (params) => params.length === 1 && params[0].max === 4 && params[0].defaultValue === 2
      && params[0].valueKind === 'choice' && params[0].choiceLabels.length === 5 && !params[0].choiceMode,
  },
  {
    id: 'enum_by_value',
    caption: 'enum by NAME — storeByValue',
    note: 'The same list with storeByValue on. The host still automates an index, but the saved\nvalue is the choice name, so it survives the visible rows changing (cascading lists).',
    build: () => createControl('Combobox', {
      Core: { id: 'qa08_enum_value', name: 'Bank' },
      Value: { storeByValue: true, rows: enumRows(['Bank A', 'Bank B', 'Bank C'], 1) },
    }),
    expect: (params) => params[0]?.choiceMode === 'value' && params[0].choiceValues.length === 3
      && params[0].defaultChoice === 'bank_b' && params[0].valueKind === 'choice',
  },
  {
    id: 'enum_header_row',
    caption: 'enum with a header row',
    note: 'Headers are not pickable and must not take an index. Four rows, one a header → [0..2],\nand the header must not reach the host menu either.',
    build: () => createControl('Combobox', {
      Core: { id: 'qa08_enum_header', name: 'Category' },
      Value: { rows: [headerRow('— Strings —'), ...enumRows(['Violin', 'Cello', 'Bass'], 0)] },
    }),
    expect: (params) => params.length === 1 && params[0].max === 2
      && params[0].choiceLabels.join('/') === 'Violin/Cello/Bass',
  },
  {
    id: 'bool_vs_unit_float',
    caption: 'a 0..1 knob — the reason valueKind is explicit',
    note: 'Identical range to the toggle above: min 0, max 1. Nothing about the numbers says which\nis a switch and which is a continuous control, which is why every parameter used to\nexport as an anonymous float. The editor states the kind; the host branches on it.',
    build: () => createControl('Knob', {
      Core: { id: 'qa08_unit_float', name: 'Level' },
      Behavior: { family: 'range', min: 0, max: 1, defaultCurrentValue: 0.5 },
    }),
    expect: (params) => params.length === 1 && params[0].valueKind === 'float'
      && params[0].min === 0 && params[0].max === 1,
  },
  {
    id: 'device_parameter',
    caption: 'bound to a device parameter',
    note: 'The wire the plugin sends with its window closed. Without it the DAW moves a number\nand the synth hears nothing.',
    build: () => createControl('Slider', {
      Core: { id: 'qa08_device_param', name: 'Resonance' },
      Behavior: { family: 'range', min: 0, max: 127, defaultCurrentValue: 0 },
      DeviceBindings: deviceBinding('osc1.resonance'),
    }),
    expect: (params) => params[0]?.deviceParameterId === 'osc1.resonance' && params[0].deviceRole === 'primary',
  },
  {
    id: 'raw_cc',
    caption: 'bound to a raw CC',
    note: 'No profile parameter, just three bytes. This used to export with an empty wire and\nsend nothing window-closed — indistinguishable from a bad MIDI cable.',
    build: () => createControl('Slider', {
      Core: { id: 'qa08_raw_cc', name: 'Expression' },
      Behavior: { family: 'range', min: 0, max: 127, defaultCurrentValue: 64 },
      DeviceBindings: midiBinding({ message: 'cc', controller: 11, channel: 1 }),
    }),
    expect: (params) => params[0]?.midiControl?.kind === 'cc' && params[0].midiControl.controller === 11,
  },
  {
    id: 'raw_nrpn_14bit',
    caption: 'raw NRPN, 14-bit',
    note: 'Two 7-bit halves for the parameter number, and a resolution the send path has to honour.',
    build: () => createControl('Knob', {
      Core: { id: 'qa08_raw_nrpn', name: 'Filter Track' },
      Behavior: { family: 'range', min: 0, max: 16383, defaultCurrentValue: 8192 },
      DeviceBindings: midiBinding({ message: 'nrpn', parameterMsb: 1, parameterLsb: 24, channel: 1, valueResolution: 14 }),
    }),
    expect: (params) => params[0]?.midiControl?.kind === 'nrpn' && params[0].midiControl.valueResolution === 14,
  },
  {
    id: 'inbound_only_no_wire',
    caption: 'bound to VELOCITY — inbound only, so NO wire',
    note: 'Velocity, poly pressure and pitch bend arrive; they are not things a plugin sends.\nThe parameter is still exported. It must carry no midiControl — a wire here would be a\nDAW control that silently does nothing.',
    tone: 'warn',
    build: () => createControl('Knob', {
      Core: { id: 'qa08_inbound_only', name: 'Velocity Depth' },
      Behavior: { family: 'range', min: 0, max: 127, defaultCurrentValue: 100 },
      DeviceBindings: midiBinding({ message: 'velocity', channel: 1 }),
    }),
    expect: (params) => params.length === 1 && !params[0].midiControl && !params[0].deviceParameterId,
  },
  {
    id: 'bindings_disabled',
    caption: 'device bindings switched OFF',
    note: 'The binding is still authored. Disabled means disabled: no wire in the export.',
    build: () => createControl('Slider', {
      Core: { id: 'qa08_bindings_off', name: 'Muted Send' },
      Behavior: { family: 'range', min: 0, max: 127, defaultCurrentValue: 0 },
      DeviceBindings: { ...deviceBinding('osc1.level'), enabled: false },
    }),
    expect: (params) => params.length === 1 && !params[0].deviceParameterId && !params[0].midiControl,
  },
  {
    id: 'channels_single',
    caption: 'custom component, ONE public channel',
    note: 'A single channel is labelled with the control name alone — "Ring", not "Ring value".',
    build: () => customWithChannels('qa08_channels_single', 'Ring', {
      value: { min: 0, max: 1, defaultValue: 0.25, label: 'value' },
    }),
    expect: (params) => params.length === 1 && params[0].label === 'Ring',
  },
  {
    id: 'channels_multi',
    caption: 'custom component, THREE channels, one private',
    note: 'One parameter per PUBLIC channel, each labelled. The private one must not appear —\nan internal channel exposed to a host is a parameter nobody can explain.',
    build: () => customWithChannels('qa08_channels_multi', 'XY Pad', {
      x: { min: 0, max: 127, defaultValue: 64, label: 'X' },
      y: { min: 0, max: 127, defaultValue: 64, label: 'Y' },
      scratch: { min: 0, max: 1, defaultValue: 0, label: 'scratch', publicInput: false, publicOutput: false },
    }),
    expect: (params) => params.length === 2 && params.every((p) => !p.path.endsWith('.scratch')),
  },
  {
    id: 'explicit_wins',
    caption: 'an author\'s explicit list OVERRIDES derivation',
    note: 'panel.exportParameters, when present, is the list. The knob beside this would derive\n"Cutoff.value"; the author said otherwise and the author wins.',
    build: () => createControl('Knob', {
      Core: { id: 'qa08_explicit', name: 'Cutoff' },
      Behavior: { family: 'range', min: 20, max: 20000, defaultCurrentValue: 440 },
    }),
    panel: {
      exportParameters: [
        { id: 'macro1', label: 'Macro 1', path: 'Cutoff.value', min: 0, max: 100, defaultValue: 50, unit: '%' },
        { id: '', path: 'Cutoff.value' },
        { id: 'noPath', label: 'dropped' },
      ],
    },
    expect: (params) => params.length === 1 && params[0].id === 'macro1' && params[0].max === 100,
  },
];

/** Value rows for a selector, with one marked default. */
function enumRows(labels, defaultIndex) {
  return labels.map((label, i) => ({
    id: label.toLowerCase().replace(/\W+/g, '_'),
    displayText: label,
    internalValue: label.toLowerCase().replace(/\W+/g, '_'),
    sendValue: i,
    selectedByDefault: i === defaultIndex,
    enabled: true,
    isHeader: false,
  }));
}

function headerRow(text) {
  return { id: 'hdr', displayText: text, internalValue: 'hdr', isHeader: true, enabled: true };
}

/** A CustomComponent carrying hand-written value channels — the second derivation path. */
function customWithChannels(id, name, channels) {
  const control = createControl('CustomComponent', { Core: { id, name } });
  control._children.ValueChannels = {
    _type: 'ValueChannels',
    _children: Object.fromEntries(
      Object.entries(channels).map(([key, ch]) => [key, { _type: 'ValueChannel', publicInput: true, publicOutput: true, ...ch }]),
    ),
  };
  control._children.Transform = { ...control._children.Transform, width: 150, height: 100 };
  return control;
}

/** Only print the reason column when it says something different per row. */
function unseenReasonsDiffer(entries) {
  return new Set(entries.map((entry) => entry.reason)).size > 1;
}

// ── The sheet ─────────────────────────────────────────────────────────────────────────────────

export function buildExportSheet() {
  const panel = createPanel('QA-08 Export Parameters');
  const classified = classifyAllTypes();
  const exporting = classified.filter((entry) => entry.verdict === 'exports');
  const declined = classified.filter((entry) => entry.verdict === 'declined');
  const unseen = classified.filter((entry) => entry.verdict === 'unseen');

  const groups = [];

  groups.push({
    title: `Exports a parameter at defaults — ${exporting.length} of ${classified.length} types`,
    cells: exporting.flatMap((entry) => [
      { caption: entry.type, control: entry.control },
      {
        caption: `${entry.params.length} parameter${entry.params.length === 1 ? '' : 's'}`,
        control: card(`qa08_p_${entry.type}`, entry.params.map(describeParam).join('\n'), {
          width: 430,
          height: Math.max(56, 22 + entry.params.length * 40),
        }),
      },
    ]),
  });

  groups.push({
    title: `Exports nothing, and the type says so — ${declined.length} types`,
    cells: [{
      caption: 'Each of these has ruled. A Behavior that calls itself a trigger or a text field, or'
        + ' an explicit empty exportValues. Deliberate; nothing to check.',
      control: rosterCard('qa08_declined', declined, 3),
    }],
  });

  groups.push({
    title: `Exports nothing because nothing in the type says anything — ${unseen.length} types`,
    cells: [{
      caption: 'No Behavior, no ValueChannels, no exportValues — so deriveExportParameters never looks.'
        + ' Read this list and ask of each: should a user be able to automate that from a DAW? If the'
        + ' answer is no, the type should SAY so with exportValues: [] and move to the group above.',
      control: rosterCard('qa08_unseen', unseen, 4, { showReason: unseenReasonsDiffer(unseen) }),
    }],
  });

  groups.push({
    title: `Derivation branches a default panel never reaches — ${RECIPES.length} recipes`,
    cells: RECIPES.flatMap((recipe) => {
      const control = recipe.build();
      const params = parametersFor(control, recipe.panel ?? {});
      const held = recipe.expect(params);
      const body = [
        recipe.note,
        '',
        params.length ? params.map(describeParam).join('\n') : 'NO PARAMETER DERIVED',
        '',
        held ? '✓ branch still covered' : '✗ THIS RECIPE NO LONGER COVERS ITS BRANCH',
      ].join('\n');
      return [
        { caption: recipe.caption, control },
        {
          caption: recipe.id,
          control: card(`qa08_r_${recipe.id}`, body, {
            width: 470,
            height: 40 + body.split('\n').length * 13,
            tone: held ? (recipe.tone ?? 'ok') : 'bad',
          }),
        },
      ];
    }),
  });

  const { controls, height } = flowGroups(groups);
  panel.controls = controls;
  panel.height = height;

  return styleSheet(panel, {
    title: `QA-08 — the exported plugin's parameter list, ${exporting.length} exporting types and ${RECIPES.length} branch recipes`,
    notes: [
      'WHAT THIS SHEET IS',
      '',
      'collectExportParameters() turned into something you can look at. That function runs in the',
      'editor for the automation UI and is read by the C++ processor at export to build its APVTS,',
      "so what it returns IS the plugin's parameter list. There is no second opinion later.",
      '',
      'WHY IT MATTERS MORE THAN IT LOOKS',
      '',
      'Every other sheet in this suite shows something that is wrong on screen. This one shows',
      'something that is wrong in three weeks, in a DAW, on somebody else\'s machine. A control that',
      'exports as no parameter, or with the wrong range, or with no wire to the synth, behaves',
      'perfectly while you are authoring. The panel looks finished.',
      '',
      'HOW TO RUN THE PASS',
      '',
      '  1. Read the third group first — the types the deriver never looks at. It is the only part',
      '     of this sheet that needs a judgement rather than a check. For each one, ask whether a',
      '     user would expect to automate it from a host. Anything that should be automatable and',
      '     is on that list is a finding, and it is invisible everywhere else.',
      '  2. Scan the first group for a range that looks wrong — a 0–1 where the control shows',
      '     0–127, a default outside its own range.',
      '  3. Read the recipe cards. Each names the branch it covers and re-checks it at generation',
      '     time; a red card means the branch stopped being exercised, which is a hole in the',
      '     coverage rather than a bug on its own.',
      '  4. Then export one. File → Export, open the plugin in a host, and check the parameter list',
      '     against the first group. This sheet proves what the editor believes; only a host proves',
      '     the two agree.',
      '',
      'WHAT A FAILURE LOOKS LIKE',
      '',
      '  - a value-bearing type in the "never looks" list       silently unautomatable',
      '  - a range of [0 … 1] on a control the user sees as 0–127',
      '  - a default outside the parameter\'s own min/max        the host clamps, the panel jumps',
      '  - a parameter with a deviceRole and no wire            moves in the DAW, sends nothing',
      '  - a wire on the velocity recipe                        automating an inbound-only message',
      '  - any red card                                          a recipe that stopped covering its branch',
      '',
      'WHAT IT CANNOT PROVE',
      '',
      'That the host and the panel agree. Everything here is the editor\'s own derivation; the C++',
      'processor reads the same document and builds the APVTS from it, and the two have drifted',
      'before. Exporting one panel and opening it in a DAW is the check this sheet sets up and',
      'cannot perform.',
      '',
      'It also proves nothing about VALUES — only about the parameter list. What a parameter does',
      'when a host moves it is the player, and the player is QA-04 and a real session.',
    ].join('\n'),
  });
}
