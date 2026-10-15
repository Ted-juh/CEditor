// sharedWriteDiagnostics.test.js — a write into a shared, frozen section explains itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { describeSharedWrite, installSharedWriteDiagnostics } from '../src/CE_Application/utils/sharedWriteDiagnostics.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function thrownBy(write) {
  try { write(); } catch (error) { return error; }
  assert.fail('the write did not throw');
}

test('the three ways to write into a frozen object are each explained, with the engine\'s own words kept', () => {
  const frozen = Object.freeze({ radius: 4 });
  for (const error of [
    thrownBy(() => { frozen.radius = 5; }),
    thrownBy(() => { frozen.colour = 'FF000000'; }),
    thrownBy(() => { delete frozen.radius; }),
  ]) {
    const text = describeSharedWrite(error);
    assert.ok(text, `explained: ${error.message}`);
    assert.ok(text.includes(error.message));
    assert.match(text, /setNestedValueShared/);
  }
});

test('JavaScriptCore\'s wording, the player\'s engine on Linux, is recognised too', () => {
  for (const message of ['Attempted to assign to readonly property.', 'Attempting to define property on object that is not extensible.', 'Unable to delete property.']) {
    assert.ok(describeSharedWrite(new TypeError(message)), message);
  }
});

test('other errors are left alone', () => {
  assert.equal(describeSharedWrite(new TypeError('x is not a function')), null);
  assert.equal(describeSharedWrite(new Error('Cannot assign to read only property')), null, 'only a TypeError');
  assert.equal(describeSharedWrite(undefined), null);
});

test('a write into a section GAIA\'s controls share is the error it explains', () => {
  const rel = 'CE/panels/Roland GAIA SH-01.cepanel';
  const panel = deserializePanel(readText(path.join(REPO, rel)), rel, null);
  // The first section of any control that is shared, and a plain value in it.
  const section = panel.controls.flatMap((c) => Object.values(c._children))
    .find((s) => s && typeof s === 'object' && Object.isFrozen(s) && Object.values(s).some((v) => typeof v !== 'object'));
  assert.ok(section, 'GAIA has shared sections');
  const key = Object.keys(section).find((k) => typeof section[k] !== 'object');
  assert.ok(describeSharedWrite(thrownBy(() => { section[key] = 'changed'; })));
});

test('uncaught errors and rejections are explained once per message, and the listeners can be removed', () => {
  const target = new EventTarget();
  const logged = [];
  const remove = installSharedWriteDiagnostics(target, (text) => logged.push(text));
  const error = thrownBy(() => { Object.freeze({ a: 1 }).a = 2; });
  const errorEvent = (e) => Object.assign(new Event('error'), { error: e });
  target.dispatchEvent(errorEvent(error));
  target.dispatchEvent(errorEvent(error));
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: thrownBy(() => { delete Object.freeze({ b: 1 }).b; }) }));
  target.dispatchEvent(errorEvent(new TypeError('x is not a function')));
  assert.equal(logged.length, 2, 'one for the repeated write, one for the rejection, none for the unrelated error');
  remove();
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: thrownBy(() => { Object.freeze({}).c = 1; }) }));
  assert.equal(logged.length, 2);
});
