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

/* -------------------------------------------------------- module opt-in (slice 3) */

test('a script reaching into a module the panel pinned off is an error, not a surprise', () => {
  const script = { source: 'function onX(){ sendCC(1, 74, 100) }', scope: 'panel', event: 'onX' };
  const panel = { scripting: { modules: ['ce.math'] }, scripts: [script] };

  const problems = validateScript(script, panel);
  const gate = problems.find((p) => p.message.includes('ce.midi'));
  assert.ok(gate, 'the missing module is reported');
  assert.equal(gate.severity, 'error', 'it will not work at runtime, so it is an error');
  assert.match(gate.message, /ce\.midi\.sendCC/, 'and names the member that needs it');
  assert.match(gate.message, /Scripting Modules/);
});

test('the same script is fine once the module is declared, and on auto', () => {
  const script = { source: 'function onX(){ sendCC(1, 74, 100) }', scope: 'panel', event: 'onX' };

  const declared = { scripting: { modules: ['ce.midi'] }, scripts: [script] };
  assert.deepEqual(validateScript(script, declared).filter((p) => p.message.includes('has not enabled')), []);

  // Auto never reports: the declaration follows the source, so there is nothing to act on.
  const auto = { scripts: [script] };
  assert.deepEqual(validateScript(script, auto).filter((p) => p.message.includes('has not enabled')), []);

  // …and with no panel passed at all, validation behaves exactly as it did before modules existed.
  assert.deepEqual(validateScript(script).filter((p) => p.message.includes('has not enabled')), []);
});
