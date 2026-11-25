// animValueKinds.test.js — the Values tab on the Animation Designer's script calls: an effect's name
// offered from the library and the panel's presets, each with what its preview plays; a swap's text
// effect; a scene's name; where on a control an effect plays, offered as the control's places.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readAnimEffect, readSwapEffect, readScene, readAnimTarget, effectCards, targetChoices } from '../src/CE_Application/scripting/animValueKinds.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { SCENE_EFFECTS } from '../src/CE_Application/utils/sceneModel.js';
import { panelControls } from '../src/CE_Application/scripting/scriptValueKinds.js';
import { valueCompletions } from '../src/CE_Application/scripting/valueCompletions.js';

function panel() {
  const knob = createControl('Knob', { Core: { id: 'k1', name: 'Cutoff' } });
  knob._children.Behavior.scaleNumberCount = 6;
  const title = createControl('Label', { Core: { id: 'l1', name: 'Title' } });
  return {
    id: 'p', name: 'P', controls: [knob, title],
    animationScenes: [{ id: 'sc_intro', name: 'Intro', trigger: { type: 'panelOpen' }, length: 1000, loop: false, clips: [] }],
    animationPresets: [{
      format: 'ceditor-animation-preset', id: 'ap_1', name: 'Echo press', revision: 1, size: 'effect',
      animations: { echo: { _type: 'Animation', name: 'echo', kind: 'keyframes', duration: 400, frames: [{ at: 0, scale: 1 }, { at: 1, scale: 1.1 }], targets: [{ path: 'Transform' }] } },
    }],
  };
}

test('an effect\'s name is a choice of the library\'s and the panel\'s presets, each card with what its preview plays', () => {
  const p = panel();
  const fade = readAnimEffect('Fade in', { panel: p });
  assert.equal(fade.problem, null);
  assert.equal(fade.meaning.found, true);
  assert.equal(fade.meaning.entry.effect.kind, 'keyframes');
  assert.ok(fade.meaning.choices.includes('Pop'));
  assert.ok(fade.meaning.choices.includes('Echo press'), 'a preset the panel carries');
  assert.equal(readAnimEffect('move:pop', { panel: p }).meaning.found, true, 'or by its id');
  const cards = effectCards(p);
  assert.equal(cards.length, SCENE_EFFECTS.length + 1);
  assert.ok(cards.every((card) => card.entry?.effect), 'every card can preview');
  const wrong = readAnimEffect('Fade inn', { panel: p });
  assert.equal(wrong.meaning.found, false);
  assert.match(wrong.problem.message, /^ce\.anim\.effect: no effect or preset called "Fade inn"\. .*Did you mean "Fade in"\?/);
});

test('a swap\'s effect is a text effect, by name, its "in" what the preview plays', () => {
  const roll = readSwapEffect('Roll in');
  assert.equal(roll.meaning.found, true);
  assert.equal(roll.meaning.entry.effect.effect, 'roll');
  assert.deepEqual(roll.meaning.choices, ['typewriter', 'explode', 'roll', 'push', 'wipe', 'crossfade', 'shimmer']);
  assert.equal(roll.meaning.choiceNames.roll, 'Roll');
  assert.match(readSwapEffect('zoom').problem.message, /is not a text effect; try typewriter/);
});

test('a scene is one of the panel\'s, by name or id, and a wrong one lists them', () => {
  const p = panel();
  assert.equal(readScene('intro', { panel: p }).meaning.found, true);
  assert.equal(readScene('sc_intro', { panel: p }).meaning.sceneId, 'sc_intro');
  assert.match(readScene('Outro', { panel: p, verb: 'ce.anim.seek' }).problem.message, /^ce\.anim\.seek: this panel has no scene called "Outro"\. Its scenes: Intro\./);
});

test('a target is offered as its control\'s places, each named as the timeline names it', () => {
  const p = panel();
  const controls = panelControls(p);
  const numbers = readAnimTarget('Cutoff.tickNumber', { controls });
  assert.equal(numbers.meaning.found, true);
  assert.equal(numbers.meaning.place, 'Parts.tickNumber');
  const { choices, choiceNames } = targetChoices(controls[0]);
  assert.equal(choices[0], 'Cutoff');
  assert.equal(choiceNames.Cutoff, 'Whole control');
  assert.ok(choices.includes('Cutoff.Value'));
  assert.ok(choices.includes('Cutoff.tickNumber'));
  assert.ok(!choices.includes('Cutoff.Text'), 'a knob has no words of its own');
  assert.ok(targetChoices(controls[1]).choices.includes('Title.Text'));
  assert.match(readAnimTarget('Cutoff.nothing', { controls }).problem.message, /"nothing" is not on Cutoff/);
  const nobody = readAnimTarget('Cutof', { controls });
  assert.deepEqual(nobody.meaning.choices, ['Cutoff', 'Title']);
  assert.match(nobody.problem.message, /no control named "Cutof"\. Did you mean "Cutoff"\?/);
});

test('in a script, the calls\' values are read as these kinds and written back as choices', () => {
  const p = panel();
  const effect = readStatement('ce.anim.effect("Cutoff.tickNumber", "Typewriter in")', 'lua', 2, { panel: p }).calls[0];
  const kinds = effect.args.map((arg) => [arg.name, arg.kind, arg.editable]);
  assert.deepEqual(kinds.slice(0, 2), [['target', 'animTarget', 'choice'], ['effect', 'animEffect', 'choice']]);
  const swap = readStatement('ce.anim.swap("Title", "Saw", "roll")', 'lua', 2, { panel: p }).calls[0];
  assert.equal(swap.args.find((arg) => arg.name === 'target').kind, 'control');
  assert.deepEqual(['kind', 'editable'].map((key) => swap.args.find((arg) => arg.name === 'effect')[key]), ['swapEffect', 'choice']);
  const play = readStatement('ce.anim.play("Intro")', 'lua', 2, { panel: p }).calls[0];
  assert.equal(play.args[0].kind, 'scene');
  assert.equal(play.args[0].meaning.found, true);
  const own = readStatement('ce.anim.play("Cutoff", "Pulse")', 'lua', 2, { panel: p }).calls[0];
  assert.equal(own.args[0].kind, 'control', 'with an animation after it, a control, as before');
  const seek = readStatement('ce.anim.seek("Intro", 0.5)', 'lua', 2, { panel: p }).calls[0];
  assert.equal(seek.args[0].kind, 'scene');
});

test('Ctrl+Space in the code offers the same: effects by category, scenes, a control\'s places by name', () => {
  const p = panel();
  const effects = 'ce.anim.effect("Cutoff", "Fa")';
  const offered = valueCompletions(effects, 'lua', effects.indexOf('Fa') + 2, { panel: p }, { force: true });
  assert.deepEqual(offered.options.slice(0, 2).map((row) => [row.label, row.detail]), [['Fade in', 'Move'], ['Fade out', 'Move']]);
  const scenes = 'ce.anim.play("In")';
  assert.deepEqual(valueCompletions(scenes, 'lua', scenes.indexOf('In') + 2, { panel: p }, { force: true }).options.map((row) => [row.label, row.detail]), [['Intro', 'scene']]);
  const places = 'ce.anim.effect("Cutoff.tickN", "Pop")';
  const where = valueCompletions(places, 'lua', places.indexOf('.tickN') + 6, { panel: p }, { force: true });
  assert.deepEqual(where.options.find((row) => row.label === 'Cutoff.tickNumber')?.detail, 'Ticks › Numbers');
});
