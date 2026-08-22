// stateRuleAuthoring.test.js — a state's `rule` must be editable, not just executable.
//
// The runtime has always honoured it: evaluateState() in interactionRuntime.js ANDs an optional
// compound condition with the `when` flags, and the custom-component starter templates ship states
// that depend on one (the Tabbed Pages container switches pages on `tab == 'a'`; the Status LED
// lights on `active >= 1`). The design surface even renders the rule as the filmstrip's trigger
// badge. What was missing was the other half: nothing in the States inspector could write one, so
// a rule that arrived with a template could be read and never changed, and no user could author a
// new one at all.
//
// That is the failure mode this file exists to catch, because every part of it works in isolation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

test('the States inspector can author a rule, with the shared builder', () => {
  const s = src('CE_Application/sections/StatesEditor.svelte');
  assert.match(s, /import ConditionBuilder from '\.\/ConditionBuilder\.svelte'/);
  assert.match(s, /value=\{selectedState\.rule \?\? ''\}/, 'the builder must be bound to state.rule');
  assert.match(s, /setStateProp\('rule', next\)/, 'and must write it back');
  // Operands come from the component's own channels, the same source Hit Zones and Links use.
  assert.match(s, /getSection\(control, 'ValueChannels'\)/);
});

test('the runtime ANDs the rule with the when flags', async () => {
  const s = src('CE_Application/utils/interactionRuntime.js');
  const fn = s.slice(s.indexOf('function evaluateState'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /customConditionMatches\(rule/, 'the rule is evaluated in the shared language');
  assert.ok(
    body.indexOf('customConditionMatches(rule') < body.indexOf('state.when'),
    'a failing rule must short-circuit before the flags are considered',
  );
});

test('a state authored with only a rule still activates', async () => {
  // The regression this guards: treating an empty `when` as "no trigger" and refusing the state.
  const { customConditionMatches } = await import('../src/CE_Application/utils/customComponentInteraction.js');
  assert.equal(customConditionMatches("tab == 'a'", { tab: 'a' }), true);
  assert.equal(customConditionMatches("tab == 'a'", { tab: 'b' }), false);
  assert.equal(customConditionMatches('active >= 1', { active: 1 }), true);
  assert.equal(customConditionMatches('active >= 1', { active: 0 }), false);
  // Flags are legal operands too, which is why the builder is offered on plain controls that
  // have no ValueChannels section at all.
  assert.equal(customConditionMatches('hover == true', { hover: true }), true);
});

test('the starter templates that depend on a rule still carry one', () => {
  const s = src('CE_Application/utils/customComponentFactory.js');
  assert.match(s, /rule: 'active >= 1'/, 'the Status LED starter');
  assert.match(s, /rule: `tab == '\$\{value\}'`/, 'the Tabbed Pages container starter');
});
