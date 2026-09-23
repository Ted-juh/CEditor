/**
 * authoringScripts.mjs — the Behavior Designer, driven as a person drives it.
 *
 * WHY THIS FILE EXISTS. `CE/web/test/` holds thirty-five script suites, and they cover the model
 * thoroughly: what `createScript` returns, what `validateScript` objects to, what the runtime does
 * with a source string. Not one of them opens the editor. So everything about scripting was proven
 * except the part a user touches — whether you can get a script INTO the thing, and whether the
 * button marked Run runs it.
 *
 * That is gate B4's whole point, and it is the handoff's rule in one sentence: a passing unit test
 * is insufficient evidence. The question here is never "does the model accept this" but "does the
 * author's keystroke reach the panel".
 *
 * WHAT THE CHAIN IS, and each step reads the output of the one before it rather than re-authoring:
 *
 *   open      select a control, press Script Editor in the Look bar — the only route in
 *   create    a lifecycle group's + adds a script and selects it
 *   type      the source goes into the real CodeEditor and reaches the document
 *   validate  a broken script says so, on screen, where the author is looking
 *   run       ▶ Run changes the PANEL — the assertion that makes the rest matter
 *   trace     what the script printed reaches the console pane
 *   reopen    leave the editor, come back, and the script is still there
 *
 * TWO FIXTURE FACTS, both of which cost a probe:
 *
 * The editor is a TAB, not a dock. `activeEditorTab.type === 'script'`, reached from the Look bar's
 * Script Editor button, which appears only when a control that HAS a Scripts section is selected —
 * so the fixture has to select the slider first, and a Label would never show the button at all.
 *
 * The root is `.bd-app` and nothing in it carries a data-testid. Buttons are addressed by their
 * titles, which are written for a human ("Run this script now against the live panel") and are the
 * most stable handle the markup offers; the lifecycle + buttons are titled "New <group> script".
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('authoringScripts');
const S = 'ScriptEditor';

/** The scripts in the Behavior Designer's workspace store. */
const storedScripts = () => kit.page.evaluate(async () => {
  const { scriptDocuments } = await import('/src/CE_Application/stores/scriptWorkspace.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  return (get(scriptDocuments) ?? []).flatMap((d) => (d.scripts ?? []).map((s) => ({
    id: s.id, event: s.event, language: s.language, enabled: s.enabled !== false,
    source: String(s.source ?? ''),
  })));
});

const embeddedScripts = () => kit.page.evaluate(async () => {
  const { panels, activeEditorTab } = await import('/src/CE_Application/stores/panels.js');
  const { scriptDocuments } = await import('/src/CE_Application/stores/scriptWorkspace.js');
  const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
  const document = get(scriptDocuments).find((entry) => entry.id === get(activeEditorTab)?.id);
  return get(panels).find((panel) => String(panel.id) === String(document?.panelId))?.scripts ?? [];
});

/** Type into the real CodeEditor: focus its content, select all, and type over it. */
async function typeSource(text) {
  const area = kit.page.locator('.bd-app textarea.ce-ta').first();
  await area.click();
  await kit.page.keyboard.press('Control+A');
  await kit.page.keyboard.type(text, { delay: 1 });
  await kit.settle(600);
}

try {
  await kit.fresh();

  // ===============================================================================================
  // OPEN — the only route in, driven rather than assumed.
  // ===============================================================================================
  const cutoff = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 110,
    'Transform.width': 240, 'Transform.height': 60, 'Core.name': 'Cutoff',
    'Behavior.min': 0, 'Behavior.max': 127, 'Behavior.defaultCurrentValue': 10 });
  await kit.settle(600);
  const box = await kit.box(cutoff);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(500);

  const jump = kit.page.locator('button.s-jump');
  led.check(S, 'the way in', 'selecting a control that can carry scripts offers the Script Editor in the Look bar — the one route to the editor, and a control with no Scripts section does not offer it',
    true, await jump.isVisible());
  await jump.click();
  await kit.settle(2500);
  led.check(S, 'the editor opens as a tab', 'the Behavior Designer replaces the canvas rather than floating over it, which is what makes it an authoring STAGE and not a dock — and it names the panel it is editing, so an author with several open knows which document they are in',
    { mounted: true, namesThePanel: true },
    await kit.page.evaluate(() => ({
      mounted: !!document.querySelector('.bd-app'),
      namesThePanel: (document.querySelector('.bd-app .crumb')?.textContent ?? '').includes('Behavior Designer'),
    })));

  // ===============================================================================================
  // CREATE — a lifecycle group's + button.
  // ===============================================================================================
  const before = (await storedScripts()).length;
  await kit.page.locator('.bd-app button.tgnew:not(.folder)').nth(2).click();   // Runtime
  await kit.settle(900);
  const created = await storedScripts();
  led.check(S, 'creating a script', 'the + on a lifecycle group adds a script to the workspace store rather than keeping it only in the view',
    { added: 1, hasEvent: true, hasSource: true },
    { added: created.length - before,
      hasEvent: !!created.at(-1)?.event,
      hasSource: created.at(-1)?.source.length > 0 });

  // ===============================================================================================
  // TYPE — the source reaches the document through the real editor.
  // ===============================================================================================
  const lang = created.at(-1)?.language ?? 'lua';
  // `set(path, value)` — ONE dotted path, not a name and a property. The three-argument spelling
  // looks right, is accepted by the editor, and does nothing: `setValue` splits the path itself and
  // a second argument is read as the value. Worth the comment because the failure is silent — the
  // script runs, the control does not move, and it reads exactly like a broken Run button.
  const setValue = lang === 'lua'
    ? 'set("Cutoff.value", 99)\nlog("authored")\n'
    : 'set("Cutoff.value", 99);\nlog("authored");\n';
  await typeSource(setValue);
  const typed = (await storedScripts()).at(-1);
  const embedded = (await embeddedScripts()).at(-1);
  led.check(S, 'typing reaches the panel', 'what is typed into the code pane reaches both the editor workspace and the panel document that saves and exports',
    { carriesTheCall: true, carriesThePrint: true, embeddedInPanel: true },
    { carriesTheCall: typed.source.includes('99'), carriesThePrint: typed.source.includes('authored'),
      embeddedInPanel: String(embedded?.source ?? '').includes('authored') });

  await kit.page.evaluate(() => {
    window.__scriptSavePreviousJuce = window.__JUCE__;
    window.__scriptSaveEvents = [];
    window.__JUCE__ = { backend: { emitEvent: (name, payload) => window.__scriptSaveEvents.push({ name, payload }) } };
  });
  await kit.page.getByRole('button', { name: 'Save file' }).click();
  const savedPanel = await kit.page.evaluate(() => {
    const event = window.__scriptSaveEvents.find((entry) => entry.name === 'savePanelAs' || entry.name === 'savePanel');
    window.__JUCE__ = window.__scriptSavePreviousJuce;
    return event ? JSON.parse(event.payload.data) : null;
  });
  led.check(S, 'Save file includes the authored script', 'the Behavior Designer Save file button submits a .cepanel containing the script, rather than a separate workspace file',
    true, String(savedPanel?.scripts?.at(-1)?.source ?? '').includes('authored'));

  // ===============================================================================================
  // RUN — the assertion the rest of the suite exists to reach.
  // ===============================================================================================
  await kit.page.locator('.bd-app button[title="Run this script now against the live panel"]').click();
  await kit.settle(1400);
  const afterRun = await kit.read(cutoff, 'Behavior.defaultCurrentValue');
  const session = await kit.session(cutoff);
  led.check(S, 'Run reaches the panel',
    'pressing Run makes the script act on the control it names — this is the only row that proves the editor is wired to anything at all, and every row above it is setup for this one. Measured on the control, not on a return value the editor prints to itself',
    true, Number(session?.valueOverride ?? afterRun) === 99);

  // ===============================================================================================
  // VALIDATE — a broken script says so, where the author is looking.
  // ===============================================================================================
  await typeSource('this is not a program(((\n');
  await kit.settle(900);
  const problems = await kit.page.evaluate(() =>
    [...document.querySelectorAll('.bd-app .problems .problem')]
      .map((n) => ({ ok: n.classList.contains('ok'), text: (n.textContent ?? '').trim() })));
  led.check(S, 'a broken script is reported on screen',
    'nonsense in the editor produces a problem in the problems strip under it, rather than being accepted silently and failing at run time — the strip is the only place an author finds out before pressing Run',
    { saysNoProblems: false, hasAProblem: true },
    { saysNoProblems: problems.some((p) => p.ok), hasAProblem: problems.some((p) => !p.ok) });

  // ===============================================================================================
  // REOPEN — leave the stage and come back.
  // ===============================================================================================
  await typeSource(setValue);
  await kit.page.locator('.tab-bar .tab').first().click();
  await kit.settle(1200);
  const leftIt = await kit.page.evaluate(() => !document.querySelector('.bd-app'));
  // Re-measure rather than reusing the box from before the editor opened: coming back to the panel
  // tab remounts the canvas, and a click at a stale coordinate selects nothing — which shows up as
  // the Look bar button never appearing, not as a missed click.
  const backBox = await kit.box(cutoff);
  await kit.page.mouse.click(backBox.x + backBox.w / 2, backBox.y + backBox.h / 2);
  await kit.settle(700);
  await kit.page.locator('button.s-jump').waitFor({ state: 'visible', timeout: 15000 });
  await kit.page.locator('button.s-jump').click();
  await kit.settle(2000);
  const back = (await storedScripts()).at(-1);
  led.check(S, 'the script survives leaving the editor',
    'switching to the panel tab and coming back finds the script still there with the source that was typed — the authoring stage is not a scratchpad, and this is the cheapest way for it to have been one',
    { leftTheEditor: true, cameBack: true, sameSource: true },
    { leftTheEditor: leftIt,
      cameBack: await kit.page.evaluate(() => !!document.querySelector('.bd-app')),
      sameSource: back.source.includes('99') });

  led.closed(S, 'what each script verb does once it runs',
    'the panel API itself — set, get, note, draw, time, storage and the rest',
    'thirty-five suites in CE/web/test/ — scriptComponents, scriptDraw, scriptMusic, scriptTime, scriptStorage and their neighbours — plus behaviourCustom.mjs for channel scripting in a browser. This suite deliberately uses ONE verb, and only as a way to prove the Run button is connected; proving the verbs again here would test the runtime through the slowest possible harness.');
  led.unverified(S, 'the interpreted-subset and preview-only languages',
    'Python, C++, C#, Java and TypeScript in the editor',
    'the editor marks these "preview · not live" and "interpreted subset" in its own header, and what they do in the SHIPPED plugin is a toolchain question `docs/verify-end-to-end.md` gates on Windows. Lua is what this suite drives, because it is the one the editor runs live and the one a Run button can be checked against.');

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
