/**
 * panelFile.mjs — the script editor's Panel file screen, driven as a person drives it.
 *
 * test/panelFileText.test.js proves the text: every control of the committed panels comes back
 * unchanged, edits apply, mistakes are refused. None of that opens the editor. This does: it gets to
 * the screen the way an author does, edits a control through the real CodeEditor, presses Apply, and
 * reads the PANEL afterwards, then takes the edit back with the panel's own Undo.
 *
 *   open      select a control, Script Editor in the Look bar, then Tools → Panel file
 *   read      the outline lists the panel settings and the controls; the selected control is open
 *   edit      a value and a misspelt property typed into the editor, Apply: the control has the value,
 *             the misspelling is warned about and kept
 *   refuse    broken JSON and a changed type are refused on screen, and the panel is left alone
 *   settings  the panel's own settings edit the same way
 *   follow    selecting another control (as on the canvas) opens it here
 *   show      "Show on the panel" goes back to the panel with that control selected
 *   undo      back on the panel, one Undo takes the control edit back, named after the control
 *
 * Text goes in with keyboard.insertText, not type: the CodeEditor closes brackets and quotes as they
 * are typed, which is right for a person and turns a typed JSON document into a different one.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('panelFile');
const S = 'PanelFile';

const store = (fn, arg) => kit.page.evaluate(fn, arg);
const control = (id) => store(async (id) => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const { findControlById } = await import('/src/CE_Application/utils/containment.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const panel = get(panels).find((p) => p.id === get(activePanelId));
  const c = findControlById(panel.controls, id);
  return c ? JSON.parse(JSON.stringify(c)) : null;
}, id);
const panelField = (key) => store(async (key) => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  return get(panels).find((p) => p.id === get(activePanelId))?.[key];
}, key);
const editorText = () => kit.page.locator('.pf textarea.ce-ta').inputValue();
const messages = () => kit.page.evaluate(() => [...document.querySelectorAll('.pf .problems .problem')]
  .map((n) => ({ kind: n.classList.contains('error') ? 'error' : n.classList.contains('warn') ? 'warn' : 'ok', text: n.textContent.trim() })));

async function replaceText(text) {
  const area = kit.page.locator('.pf textarea.ce-ta');
  await area.click();
  await kit.page.keyboard.press('Control+A');
  await kit.page.keyboard.insertText(text);
  await kit.settle(300);
}
async function apply() {
  await kit.page.locator('.pf button', { hasText: 'Apply' }).click();
  await kit.settle(500);
}

try {
  await kit.fresh();
  const cutoff = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 110, 'Transform.width': 240, 'Transform.height': 60, 'Core.name': 'Cutoff' });
  const label = await kit.make('Label', { 'Transform.x': 70, 'Transform.y': 200, 'Core.name': 'Title' });
  await kit.settle(600);

  // ---- open --------------------------------------------------------------------------------------
  const box = await kit.box(cutoff);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(500);
  await kit.page.locator('button.s-jump').click();
  await kit.settle(2000);
  await kit.page.locator('.bd-app .tnode', { hasText: 'Panel file' }).click();
  await kit.settle(800);
  led.check(S, 'the way in', 'Tools → Panel file in the script editor opens the panel file screen', true,
    await kit.page.locator('[data-testid="panel-file-view"]').isVisible());

  // ---- read --------------------------------------------------------------------------------------
  const rows = await kit.page.evaluate(() => [...document.querySelectorAll('.pf .pf-row .pf-name')].map((n) => n.textContent.trim()));
  const opened = await editorText();
  led.check(S, 'the outline and the open item', 'the outline lists the panel settings and both controls, and the control selected on the canvas is the one open, written as only what differs from a new Slider',
    { panelSettings: true, cutoff: true, title: true, opensCutoff: true, sparse: true },
    { panelSettings: rows.includes('Panel settings'), cutoff: rows.includes('Cutoff'), title: rows.includes('Title'),
      opensCutoff: JSON.parse(opened)._children.Core.name === 'Cutoff',
      sparse: !('Behavior' in JSON.parse(opened)._children) || Object.keys(JSON.parse(opened)._children.Behavior).length < 5 });

  // ---- edit --------------------------------------------------------------------------------------
  const doc = JSON.parse(opened);
  doc._children.Transform = { ...doc._children.Transform, x: 150, widht: 3 };
  await replaceText(JSON.stringify(doc, null, 2));
  await apply();
  const edited = await control(cutoff);
  const afterEdit = await messages();
  led.check(S, 'an edit reaches the panel', 'a value changed in the text is the control\'s after Apply, the misspelt property is kept and warned about by name, and the panel is marked modified',
    { x: 150, kept: true, warned: true, applied: true, modified: true },
    { x: edited._children.Transform.x, kept: edited._children.Transform.widht === 3,
      warned: afterEdit.some((m) => m.kind === 'warn' && m.text.includes('Transform.widht')),
      applied: afterEdit.some((m) => m.kind === 'ok' && m.text.includes('Applied')),
      modified: await panelField('modified') });

  // ---- refuse ------------------------------------------------------------------------------------
  const goodText = await editorText();
  await replaceText(goodText.replace('"x": 150', '"x": 150,,'));
  await apply();
  const syntax = await messages();
  led.check(S, 'broken JSON is refused', 'a stray comma is reported with its line, and the control keeps what it had', { error: true, hasLine: true, unchanged: 150 },
    { error: syntax.some((m) => m.kind === 'error'), hasLine: syntax.some((m) => /Line \d+/.test(m.text)),
      unchanged: (await control(cutoff))._children.Transform.x });
  await replaceText(goodText.replace('"controlType": "Slider"', '"controlType": "Knob"'));
  await apply();
  const typed = await messages();
  led.check(S, 'a new type is refused', 'changing controlType is refused with the reason, and the control is still a Slider', { error: true, stillSlider: true },
    { error: typed.some((m) => m.kind === 'error' && m.text.includes('conversion')),
      stillSlider: (await control(cutoff))._children.Core.controlType === 'Slider' });
  await kit.page.locator('.pf button', { hasText: 'Revert' }).click();
  await kit.settle(300);

  // ---- every field -------------------------------------------------------------------------------
  // The textarea's readonly attribute stops typing, not the editor's own edits: Tab indents, Enter
  // indents the new line, a bracket closes itself, each through a path of its own.
  await kit.page.locator('.pf label', { hasText: 'Every field' }).locator('input').check();
  await kit.settle(500);
  const reference = await editorText();
  const area = kit.page.locator('.pf textarea.ce-ta');
  await area.click();
  for (const key of ['Tab', 'Enter', 'Shift+Tab', 'BracketLeft', 'x']) await kit.page.keyboard.press(key);
  await kit.settle(300);
  led.check(S, 'every field is for reading', 'with Every field ticked, the whole control is shown and no key changes it, the editor\'s own edits (indent, new line, a closing bracket) included',
    { whole: true, unchanged: true }, { whole: reference.length > goodText.length, unchanged: (await editorText()) === reference });
  await kit.page.locator('.pf label', { hasText: 'Every field' }).locator('input').uncheck();
  await kit.settle(300);

  // ---- settings ----------------------------------------------------------------------------------
  await kit.page.locator('.pf .pf-row', { hasText: 'Panel settings' }).click();
  await kit.settle(500);
  const settings = JSON.parse(await editorText());
  await replaceText(JSON.stringify({ ...settings, width: 777 }, null, 2));
  await apply();
  led.check(S, 'panel settings edit the same way', 'the panel settings open as text with the panel\'s guid, and a width typed there is the panel\'s after Apply',
    { hasGuid: true, width: 777 }, { hasGuid: typeof settings.panelGuid === 'string', width: await panelField('width') });

  // ---- follow ------------------------------------------------------------------------------------
  await store(async (id) => { const { selectComponent } = await import('/src/CE_Application/stores/panels.js'); selectComponent(id); }, label);
  await kit.settle(500);
  led.check(S, 'it follows the selection', 'selecting another control, as clicking it on the canvas does, opens that control here', 'Title',
    JSON.parse(await editorText())._children.Core.name);

  // ---- show --------------------------------------------------------------------------------------
  await kit.page.locator('.pf button', { hasText: 'Show on the panel' }).click();
  await kit.settle(1200);
  const shown = await store(async () => {
    const { activeEditorTab, selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    return { tab: get(activeEditorTab)?.type, selected: [...get(selectedComponentIds)] };
  });
  led.check(S, 'Show on the panel', 'the button switches to the panel with the open control selected, which a tab switch alone would have cleared',
    { tab: 'panel', selected: [label] }, shown);

  // ---- undo --------------------------------------------------------------------------------------
  const undone = await store(async () => {
    const history = await import('/src/CE_Application/stores/history.js');
    const labels = history.historyTimeline().steps.map((step) => step.label);
    history.undo();
    return labels;
  });
  await kit.settle(500);
  // The settings edit was the later step, so it goes first; the control edit is the one before it.
  await store(async () => { (await import('/src/CE_Application/stores/history.js')).undo(); });
  await kit.settle(500);
  led.check(S, 'the panel\'s Undo takes it back', 'on the panel, the edits made as text are steps of its own history, named after what they edited, and Undo takes the control edit back',
    { namedControl: true, namedSettings: true, x: 70, width: 600 },
    { namedControl: undone.includes('Edit Cutoff as text'), namedSettings: undone.includes('Edit panel settings as text'),
      x: (await control(cutoff))._children.Transform.x, width: await panelField('width') });

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
