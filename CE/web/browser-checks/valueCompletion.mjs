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
 *   scrolling  a word list longer than its box follows the arrow keys, ArrowUp from the first row
 *              to the last included; the keys keep the selection with the pointer resting on the
 *              list, and a pointer that moves still selects
 *   symbols    Go to symbol's list follows the arrow keys the same way
 *   path       a property path is built a segment at a time: typing in the quotes lists the
 *              controls, a dot opens the next segment's list by itself, Enter writes that segment
 *   hint       the signature hint sits after the end of the caret's line when it fits there, else in
 *              a box above the line (below it on the top visible line); it and the completion list
 *              are drawn on their own background, though they are moved to <body>
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
    index: rows.indexOf(sel),
    inView: !!at && at.top >= box.top - 1 && at.bottom <= box.bottom + 1,
    scrolls: el.scrollHeight > el.clientHeight + 1,
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
  // SCROLLING — a word list longer than its box follows the arrows, as a value's list does.
  // ===============================================================================================
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+Space');
  await kit.settle(250);
  const all = await list();
  await page.keyboard.press('ArrowUp');
  await kit.settle(120);
  const last = await list();
  led.check(S, 'ArrowUp to the last word', 'Ctrl+Space on an empty line lists every word, more than the box shows; ArrowUp from the first goes to the last, and the list scrolls to show it',
    { kind: 'words', scrolls: true, index: (all?.labels.length ?? 0) - 1, inView: true },
    { kind: last?.kind, scrolls: last?.scrolls, index: last?.index, inView: last?.inView });
  await page.keyboard.press('ArrowDown');
  await kit.settle(120);
  // The pointer rests on a row in the middle of the box, as a hand left on the mouse does, and the
  // keys go on past the bottom: the list scrolls under the pointer, and the keys keep the selection.
  const box = await page.locator('.ce-ac').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await kit.settle(150);
  const hovered = (await list())?.index ?? -1;
  for (let i = 0; i < 15; i += 1) await page.keyboard.press('ArrowDown');
  await kit.settle(250);
  const down = await list();
  led.check(S, 'the keys keep the selection', 'with the pointer resting on a row in the middle, fifteen ArrowDowns move fifteen rows past it and the list scrolls to show the last, the pointer taking nothing back',
    { moved: 15, inView: true }, { moved: hovered >= 0 && down ? down.index - hovered : null, inView: down?.inView });
  // And the pointer still selects by moving: onto the row at the top of the box now.
  const top = await page.evaluate(() => {
    const el = document.querySelector('.ce-ac');
    const box = el.getBoundingClientRect();
    const row = [...el.querySelectorAll('.ce-ac-row')].find((r) => r.getBoundingClientRect().top >= box.top);
    const at = row.getBoundingClientRect();
    return { label: row.querySelector('.ce-ac-label').textContent, x: at.left + at.width / 2, y: at.top + at.height / 2 };
  });
  await page.mouse.move(top.x, top.y, { steps: 4 });
  await kit.settle(150);
  led.check(S, 'the pointer still selects', 'moving the pointer onto the row at the top of the box selects that row',
    top.label, (await list())?.selected);
  await page.keyboard.press('Escape');

  // ===============================================================================================
  // SYMBOLS — Go to symbol's list follows the arrows the same way.
  // ===============================================================================================
  const MANY = Array.from({ length: 60 }, (_, i) => `function step${String(i + 1).padStart(2, '0')}() end`).join('\n') + '\n';
  await typeScript(MANY);
  await page.locator(TA).first().click();
  await page.keyboard.press('Control+Shift+O');
  await page.waitForSelector('.ce-so .ce-so-row', { timeout: 5000 });
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown');
  await kit.settle(200);
  const symbols = await page.evaluate(() => {
    const listEl = document.querySelector('.ce-so-list');
    const rows = [...listEl.querySelectorAll('.ce-so-row')];
    const sel = listEl.querySelector('.ce-so-row.sel');
    const box = listEl.getBoundingClientRect();
    const at = sel?.getBoundingClientRect();
    return {
      count: rows.length, scrolls: listEl.scrollHeight > listEl.clientHeight + 1,
      selected: sel?.querySelector('.ce-so-name')?.textContent ?? null,
      inView: !!at && at.top >= box.top - 1 && at.bottom <= box.bottom + 1,
    };
  });
  led.check(S, 'Go to symbol follows the arrows', 'over sixty functions, more than the box shows, forty ArrowDowns select the forty-first, and the list scrolls to show it',
    { count: 60, scrolls: true, selected: 'step41', inView: true }, symbols);
  await page.keyboard.press('Escape');

  // ===============================================================================================
  // PATH — a property path, a segment at a time.
  // ===============================================================================================
  const PATH = 'set("", 1)\n';
  await typeScript(PATH);
  await clickAt(PATH.indexOf('""') + 1);
  await page.keyboard.type('Cut');
  await kit.settle(250);
  const controlsList = await list();
  await page.keyboard.press('Enter');
  await kit.settle(150);
  const afterControl = await editorText();
  await page.keyboard.type('.');
  await kit.settle(250);
  const segmentList = await list();
  await page.keyboard.type('Tran');
  await kit.settle(200);
  await page.keyboard.press('Enter');
  await kit.settle(150);
  const afterSection = await editorText();
  await page.keyboard.type('.x');
  await page.keyboard.press('Escape');
  await kit.settle(150);
  led.check(S, 'a path a segment at a time', 'typing "Cut" in set()\'s path lists Cutoff and Enter writes it; a dot opens the next list by itself, with its value and its sections, and "Tran" and Enter write Transform; the path reads Cutoff.Transform.x',
    { controls: true, control: 'set("Cutoff", 1)\n', opened: true, sections: true, section: 'set("Cutoff.Transform", 1)\n', text: 'set("Cutoff.Transform.x", 1)\n' },
    {
      controls: controlsList?.kind === 'value' && controlsList.labels.includes('Cutoff'),
      control: afterControl,
      opened: segmentList?.kind === 'value',
      sections: !!segmentList?.labels.includes('value') && !!segmentList?.labels.includes('Transform'),
      section: afterSection,
      text: await editorText(),
    });

  // ===============================================================================================
  // HINT — the signature hint after the end of the caret's line, or a box above or below it; and the
  // popups drawn as boxes, in the editor's colours, though they are moved to <body>.
  // ===============================================================================================
  const LONG = `-- ${'a long comment that runs past the edge of the editor '.repeat(3)}`;
  const HINTS = `ce.midi.sendCC(1, 74, 64) ${LONG}
function onValueChanged(value)
  ce.midi.sendCC(1, 74, 64)
  ce.midi.sendCC(1, 74, 64) ${LONG}
end
`;
  await typeScript(HINTS);
  const lineOf = (n) => HINTS.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  /** The hint shown, its box and paint, and the caret line's on-screen top and its text's end. */
  const hintAt = async (line) => {
    const start = lineOf(line);
    await clickAt(HINTS.indexOf('74', start) + 1);
    await until(() => document.querySelector('.ce-sig'));
    await kit.settle(200);
    const row = await charRect(start);
    const text = HINTS.split('\n')[line - 1];
    const end = await charRect(start + text.length - 1);
    return page.evaluate(({ row, end }) => {
      const n = document.querySelector('.ce-sig');
      const r = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      const ta = document.querySelector('.bd-app .detail textarea.ce-ta').getBoundingClientRect();
      return { mode: n.dataset.mode, parent: n.parentElement.tagName, text: n.textContent.replace(/\s+/g, ' ').trim(),
        opaque: s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent', border: s.borderTopStyle,
        onLine: Math.abs(r.top - row.top) <= 2, after: end ? r.left >= end.left + end.width : null,
        clearAbove: r.bottom <= row.top, clearBelow: r.top >= row.top + row.height, inside: r.left >= ta.left && r.right <= ta.right };
    }, { row, end });
  };
  const inline = await hintAt(3);
  const above = await hintAt(4);
  const below = await hintAt(1);
  if (process.env.HINT_SHOT_DIR) {
    await hintAt(3);
    await page.screenshot({ path: `${process.env.HINT_SHOT_DIR}/hint-inline.png`, clip: { x: 340, y: 280, width: 900, height: 200 } });
    await hintAt(4);
    await page.screenshot({ path: `${process.env.HINT_SHOT_DIR}/hint-above.png`, clip: { x: 340, y: 280, width: 900, height: 200 } });
  }
  led.check(S, 'the hint after the end of its line', 'with the caret in a short sendCC, the hint is on that line after its last character, in the code\'s own line, over no code, and drawn on a background of its own though it is moved to <body>',
    { mode: 'inline', parent: 'BODY', text: 'sendCC(channel, cc, value)', opaque: true, onLine: true, after: true, inside: true },
    { mode: inline.mode, parent: inline.parent, text: inline.text, opaque: inline.opaque, onLine: inline.onLine, after: inline.after, inside: inline.inside });
  led.check(S, 'no room after the line', 'on a line too long for it, the hint is a box above the line, clear of it, with a border and a background, inside the editor; on the top visible line, below it',
    { above: { mode: 'above', opaque: true, border: 'solid', clearAbove: true, inside: true }, below: { mode: 'below', clearBelow: true, inside: true } },
    { above: { mode: above.mode, opaque: above.opaque, border: above.border, clearAbove: above.clearAbove, inside: above.inside },
      below: { mode: below.mode, clearBelow: below.clearBelow, inside: below.inside } });
  // The completion list is moved to <body> the same way, and is drawn as a box too.
  await clickAt(lineOf(5));
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Control+Space');
  await until(() => document.querySelector('.ce-ac'));
  const acPaint = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.ce-ac'));
    return { opaque: s.backgroundColor !== 'rgba(0, 0, 0, 0)', border: s.borderTopStyle };
  });
  await page.keyboard.press('Escape');
  led.check(S, 'the completion list is a box', 'the completion list, moved to <body> as the hint is, is drawn on its own background with its border, not over the code bare',
    { opaque: true, border: 'solid' }, acPaint);

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
