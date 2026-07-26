import test from 'node:test';
import assert from 'node:assert/strict';

import { validateScript } from '../src/CE_Application/scripting/scriptValidate.js';

const hasHandlerWarning = (problems) =>
  problems.some((p) => /no function .*is defined/.test(p.message));

test('Python handler defined with `def` does not trigger the missing-handler warning', () => {
  const script = {
    id: 'p', name: 'Ready', event: 'onPanelReady', scope: 'panel', language: 'python',
    source: 'def onPanelReady(info):\n    if info.firstTime:\n        pass\n',
  };
  assert.equal(hasHandlerWarning(validateScript(script)), false);
});

test('Lua/JS handler defined with `function` still passes', () => {
  const lua = { id: 'l', event: 'onPanelReady', scope: 'panel', language: 'lua',
    source: 'function onPanelReady(info)\nend' };
  const js = { id: 'j', event: 'onPanelReady', scope: 'panel', language: 'javascript',
    source: 'function onPanelReady(info) {}' };
  assert.equal(hasHandlerWarning(validateScript(lua)), false);
  assert.equal(hasHandlerWarning(validateScript(js)), false);
});

test('missing handler still warns regardless of language', () => {
  const script = { id: 'm', event: 'onPanelReady', scope: 'panel', language: 'python',
    source: 'def somethingElse():\n    pass\n' };
  assert.equal(hasHandlerWarning(validateScript(script)), true);
});
