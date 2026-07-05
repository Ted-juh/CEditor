import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { customConditionMatches } from '../src/CE_Application/utils/customComponentInteraction.js';
import { createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';

// Minimal CustomComponent with one part and one rule-driven state that
// patches the part's opacity while the rule holds.
function makeControl(state) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'c1', controlType: 'CustomComponent' },
      ValueChannels: {
        _type: 'ValueChannels',
        _children: {
          level: createValueChannel('level', { min: 0, max: 1, defaultValue: 0 }),
          mode: createValueChannel('mode', { type: 'enum', defaultValue: 'A' }),
        },
      },
      Parts: {
        _type: 'Parts',
        _children: {
          lamp: { _type: 'Part', name: 'lamp', opacity: 0.2, _children: { Layout: {} } },
        },
      },
      States: {
        _type: 'States',
        _children: { lit: state },
      },
    },
  };
}

function litState(rule, when = {}) {
  return {
    _type: 'State',
    name: 'lit',
    enabled: true,
    rule,
    when,
    patches: { parts: { lamp: { opacity: 1 } } },
  };
}

function lampOpacity(resolved) {
  return resolved.control._children.Parts._children.lamp.opacity;
}

test('a state rule over a non-enum channel activates the state', () => {
  const control = makeControl(litState('level > 0.5'));
  const active = resolveInteractiveControl(control, { customValues: { level: 0.8 } });
  assert.equal(lampOpacity(active), 1);

  const inactive = resolveInteractiveControl(control, { customValues: { level: 0.2 } });
  assert.equal(lampOpacity(inactive), 0.2);
});

test('compound && rules combine numeric and enum channels', () => {
  const control = makeControl(litState("level > 0.5 && mode == 'B'"));
  const both = resolveInteractiveControl(control, { customValues: { level: 0.9, mode: 'B' } });
  assert.equal(lampOpacity(both), 1);

  const onlyLevel = resolveInteractiveControl(control, { customValues: { level: 0.9, mode: 'A' } });
  assert.equal(lampOpacity(onlyLevel), 0.2);
});

test('|| rules activate when either side holds', () => {
  const control = makeControl(litState("level >= 1 || mode == 'B'"));
  const byMode = resolveInteractiveControl(control, { customValues: { level: 0, mode: 'B' } });
  assert.equal(lampOpacity(byMode), 1);

  const neither = resolveInteractiveControl(control, { customValues: { level: 0, mode: 'A' } });
  assert.equal(lampOpacity(neither), 0.2);
});

test('rule is ANDed with when-flags', () => {
  const control = makeControl(litState('level > 0.5', { hover: true }));
  const ruleOnly = resolveInteractiveControl(control, { customValues: { level: 0.9 }, hover: false });
  assert.equal(lampOpacity(ruleOnly), 0.2);

  const both = resolveInteractiveControl(control, { customValues: { level: 0.9 }, hover: true });
  assert.equal(lampOpacity(both), 1);
});

test('rules can reference interaction flags directly', () => {
  const control = makeControl(litState('hover == true && level > 0.5'));
  const active = resolveInteractiveControl(control, { customValues: { level: 0.9 }, hover: true });
  assert.equal(lampOpacity(active), 1);
});

test('customConditionMatches is exported and evaluates compound expressions', () => {
  assert.equal(customConditionMatches("a > 1 && b == 'x'", { a: 2, b: 'x' }), true);
  assert.equal(customConditionMatches("a > 1 && b == 'x'", { a: 0, b: 'x' }), false);
  assert.equal(customConditionMatches('', {}), true);
});
