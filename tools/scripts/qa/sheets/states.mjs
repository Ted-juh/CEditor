// states.mjs — QA-03: the interaction states, all of them, side by side.
//
// The gap this fills. QA-01 shows every component at its authored default and QA-02 drives the
// cross-cutting sections hard, but both look at a control in ONE condition. A state is a patch
// applied over that condition — hover recolours a fill, pressed insets a border, disabled dims the
// text — and a broken state is invisible in every other sheet because the sheet never enters it.
//
// Nothing here is interactive, and that is deliberate. A QA sheet that needed you to hover
// forty-five cells to find the broken one is a sheet nobody finishes. Instead each cell is a real
// control with the state's patch already applied to its base, so the whole matrix is on screen at
// once and a wrong one is wrong at a glance. What that costs is honest and worth writing down: it
// proves the state's PATCH renders, not that the runtime enters the state at the right moment.
// Entering them is `interactionRuntime`'s job and `interactionPreview.test.js` already asserts it.
//
// THE RATCHET: every state name in `SECTION_DEFAULTS.States.priority` gets a column, and every
// component type that carries a States section gets a row — both read from the model, so adding a
// state or giving a component States puts it on this sheet and fails `qaPanels.test.js` until the
// generator is re-run.

import { COMPONENT_TYPES, createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../../../../CE/web/src/CE_Application/models/sectionDefaults.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import { flowGroups, styleSheet } from '../layout.mjs';

/** The states the runtime can be in, in the order it resolves them. Read from the model. */
export const STATE_NAMES = [...(SECTION_DEFAULTS.States?.priority ?? [])];

/** Component types that carry a States section — the only ones a state can apply to. */
export function statefulTypes() {
  return Object.keys(COMPONENT_TYPES).filter((type) => {
    try {
      return !!createControl(type)?._children?.States;
    } catch {
      return false;
    }
  }).sort();
}

/**
 * Build one control with one state's patch baked into its base.
 *
 * `States._children[name]` holds `{ patch, parts, when, ... }` where `patch` is a map of dot-paths
 * to values. Applying it here is the same operation `applyStatePatches` performs at runtime, done
 * once at generation time so the sheet is static.
 *
 * A component that declares no patch for a state still gets a cell: an unstyled state IS the
 * finding for some of these, and an empty column would read as "not covered" rather than
 * "covered, and this component chooses not to change".
 */
function withState(type, stateName, id) {
  const control = createControl(type, {
    Core: { id, name: id },
    Transform: { width: 150, height: 46 },
  });
  const state = control._children?.States?._children?.[stateName];
  const patch = state?.patch ?? state?.component ?? null;
  if (patch && typeof patch === 'object') {
    for (const [dotPath, value] of Object.entries(patch)) applyPath(control, dotPath, value);
  }
  return { control, patched: !!(patch && Object.keys(patch).length) };
}

/** Set a `Section.Child.field` dot-path on a control, creating nothing that is not already there. */
function applyPath(control, dotPath, value) {
  const parts = String(dotPath).split('.');
  const field = parts.pop();
  let node = control._children;
  for (const key of parts) {
    node = node?.[key]?._children ?? node?.[key];
    if (!node) return;
  }
  if (node && typeof node === 'object') node[field] = value;
}

export function buildStatesSheet() {
  const panel = createPanel('QA-03 States & Interaction');
  const states = STATE_NAMES;

  const groups = statefulTypes().map((type) => ({
    title: `${type} — base, then each state's patch applied`,
    cells: [
      { caption: 'base', control: createControl(type, {
          Core: { id: `qa03_${type}_base`, name: `qa03_${type}_base` },
          Transform: { width: 150, height: 46 },
        }) },
      ...states.map((stateName) => {
        const id = `qa03_${type}_${stateName}`;
        const { control, patched } = withState(type, stateName, id);
        return { caption: patched ? stateName : `${stateName} (no patch)`, control };
      }),
    ],
  }));

  const { controls, height } = flowGroups(groups);
  panel.controls = controls;
  panel.height = height;

  return styleSheet(panel, {
    title: 'QA-03 — every interaction state of every stateful component',
    notes: [
      'WHAT THIS SHEET IS',
      '',
      `Each row is one component type. The first cell is its base; the rest are the same control`,
      `with one state's patch applied — ${states.join(', ')}.`,
      '',
      'HOW TO READ IT',
      '',
      'Scan across a row. Each cell should differ from the base in the way its caption names, and',
      'differ from its neighbours. Two cells that look identical mean one state is not patching.',
      '',
      'A cell captioned "(no patch)" is not a failure. It means that component declares no override',
      'for that state, which is often right — a Label has no pressed look. It is on the sheet so',
      '"covered, chooses not to change" and "not covered" cannot be confused for one another.',
      '',
      'WHAT A FAILURE LOOKS LIKE',
      '',
      '  - a cell identical to base when its caption says otherwise',
      '  - disabled that is not visibly dimmer than base',
      '  - a patch that moves or resizes the control rather than restyling it',
      '  - text that vanishes because a state set the same colour as its fill',
      '',
      'WHAT IT CANNOT PROVE',
      '',
      'That the runtime ENTERS these states at the right moment. Every patch here was applied by',
      'the generator, not by a pointer. Entry is interactionRuntime’s job and interactionPreview',
      'covers it in the test suite. This sheet answers the other half: does the patch look right',
      'once it is in.',
    ].join('\n'),
  });
}
