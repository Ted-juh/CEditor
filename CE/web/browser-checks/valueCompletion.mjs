/**
 * valueCompletion.mjs — the script editor's completion reopened over a value already written, driven
 * as a person drives it: the caret put in a value with a click, Ctrl+Space, the arrows, Enter, typing.
 *
 * test/valueCompletions.test.js proves the pure part: which choices a value has and which characters
 * one replaces, in each language. This opens the editor and reads what is on screen and what is in
 * the script afterwards. docs/design/script-editor-value-editors.md, "Order of work", step 3.
 *
 *   loaded     completion over values works with the dock on Insert: it does not wait for the
 *              Values tab, whose core it shares and loads on its own
 *   forced     Ctrl+Space inside "outBack" lists the curves in their own order, outBack selected
 *              and in view in the list
 *   accept     Enter on another writes it in place of the whole value, quotes kept, as one edit, the
 *              caret after it inside the quotes; one Ctrl+Z gives back outBack
 *   keep       a division written "1/8t" is selected as written, and Enter leaves the text alone
 *   typing     typing inside a value opens the list once something is typed, filtered by it in the
 *              choices' order; nothing that fits closes it; Escape closes it as it does for words
 *   leaving    the caret leaving the value closes its list
 *   words      outside a value, completion completes words as before
 *   js         the same in JavaScript, a choice picked with the mouse
 *
 * Text goes in with keyboard.insertText, as valuesSidebar.mjs does; keys that complete go in as keys.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';
import { ANIM_CURVE_NAMES } from '../src/CE_Application/scripting/easingTables.js';

const kit = await boot({ width: 1600, height: 1000 });
const led = new Ledger('valueCompletion');
const S = 'ValueCompletion';
const page = kit.page;

const SCRIPT = '.bd-app .detail';
const TA = `${SCRIPT} textarea.ce-ta`;

const until = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const editorText = () => page.locator(TA).first().inputValue();
const caretAt = () => page.evaluate((sel) => document.querySelector(sel).selectionStart, TA);

/** The on-screen box of the character at `offset`, by the highlight layer under the textarea. */
const charRect = (offset) => page.evaluate(({ offset }) => {
  const pre = document.querySelector('.bd-app .detail .ce-hl');
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.nodeValue.length;
    if (offset < pos + len) {
      const range = document.createRange();
      range.setStart(n, offset - pos);
      range.setEnd(n, offset - pos + 1);
      const r = range.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    pos += len;
  }
  return null;
}, { offset });

/** Click just inside the left edge of the character at `offset`: the caret goes before it. */
async function clickAt(offset) {
  const r = await charRect(offset);
  await page.mouse.click(r.left + 1, r.top + r.height / 2);
  await kit.settle(150);
}

async function typeScript(text) {
  await page.locator(TA).first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(text);
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta')?.value === t, text);
  await page.keyboard.press('Escape');
  await kit.settle(200);
}

/** The completion list as it is on screen, or null when it is closed. */
const list = () => page.evaluate(() => {
  const el = document.querySelector('.ce-ac');
  if (!el) return null;
  const rows = [...el.querySelectorAll('.ce-ac-row')];
  const sel = el.querySelector('.ce-ac-row.sel');
  const box = el.getBoundingClientRect();
  const at = sel?.getBoundingClientRect();
  return {
    kind: el.dataset.list,
    labels: rows.map((r) => r.querySelector('.ce-ac-label').textContent),
    selected: sel?.querySelector('.ce-ac-label').textContent ?? null,
    detail: sel?.querySelector('.ce-ac-detail').textContent ?? null,
    inView: !!at && at.top >= box.top - 1 && at.bottom <= box.bottom + 1,
  };
});

/** Ctrl+Space, until the list is a value's: the completer loads in the background, so the first
 *  press after the editor opens may still get words. A list that never becomes a value's fails. */
async function forceValueList() {
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Control+Space');
    await kit.settle(120);
    const shown = await list();
    if (shown?.kind === 'value') return shown;
    if (shown) await page.keyboard.press('Escape');
    await kit.settle(250);
  }
  return list();
}

/** Count the edits the editor makes: each is one input event on the textarea. */
const countInputs = () => page.evaluate((sel) => {
  window.__inputs = [];
  const ta = document.querySelector(sel);
  if (window.__inputTa !== ta) {
    window.__inputTa = ta;
    ta.addEventListener('input', () => window.__inputs.push(ta.value));
  }
}, TA);
const inputs = () => page.evaluate(() => window.__inputs.length);

async function openScriptEditor(control) {
  const box = await kit.box(control);
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(400);
  await page.locator('button.s-jump').click();
  await page.waitForSelector('.bd-app', { timeout: 30000 });
  await kit.settle(1200);
}

const LUA = `function onValueChanged(value)
  ce.anim.to("Cutoff.value", 100, { duration = 250, curve = "outBack" })
  ce.time.step(value, "1/8t")
end
`;

const JS = `function onValueChanged(value) {
  ce.anim.to("Cutoff.value", 100, { duration: 250, curve: "outBack" });
}
`;

try {
  await kit.fresh();
  const cutoff = await kit.make('Knob', { 'Transform.x': 70, 'Transform.y': 110, 'Core.name': 'Cutoff' });
  await kit.settle(400);
  await openScriptEditor(cutoff);
  await page.locator('.bd-app button.tgnew:not(.folder)').nth(2).click();   // Runtime
  await page.waitForSelector(TA, { timeout: 15000 });
  await kit.settle(500);
  await typeScript(LUA);

  // ===============================================================================================
  // FORCED — Ctrl+Space inside "outBack", with the dock on Insert.
  // ===============================================================================================
  const curveAt = LUA.indexOf('outBack');
  await clickAt(curveAt + 3);
  const placed = await caretAt();
  const shown = await forceValueList();
  led.check(S, 'it does not wait for the Values tab', 'with the dock on Insert and no Values tab ever shown, Ctrl+Space in a value lists its choices',
    { dock: 'Insert', sidebar: false, list: 'value' },
    { dock: await page.evaluate(() => document.querySelector('[data-testid="script-dock"] .dtab.active')?.textContent.trim()),
      sidebar: await page.evaluate(() => !!document.querySelector('[data-testid="values-sidebar"]')), list: shown?.kind });
  led.check(S, 'Ctrl+Space over a value', 'with the caret between "out" and "Back", the list is every curve in its own order, outBack selected, marked as what is written, and in view in the list',
    { caret: curveAt + 3, labels: ANIM_CURVE_NAMES, selected: 'outBack', detail: 'now · curve', inView: true },
    { caret: placed, labels: shown?.labels, selected: shown?.selected, detail: shown?.detail, inView: shown?.inView });

  // ===============================================================================================
  // ACCEPT — another curve replaces the whole value, in one edit; one Ctrl+Z takes it back.
  // ===============================================================================================
  await countInputs();
  await page.keyboard.press('ArrowDown');
  await kit.settle(100);
  const moved = await list();
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('"inOutBack"'));
  await kit.settle(200);
  let text = await editorText();
  led.check(S, 'Enter replaces the whole value', 'ArrowDown moves to inOutBack; Enter writes it in place of all of "outBack", not only "out", the quotes kept, as one edit, the caret after it inside the quotes, the list closed',
    { selected: 'inOutBack', text: LUA.replace('"outBack"', '"inOutBack"'), edits: 1, caret: curveAt + 'inOutBack'.length, closed: null },
    { selected: moved?.selected, text, edits: await inputs(), caret: await caretAt(), closed: await list() });
  await page.keyboard.press('Control+z');
  await until((t) => document.querySelector('.bd-app .detail textarea.ce-ta').value === t, LUA);
  led.check(S, 'one Ctrl+Z gives it back', 'the choice was one step of the editor\'s own undo: one Ctrl+Z gives back the script with "outBack"', true, (await editorText()) === LUA);

  // ===============================================================================================
  // KEEP — a division written as the runtime reads it is kept as written.
  // ===============================================================================================
  const divisionAt = LUA.indexOf('1/8t');
  await clickAt(divisionAt + 2);
  const divisions = await forceValueList();
  await countInputs();
  await page.keyboard.press('Enter');
  await kit.settle(300);
  led.check(S, 'Enter keeps what is written', 'over "1/8t", which ce.time reads as 1/8T, the 1/8T row is selected and shown as written; Enter leaves the text exactly as it was and makes no edit',
    { selected: '1/8t', detail: 'now · 8th T, 0.33 beats', text: LUA, edits: 0, caret: divisionAt + 4 },
    { selected: divisions?.selected, detail: divisions?.detail, text: await editorText(), edits: await inputs(), caret: await caretAt() });

  // ===============================================================================================
  // TYPING — inside a value, the text before the caret filters.
  // ===============================================================================================
  const EMPTY = LUA.replace('"outBack"', '""');
  await typeScript(EMPTY);
  const emptyAt = EMPTY.indexOf('""') + 1;
  await clickAt(emptyAt);
  const nothingTyped = await list();
  await countInputs();
  await page.keyboard.type('in');
  await kit.settle(250);
  const typed = await list();
  const starts = ANIM_CURVE_NAMES.filter((n) => n.toLowerCase().startsWith('in'));
  const holds = ANIM_CURVE_NAMES.filter((n) => !n.toLowerCase().startsWith('in') && n.toLowerCase().includes('in'));
  led.check(S, 'typing filters', 'between empty quotes nothing opens; typing "in" opens the list by itself, the curves starting with it first and then those holding it, each in the curves\' order',
    { before: null, kind: 'value', labels: [...starts, ...holds], selected: starts[0] },
    { before: nothingTyped, kind: typed?.kind, labels: typed?.labels, selected: typed?.selected });
  await page.keyboard.type('OutC');
  await kit.settle(250);
  const narrowed = await list();
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('curve = "inOutCubic"'));
  led.check(S, 'typed and accepted', 'typing on to "inOutC" leaves inOutCubic alone in the list, and Enter completes it inside the quotes',
    { labels: ['inOutCubic'], text: EMPTY.replace('""', '"inOutCubic"') }, { labels: narrowed?.labels, text: await editorText() });

  await page.keyboard.type('X');
  await kit.settle(250);
  const nothingFits = await list();
  await page.keyboard.press('Backspace');
  await kit.settle(150);
  await page.keyboard.press('Control+Space');
  await kit.settle(200);
  const reopened = await list();
  await page.keyboard.press('Escape');
  await kit.settle(150);
  led.check(S, 'nothing fits, and Escape', 'a letter that leaves no choice closes the list, and no word list opens in its place; Ctrl+Space opens it again on inOutCubic, and Escape closes it, the text as it was',
    { nothingFits: null, reopened: 'inOutCubic', escaped: null, text: EMPTY.replace('""', '"inOutCubic"') },
    { nothingFits, reopened: reopened?.selected, escaped: await list(), text: await editorText() });

  // ===============================================================================================
  // LEAVING — the caret leaving the value closes its list.
  // ===============================================================================================
  const cubicAt = EMPTY.indexOf('""') + 1;
  await clickAt(cubicAt + 2);
  await forceValueList();
  for (let i = 0; i < 'OutCubic'.length; i += 1) await page.keyboard.press('ArrowRight');
  await kit.settle(150);
  const atEnd = await list();
  await page.keyboard.press('ArrowRight');
  await kit.settle(150);
  led.check(S, 'the caret leaving closes it', 'arrowing to the end of the value keeps the list; one more, past the closing quote, closes it',
    { atEnd: 'value', past: null }, { atEnd: atEnd?.kind ?? null, past: await list() });

  // ===============================================================================================
  // WORDS — outside a value, word completion as it was.
  // ===============================================================================================
  const lineEnd = EMPTY.indexOf('\n', EMPTY.indexOf('ce.time')) ;
  await clickAt(lineEnd - 1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('pri');
  await kit.settle(300);
  const words = await list();
  led.check(S, 'words outside a value', 'on a line of its own, typing "pri" opens the word list with print, as before',
    { kind: 'words', has: true }, { kind: words?.kind, has: !!words?.labels.includes('print') });
  await page.keyboard.press('Escape');

  // ===============================================================================================
  // JAVASCRIPT — the same, a choice picked with the mouse.
  // ===============================================================================================
  page.on('dialog', (d) => d.accept());
  await page.locator('#bd-lang').selectOption('javascript');
  await kit.settle(500);
  await typeScript(JS);
  const jsAt = JS.indexOf('outBack');
  await clickAt(jsAt + 5);
  const jsList = await forceValueList();
  await countInputs();
  await page.locator('.ce-ac .ce-ac-row', { hasText: 'inBack' }).first().dispatchEvent('mousedown');
  await until(() => document.querySelector('.bd-app .detail textarea.ce-ta').value.includes('curve: "inBack"'));
  await kit.settle(200);
  led.check(S, 'the same in JavaScript', 'in JavaScript the list is the same curves with outBack selected, and inBack picked with the mouse is written in place of the whole value, as one edit',
    { selected: 'outBack', labels: ANIM_CURVE_NAMES, text: JS.replace('"outBack"', '"inBack"'), edits: 1 },
    { selected: jsList?.selected, labels: jsList?.labels, text: await editorText(), edits: await inputs() });

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
