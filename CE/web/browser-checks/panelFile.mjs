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
 *   follow    another control picked for the panel (as the Values tab's Select does) opens it here
 *   show      "Show on the panel" goes back to the panel with that control selected
 *   undo      back on the panel, one Undo takes the control edit back, named after the control
 *   way back  a control opened here is selected when the panel is next in front by its tab, too
 *
 * Then the whole file, on GAIA (71,000 lines), which is what it is for:
 *   whole     "Whole file" shows the file as Save writes it, at the control selected, in well under
 *             the time a textarea takes to lay that text out
 *   window    only the lines on screen are drawn, and they line up with the gutter to the last line
 *   outline   a row goes to its lines, and what is being read is named; find goes to the next match
 *   session   a device mapping changed while it is open shows in it, as it would in what Save writes
 *   edit      "Edit this item" opens what is being read as an item
 *   reference the "every field" reference of GAIA's longest control (11,000 lines) draws only the
 *             screen too, and its colours line up with the text under them
 *
 * Text goes in with keyboard.insertText, not type: the CodeEditor closes brackets and quotes as they
 * are typed, which is right for a person and turns a typed JSON document into a different one.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  // The canvas is never on screen with the script tab, so what the screen follows is a pick: the
  // control picked to be the panel's selection, as the Values tab's Select picks one.
  await store(async (id) => {
    const { pickPanelSelection, selectionBeforeScriptTab } = await import('/src/CE_Application/stores/panels.js');
    let before; selectionBeforeScriptTab.subscribe((v) => { before = v; })();
    pickPanelSelection(before.panelId, id);
  }, label);
  await kit.settle(500);
  led.check(S, 'it follows a pick', 'a control picked to be the panel\'s selection, as the Values tab\'s Select picks one, opens here', 'Title',
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

  // ---- the way back ------------------------------------------------------------------------------
  // A control opened here is the panel's selection once the panel is in front, by its tab as well as
  // by "Show on the panel". It was selected while the script tab was in front, and the tab switch
  // back to the panel cleared it.
  // In by the slider (a Label has no Scripts section, so no Script Editor button), out on the Label.
  const sliderBox = await kit.box(cutoff);
  await kit.page.mouse.click(sliderBox.x + sliderBox.w / 2, sliderBox.y + sliderBox.h / 2);
  await kit.settle(500);
  await kit.page.locator('button.s-jump').click();
  await kit.settle(2000);
  await kit.page.locator('.bd-app .tnode', { hasText: 'Panel file' }).click();
  await kit.settle(800);
  await kit.page.locator('.pf .pf-row', { hasText: 'Title' }).click();
  await kit.settle(500);
  const panelName = await store(async () => {
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    let list; panels.subscribe((v) => { list = v; })();
    return list[0].name;
  });
  await kit.page.locator('.tabs .tab:not(.active)', { hasText: panelName }).first().click();
  await kit.settle(1200);
  const back = await store(async () => {
    const { activeEditorTab, selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    return { tab: get(activeEditorTab)?.type, selected: [...get(selectedComponentIds)] };
  });
  led.check(S, 'the way back', 'a control opened on the panel file screen is selected when the panel\'s tab is clicked, not only by "Show on the panel"',
    { tab: 'panel', selected: [label] }, back);

  // ---- whole file (GAIA) ---------------------------------------------------------------------------
  const gaia = await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8');
  await store(async (json) => {
    const { deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    const { addPanel, setActivePanel, panels } = await import('/src/CE_Application/stores/panels.js');
    addPanel(deserializePanel(json, 'Roland GAIA SH-01.cepanel', 'Roland GAIA SH-01'));
    let list; panels.subscribe((v) => { list = v; })();
    setActivePanel(list[list.length - 1].id);
  }, gaia);
  await kit.settle(2500);
  // GAIA's scripts wait for approval, and the notice saying so covers the foot of the screen.
  const trust = kit.page.locator('button', { hasText: 'Enable scripts for this session' });
  if (await trust.isVisible().catch(() => false)) { await trust.click(); await kit.settle(1000); }
  await store(async () => { (await import('/src/CE_Application/stores/panels.js')).selectComponent('gaia_tone1_filter_cutoff_342'); });
  await kit.settle(400);
  await kit.page.locator('button.s-jump').click();
  await kit.settle(2000);
  await kit.page.locator('.bd-app .tnode', { hasText: 'Panel file' }).click();
  await kit.settle(800);
  // What the whole file should be, written here the way the view writes it.
  const expected = await store(async () => {
    const { panels, activePanelId, serializePanelDocument } = await import('/src/CE_Application/stores/panels.js');
    const { wholeFileText } = await import('/src/CE_Application/stores/panelFileText.js');
    const get = (st) => { let v; st.subscribe((x) => { v = x; })(); return v; };
    const panel = get(panels).find((p) => p.id === get(activePanelId)) ?? get(panels).at(-1);
    const whole = wholeFileText(serializePanelDocument(panel));
    window.__wholeLines = whole.text.split('\n');
    return { lines: whole.lineCount, cutoff: whole.controls.get('gaia_tone1_filter_cutoff_342').start, label: whole.controls.get('gaia_lbl_343').start };
  });
  const viewer = () => kit.page.evaluate(() => {
    const v = document.querySelector('[data-testid="file-viewer"]');
    const pre = v.querySelector('.fv-lines');
    const rows = [...v.querySelectorAll('.fv-gln')];
    const first = Number(rows[0].textContent);
    const drawn = pre.textContent.split('\n');
    return {
      rows: rows.length, first, last: Number(rows.at(-1).textContent), nodes: v.querySelectorAll('*').length,
      aligned: drawn.every((line, i) => line === window.__wholeLines[first - 1 + i]),
      level: Math.abs(rows[0].getBoundingClientRect().top - pre.getBoundingClientRect().top) < 0.5,
      active: Number(v.querySelector('.fv-gln.active')?.textContent ?? 0),
      top: Math.floor((v.querySelector('.fv-scroll').scrollTop - 10) / 21) + 1,   // the line at the top edge
      here: document.querySelector('[data-testid="panel-file-here"]')?.textContent ?? '',
    };
  });
  const started = Date.now();
  await kit.page.locator('.pf-mode-btn', { hasText: 'Whole file' }).click();
  await kit.page.waitForSelector('[data-testid="file-viewer"] .fv-gln');
  await kit.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const openedMs = Date.now() - started;
  await kit.settle(400);
  const first = await viewer();
  led.check(S, 'the whole file opens', `"Whole file" shows the file as Save writes it, ${expected.lines} lines, at the control that was selected, in under three seconds (${openedMs} ms here)`,
    { header: true, atCutoff: true, quick: true },
    { header: (await kit.page.locator('.pf .pf-head .lang').textContent()).includes(expected.lines.toLocaleString('en')),
      atCutoff: first.active === expected.cutoff && first.here.includes('tone1_filter_cutoff'), quick: openedMs < 3000 });
  led.check(S, 'only the screen is drawn', 'of the whole file, only the lines on screen and a margin are drawn: a few hundred gutter rows, not tens of thousands',
    { fewRows: true, fewNodes: true }, { fewRows: first.rows < 400 && expected.lines > 50000, fewNodes: first.nodes < 2000 });

  await kit.page.evaluate(() => { const el = document.querySelector('.fv-scroll'); el.scrollTop = el.scrollHeight; });
  await kit.settle(400);
  const end = await viewer();
  led.check(S, 'it lines up to the last line', 'scrolled to the end, the drawn lines are the file\'s last lines, level with their numbers',
    { last: expected.lines, aligned: true, level: true }, { last: end.last, aligned: end.aligned, level: end.level });

  // ---- outline and find --------------------------------------------------------------------------
  await kit.page.locator('.pf .pf-row', { hasText: 'Scripts' }).first().click();
  await kit.settle(300);
  const scripts = await viewer();
  await kit.page.locator('.pf .pf-row', { hasText: 'tone1_filter_cutoff_label' }).click();
  await kit.settle(400);
  const atLabel = await viewer();
  led.check(S, 'the outline goes there', 'a row brings its lines to the top and what is being read is named: the scripts section, then the label',
    { scripts: true, label: true, top: true },
    { scripts: scripts.here.includes('Scripts'), label: atLabel.active === expected.label && atLabel.here.includes('tone1_filter_cutoff_label'),
      top: atLabel.top === expected.label });
  await kit.page.keyboard.press('Control+f');
  await kit.settle(200);
  await kit.page.keyboard.type('tone3_filter_cutoff');
  await kit.settle(400);
  const found = await viewer();
  led.check(S, 'find goes to the next match', 'Ctrl+F searches the whole file from where the reader is, and shows the first match after it',
    { counted: true, there: true },
    { counted: /^\d+\/\d+/.test(await kit.page.locator('.fv-find-count').textContent()), there: found.here.includes('tone3_filter_cutoff') && found.active > expected.label });
  await kit.page.keyboard.press('Escape');
  // Save's document holds the project's device session too, which is no part of the panel object:
  // a mapping that changes while the file is open has to show in it.
  await store(async () => {
    (await import('/src/CE_Application/stores/projectDeviceSession.js')).mergeProjectDeviceRoleMapping({ role: 'Probe role', profileId: 'probe-profile-7f3a' });
  });
  await kit.settle(1000);
  await kit.page.locator('.fv-scroll').focus();
  await kit.page.keyboard.press('Control+f');
  await kit.page.keyboard.type('probe-profile-7f3a');
  await kit.settle(300);
  const sessionCount = (await kit.page.locator('.fv-find-count').textContent()).trim();
  await kit.page.keyboard.press('Escape');
  led.check(S, 'it follows the device session', 'a device mapping changed while the whole file is open is in it a moment later, as it is in what Save writes',
    '1/1', sessionCount);
  await kit.page.locator('.pf .pf-row', { hasText: 'tone1_filter_cutoff_label' }).click();
  await kit.settle(300);
  await kit.page.locator('.pf button', { hasText: 'Edit this item' }).click();
  await kit.settle(600);
  led.check(S, 'Edit this item', 'the button opens what is being read as an item, to edit', 'tone1_filter_cutoff_label · Label',
    (await kit.page.locator('.pf .pf-head .lang').textContent()).trim());

  // ---- the every-field reference of a long control ------------------------------------------------
  await store(async () => {
    const { pickPanelSelection, selectionBeforeScriptTab } = await import('/src/CE_Application/stores/panels.js');
    let before; selectionBeforeScriptTab.subscribe((v) => { before = v; })();
    pickPanelSelection(before.panelId, 'gaia_tone1_osc_wave_317');
  });
  await kit.settle(500);
  await kit.page.locator('.pf label', { hasText: 'Every field' }).locator('input').check();
  await kit.settle(800);
  await kit.page.evaluate(() => { const ta = document.querySelector('.pf textarea.ce-ta'); ta.scrollTop = ta.scrollHeight * 0.6; ta.dispatchEvent(new Event('scroll')); });
  await kit.settle(400);
  const longReference = await kit.page.evaluate(() => {
    const ta = document.querySelector('.pf textarea.ce-ta');
    const lines = ta.value.split('\n');
    const rows = [...document.querySelectorAll('.pf .ce-gln .ce-lnnum')].map((n) => Number(n.textContent));
    const drawn = document.querySelector('.pf .ce-hl').textContent.split('\n');
    return { lines: lines.length, rows: rows.length, aligned: drawn.slice(0, 60).every((line, i) => line === lines[rows[0] - 1 + i]) };
  });
  led.check(S, 'a long reference draws only the screen', 'the every-field reference of GAIA\'s longest control draws a window of its lines, and the colours are the text under them',
    { long: true, fewRows: true, aligned: true }, { long: longReference.lines > 10000, fewRows: longReference.rows < 400, aligned: longReference.aligned });

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
