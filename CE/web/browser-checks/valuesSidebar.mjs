/**
 * valuesSidebar.mjs — the script editor's Values tab, driven as a person drives it.
 *
 * test/valuesSidebar.test.js proves the parts that are not a component: where the highlights go,
 * the rules an edit session keeps, the remembered tab, the rows. test/scriptValues.test.js proves
 * the core. Neither opens the editor. This does, and reads what is on screen and what is in the
 * script afterwards. docs/design/script-editor-value-editors.md is the record it checks against.
 *
 *   tab        the dock has a Values tab, and opens on it again after a reload
 *   rows       a call written over several lines, in Lua and in JavaScript: its arguments in order,
 *              its options under `opts`, an unknown option refused in the runtime's words
 *   marks      the statement band lies over the statement's lines and the hover box over the value's
 *              characters, measured against the text under them, and again once the text's face has
 *              changed width (a web font arriving late); the caret in a value selects its row
 *   keyboard   a row's name is a button: Enter takes the caret to its value
 *   colour     a swatch opens the shared display panel on Colors, named "Script · … , line N"; a drag
 *              writes the script once, when it settles; the edit box is around the value and follows
 *              its new length; Done keeps it; Ctrl+Z takes it back in one step; Cancel puts the
 *              original characters back exactly; the panel is hidden again if it was hidden, and
 *              stays if it was showing (the rail's Dock toggle works in the script workspace)
 *   own dock   the script workspace has a display switch of its own: a dock left open in the panel
 *              editor does not show in the script editor
 *   choice     a curve's dropdown writes at once, with the curve's picture beside it
 *   number     a field written on Enter, put back on Escape, a value out of range shown as a problem
 *   nested     a call inside another has its own rows, indented under it
 *   gradient   a gradient's strip opens the Gradient tab at the runtime's 180 and writes its stops and
 *              the angle in one edit
 *   file       the panel file view has the Values tab alone; a control's colour row edits the item's
 *              text as typing would, which Apply then puts on the control; Every field and the whole
 *              file are rows only, the whole file's at the line clicked
 *
 * Text goes in with keyboard.insertText, as panelFile.mjs does: the editor closes brackets as they
 * are typed. The caret is put in place with a click on the character, measured from the text.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot({ width: 1600, height: 1000 });
const led = new Ledger('valuesSidebar');
const S = 'ValuesSidebar';
const page = kit.page;

const SCRIPT = '.bd-app .detail';
const FILE = '.pf';

/** Wait for a condition in the page, generously: a slow machine is not a failure. */
const until = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

const editorText = (root = SCRIPT) => page.locator(`${root} textarea.ce-ta`).first().inputValue();

/** The on-screen boxes of the text [start, end) in an editor, by the highlight layer under it. */
const textRects = (start, end, root = SCRIPT) => page.evaluate(({ start, end, root }) => {
  const pre = document.querySelector(`${root} .ce-hl`);
  // A long text is drawn a window of lines at a time: offsets in it start at its first drawn line.
  const value = document.querySelector(`${root} textarea.ce-ta`).value;
  const firstLine = Number(document.querySelector(`${root} .ce-gln .ce-lnnum`)?.textContent ?? 1);
  let windowStart = 0;
  for (let line = 1, i = 0; line < firstLine && i !== -1; line += 1) { i = value.indexOf('\n', i) + 1; windowStart = i; }
  start -= windowStart;
  end -= windowStart;
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let sNode = null; let sOff = 0; let eNode = null; let eOff = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.nodeValue.length;
    if (!sNode && start < pos + len) { sNode = n; sOff = start - pos; }
    if (end <= pos + len) { eNode = n; eOff = end - pos; break; }
    pos += len;
  }
  const range = document.createRange();
  range.setStart(sNode, sOff);
  range.setEnd(eNode, eOff);
  return [...range.getClientRects()].filter((r) => r.width > 0.5)
    .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
}, { start, end, root });

const markRects = (kind, root = SCRIPT) => page.evaluate(({ kind, root }) => [...document.querySelectorAll(`${root} .ce-mark-${kind}`)]
  .map((n) => { const r = n.getBoundingClientRect(); return { line: Number(n.dataset.line), left: r.left, top: r.top, width: r.width, height: r.height }; }), { kind, root });

const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

/** Click on the character at `offset`, as a person puts the caret there. */
async function clickAt(offset, root = SCRIPT) {
  // Scrolled into view first, as a person would scroll to it.
  const moved = await page.evaluate(({ offset, root }) => {
    const ta = document.querySelector(`${root} textarea.ce-ta`);
    const line = ta.value.slice(0, offset).split('\n').length - 1;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21;
    const top = 10 + line * lh;
    if (top >= ta.scrollTop + lh && top <= ta.scrollTop + ta.clientHeight - 2 * lh) return false;
    ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
    ta.dispatchEvent(new Event('scroll'));
    return true;
  }, { offset, root });
  if (moved) await kit.settle(300);
  const [r] = await textRects(offset, offset + 1, root);
  await page.mouse.click(r.left + 1, r.top + r.height / 2);
  await kit.settle(150);
}

async function typeScript(text) {
  const area = page.locator(`${SCRIPT} textarea.ce-ta`).first();
  await area.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(text);
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta')?.value === t, text);
  await kit.settle(200);
}

/** The rows the Values tab lists: name, depth, kind, value text, meaning line, problem, selected. */
const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="values-sidebar"] .vrow')].map((n) => ({
  name: n.dataset.name, kind: n.dataset.kind, depth: Number(getComputedStyle(n).getPropertyValue('--depth') || 0),
  text: n.querySelector('.vtext')?.textContent ?? '', meaning: n.querySelector('.vmeaning')?.textContent ?? '',
  problem: n.querySelector('.vproblem')?.textContent ?? '', sel: n.classList.contains('sel'), editing: n.classList.contains('editing'),
})));
const head = () => page.evaluate(() => {
  const h = document.querySelector('[data-testid="values-sidebar"] .vhead');
  return h ? { where: h.querySelector('.vwhere')?.textContent.trim(), path: h.querySelector('.vpath')?.textContent.trim(), sum: h.querySelector('.vsum')?.textContent.trim() } : null;
});
const waitHead = (where) => until((w) => document.querySelector('[data-testid="values-sidebar"] .vwhere')?.textContent.includes(w), where);

const displayShown = () => page.evaluate(() => getComputedStyle(document.querySelector('.display-panel-area')).display !== 'none');
const activeDisplayTab = () => page.evaluate(() => document.querySelector('.studio-rail [role="tab"][aria-selected="true"]')?.getAttribute('aria-label') ?? '');

/** Count the writes the editor gets: every edit of the sidebar's own is one input event. */
const countInputs = () => page.evaluate(() => {
  window.__inputs = [];
  const ta = document.querySelector('.bd-app .detail textarea.ce-ta') ?? document.querySelector('.pf textarea.ce-ta');
  if (window.__inputTa !== ta) {
    window.__inputTa = ta;
    ta.addEventListener('input', () => window.__inputs.push(ta.value));
  }
});
const inputs = () => page.evaluate(() => window.__inputs.length);

/** Drag across the display panel's colour square, holding the pointer still at the end for `holdMs`. */
async function dragColour(steps = 12, holdMs = 600, x0 = 0.25) {
  const sq = await page.locator('.sv-square').boundingBox();
  await page.mouse.move(sq.x + sq.width * x0, sq.y + sq.height * 0.3);
  await page.mouse.down();
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.move(sq.x + sq.width * (x0 + i * 0.04), sq.y + sq.height * (0.3 + i * 0.01));
    await page.waitForTimeout(25);
  }
  const during = await inputs();
  await page.waitForTimeout(holdMs);
  const held = await inputs();
  await page.mouse.up();
  return { during, held };
}

async function openScriptEditor(control) {
  const box = await kit.box(control);
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(400);
  await page.locator('button.s-jump').click();
  await page.waitForSelector('.bd-app', { timeout: 30000 });
  await kit.settle(1200);
}

async function newScript() {
  await page.locator('.bd-app button.tgnew:not(.folder)').nth(2).click();   // Runtime
  await page.waitForSelector(`${SCRIPT} textarea.ce-ta`, { timeout: 15000 });
  await kit.settle(500);
}

async function makeControls() {
  await kit.fresh();
  const cutoff = await kit.make('Knob', { 'Transform.x': 70, 'Transform.y': 110, 'Core.name': 'Cutoff' });
  await kit.make('Label', { 'Transform.x': 70, 'Transform.y': 260, 'Core.name': 'Title', 'Background.Fill.colour': 'FF5B9BD5' });
  await kit.settle(400);
  return cutoff;
}

const LUA = `-- Cutoff: follow the filter, and colour the title
function onValueChanged(value)
  ce.core.set("Title.Text.Fill.colour", "SteelBlue")
  ce.anim.to("Cutoff.value", 100, {
    duration = 250,
    curve = "outBack",
    easing = "in",
  })
  ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }))
end
`;

const JS = `function onValueChanged(value) {
  ce.anim.to("Cutoff.value", 100, {
    duration: 250,
    curve: "outBack",
    easing: "in",
  });
}
`;

try {
  // ===============================================================================================
  // TAB — the fourth tab, remembered across a reload.
  // ===============================================================================================
  let cutoff = await makeControls();
  await page.locator('.icon-panel-area button.rail-toggle', { hasText: 'Dock' }).click();
  await kit.settle(300);
  const panelDock = await displayShown();
  await openScriptEditor(cutoff);
  await newScript();
  led.check(S, 'a display switch of its own', 'the display panel opened with the rail\'s Dock toggle in the panel editor does not show in the script editor, whose switch is off until asked for',
    { panelEditor: true, scriptEditor: false, stored: [true, false] },
    { panelEditor: panelDock, scriptEditor: await displayShown(),
      stored: await page.evaluate(() => ['ce.ui.showDisplayPanel', 'ce.ui.showDisplayPanel.script'].map((k) => localStorage.getItem(k) === 'true')) });
  // Put the panel editor's back, so the reload below lays the panel editor out as it was.
  await page.evaluate(async () => {
    const { showDisplayPanel } = await import('/src/CE_Application/stores/panelVisibility.js');
    showDisplayPanel.set(false);
  });
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-testid="script-dock"] .dtab')].map((b) => b.textContent.trim().split(' ')[0]));
  const firstTab = await page.evaluate(() => document.querySelector('[data-testid="script-dock"] .dtab.active')?.textContent.trim());
  await page.locator('[data-testid="script-dock"] .dtab', { hasText: 'Values' }).click();
  await page.waitForSelector('[data-testid="values-sidebar"]');
  led.check(S, 'a fourth tab', 'the dock has Insert, Library, History and Values, and opens on Insert the first time',
    { tabs: ['Insert', 'Library', 'History', 'Values'], first: 'Insert' }, { tabs, first: firstTab });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app', { timeout: 60000 });
  await kit.settle(600);
  cutoff = await makeControls();
  await openScriptEditor(cutoff);
  await newScript();
  led.check(S, 'remembered', 'after a reload the dock opens on the tab last used, Values, read from this viewer\'s local storage',
    { active: 'Values', stored: 'values', sidebar: true },
    await page.evaluate(() => ({
      active: document.querySelector('[data-testid="script-dock"] .dtab.active')?.textContent.trim(),
      stored: localStorage.getItem('ce-script-dock-tab'),
      sidebar: !!document.querySelector('[data-testid="values-sidebar"]'),
    })));

  // ===============================================================================================
  // ROWS — a call over several lines, Lua.
  // ===============================================================================================
  await typeScript(LUA);
  await clickAt(LUA.indexOf('250') + 1);
  await waitHead('Lines 4');
  const luaRows = await rows();
  const luaHead = await head();
  led.check(S, 'a statement over five lines', 'with the caret in the options table, the whole ce.anim.to call is listed: its header names the lines, the call and its summary; its arguments in order; its options under opts',
    { where: 'Statement · Lines 4–8', path: 'ce.anim.to', sum: true,
      names: ['path', 'target', 'opts', 'duration', 'curve', 'easing'], depths: [0, 0, 0, 1, 1, 1] },
    { where: luaHead.where, path: luaHead.path, sum: /^Move a value smoothly to target/.test(luaHead.sum),
      names: luaRows.map((r) => r.name), depths: luaRows.map((r) => r.depth) });
  const byName = (list, name) => list.find((r) => r.name === name);
  // A Knob's document holds no value of its own until one is set (its value is the preview's), so
  // its path names the control and its type.
  led.check(S, 'what each value means', 'the path names the control on the panel and its type; the duration is in milliseconds and in beats; the curve shows its picture; the caret\'s value is the selected row',
    { path: 'Cutoff · Knob', duration: '250 ms is half a beat at 120 BPM', picture: true, selected: 'duration' },
    { path: byName(luaRows, 'path').meaning.trim(), duration: byName(luaRows, 'duration').meaning,
      picture: await page.locator('.vrow[data-name="curve"] svg.curve').isVisible(), selected: luaRows.find((r) => r.sel)?.name });
  led.check(S, 'an unknown option', 'easing is no option of ce.anim.to, and its row says so in the runtime\'s words',
    'ce.anim.to: "easing" is not one of its options, so nothing was done. Its options are: duration, beats, sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done.',
    byName(luaRows, 'easing').problem);

  // ---- marks -------------------------------------------------------------------------------------
  const lineStarts = (text) => { const out = [0]; for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') out.push(i + 1); return out; };
  const starts = lineStarts(LUA);
  const bands = await markRects('statement');
  const lineTops = [];
  for (const line of [4, 5, 6, 7, 8]) lineTops.push((await textRects(starts[line - 1] + 2, starts[line - 1] + 3))[0].top);
  led.check(S, 'the statement band', 'a faint band lies over each of the statement\'s lines, 4 to 8, level with the text of each, with its bar at the left',
    { lines: [4, 5, 6, 7, 8], level: true, bar: true },
    { lines: bands.map((b) => b.line), level: bands.every((b, i) => near(b.top, lineTops[i], 3)),
      bar: await page.evaluate(() => getComputedStyle(document.querySelector('.bd-app .ce-mark-statement')).boxShadow.includes('inset')) });
  await page.locator('.vrow[data-name="curve"]').hover();
  await until(() => document.querySelectorAll('.bd-app .ce-mark-hover').length > 0);
  const [hover] = await markRects('hover');
  const curveAt = LUA.indexOf('"outBack"');
  const [curveText] = await textRects(curveAt, curveAt + '"outBack"'.length);
  led.check(S, 'the hover box', 'the pointer over the curve row draws a light box around exactly "outBack" in the text, and nothing moves a character',
    { line: 6, around: true },
    { line: hover.line, around: near(hover.left, curveText.left - 1) && near(hover.width, curveText.width + 2) && near(hover.top, curveText.top, 3) });
  // The face is a web font, loaded when the editor first draws text, so the editor can measure the
  // fallback's width before it arrives; on Windows that fallback is narrower, and the boxes ended
  // short of their text (CI's first run of this check). Letter-spacing widens the text the way the
  // font arriving does, without the network: the box follows the width the text has now.
  const wider = await page.addStyleTag({ content: '.bd-app .ce-measure, .bd-app .ce-hl, .bd-app textarea.ce-ta { letter-spacing: 1.5px; }' });
  await kit.settle(300);
  const [hoverWide] = await markRects('hover');
  const [curveWide] = await textRects(curveAt, curveAt + '"outBack"'.length);
  led.check(S, 'the boxes follow the face', 'when the text\'s face changes width after the editor opened (a web font arriving), the hover box is still around exactly "outBack"',
    { wider: true, around: true },
    { wider: curveWide.width > curveText.width + 9, around: near(hoverWide.left, curveWide.left - 1) && near(hoverWide.width, curveWide.width + 2) });
  await wider.evaluate((node) => node.remove());
  await kit.settle(300);
  await page.mouse.move(5, 500);

  // ---- keyboard ----------------------------------------------------------------------------------
  await page.locator('.vrow[data-name="target"] .vname').focus();
  await page.keyboard.press('Enter');
  await kit.settle(200);
  const caret = await page.evaluate(() => { const ta = document.querySelector('.bd-app .detail textarea.ce-ta'); return { at: ta.selectionStart, focused: document.activeElement === ta }; });
  led.check(S, 'a row by the keyboard', 'a row\'s name is a button: Enter on it takes the caret to its value in the code', { at: LUA.indexOf('100'), focused: true }, caret);

  // ===============================================================================================
  // CHOICE and NUMBER, in the row.
  // ===============================================================================================
  await countInputs();
  await page.locator('.vrow[data-name="curve"] select').selectOption('inOutQuad');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('"inOutQuad"'));
  await kit.settle(300);
  let text = await editorText();
  led.check(S, 'a dropdown writes at once', 'picking inOutQuad in the curve\'s dropdown writes it in place of "outBack", quotes kept, as one edit',
    { written: true, edits: 1, rest: true },
    { written: text.includes('curve = "inOutQuad"'), edits: await inputs(), rest: text === LUA.replace('"outBack"', '"inOutQuad"') });

  const field = page.locator('.vrow[data-name="duration"] input.vfield');
  await countInputs();
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('400');
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('duration = 400'));
  await kit.settle(300);
  const afterEnter = await inputs();
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('999');
  await page.keyboard.press('Escape');
  await kit.settle(300);
  text = await editorText();
  led.check(S, 'a number field', 'the duration\'s field writes 400 on Enter, as one edit, with "ms" beside it; 999 typed and Escape puts the field back and writes nothing',
    { written: true, edits: 1, unit: 'ms', field: '400', untouched: true },
    { written: text.includes('duration = 400'), edits: afterEnter, unit: (await page.locator('.vrow[data-name="duration"] .vunit').textContent()).trim(),
      field: await field.inputValue(), untouched: !text.includes('999') && (await inputs()) === 1 });
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('-5');
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('duration = -5'));
  await until(() => (document.querySelector('.vrow[data-name="duration"] .vproblem')?.textContent ?? '').length > 0);
  led.check(S, 'a number out of range', 'a duration below 1 ms is written as typed, and the row says what the runtime makes of it',
    'ce.anim.to: a duration of -5 is under 1 ms, so the move takes 1 ms: it jumps.', (await rows()).find((r) => r.name === 'duration').problem);
  await page.locator(`${SCRIPT} textarea.ce-ta`).focus();
  await page.keyboard.press('Control+z');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('duration = 400'));

  // ===============================================================================================
  // COLOUR — through the shared display panel.
  // ===============================================================================================
  await typeScript(LUA);
  await clickAt(LUA.indexOf('ce.core') + 2);
  await waitHead('Line 3');
  const hiddenBefore = !(await displayShown());
  await countInputs();
  await page.locator('.vrow[data-name="value"] button.vswatch').click();
  await until(() => getComputedStyle(document.querySelector('.display-panel-area')).display !== 'none');
  await page.waitForSelector('.sv-square');
  await kit.settle(300);
  const label = (await page.locator('.context-label').first().textContent()).trim();
  led.check(S, 'a swatch opens the display panel', 'the value row\'s swatch shows the shared display panel, which the script workspace hides until now, on its Colors tab, editing "Script · Title text colour, line 3"; no write yet',
    { hiddenBefore: true, shown: true, tab: 'Colors', label: 'Editing: Script · Title text colour, line 3', edits: 0 },
    { hiddenBefore, shown: await displayShown(), tab: await activeDisplayTab(), label, edits: await inputs() });
  const original = '"SteelBlue"';
  const valueAt = LUA.indexOf(original);
  const [editBefore] = await markRects('edit');
  const [origText] = await textRects(valueAt, valueAt + original.length);
  const drag = await dragColour();
  await until(() => window.__inputs.length > 0);
  await kit.settle(500);
  text = await editorText();
  const written = /ce\.core\.set\("Title\.Text\.Fill\.colour", ("#[0-9A-F]{6}")\)/.exec(text)?.[1] ?? '';
  const [editAfter] = await markRects('edit');
  const [newText] = await textRects(valueAt, valueAt + written.length);
  led.check(S, 'it writes once, when the drag settles', 'a drag across the colour square writes nothing while it moves or while the pointer is held, then once when it is let go, as #RRGGBB: a colour with no name',
    { during: 0, held: 0, after: 1, form: true },
    { during: drag.during, held: drag.held, after: await inputs(), form: /^"#[0-9A-F]{6}"$/.test(written) });
  led.check(S, 'the edit box follows the value', 'the strong box is around "SteelBlue" while it is edited, and around the shorter "#RRGGBB" once that is written',
    { before: true, after: true, shorter: true },
    { before: near(editBefore.left, origText.left - 1) && near(editBefore.width, origText.width + 2),
      after: near(editAfter.left, newText.left - 1) && near(editAfter.width, newText.width + 2), shorter: editAfter.width < editBefore.width - 5 });
  const editingRow = (await rows()).find((r) => r.editing);
  led.check(S, 'the row is the one being edited', 'the value\'s row is marked while it is edited, shows the new value, and the foot says what Done and Cancel do',
    { row: 'value', text: written, foot: true },
    { row: editingRow?.name, text: editingRow?.text, foot: (await page.locator('[data-testid="values-sidebar"] .vfoot').textContent()).includes('Cancel puts "SteelBlue" back exactly') });

  await page.locator('.context-done').first().click();
  await until(() => getComputedStyle(document.querySelector('.display-panel-area')).display === 'none');
  await kit.settle(300);
  led.check(S, 'Done keeps it', 'Done ends the edit with the colour written, the edit box gone, and the display panel hidden again, as it was before',
    { kept: true, box: 0, shown: false, edits: 1 },
    { kept: (await editorText()).includes(written), box: (await markRects('edit')).length, shown: await displayShown(), edits: await inputs() });
  await page.locator(`${SCRIPT} textarea.ce-ta`).focus();
  await page.keyboard.press('Control+z');
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta').value === t, LUA);
  led.check(S, 'Ctrl+Z takes it back in one step', 'the settled write is one step of the editor\'s own undo: one Ctrl+Z gives back the script with "SteelBlue"', true,
    (await editorText()) === LUA);

  // Cancel, with the display panel shown by the rail's Dock toggle first: it stays shown afterwards.
  await page.locator('.icon-panel-area button.rail-toggle', { hasText: 'Dock' }).click();
  await until(() => getComputedStyle(document.querySelector('.display-panel-area')).display !== 'none');
  await clickAt(LUA.indexOf('ce.core') + 2);
  await countInputs();
  await page.locator('.vrow[data-name="value"] button.vswatch').click();
  await page.waitForSelector('.sv-square');
  await kit.settle(300);
  await dragColour(8, 450);
  await until(() => window.__inputs.length >= 1);
  await dragColour(8, 450, 0.1);
  await until(() => window.__inputs.length >= 2);
  await kit.settle(300);
  const twoWrites = await inputs();
  await page.locator('.context-cancel').first().click();
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta').value === t, LUA);
  await kit.settle(300);
  led.check(S, 'Cancel puts the original back exactly', 'after two settled writes, Cancel restores the characters "SteelBlue" exactly, in one more edit, not "#4682B4"; the panel, opened by the rail\'s Dock toggle before, stays',
    { writes: 2, cancelEdits: 3, exact: true, shown: true, target: false },
    { writes: twoWrites, cancelEdits: await inputs(), exact: (await editorText()) === LUA, shown: await displayShown(),
      target: await page.evaluate(async () => { const { colorTarget } = await import('/src/CE_Application/stores/colorTarget.js'); let t; colorTarget.subscribe((v) => { t = v; })(); return !!t; }) });
  await page.locator('.icon-panel-area button.rail-toggle', { hasText: 'Dock' }).click();
  await until(() => getComputedStyle(document.querySelector('.display-panel-area')).display === 'none');

  // A session ends when the text moves under it: typing elsewhere ends the edit, and the next drag writes nothing.
  await clickAt(LUA.indexOf('ce.core') + 2);
  await page.locator('.vrow[data-name="value"] button.vswatch').click();
  await page.waitForSelector('.sv-square');
  await kit.settle(200);
  await clickAt(LUA.indexOf('-- Cutoff'));
  await page.keyboard.insertText('X');
  await kit.settle(400);
  const moved = await page.evaluate(async () => {
    const { colorTarget } = await import('/src/CE_Application/stores/colorTarget.js');
    let t; colorTarget.subscribe((v) => { t = v; })();
    return { target: !!t, box: document.querySelectorAll('.bd-app .ce-mark-edit').length };
  });
  led.check(S, 'the text moving ends it', 'typing outside the value while its colour is open ends the edit: the display panel\'s target is let go, the box goes, and the panel is hidden again',
    { target: false, box: 0, shown: false }, { ...moved, shown: await displayShown() });
  await page.keyboard.press('Control+z');
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta').value === t, LUA);

  // …and so does folding the view, whose lines are then not the text's.
  await clickAt(LUA.indexOf('ce.core') + 2);
  await page.locator('.vrow[data-name="value"] button.vswatch').click();
  await page.waitForSelector('.sv-square');
  await kit.settle(200);
  await page.locator(`${SCRIPT} button.ce-fold-btn`).click();
  await kit.settle(400);
  const folded = await page.evaluate(async () => {
    const { colorTarget } = await import('/src/CE_Application/stores/colorTarget.js');
    let t; colorTarget.subscribe((v) => { t = v; })();
    return { target: !!t, marks: document.querySelectorAll('.bd-app .ce-mark').length };
  });
  const shownFolded = await displayShown();
  await page.locator(`${SCRIPT} button.ce-fold-btn`).click();
  await kit.settle(300);
  led.check(S, 'folding ends it', 'folding the view while a colour is open ends the edit and draws no highlight at all, since the lines shown are not the text\'s; unfolded, the text is as it was',
    { target: false, marks: 0, shown: false, text: true }, { ...folded, shown: shownFolded, text: (await editorText()) === LUA });

  // ===============================================================================================
  // NESTED and GRADIENT.
  // ===============================================================================================
  await clickAt(LUA.indexOf('ce.draw.fill') + 2);
  await waitHead('Line 9');
  const nested = await rows();
  const nestedCall = await page.evaluate(() => [...document.querySelectorAll('[data-testid="values-sidebar"] .vcall')].map((n) => ({
    path: n.querySelector('.vpath')?.textContent.trim(), depth: Number(getComputedStyle(n).getPropertyValue('--depth') || 0),
    rule: getComputedStyle(n).borderLeftStyle,
  })));
  led.check(S, 'a call inside another', 'ce.draw.fill\'s colour is made by the call below, and ce.draw.gradient is listed under it, indented with a rule, with its stops and their swatches',
    { names: ['colour', 'stops', 'stop 1', 'stop 2'], depths: [0, 1, 2, 2], madeBelow: 'made by the call below: a colour', call: [{ path: 'ce.draw.gradient', depth: 1, rule: 'solid' }], swatches: 2 },
    { names: nested.map((r) => r.name), depths: nested.map((r) => r.depth), madeBelow: nested[0].meaning, call: nestedCall,
      swatches: await page.locator('.vrow[data-name^="stop"] button.vswatch').count() });

  await countInputs();
  await page.locator('.vrow[data-name="stops"] button.vstrip').click();
  await until(() => getComputedStyle(document.querySelector('.display-panel-area')).display !== 'none');
  await page.waitForSelector('.gradient-settings');
  await kit.settle(400);
  const angleCell = page.locator('.gradient-settings .nc-value').first();
  const opened = { tab: await activeDisplayTab(), label: (await page.locator('.context-label').first().textContent()).trim(), angle: await angleCell.inputValue() };
  await angleCell.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('135');
  await page.keyboard.press('Enter');
  await until(() => window.__inputs.length > 0);
  await kit.settle(500);
  text = await editorText();
  led.check(S, 'a gradient opens the Gradient tab', 'the stops\' strip opens the Gradient tab on a script gradient at the runtime\'s 180 (none is written), named as linear only',
    { tab: 'Gradient', label: 'Editing: Script · ce.draw.gradient stops, line 9 (linear only)', angle: '180' }, opened);
  led.check(S, 'a gradient is written in one edit', 'turning it to 135 writes the angle after the stops, the stops as they were, in one edit',
    { line: '  ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 135))', edits: 1 },
    { line: text.split('\n')[8], edits: await inputs() });
  await page.locator('.context-cancel').first().click();
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta').value === t, LUA);
  led.check(S, 'a gradient\'s Cancel', 'Cancel takes the added angle out again, the characters exactly as they were, and hides the panel', { exact: true, shown: false },
    { exact: (await editorText()) === LUA, shown: await displayShown() });

  // ===============================================================================================
  // JAVASCRIPT — the same call, the same rows.
  // ===============================================================================================
  await page.on('dialog', (d) => d.accept());
  await page.locator('#bd-lang').selectOption('javascript');
  await kit.settle(500);
  await typeScript(JS);
  await clickAt(JS.indexOf('outBack'));
  await waitHead('Lines 2');
  const jsRows = await rows();
  led.check(S, 'the same call in JavaScript', 'the JavaScript spelling lists the same rows, the curve\'s row selected for the caret in it, and the same refusal for easing',
    { where: 'Statement · Lines 2–6', names: ['path', 'target', 'opts', 'duration', 'curve', 'easing'], selected: 'curve', easing: true },
    { where: (await head()).where, names: jsRows.map((r) => r.name), selected: jsRows.find((r) => r.sel)?.name,
      easing: jsRows.find((r) => r.name === 'easing').problem.startsWith('ce.anim.to: "easing" is not one of its options') });
  await countInputs();
  await page.locator('.vrow[data-name="curve"] select').selectOption('inBack');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('curve: "inBack"'));
  led.check(S, 'a JavaScript dropdown', 'the curve is written in JavaScript\'s own syntax, as one edit', 1, await inputs());

  // ===============================================================================================
  // FILE — the panel file view's Values tab.
  // ===============================================================================================
  await page.locator('.bd-app .tnode', { hasText: 'Panel file' }).click();
  await page.waitForSelector('[data-testid="panel-file-view"]');
  await page.locator('.pf .pf-row', { hasText: 'Title' }).click();
  await until(() => (document.querySelector('.pf textarea.ce-ta')?.value ?? '').includes('"Title"'));
  await kit.settle(300);
  const fileTabs = await page.evaluate(() => [...document.querySelectorAll('[data-testid="script-dock"] .dtab')].map((b) => b.textContent.trim()));
  const itemText = await editorText(FILE);
  await clickAt(itemText.indexOf('"FF5B9BD5"') + 2, FILE);
  await until(() => !!document.querySelector('[data-testid="values-sidebar"] .vrow[data-name="colour"]'));
  const fileRows = await rows();
  led.check(S, 'the panel file view has Values', 'beside the panel file the dock has the Values tab alone, and with the caret in the Fill of a Label its colour is a row, read by the section templates',
    { tabs: ['Values'], where: true, colour: { name: 'colour', kind: 'colour', meaning: 'stored as FF5B9BD5', sel: true } },
    { tabs: fileTabs, where: (await head()).where.startsWith('Object'),
      colour: (({ name, kind, meaning, sel }) => ({ name, kind, meaning, sel }))(fileRows.find((r) => r.name === 'colour')) });
  await countInputs();
  await page.locator('.vrow[data-name="colour"] button.vswatch').click();
  await page.waitForSelector('.sv-square');
  await kit.settle(300);
  const fileLabel = (await page.locator('.context-label').first().textContent()).trim();
  const hex = page.locator('.sv-toolbar .hex-input');
  await hex.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('#80123456');
  await page.keyboard.press('Enter');
  await until(() => window.__inputs.length > 0);
  await kit.settle(500);
  await page.locator('.context-done').first().click();
  await kit.settle(300);
  const draftText = await editorText(FILE);
  const applyEnabled = await page.locator('.pf button', { hasText: 'Apply' }).isEnabled();
  await page.locator('.pf button', { hasText: 'Apply' }).click();
  await kit.settle(500);
  const title = await page.evaluate(async () => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const panel = get(panels).find((p) => p.id === get(activePanelId));
    return panel.controls.find((c) => c._children.Core.name === 'Title')._children.Background._children.Fill.colour;
  });
  led.check(S, 'a colour edited in the file', 'the colour typed in the display panel is written into the item\'s text once, as AARRGGBB, which is a draft until Apply puts it on the control',
    { label: true, written: true, edits: 1, draft: true, applied: '80123456' },
    { label: /^Editing: Panel file · Title Fill colour, line \d+$/.test(fileLabel), written: draftText.includes('"colour": "80123456"'),
      edits: await inputs(), draft: applyEnabled, applied: title });
  await page.locator('.pf label', { hasText: 'Every field' }).locator('input').check();
  await kit.settle(500);
  const refText = await editorText(FILE);
  await clickAt(refText.indexOf('"80123456"') + 2, FILE);
  await until(() => !!document.querySelector('[data-testid="values-sidebar"] .vrow[data-name="colour"]'));
  led.check(S, 'Every field is to read', 'in the every-field reference the rows are shown and nothing opens: no swatch is a button there, and the foot says so',
    { rows: true, buttons: 0, foot: true },
    { rows: (await rows()).length > 0, buttons: await page.locator('[data-testid="values-sidebar"] button.vswatch').count(),
      foot: (await page.locator('[data-testid="values-sidebar"] .vfoot').textContent()).startsWith('Shown to read here') });
  await page.locator('.pf label', { hasText: 'Every field' }).locator('input').uncheck();
  await kit.settle(300);

  // The whole file has no caret: the line being read stands for one.
  await page.locator('.pf-mode-btn', { hasText: 'Whole file' }).click();
  await page.waitForSelector('[data-testid="file-viewer"] .fv-gln', { timeout: 30000 });
  await page.locator('.pf .pf-row', { hasText: 'Title' }).click();
  await kit.settle(500);
  const drawnLine = await page.evaluate(() => document.querySelector('[data-testid="file-viewer"] .fv-lines').textContent.split('\n')
    .findIndex((l) => l.includes('"80123456"')));
  const firstDrawn = await page.evaluate(() => Number(document.querySelector('[data-testid="file-viewer"] .fv-gln').textContent));
  const lines = await page.locator('[data-testid="file-viewer"] .fv-lines').boundingBox();
  // The line's number in the gutter is level with it: click the text beside it.
  const gutterRow = await page.evaluate((n) => {
    const row = [...document.querySelectorAll('[data-testid="file-viewer"] .fv-gln')].find((r) => Number(r.textContent) === n);
    const b = row.getBoundingClientRect();
    return b.top + b.height / 2;
  }, firstDrawn + drawnLine);
  await page.mouse.click(lines.x + 60, gutterRow);
  await until(() => !!document.querySelector('[data-testid="values-sidebar"] .vrow[data-name="colour"]'));
  const wholeRows = await rows();
  led.check(S, 'the whole file is to read', 'in the whole file, the line clicked stands for the caret: the Fill there is listed with its colour, and nothing in it opens',
    { colour: 'stored as 80123456 at 50% opacity', buttons: 0, foot: true, path: true },
    { colour: wholeRows.find((r) => r.name === 'colour')?.meaning, buttons: await page.locator('[data-testid="values-sidebar"] button.vswatch').count(),
      foot: (await page.locator('[data-testid="values-sidebar"] .vfoot').textContent()).startsWith('Shown to read here'),
      path: (await head()).path.endsWith('Background › Fill') && firstDrawn >= 1 });

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
