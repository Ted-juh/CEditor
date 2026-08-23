// scripting.mjs — QA-04: seven languages against thirty-seven events.
//
// What breaks here, and why nothing else catches it. `validate-script-exports` proves each language
// COMPILES and runs against the panel API; `manualReference.test.js` proves each event is
// DOCUMENTED. Neither proves that a script is *authorable*: that the editor makes a handler for the
// event you asked for, in the language you asked for, with a body that names the right function and
// unpacks the right payload. That path runs through `createScript` → `defaultSource(event, language)`
// and it is 259 combinations, of which a real panel exercises maybe five.
//
// So this sheet is a panel carrying every one of them. Opening it in the editor puts 259 scripts
// through the script list, the picker, the validator and the language badges in one go; a
// combination that produces an empty body, the wrong handler name or a body in the wrong language
// is visible without running anything.
//
// WHY IT IS LAID OUT BY LANGUAGE AND NOT BY EVENT: a wrong body is easiest to spot next to the same
// event in a language that got it right, and the eye compares down a column faster than across a
// page. Each cell caption is `event` and each group is a language.
//
// THE RATCHET: every language in `SCRIPT_LANGUAGES` and every event in `ALL_EVENTS`, both read from
// the model. Add either and this sheet grows; `qaPanels.test.js` fails until it is regenerated.

import { createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import { createScript, SCRIPT_LANGUAGES } from '../../../../CE/web/src/CE_Application/scripting/scriptModel.js';
import { ALL_EVENTS } from '../../../../CE/web/src/CE_Application/scripting/panelApi.js';
import { flowGroups, styleSheet } from '../layout.mjs';

export const LANGUAGES = SCRIPT_LANGUAGES.map((l) => (typeof l === 'string' ? l : l.id));
export const EVENTS = ALL_EVENTS.map((e) => e.id);

/** Every language × event pair, as the scripts a panel would actually carry. */
export function allScripts() {
  const scripts = [];
  for (const language of LANGUAGES) {
    for (const event of ALL_EVENTS) {
      scripts.push(createScript({
        id: `qa04_${language}_${event.id}`,
        name: `${language}: ${event.fn}`,
        language,
        event: event.fn,
        scope: event.group === 'control' || event.group === 'component' ? 'component' : 'panel',
        target: event.group === 'control' || event.group === 'component' ? 'self' : '*',
        description: event.summary ?? '',
      }));
    }
  }
  return scripts;
}

/**
 * One carrier control per language.
 *
 * The scripts have to hang off something — `Scripts` is a control section, not a panel one — and a
 * carrier per language keeps the script list grouped the way the sheet is grouped, so the editor's
 * own tree matches what is on screen.
 */
function carrier(language, scripts) {
  const control = createControl('Label', {
    Core: { id: `qa04_carrier_${language}`, name: `scripts_${language}` },
    Transform: { width: 210, height: 54 },
    Text: { content: `${language}\n${scripts.length} handlers`, _children: { Font: { size: 12 } } },
    Background: {
      _children: {
        Fill: { colour: 'FF20262B' },
        Border: { enabled: true, thickness: 1, colour: '5589C2FF' },
        Corners: { radius: 4 },
      },
    },
  });
  control._children.Scripts = { _type: 'Scripts', _children: {} };
  for (const script of scripts) control._children.Scripts._children[script.id] = script;
  return control;
}

export function buildScriptingSheet() {
  const panel = createPanel('QA-04 Scripting');
  const scripts = allScripts();

  const groups = LANGUAGES.map((language) => {
    const mine = scripts.filter((s) => s.language === language);
    return {
      title: `${language} — ${mine.length} handlers, one per event`,
      cells: [
        { caption: `${language} carrier`, control: carrier(language, mine) },
        ...ALL_EVENTS.map((event) => ({
          caption: `${event.fn}  ·  ${event.group}`,
          control: createControl('Label', {
            Core: { id: `qa04_${language}_${event.id}_tile`, name: `${language}_${event.id}` },
            Transform: { width: 150, height: 34 },
            Text: { content: event.payload ? `(${event.payload})` : '—', _children: { Font: { size: 10 } } },
            Background: { _children: { Fill: { colour: 'FF1A1F24' }, Corners: { radius: 3 } } },
          }),
        })),
      ],
    };
  });

  const { controls, height } = flowGroups(groups);
  panel.controls = controls;
  panel.height = height;

  return styleSheet(panel, {
    title: `QA-04 — ${LANGUAGES.length} languages × ${EVENTS.length} events`,
    notes: [
      'WHAT THIS SHEET IS',
      '',
      `${LANGUAGES.length} carrier controls, one per language, each holding a handler for all`,
      `${EVENTS.length} events the panel API defines — ${LANGUAGES.length * EVENTS.length} scripts in one document.`,
      '',
      'HOW TO RUN THE PASS',
      '',
      '  1. Open the Scripts tab. Every carrier should list its full set with no blanks.',
      '  2. Click into a handful per language. The body should name the right function for the',
      '     event and be written in that language — not a Lua body under a Python badge.',
      '  3. Run Validate. A language whose toolchain is absent reports SKIP, which is not a',
      '     failure; a language whose toolchain is present and reports errors is.',
      '  4. Check the tiles: each caption is the handler name and its group, each body the payload',
      '     the handler receives. A tile reading "—" takes no payload.',
      '',
      'WHAT A FAILURE LOOKS LIKE',
      '',
      '  - an empty script body for a language/event pair',
      '  - a handler named for a different event than its caption',
      '  - the same body under two different languages',
      '  - an event in the API that has no row here (the generator is stale — re-run it)',
      '',
      'WHAT IT CANNOT PROVE',
      '',
      'That the events FIRE. This is an authoring-path sheet: it proves the editor can make every',
      'handler, not that the runtime calls them. Firing is covered by scriptFlow, scriptTimersState',
      'and scriptMidiInHandles in the test suite, and by QA-05 for the verbs a handler would call.',
    ].join('\n'),
  });
}
