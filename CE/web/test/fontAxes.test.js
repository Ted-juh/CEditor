// fontAxes.test.js — ce.text.axis: a variable font's axis by its tag, and the number it is set to,
// read against the font of the control the call names. The runtime kept a number the axis does not
// reach within it without a word; it says so once now, and the Values rows offer the axes the font
// has and say what the runtime says.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { appSettings, availableFonts } from '../src/CE_Application/stores/appSettings.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { valueCatalogues } from '../src/CE_Application/editor/valuesContext.js';

const ONCE = ' This is said only the first time.';
// Installed as an imported font is, in the settings the catalogue derives from (scriptText.test.js).
const INTER = {
  id: 'inter', family: 'Inter Variable', cssFamily: 'Inter Variable', enabled: true, sourceType: 'local', supportsWeight: true,
  axes: [{ tag: 'wght', min: 100, max: 900, default: 400 }, { tag: 'slnt', min: -10, max: 0, default: 0 }],
};

function title() {
  const c = createControl('Label', { name: 'Title' });
  c._children.Text._children.Font.family = 'Inter Variable';
  return c;
}

function run(fn) {
  resetScriptStateForTesting();
  const before = get(appSettings);
  appSettings.set({ ...before, fonts: [INTER] });
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [title()], scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    fn(scriptApiForTesting('Title', 'axis-probe'));
    return { panel, lines: get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error').map((t) => t.message) };
  } finally { setRuntimeHost(null); appSettings.set(before); }
}

/** The faces the script editor's context gives, with the font installed. */
function facesWithInter() {
  const before = get(appSettings);
  appSettings.set({ ...before, fonts: [INTER] });
  try { return valueCatalogues({ fonts: get(availableFonts) }).faces; } finally { appSettings.set(before); }
}
const faces = facesWithInter();
const rowOf = (src, name) => readStatement(src, 'lua', src.indexOf('(') + 1, { panel: { controls: [title()] }, fontFaces: faces })
  .calls[0].args.find((a) => a.name === name);

test.after(() => resetScriptStateForTesting());

test('a number the axis does not reach is kept within it, and said once per control and axis', () => {
  const { panel, lines } = run((api) => {
    api.ce.text.axis('Title', 'wght', 1200);
    api.ce.text.axis('Title', 'wght', 1500);
    api.ce.text.axis('Title', 'slnt', -4);
  });
  assert.deepEqual(lines, [`ce.text.axis("Title", "wght"): 1200 is outside the 100 to 900 "Inter Variable" has, so 900 was used.${ONCE}`]);
  const axes = panel.controls[0]._children.Text._children.Font.variationAxes;
  assert.ok(JSON.stringify(axes).includes('900'), 'written at the nearest end');
});

test('the tag is one of the font\'s axes, and the value a field with the axis\'s range, in the runtime\'s words', () => {
  const tag = rowOf('ce.text.axis("Title", "wght", 1200)', 'tag');
  assert.deepEqual([tag.kind, tag.editable, tag.meaning.choices, meaningLine(tag)], ['fontAxis', 'choice', ['wght', 'slnt'], 'weight, 100 to 900, 400 by default']);
  assert.equal(tag.meaning.choiceNames.slnt, 'slant, -10 to 0, 0 by default');
  const value = rowOf('ce.text.axis("Title", "wght", 1200)', 'value');
  const said = run((api) => api.ce.text.axis('Title', 'wght', 1200)).lines[0];
  assert.deepEqual([value.editable, value.meaning.min, value.meaning.max], ['number', 100, 900]);
  assert.deepEqual(value.problem, { severity: 'warning', message: said.slice(0, -ONCE.length) });

  const none = rowOf('ce.text.axis("Title", "wdth", 80)', 'tag');
  const refused = run((api) => api.ce.text.axis('Title', 'wdth', 80)).lines[0];
  assert.deepEqual(none.problem, { severity: 'error', message: refused });
  const text = rowOf('ce.text.axis("Title", "wght", "bold")', 'value');
  assert.deepEqual(text.problem, { severity: 'error', message: run((api) => api.ce.text.axis('Title', 'wght', 'bold')).lines[0] });
  assert.equal(rowOf('ce.text.axis("Title", "wght", 500)', 'value').problem, null);
});
