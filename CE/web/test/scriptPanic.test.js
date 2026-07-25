import test from 'node:test';
import assert from 'node:assert/strict';
import { executeScript, createScriptContext, validateScript } from '../src/CE_Application/scripting/scriptRuntime.js';
import { emitScript, exportWarningsForScript } from '../src/CE_Application/scripting/scriptEmitters.js';
import { commandDescriptor } from '../src/CE_Application/scripting/scriptCommandRegistry.js';

function script(args) {
  return { id: 's1', event: 'onPress', target: 'btn', steps: [{ command: 'panic', args }] };
}
const ccOf = (out) => out.deviceMessages.map((m) => [m.channel, m.cc]);

test('a panic step expands to the silence set, in order', () => {
  const out = executeScript(script({ scope: 'channel', channel: 3 }), createScriptContext());
  assert.deepEqual(ccOf(out), [[3, 120], [3, 123], [3, 121]]);
  // same guarantee as the button: sound-off before notes-off
  assert.ok(out.deviceMessages.every((m) => m.type === 'cc' && m.value === 0));
  assert.ok(out.trace.some((t) => t.type === 'MIDI' && t.message.includes('panic ch3')));
});

test('scope and resetControllers carry through', () => {
  assert.equal(executeScript(script({}), createScriptContext()).deviceMessages.length, 48);
  assert.deepEqual(
    ccOf(executeScript(script({ scope: 'channel', channel: 1, resetControllers: false }), createScriptContext())),
    [[1, 120], [1, 123]],
  );
  const all = executeScript(script({ scope: 'all' }), createScriptContext());
  assert.equal(new Set(all.deviceMessages.map((m) => m.channel)).size, 16);
});

test('panic is a first-class portable command', () => {
  const d = commandDescriptor('panic');
  assert.equal(d.portable, true);
  assert.equal(d.exportSafe, true);
  assert.deepEqual(exportWarningsForScript(script({})), []);   // exports clean everywhere
  assert.equal(validateScript(script({ scope: 'channel', channel: 2 })).errors?.length ?? 0, 0);
});

test('every code target emits the CCs it stands for, not an undefined call', () => {
  const s = script({ scope: 'channel', channel: 2, resetControllers: true });
  for (const target of ['ce', 'lua', 'javascript', 'typescript', 'python', 'cpp', 'csharp', 'swift', 'go', 'kotlin', 'rust']) {
    const code = emitScript(s, target);
    assert.ok(!/\bpanic\s*\(/.test(code), `${target} emitted a panic() call no host defines`);
    for (const cc of [120, 123, 121]) {
      assert.ok(code.includes(String(cc)), `${target} is missing CC ${cc}`);
    }
  }
  // JSON is the round-trip format, so it keeps the step intact
  assert.equal(JSON.parse(emitScript(s, 'json')).steps[0].command, 'panic');
});
