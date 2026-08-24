// verbs.mjs — QA-05: the 23 component verb families, and the components they drive.
//
// A verb is the scripting API's way of reaching into a component: `arp.run()`, `meter.level(0.7)`,
// `transport.tempo(120)`. There are 426 of them across 23 families, and each family belongs to
// exactly one component section — so a verb that stops working takes a component's whole script
// surface with it, silently, because nothing on a normal panel calls it.
//
// `componentVerbs.test.js` and `componentScriptPatches.test.js` already prove the reducers behave.
// What they cannot show is the thing this sheet is for: the component the verbs drive, on screen,
// next to a readable list of what can be said to it. A beta pass with this sheet open is "call one
// of these and watch that", which is the only way the two halves get checked against each other.
//
// WHY EACH FAMILY GETS ITS COMPONENT AND A VERB CARD, not a control per verb: 426 controls of the
// same 23 types would be a slower sheet that proved less. The component is what can visibly break;
// the verb list is reference the tester reads while driving it.
//
// THE RATCHET: every family in `COMPONENT_FAMILIES` gets a group, and the component carrying that
// family's section is looked up from the model rather than named here — so a family whose section
// moves, or a new family, fails `qaPanels.test.js` until the generator is re-run.

import { COMPONENT_TYPES, createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import { COMPONENT_FAMILIES } from '../../../../CE/web/src/CE_Application/scripting/componentVerbs.js';
import { flowGroups, styleSheet } from '../layout.mjs';

/**
 * Which component type carries a section — the model's answer, not a hand-kept table.
 *
 * A family declares the section it drives (`Arp`, `Pixel`, …) and exactly one component type
 * materializes that section. Looking it up here is what keeps the mapping honest: rename a section
 * or move it to a different component and this returns something different or nothing, and the
 * test says so.
 */
export function componentForSection(section) {
  for (const type of Object.keys(COMPONENT_TYPES)) {
    try {
      if (createControl(type)?._children?.[section]) return type;
    } catch { /* a type that will not build is QA-01's finding, not this sheet's */ }
  }
  return null;
}

/** family id -> component type, for the whole model. */
export function familyComponentMap() {
  const map = {};
  for (const family of COMPONENT_FAMILIES) map[family.id] = componentForSection(family.section);
  return map;
}

/** The verb list as a readable card: what can be said to the component beside it. */
function verbCard(family) {
  const lines = family.verbs.map((verb) => {
    const arg = verb.toggle ? '[on]' : verb.k === 'bool' ? '(on)' : verb.k ? `(${verb.k})` : '()';
    return `${family.prefix}.${verb.v}${arg}`;
  });
  // Two columns of text in one Label: a 426-verb sheet is long enough without one row per verb.
  const columns = 2;
  const perColumn = Math.ceil(lines.length / columns);
  const rows = [];
  for (let i = 0; i < perColumn; i++) {
    const left = lines[i] ?? '';
    const right = lines[i + perColumn] ?? '';
    rows.push(right ? `${left.padEnd(30)}${right}` : left);
  }
  return createControl('Label', {
    Core: { id: `qa05_${family.id}_verbs`, name: `verbs_${family.id}` },
    Transform: { width: 470, height: Math.max(54, 16 + perColumn * 13) },
    Text: {
      content: rows.join('\n'),
      _children: { Font: { size: 10, family: 'monospace' } },
    },
    Background: {
      _children: {
        Fill: { colour: 'FF181D22' },
        Border: { enabled: true, thickness: 1, colour: '3389C2FF' },
        Corners: { radius: 4 },
      },
    },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', verticalAlign: 'top', paddingLeft: 8, paddingTop: 6 },
  });
}

export function buildVerbsSheet() {
  const panel = createPanel('QA-05 Component Verbs');
  const map = familyComponentMap();

  const groups = COMPONENT_FAMILIES.map((family) => {
    const type = map[family.id];
    const cells = [];

    if (type) {
      cells.push({
        caption: `${type} — the component these drive`,
        control: createControl(type, {
          Core: { id: `qa05_${family.id}_component`, name: `qa05_${family.id}` },
        }),
      });
    } else {
      // A family whose section no component carries. Shown rather than skipped: an orphaned verb
      // family is a real finding, and a silently absent group would hide it.
      cells.push({
        caption: `NO COMPONENT carries section "${family.section}"`,
        control: createControl('Label', {
          Core: { id: `qa05_${family.id}_orphan`, name: `orphan_${family.id}` },
          Transform: { width: 300, height: 46 },
          Text: { content: `orphaned family: ${family.id}`, _children: { Font: { size: 11 } } },
          Background: { _children: { Fill: { colour: 'FF3A1F1F' }, Corners: { radius: 4 } } },
        }),
      });
    }

    cells.push({ caption: `${family.verbs.length} verbs`, control: verbCard(family) });

    return { title: `${family.label} — ${family.prefix}.*  (${family.summary})`, cells };
  });

  const { controls, height } = flowGroups(groups);
  panel.controls = controls;
  panel.height = height;

  const verbCount = COMPONENT_FAMILIES.reduce((n, f) => n + f.verbs.length, 0);
  return styleSheet(panel, {
    title: `QA-05 — ${COMPONENT_FAMILIES.length} verb families, ${verbCount} verbs`,
    notes: [
      'WHAT THIS SHEET IS',
      '',
      `One group per verb family. Each shows the component the family drives, and beside it every`,
      `verb that can be called on it — ${verbCount} across ${COMPONENT_FAMILIES.length} families.`,
      '',
      'HOW TO RUN THE PASS',
      '',
      '  1. Open the Console (Display panel → Console) and pick a component.',
      '  2. Call verbs off the card beside it and watch the component, not the console. A verb',
      '     that returns cleanly and changes nothing on screen is the failure this sheet exists',
      '     to find — the reducer tests already prove the return value.',
      '  3. Work down a family before moving on. Families are independent; a broken one is usually',
      '     broken throughout.',
      '',
      'WHAT A FAILURE LOOKS LIKE',
      '',
      '  - a verb that throws, or that reports success and moves nothing',
      '  - a toggle verb that only ever turns on',
      '  - a group headed "NO COMPONENT carries section ..." — an orphaned family, which means the',
      '    section was renamed or moved and the verbs now address nothing',
      '  - a component that renders but ignores its whole family',
      '',
      'WHAT IT CANNOT PROVE',
      '',
      'That a verb does the RIGHT thing — only that it does something visible. Correctness of the',
      'reducers is componentVerbs.test.js and componentScriptPatches.test.js; this sheet is where',
      'the two halves meet, and it is the only place the component and its API are on screen',
      'together.',
    ].join('\n'),
  });
}
