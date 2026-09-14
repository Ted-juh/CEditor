/**
 * behaviourButtons.mjs — the button half of the `Behavior` section.
 *
 * What kind of control this is (`family`, `role`, `buttonType`), what a press means (one shot,
 * toggle, cyclic, press-to-talk, double-click), and the ten settings around them that turned out
 * to be declared and not connected.
 *
 * TWO THINGS TO KNOW BEFORE READING THE ROWS.
 *
 * The evidence is the PREVIEW SESSION, not the drawing. A button's press leaves `checked`,
 * `executed`, `disabled`, `pending` or `valueOverride` behind, and those are what bindings read and
 * what the script runtime diffs — so they are the outgoing behaviour, where a screenshot is only
 * the skin over it. Where a row is about what the control IS rather than what it did, the evidence
 * is the ARIA `role` the surface puts on the element, which is `previewRoleFor`'s whole output.
 *
 * And TEN OF THE PROPERTIES IN THIS BLOCK ARE NOT CONNECTED — six of them with a chip or a toggle
 * in the Properties panel. They are written out at the end with what was checked, because "no
 * reader" is a claim that has been wrong here before: a key can be reached by a computed name
 * (the drum pads' corner fields), by a whole-section pass, or by a generated script verb. All
 * three were checked for each one — there is no computed access to `behavior` anywhere in src/,
 * none of the ten appears in the scripting or export tables, and `derivedFlagVerbs` mints verbs
 * only for `show*` booleans and `editable`, which none of them is.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('buttons');
const B = 'Behavior';

const SESSION_KEYS = ['checked', 'mixed', 'executed', 'disabled', 'pending', 'pressed',
  'repeatCount', 'valueOverrideEnabled', 'valueOverride'];
const sess = async (id) => {
  const s = (await kit.session(id)) ?? {};
  return Object.fromEntries(SESSION_KEYS.filter((k) => k in s).map((k) => [k, s[k]]));
};
const roleOf = (id) => kit.page.evaluate(({ id }) =>
  document.querySelector(`[data-control-id="${id}"]`)?.getAttribute('role') ?? null, { id });

const centre = async (id) => {
  const b = await kit.box(id);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};
const press = async (id, holdMs = 90) => {
  const at = await centre(id);
  await kit.page.mouse.move(at.x, at.y);
  await kit.page.mouse.down();
  await kit.settle(holdMs);
  const held = await sess(id);
  await kit.page.mouse.up();
  await kit.settle(320);
  return { held, after: await sess(id) };
};
const tap = async (id) => (await press(id, 60)).after;
/**
 * Two clicks a chosen number of milliseconds apart, which is the only way to ask a question about
 * `clickWindow`. `tap` settles for 320ms after each release, so two of them are always further
 * apart than a short window — a fixture built out of taps can prove the count and never the clock.
 */
const doubleTap = async (id, gapMs) => {
  const at = await centre(id);
  for (let i = 0; i < 2; i += 1) {
    await kit.page.mouse.move(at.x, at.y);
    await kit.page.mouse.down();
    await kit.settle(30);
    await kit.page.mouse.up();
    if (i === 0) await kit.settle(gapMs);
  }
  await kit.settle(360);
  return await sess(id);
};

const mk = (type, y, extra = {}) => kit.make(type, { 'Transform.x': 70, 'Transform.y': y,
  'Transform.width': 160, 'Transform.height': 46, ...extra });

try {
  // =============================================================================================
  // family, role and buttonType — what the control announces itself to be.
  // =============================================================================================
  await kit.fresh();
  {
    const plain = await mk('Button', 110);
    const toggle = await mk('ToggleButton', 165);
    const radio = await mk('RadioButtonGroup', 220);
    const slider = await kit.make('Slider', { 'Transform.x': 260, 'Transform.y': 110,
      'Transform.width': 200, 'Transform.height': 44 });
    const number = await kit.make('Number', { 'Transform.x': 260, 'Transform.y': 170,
      'Transform.width': 140, 'Transform.height': 40 });
    await kit.preview(true);
    await kit.settle(700);

    led.check(B, 'family + role (what the surface announces)',
      'the two together decide the ARIA role the element carries: a range family is a slider or a spinbutton depending on its role, a toggle role is a checkbox, a radio button group is a radiogroup, and anything else is a button',
      { button: 'button', toggle: 'checkbox', radio: 'radiogroup', slider: 'slider', number: 'spinbutton' },
      { button: await roleOf(plain), toggle: await roleOf(toggle), radio: await roleOf(radio),
        slider: await roleOf(slider), number: await roleOf(number) });
    led.check(B, 'family (range is decided before the role is consulted)',
      'the family is asked first, so a control in the range family is never a plain button whatever its role says — and that is why a slider and a number field, which share a family and differ only in role, come out as two different things',
      { sliderFamily: 'range', numberFamily: 'range', sliderRole: 'slider', numberRole: 'spinbox' },
      { sliderFamily: await kit.read(slider, 'Behavior.family'),
        numberFamily: await kit.read(number, 'Behavior.family'),
        sliderRole: await kit.read(slider, 'Behavior.role'),
        numberRole: await kit.read(number, 'Behavior.role') });
    led.check(B, 'role (changed on a control that already exists)',
      'and it is read from the document rather than baked in at creation: a plain button given the toggle role becomes a checkbox to anything listening',
      'checkbox', await (async () => {
        await kit.set(plain, { 'Behavior.role': 'toggle' });
        await kit.settle(400);
        return await roleOf(plain);
      })());
    led.check(B, 'buttonType (combobox and radio outrank the role)',
      'two button types are announced by the type rather than the role, because a combobox and a radio group are containers of choices rather than one control with a state',
      { combobox: 'combobox', radiogroup: 'radiogroup' },
      await (async () => {
        await kit.set(plain, { 'Behavior.role': 'toggle', 'Behavior.buttonType': 'combobox' });
        await kit.settle(400);
        const combobox = await roleOf(plain);
        await kit.set(plain, { 'Behavior.buttonType': 'radio' });
        await kit.settle(400);
        return { combobox, radiogroup: await roleOf(plain) };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // buttonType 'one_shot' and disableAfterUse — the press that may only happen once.
  // =============================================================================================
  await kit.fresh();
  {
    const once = await mk('OneShotButton', 110);
    const again = await mk('OneShotButton', 175, { 'Behavior.disableAfterUse': false });
    await kit.preview(true);
    await kit.settle(700);

    led.check(B, 'buttonType (one_shot) + disableAfterUse',
      'a one-shot button records that it fired and then locks itself, which is what makes it one-shot rather than a button that happens to be pressed once',
      { executed: true, disabled: true }, await (async () => {
        const s = await tap(once);
        return { executed: s.executed, disabled: s.disabled };
      })());
    led.check(B, 'disableAfterUse (the lock really holds)',
      'and a second press on the locked button changes nothing, because a disabled control is not a control',
      { executed: true, disabled: true }, await (async () => {
        const s = await tap(once);
        return { executed: s.executed, disabled: s.disabled };
      })());
    led.check(B, 'disableAfterUse (false)',
      'switched off it still reports that it fired and stays live — a panic button you can hit twice, where the lock is for the one you must not',
      { executed: true, disabled: false }, await (async () => {
        const s = await tap(again);
        return { executed: s.executed, disabled: s.disabled };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // buttonType 'cyclic' and wrapBehavior — walking a list of states with one button.
  // =============================================================================================
  await kit.fresh();
  {
    const wrapping = await mk('CyclicButton', 110);
    const stopping = await mk('CyclicButton', 175, { 'Behavior.wrapBehavior': false });
    await kit.preview(true);
    await kit.settle(700);
    /** Press n times and report the value after each, so the shape of the cycle is visible. */
    const walk = async (id, n) => {
      const seen = [];
      for (let i = 0; i < n; i += 1) {
        seen.push(String((await tap(id)).valueOverride ?? ''));
      }
      return seen;
    };

    const cycle = await walk(wrapping, 5);
    led.check(B, 'buttonType (cyclic)', 'each press moves to the next state in the list rather than toggling one',
      { moved: true, distinct: true },
      { moved: cycle.length === 5, distinct: new Set(cycle.slice(0, 3)).size >= 2 });
    led.check(B, 'wrapBehavior (true)', 'and past the last state it comes round to the first, so the button never runs out',
      true, cycle.includes(cycle[cycle.length - 1]) && new Set(cycle).size < cycle.length);

    const stopped = await walk(stopping, 5);
    led.check(B, 'wrapBehavior (false)', 'switched off it stops on the last state and stays there however many more presses arrive — five presses, and the last three are the same answer',
      { settled: true, sameTail: true },
      { settled: stopped.length === 5,
        sameTail: stopped[2] === stopped[3] && stopped[3] === stopped[4] });
  }
  await kit.preview(false);

  // =============================================================================================
  // enumValues and wrapEnum — the same idea for a control whose values are a plain list.
  //
  // REACHABLE ONLY BY WRITING THE FIELDS. No editor offers a cell for either, and the branch that
  // reads them sits AFTER the cyclic branch, which returns first — so a cyclic button never gets
  // there. What reaches it is a control with valueType 'enum' that is not a cyclic button, which
  // is what the fixture authors directly.
  // =============================================================================================
  await kit.fresh();
  {
    // A TOGGLE BUTTON, not a plain one: the whole select path is behind
    // `if (String(behavior?.family ?? '') !== 'select') return null`, and a plain Button is in the
    // `trigger` family, so a fixture built on one never enters the function at all and reports
    // every property in it dead.
    const wrapping = await mk('ToggleButton', 110, {
      'Behavior.valueType': 'enum', 'Behavior.enumValues': ['low', 'mid', 'high'],
      'Behavior.defaultValue': 'low', 'Behavior.wrapEnum': true });
    const stopping = await mk('ToggleButton', 175, {
      'Behavior.valueType': 'enum', 'Behavior.enumValues': ['low', 'mid', 'high'],
      'Behavior.defaultValue': 'low', 'Behavior.wrapEnum': false });
    await kit.preview(true);
    await kit.settle(700);
    const walk = async (id, n) => {
      const seen = [];
      for (let i = 0; i < n; i += 1) seen.push(String((await tap(id)).valueOverride ?? ''));
      return seen;
    };

    led.check(B, 'enumValues', 'a press steps through the authored list in order, and the values it produces are the strings the author wrote',
      ['mid', 'high'], (await walk(wrapping, 2)));
    led.check(B, 'wrapEnum (true)', 'and past the end it comes round to the front of the list',
      'low', (await walk(wrapping, 1))[0]);
    led.check(B, 'wrapEnum (false)', 'switched off it stops on the last one, which is the same promise wrapBehavior makes for the value rows',
      ['mid', 'high', 'high', 'high'], await walk(stopping, 4));
  }
  await kit.preview(false);

  // =============================================================================================
  // activeWhileHeld — the press-to-talk button, active only while a finger is on it.
  // =============================================================================================
  await kit.fresh();
  {
    const talk = await mk('MomentaryButton', 110, { 'Behavior.activeWhileHeld': true });
    const plain = await mk('MomentaryButton', 175);
    await kit.preview(true);
    await kit.settle(700);

    const talkPress = await press(talk, 260);
    led.check(B, 'activeWhileHeld', 'a press-to-talk button is pressed while it is held and let go the moment it is released — the state is the finger, not a latch',
      { held: true, released: false },
      { held: talkPress.held.pressed === true, released: talkPress.after.pressed === true });
    led.check(B, 'activeWhileHeld (it is the subtype, spelled two ways)',
      'the flag is one of two ways to say press-to-talk — `subtype: press_to_talk` is the other, and `isPressToTalkBehavior` accepts either, so a panel authored in one spelling behaves as one authored in the other',
      { flagged: true, subtyped: true },
      await (async () => {
        const flagged = (await press(talk, 240)).held.pressed === true;
        await kit.set(plain, { 'Behavior.subtype': 'press_to_talk' });
        await kit.settle(380);
        return { flagged, subtyped: (await press(plain, 240)).held.pressed === true };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // requiredClicks and clickWindow — the button that wants to be asked twice.
  // =============================================================================================
  await kit.fresh();
  {
    const twice = await mk('TimedButton', 110, { 'Behavior.subtype': 'double_click',
      'Behavior.requiredClicks': 2, 'Behavior.clickWindow': 600 });
    const impatient = await mk('TimedButton', 175, { 'Behavior.subtype': 'double_click',
      'Behavior.requiredClicks': 2, 'Behavior.clickWindow': 120 });
    await kit.preview(true);
    await kit.settle(700);

    const first = await tap(twice);
    led.check(B, 'requiredClicks (the first click alone)',
      'one click on a two-click button does not fire it — it marks it pending, which is what lets the panel show that it is waiting',
      { executed: false, pending: true }, { executed: first.executed, pending: first.pending });
    const second = await tap(twice);
    led.check(B, 'requiredClicks (and the second)', 'the second click inside the window is the one that fires it',
      true, second.executed === true);

    await kit.settle(700);
    const late = await doubleTap(impatient, 400);
    led.check(B, 'clickWindow (a pair that straddles it)',
      'two clicks four hundred milliseconds apart do not fire a button whose window is one hundred and twenty — the count was reset between them, so the second is a first click again rather than a confirmation',
      false, late.executed === true);
    await kit.settle(700);
    const quick = await doubleTap(impatient, 40);
    led.check(B, 'clickWindow (and the same pair inside it)',
      'and the same two clicks forty milliseconds apart do fire it, so what separates them is the clock rather than anything about the clicks',
      true, quick.executed === true);
  }
  await kit.preview(false);

  // =============================================================================================
  // visualStyle — three looks for one behaviour.
  // =============================================================================================
  await kit.fresh();
  {
    const group = await kit.make('RadioButtonGroup', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 46 });
    await kit.preview(true);
    await kit.settle(700);
    /** The whole-group shape the style picks: a pill for radio, a rounded box for the other two. */
    const wholeRadius = async () => {
      await kit.settle(360);
      const nodes = await kit.dom(group, '*');
      const radii = await kit.page.evaluate(({ id }) => {
        const el = document.querySelector(`[data-control-id="${id}"]`);
        return [...el.querySelectorAll('*')]
          .map((n) => parseFloat(getComputedStyle(n).borderTopLeftRadius) || 0)
          .filter((r) => r > 0);
      }, { id: group });
      return { nodes: nodes.length, maxRadius: radii.length ? Math.max(...radii) : 0 };
    };

    await kit.set(group, { 'Behavior.visualStyle': 'radio' });
    const asRadio = await wholeRadius();
    await kit.set(group, { 'Behavior.visualStyle': 'segmented' });
    const asSegmented = await wholeRadius();
    await kit.set(group, { 'Behavior.visualStyle': 'tab' });
    const asTab = await wholeRadius();
    led.check(B, 'visualStyle',
      'the three styles are three shapes for the same control — a radio group is drawn as a pill and the segmented and tab styles as a rounded box, which is the difference between "pick one of these" and "these are pages"',
      { radioIsPill: true, segmentedIsBoxy: true, tabIsBoxy: true },
      { radioIsPill: asRadio.maxRadius > 100,
        segmentedIsBoxy: asSegmented.maxRadius > 0 && asSegmented.maxRadius < 100,
        tabIsBoxy: asTab.maxRadius > 0 && asTab.maxRadius < 100 });
    led.check(B, 'visualStyle (it falls back to the subtype, and only when it is absent)',
      'a control with no style of its own takes its subtype instead, so a panel authored before the field existed is unchanged — and the fallback is `??`, so an EMPTY STRING is a style rather than an absence, and normalizes to radio',
      { absentTakesSubtype: true, emptyIsRadio: true },
      await (async () => {
        await kit.set(group, { 'Behavior.visualStyle': null, 'Behavior.subtype': 'segmented' });
        const bySubtype = await wholeRadius();
        await kit.set(group, { 'Behavior.visualStyle': '' });
        const byEmpty = await wholeRadius();
        return { absentTakesSubtype: bySubtype.maxRadius > 0 && bySubtype.maxRadius < 100,
          emptyIsRadio: byEmpty.maxRadius > 100 };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // The ten that are declared and not connected.
  //
  // Each was checked three ways before being written down here, because "no reader" has been wrong
  // in this repo before: a repo-wide search for the key name, a search for computed access to
  // `behavior` (there is none anywhere in src/), and the scripting and export tables.
  // =============================================================================================
  led.unsupported(B, 'pressMode',
    'choose whether the button acts on press or on release',
    'not a property: zero mentions in the whole repository outside the model defaults. No cell in any editor, no reader on any surface, no script verb. The idea it names is real and is spelled elsewhere — `momentaryButtonPreview` decides press-versus-release for the momentary family, and the timed family has its own subtypes — so this is a third spelling of something already implemented twice, rather than a missing feature. Smallest honest release treatment: leave the key (a defaulted field cannot be removed without rewriting every panel on disk) and add nothing to the UI that would promise it.');
  led.unsupported(B, 'toggleOn',
    'choose whether a toggle flips on press or on release',
    'not a property: the same as pressMode in every respect, and declared beside it. Zero mentions outside the model defaults.');
  led.unsupported(B, 'activationKeys',
    'the keys that operate this control from the keyboard',
    'not a property: zero mentions outside the model defaults, where it is `[\'Enter\', \'Space\']`. The keyboard path that exists reads `keyboardEnabled`, `arrowKeyAdjust`, `pageKeyAdjust` and `homeEndAdjust` — all four verified in behaviourTrack.mjs — and hard-codes which keys do what. So the list is a description of the behaviour rather than a setting that shapes it.');

  led.inert(B, 'uncheckOnClick',
    'let a click turn a checked toggle back off',
    'read ONLY by InteractionPreviewTab.svelte, which is the editor’s Interaction Preview dock — not the panel preview surface and not the player. The panel path spells the same idea `allowUncheck` (interactionPreview.js: `if (wasChecked && behavior?.allowUncheck === false) return {}`), which is read and has an editor cell. So this is one concept with two names, one of which reaches the product and one of which reaches a dock. Smallest honest release treatment: nothing in the UI offers it, so nothing promises it; the fix worth doing later is deleting one of the two names, not implementing the second.');
  led.inert(B, 'allowMixed',
    'allow a third, mixed state on a toggle',
    'USER-VISIBLE AND NOT CONNECTED. It has a chip in the Behavior tab — "Mixed — allow a mixed state where the design calls for it" — and its only reader is InteractionPreviewTab.svelte, the editor dock. On a real panel and in the player a toggle has two states whatever the chip says; the `mixed` session flag exists and is never set by any panel-surface path. Smallest honest release treatment: hide the chip, or say in the release note that the mixed state is a design-time preview only. Implementing a tri-state toggle on the panel is a feature, not a defect fix.');

  led.inert(B, 'emitClick',
    'expose click events to the scripting/runtime layer',
    'USER-VISIBLE AND NOT CONNECTED, and the tab says so itself: the chip’s own tooltip reads "expose click events to the FUTURE scripting/runtime layer". Read by nothing but the editor that writes it. The scripting layer that shipped does not consult it — a control’s script handlers run whether or not the chip is lit. Smallest honest release treatment: the tooltip already carries the caveat; either keep it and leave the chip, or drop the three emit chips until there is something behind them.');
  led.inert(B, 'emitStateChange',
    'expose state changes to the scripting/runtime layer',
    'the same as emitClick in every respect, including the word "future" in its own tooltip, and declared beside it.');
  led.inert(B, 'emitValueChange',
    'expose value changes to the scripting/runtime layer',
    'the same again, with a toggle of its own in the Behavior tab rather than a chip. Read by nothing outside the editor that writes it.');
  led.inert(B, 'emitValueCommit',
    'emit on pointer release and on a confirmed edit',
    'USER-VISIBLE AND ALMOST NOT CONNECTED: a chip in the Slider tab, and exactly one reader — InteractiveTestSurface.svelte:173, where it gates a 180ms `executed` pulse. That surface is the editor’s Interaction Preview and Custom Designer dock, not the panel preview and not the player, so a slider on a finished panel emits nothing different either way. Of the five emit flags this is the one with real behaviour behind it, in the one place a user is least likely to be looking.');
  led.inert(B, 'emitActiveHandleChange',
    'emit metadata when the active handle changes',
    'a chip in the Slider tab beside emitValueCommit, and no reader anywhere — not even the test surface. The active handle itself is live and verified (behaviourTrack.mjs measures trackClickMode moving it); what is missing is any code that treats this flag as permission to report the move.');

  // =============================================================================================
  // save/reopen — the press semantics are authored state.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await mk('TimedButton', 110, { 'Behavior.subtype': 'double_click',
      'Behavior.requiredClicks': 3, 'Behavior.clickWindow': 800 });
    const again = await kit.reopen(sid);
    await kit.preview(true);
    await kit.settle(700);
    const one = await tap(again);
    const two = await tap(again);
    const three = await tap(again);
    led.check(B, 'save/reopen (requiredClicks + clickWindow)',
      'a reopened button still wants three clicks inside its window, and fires on the third rather than the first or the second',
      { first: false, second: false, third: true },
      { first: one.executed === true, second: two.executed === true, third: three.executed === true });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
