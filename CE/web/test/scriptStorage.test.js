// scriptStorage.test.js — ce.storage (design doc §43).
//
// Two gaps, and neither is a Properties-panel gap: there is no property anywhere that means "keep
// this between sessions", so the whole module is already past that bar. The gaps are internal.
//
//  1. `state` was per-script and SAID so. Settings were panel-wide and said nothing, so two scripts
//     both saving "count" clobbered each other in silence. Three scopes now, and a scope this build
//     does not know is refused rather than quietly treated as "panel".
//  2. There was no way to turn a structure into a string. The Lua engine opens base, math, string
//     and table — no json module — and JavaScript and Python have one each with different names and
//     different edge cases. So a cross-runtime script could not encode a patch for a SysEx payload,
//     or read a config somebody typed into a text control.
//
// What this file pins is mostly the second thing, because it is where four runtimes can disagree.
// The encoder is written out by hand in Lua and Python rather than handed to a library, precisely
// so that one structure has ONE encoding; the fixtures below are the ones the cross-runtime test in
// scriptPreludeAgreement.test.js replays against the three engine preludes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import {
  MEMBER_BY_ID, MODULES, memberPath, memberRuntime, RUNTIME_ANY,
} from '../src/CE_Application/scripting/panelApi.js';
import {
  JSON_CASES, JSON_DECODE_CASES, JSON_REJECTS, NATIVE_ENCODE_CASES,
} from './fixtures/jsonCases.js';

/** A panel, and one or two scripts on it. Every test drives its own document. */
function withPanel(fn, ids = ['scriptA', 'scriptB']) {
  const panel = { id: 'p', name: 'P', scripting: { modules: ['ce.storage'] }, controls: [] };
  setRuntimeHost({ panel });
  try {
    return fn(...ids.map((id) => scriptApiForTesting('', id)), panel);
  } finally {
    setRuntimeHost(null);
  }
}

const api = scriptApiForTesting('', 'storage-probe');

/* ------------------------------------------------------------------------ the contract */

test('every phase-17 verb is declared, runs in both runtimes, and is namespaced under ce.storage', () => {
  for (const [id, path] of [
    ['allSettings', 'ce.storage.all'], ['clearSettings', 'ce.storage.clear'],
    ['storageInfo', 'ce.storage.info'], ['encodeJson', 'ce.storage.encode'],
    ['decodeJson', 'ce.storage.decode'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // None of these needs the window: they are the store and pure text. A setting a script can only
    // read in the editor would be worse than no setting at all.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
  }
});

test('the flat aliases keep a qualifier where the bare word is one a panel author would reach for', () => {
  // §1's rule. `all`, `clear`, `info`, `encode` and `decode` are all words a script would want for
  // itself, so the flat spelling carries what it is about.
  for (const bare of ['all', 'clear', 'info', 'encode', 'decode']) {
    assert.equal(MEMBER_BY_ID[bare], undefined, `"${bare}" must not be a flat global`);
  }
  assert.equal(MODULES.find((m) => m.id === 'ce.storage').version, '1.2');
});

/* ------------------------------------------------------------------------ scopes */

test('panel scope is shared, which is what settings have always been', () => {
  withPanel((a, b) => {
    assert.equal(a.saveSetting('count', 1), true);
    assert.equal(b.loadSetting('count'), 1, 'the other script reads the same value');
    b.saveSetting('count', 2);
    assert.equal(a.loadSetting('count'), 2, 'and writes over it, which is the point of the scope');
  });
});

test('script scope is private, the way state already is', () => {
  withPanel((a, b) => {
    a.saveSetting('count', 10, { scope: 'script' });
    b.saveSetting('count', 20, { scope: 'script' });
    assert.equal(a.loadSetting('count', null, { scope: 'script' }), 10);
    assert.equal(b.loadSetting('count', null, { scope: 'script' }), 20);
    // …and neither of them is the shared one. This is the silence the phase was about: before,
    // these three were one value.
    a.saveSetting('count', 1);
    assert.equal(a.loadSetting('count'), 1);
    assert.equal(a.loadSetting('count', null, { scope: 'script' }), 10);
    assert.equal(b.loadSetting('count', null, { scope: 'script' }), 20);
  });
});

test('a private setting still lives in the panel store, so it persists and travels like a shared one', () => {
  withPanel((a, _b, panel) => {
    a.saveSetting('secret', 7, { scope: 'script' });
    const keys = Object.keys(panel.scripting.settings);
    assert.equal(keys.length, 1);
    // The owner is IN the key. A second store would have been a second thing to save, load, export
    // and migrate; a prefix is none of those.
    assert.ok(keys[0].includes('scriptA'), `expected the owner in the stored key, got ${JSON.stringify(keys[0])}`);
    assert.equal(panel.scripting.settings[keys[0]], 7);
  });
});

test('the private-key prefix is U+0001, because U+0000 would not survive juce::String', () => {
  withPanel((a, _b, panel) => {
    a.saveSetting('k', 1, { scope: 'script' });
    const stored = Object.keys(panel.scripting.settings)[0];
    assert.equal(stored, '\u0001script:scriptA:k');
    // A NUL would truncate on the C++ side, and then the editor and the export would disagree
    // about what a private key is even called.
    assert.ok(!stored.includes('\u0000'));
  });
});

test('a panel listing hides other scripts’ private keys rather than showing an unusable spelling', () => {
  withPanel((a, b) => {
    a.saveSetting('shared', 1);
    a.saveSetting('mine', 2, { scope: 'script' });
    b.saveSetting('theirs', 3, { scope: 'script' });
    assert.deepEqual(a.listSettings().sort(), ['shared']);
    assert.deepEqual(a.listSettings({ scope: 'script' }), ['mine']);
    assert.deepEqual(b.listSettings({ scope: 'script' }), ['theirs']);
  });
});

test('an unknown scope is refused, not quietly treated as panel', () => {
  withPanel((a, _b, panel) => {
    // The failure mode this prevents: a typo in a scope name turning a private setting into a
    // shared one, silently, at the moment it is written.
    assert.equal(a.saveSetting('k', 1, { scope: 'sript' }), false);
    // …and nothing was even created to put it in.
    assert.deepEqual(panel.scripting.settings ?? {}, {});
    assert.equal(a.loadSetting('k', 'fallback', { scope: 'sript' }), 'fallback');
    assert.deepEqual(a.listSettings({ scope: 'sript' }), []);
    assert.deepEqual(a.allSettings({ scope: 'sript' }), {});
    assert.equal(a.clearSettings({ scope: 'sript' }), 0);
    assert.equal(a.storageInfo({ scope: 'sript' }), undefined);
    assert.equal(a.forgetSetting('k', { scope: 'sript' }), false);
  });
});

test('a scope may be given as a bare string as well as an option, because that is how it reads', () => {
  withPanel((a) => {
    a.saveSetting('k', 5, 'script');
    assert.equal(a.loadSetting('k', null, 'script'), 5);
    assert.equal(a.loadSetting('k', 'none'), 'none');
  });
});

test('local scope is never written into the panel document', () => {
  withPanel((a, _b, panel) => {
    // No localStorage in a test run, which is exactly the "this build has no machine-local store"
    // case: the write must FAIL rather than quietly land in the document.
    assert.equal(typeof localStorage, 'undefined');
    assert.equal(a.saveSetting('port', 'IAC', { scope: 'local' }), false);
    assert.deepEqual(panel.scripting.settings ?? {}, {},
      'a machine-local setting must never end up in a panel somebody else will open');
    assert.equal(a.storageInfo({ scope: 'local' }).available, false,
      'and info() is where a script finds that out, rather than per key');
  });
});

/* ------------------------------------------------------------------------ bulk reads */

test('all() is the read every other module already had', () => {
  withPanel((a) => {
    a.saveSetting('bank', 'A');
    a.saveSetting('volume', 100);
    // Before this, the only way to see the settings was listSettings() and a loop.
    assert.deepEqual(a.allSettings(), { bank: 'A', volume: 100 });
    assert.deepEqual(a.allSettings({ scope: 'script' }), {});
  });
});

test('clear() says how many went, and leaves the other scopes alone', () => {
  withPanel((a, b) => {
    a.saveSetting('one', 1);
    a.saveSetting('two', 2);
    a.saveSetting('mine', 3, { scope: 'script' });
    b.saveSetting('theirs', 4, { scope: 'script' });

    assert.equal(a.clearSettings(), 2);
    assert.deepEqual(a.listSettings(), []);
    // "clear my settings" must not mean "clear everybody's": both private stores survive a panel
    // clear, and clearing one script's leaves the other's.
    assert.equal(a.loadSetting('mine', null, { scope: 'script' }), 3);
    assert.equal(b.loadSetting('theirs', null, { scope: 'script' }), 4);
    assert.equal(a.clearSettings({ scope: 'script' }), 1);
    assert.equal(b.loadSetting('theirs', null, { scope: 'script' }), 4);
  });
});

test('info() reports the store a scope is talking to and what is in it', () => {
  withPanel((a) => {
    a.saveSetting('bank', 'A');
    assert.deepEqual(a.storageInfo(), {
      scope: 'panel', backing: 'project', available: true, count: 1,
      bytes: a.encodeJson({ bank: 'A' }).length,
    });
    assert.equal(a.storageInfo({ scope: 'local' }).backing, 'machine');
    // available is the honest field, and it is about the STORE, not about whether anything is in
    // it: an empty panel store is available, an absent machine store is not.
    assert.equal(a.storageInfo({ scope: 'script' }).available, true);
    assert.equal(a.storageInfo({ scope: 'script' }).count, 0);
  });
});

test('an empty listing means nothing written, which is not the same as no store', () => {
  withPanel((a) => {
    assert.deepEqual(a.listSettings(), []);
    assert.equal(a.storageInfo().available, true, 'nothing saved yet, but the store is there');
    assert.equal(a.storageInfo({ scope: 'local' }).available, false, 'this one genuinely is not');
  });
});

test('forget() still says whether there was one, in every scope', () => {
  withPanel((a) => {
    a.saveSetting('k', 1, { scope: 'script' });
    assert.equal(a.forgetSetting('k', { scope: 'script' }), true);
    assert.equal(a.forgetSetting('k', { scope: 'script' }), false);
    assert.equal(a.forgetSetting('k'), false, 'and a panel key of the same name was never there');
  });
});

test('saveSetting reports a write it could not make', () => {
  // No host and no editor panel: there is nowhere to put it. This used to be indistinguishable
  // from success, which is the worst possible answer for something whose whole job is persistence.
  setRuntimeHost(null);
  assert.equal(api.saveSetting('k', 1), false);
  assert.equal(api.loadSetting('k', 'gone'), 'gone');
});

/* ------------------------------------------------------------------------ JSON */

test('encode and decode round-trip every fixture the three engine preludes are held to', () => {
  for (const { name, value, json } of JSON_CASES) {
    assert.equal(api.encodeJson(value), json, `encode ${name}`);
    if (value !== null && typeof value === 'object') {
      assert.deepEqual(api.decodeJson(json), value, `decode ${name}`);
    }
  }
});

test('keys come out sorted, at every depth, because Lua cannot produce any other order', () => {
  // A Lua table has NO insertion order to preserve. Sorted is the only ordering all four runtimes
  // are able to produce — and it is the ordering that makes two encodings comparable, which is half
  // of what encode is for.
  assert.equal(api.encodeJson({ b: 1, a: 2, c: { z: 1, y: { n: 1, m: 2 } } }),
    '{"a":2,"b":1,"c":{"y":{"m":2,"n":1},"z":1}}');
  // Same structure, other insertion order, same text. That is the property.
  assert.equal(api.encodeJson({ c: { y: { m: 2, n: 1 }, z: 1 }, a: 2, b: 1 }),
    api.encodeJson({ b: 1, a: 2, c: { z: 1, y: { n: 1, m: 2 } } }));
});

test('indent pretty-prints, and the shape is the one every runtime writes', () => {
  assert.equal(api.encodeJson({ b: 2, a: 1 }, { indent: 2 }), '{\n  "a": 1,\n  "b": 2\n}');
  assert.equal(api.encodeJson([1, [2]], { indent: 2 }), '[\n  1,\n  [\n    2\n  ]\n]');
  assert.equal(api.encodeJson({ a: {} }, { indent: 2 }), '{\n  "a": {}\n}');
  assert.equal(api.encodeJson({ b: 2, a: 1 }, { indent: 0 }), '{"a":1,"b":2}');
});

test('a value with no JSON form yields nothing, rather than a string that is not the value', () => {
  const cycle = {};
  cycle.self = cycle;
  assert.equal(api.encodeJson(cycle), undefined);
  assert.equal(api.encodeJson(() => 1), undefined);
  assert.equal(api.encodeJson(undefined), undefined);
  // Inside a structure the rules are JSON.stringify's, which the other three were written to match:
  // an object member is dropped, an array element is null.
  assert.equal(api.encodeJson({ a: 1, f: () => 1 }), '{"a":1}');
  assert.equal(api.encodeJson([1, () => 1]), '[1,null]');
});

test('decode says nothing for text that is not JSON, which is what tells malformed from empty', () => {
  for (const bad of [...JSON_REJECTS, 'null']) {
    assert.equal(api.decodeJson(bad), undefined, `${JSON.stringify(bad)} is not a value`);
  }
  assert.deepEqual(api.decodeJson('{}'), {});
});

test('decode reads every fixture the three engine preludes are held to', () => {
  for (const { text, json } of JSON_DECODE_CASES) {
    assert.equal(api.encodeJson(api.decodeJson(text)), json, `decode ${JSON.stringify(text)}`);
  }
});

test('the shapes a JavaScript value cannot express still encode the way the other runtimes do', () => {
  // These are the entries the cross-runtime test writes out once per language, because `1.0` is a
  // float in Lua and Python and an integer here. Evaluating the JavaScript spelling keeps this
  // side of the list honest rather than only documented.
  for (const c of NATIVE_ENCODE_CASES) {
    // eslint-disable-next-line no-new-func
    assert.equal(api.encodeJson(new Function(`return (${c.javascript});`)()), c.json, c.name);
  }
});

test('JSON null reads as nothing, because a Lua table cannot hold one', () => {
  // Not a preference. A value the four runtimes cannot all hold is not a value this API has, so
  // rather than three shapes in three engines there is one: the member is absent, the element is
  // skipped.
  assert.deepEqual(api.decodeJson('{"a":1,"b":null}'), { a: 1 });
  assert.deepEqual(api.decodeJson('[1,null,2]'), [1, 2]);
  assert.deepEqual(api.decodeJson('{"a":{"b":null,"c":[null,1]}}'), { a: { c: [1] } });
});

test('a setting survives an encode round-trip, which is what makes it a transport', () => {
  withPanel((a) => {
    const patch = { name: 'Lead', cutoff: 0.75, notes: [60, 64, 67] };
    a.saveSetting('patch', a.encodeJson(patch));
    assert.deepEqual(a.decodeJson(a.loadSetting('patch')), patch);
  });
});
