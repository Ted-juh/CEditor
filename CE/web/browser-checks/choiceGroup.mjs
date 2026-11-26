/**
 * The choice group (RadioButtonGroup) in Preview, as redesigned (docs/design/choice-group.md):
 *
 *   - one frame at most: the segmented strip's options draw no box of their own, the chosen one is
 *     a filled thumb, and the radio, LED and tab looks draw no face at all
 *   - a two-way switch at 110 x 28 shows both its labels whole
 *   - the pointer lights the option it is over, not the group; a press darkens that option only
 *   - a click chooses the option under it, and one between options chooses nothing
 *   - one tab stop, a radiogroup of radios with aria-checked and aria-activedescendant; the arrows
 *     move the choice and wrap, and in a multi-select group (a group of checkboxes) they move the
 *     focus and Space chooses; the focused option wears a ring
 *
 *   node browser-checks/choiceGroup.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 1400, height: 900 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };
const rows = (labels, chosen = 0) => labels.map((text, index) => ({
  id: `r${index}`, displayText: text, internalValue: `r${index}`, sendValue: index, receiveValue: '',
  selectedByDefault: index === chosen, enabled: true, visualOverrides: {},
}));

/** Each drawn option: its key, label, ARIA, whether its body draws, its label's whole width shown. */
const options = (id) => page.evaluate((id) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return [...el.querySelectorAll('[data-choice-key]')].map((option) => {
    const label = option.querySelector('.choice-label');
    const rect = option.getBoundingClientRect();
    return {
      key: option.dataset.choiceKey,
      label: label.textContent,
      whole: label.scrollWidth <= label.clientWidth + 0.5,
      role: option.getAttribute('role'),
      checked: option.getAttribute('aria-checked'),
      id: option.id,
      body: !!option.querySelector('.choice-body'),
      bodyColour: option.querySelector('.choice-body *') ? getComputedStyle([...option.querySelectorAll('.choice-body *')].find((n) => getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)') ?? option).backgroundColor : '',
      focusRing: !!option.querySelector('.choice-focus'),
      centre: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      right: rect.x + rect.width,
    };
  });
}, id);
const group = (id) => page.evaluate((id) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return {
    role: el.getAttribute('role'),
    tabindex: el.getAttribute('tabindex'),
    active: el.getAttribute('aria-activedescendant'),
    focused: document.activeElement === el,
  };
}, id);
const value = async (id) => (await kit.session(id))?.valueOverride;

try {
  await kit.fresh();
  const strip = await kit.make('RadioButtonGroup', { 'Transform.x': 40, 'Transform.y': 40, 'Transform.width': 300, 'Transform.height': 32, 'Value.rows': rows(['Off', 'Saw', 'Square', 'Noise'], 1), 'Behavior.defaultValue': 'r1' });
  const small = await kit.make('RadioButtonGroup', { 'Transform.x': 40, 'Transform.y': 100, 'Transform.width': 110, 'Transform.height': 28, 'Value.rows': rows(['Off', 'On']), 'Behavior.defaultValue': 'r0' });
  const looks = {};
  let y = 150;
  for (const style of ['buttons', 'radio', 'led', 'tab']) {
    looks[style] = await kit.make('RadioButtonGroup', { 'Transform.x': 40, 'Transform.y': y, 'Transform.width': 300, 'Transform.height': 30, 'Value.rows': rows(['Off', 'Saw', 'Square', 'Noise'], 1), 'Behavior.defaultValue': 'r1', 'Behavior.visualStyle': style });
    y += 45;
  }
  const multi = await kit.make('RadioButtonGroup', { 'Transform.x': 40, 'Transform.y': y, 'Transform.width': 300, 'Transform.height': 30, 'Value.rows': rows(['Chorus', 'Delay', 'Reverb']), 'Behavior.defaultValue': 'r0', 'Behavior.selectionMode': 'multi', 'Behavior.allowDeselect': true, 'Behavior.visualStyle': 'buttons' });
  await kit.preview(true);
  await kit.settle(700);

  const atRest = await options(strip);
  check('a segmented strip: options draw no box of their own, the chosen one a thumb', () => {
    assert.deepEqual(atRest.map((option) => option.body), [false, true, false, false], JSON.stringify(atRest.map((o) => [o.label, o.body])));
    assert.ok(atRest.every((option) => option.whole), 'every label whole');
  });
  const switchOptions = await options(small);
  check('a two-way switch at 110 x 28 shows both its labels whole', () => {
    assert.deepEqual(switchOptions.map((option) => [option.label, option.whole]), [['Off', true], ['On', true]]);
  });

  const panelLooks = {};
  for (const style of ['radio', 'led', 'tab']) panelLooks[style] = await options(looks[style]);
  const keys = await options(looks.buttons);
  check('buttons are keys each; radio, LED and tabs draw no face, and every one marks the chosen option', () => {
    assert.ok(keys.every((option) => option.body), 'every key has a body');
    assert.notEqual(keys[1].bodyColour, keys[0].bodyColour, `the chosen key is filled differently: ${keys[1].bodyColour} vs ${keys[0].bodyColour}`);
    for (const style of ['radio', 'led', 'tab']) {
      assert.ok(panelLooks[style].every((option) => !option.body), `${style}: no option box`);
      assert.ok(panelLooks[style].every((option) => option.whole), `${style}: every label whole`);
    }
  });

  // The pointer over the fourth option: only that option lights; pressed, only it darkens.
  await page.mouse.move(atRest[3].centre.x, atRest[3].centre.y);
  await kit.settle(250);
  const hovered = await options(strip);
  await page.mouse.down();
  await kit.settle(150);
  const pressed = await options(strip);
  check('the pointer lights the option it is over, and a press darkens that option only', () => {
    assert.deepEqual(hovered.map((option) => option.body), [false, true, false, true], 'the chosen one and the one under the pointer');
    assert.equal(pressed[3].body, true);
    assert.notEqual(pressed[3].bodyColour, hovered[3].bodyColour, 'pressed is not hovered');
    assert.equal(pressed[0].body || pressed[2].body, false, 'the others untouched');
  });
  await page.mouse.up();
  await kit.settle(250);
  const afterClick = await value(strip);
  // In the gap between two keys: nothing is chosen (it used to choose the default option).
  const keysBefore = (await options(looks.buttons)).map((option) => option.checked);
  await page.mouse.click(keys[2].right + 2, keys[2].centre.y);
  await kit.settle(250);
  const keysAfter = (await options(looks.buttons)).map((option) => option.checked);
  await page.mouse.move(5, 880);
  check('a click chooses the option under it; one in the gap between two keys chooses nothing', () => {
    assert.equal(afterClick, 'r3');
    assert.deepEqual(keysAfter, keysBefore);
  });

  // The keyboard: one stop, a radiogroup of radios; the arrows move the choice and wrap.
  await page.evaluate((id) => document.querySelector(`[data-control-id="${id}"]`).focus(), strip);
  await page.keyboard.press('Home');
  await kit.settle(200);
  const home = await value(strip);
  await page.keyboard.press('ArrowLeft');
  await kit.settle(200);
  const wrapped = await value(strip);
  const aria = await group(strip);
  const ariaOptions = await options(strip);
  check('one tab stop, a radiogroup of radios; Home and the arrows move the choice, and wrap', () => {
    assert.equal(aria.tabindex, '0');
    assert.equal(aria.role, 'radiogroup');
    assert.equal(home, 'r0');
    assert.equal(wrapped, 'r3', 'left of the first is the last');
    assert.deepEqual(ariaOptions.map((option) => [option.role, option.checked]), [['radio', 'false'], ['radio', 'false'], ['radio', 'false'], ['radio', 'true']]);
    assert.equal(aria.active, ariaOptions[3].id, 'aria-activedescendant names the chosen option');
    assert.ok(ariaOptions[3].focusRing, 'which wears the focus ring');
  });

  await page.evaluate((id) => document.querySelector(`[data-control-id="${id}"]`).focus(), multi);
  await page.keyboard.press('ArrowRight');
  await kit.settle(200);
  const moved = (await options(multi)).map((option) => [option.checked, option.focusRing]);
  await page.keyboard.press('Space');
  await kit.settle(250);
  const added = await value(multi);
  const multiAria = await group(multi);
  const multiOptions = await options(multi);
  check('a multi-select group: checkboxes; the arrows move the focus, Space chooses', () => {
    assert.equal(multiAria.role, 'group');
    assert.deepEqual(moved, [['true', false], ['false', true], ['false', false]], 'the arrow moved the focus and chose nothing');
    assert.deepEqual(added, ['r0', 'r1']);
    assert.deepEqual(multiOptions.map((option) => [option.role, option.checked]), [['checkbox', 'true'], ['checkbox', 'true'], ['checkbox', 'false']]);
    assert.ok(multiOptions[1].focusRing);
  });

  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('choiceGroup: all checks passed');
} finally {
  await kit.close();
}
