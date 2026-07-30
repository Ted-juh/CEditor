// panelCollections.test.js — the structure INSIDE a control (design doc §31).
//
// The gap this closes was found by asking the only question that matters for this API: what can the
// Properties panel do that a script cannot? For plain values, nothing — set/get reach every leaf.
// For structure, the panel could add to and remove from eleven sections of a control and a script
// could not: `Children` was covered by ce.panel.create/destroy, and the other ten were reachable
// only by writing a whole node as one value, with no way to remove one at all.
//
// Every one of those failures was SILENT, which is why the reporting fix is in this file too: it is
// what makes the rest of the gap visible instead of theoretical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue, probeNestedWrite } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';

// Mirrors playerScriptHost: a LIVE value moves through the preview session and needs no Value
// section, so it always lands; anything else is a plain model write that reports whether it did.
function hostFor(panel) {
  return {
    panel,
    scripts: [],
    readValue: (c, p) => valueAtPath(c, p),
    writeValue: (c, p, v) => (String(p).toLowerCase() === 'value.value'
      ? (setNestedValue(c, p, v), true)
      : setNestedValue(c, p, v)),
  };
}

function withControl(type, fn) {
  const control = createControl(type, { name: 'k' });
  const panel = {
    id: 'p', name: 'P', width: 400, height: 300, controls: [control],
    scripting: { modules: ['ce.core', 'ce.panel'] },
  };
  setRuntimeHost(hostFor(panel));
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'struct-script'), control, panel); } finally { setRuntimeHost(null); }
}

const traced = () => get(scriptTrace).map((t) => `${t.kind}:${t.message}`).join('\n');
const kidsOf = (control, section) => Object.keys(control._children[section]?._children ?? {});

/* -------------------------------------------------------------------------- the contract */

test('the five verbs are declared, namespaced and panel-view only', () => {
  for (const [id, path] of [
    ['panelEntries', 'ce.panel.entries'],
    ['panelEntry', 'ce.panel.entry'],
    ['panelDefine', 'ce.panel.define'],
    ['panelUndefine', 'ce.panel.undefine'],
    ['panelPatch', 'ce.panel.patch'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // Structure needs a control model, and there is none with the window shut — the same boundary
    // ce.panel.create already sits behind.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_WEBVIEW);
  }
  // `undefine`, not `remove`: `destroy` takes a whole control away and the two must not read alike.
  assert.equal(MEMBER_BY_ID.panelDestroy && memberPath('panelDestroy'), 'ce.panel.destroy');
});

/* --------------------------------------------------------- set() no longer fails in silence */

test('a path that leads nowhere is reported instead of vanishing', () => {
  withControl('Knob', (api) => {
    clearScriptTrace();
    // The exact shape that fooled the analysis: the last three segments are ONE patch-map key.
    api.set('k.States.Hover.patches.component.Background.Fill.colour', 'FFFF0000');
    assert.match(traced(), /error:/);
    assert.match(traced(), /nothing was written/);
    assert.match(traced(), /ce\.panel\.patch/);
  });
});

test('a missing SECTION is named, because that is a different mistake', () => {
  withControl('Knob', (api) => {
    clearScriptTrace();
    // A Knob ships no Value section, so this — the most ordinary line in any panel script — has
    // been writing nothing at all. Saying which section is missing is the whole difference between
    // a fixable message and a mystery.
    api.set('k.Nonsense.whatever', 1);
    assert.match(traced(), /"Nonsense" is not a section this control has/);
  });
});

test('a new property on a fixed-shape section is a warning, not an error', () => {
  const control = createControl('Knob', { name: 'k' });
  const panel = { id: 'p', name: 'P', width: 400, height: 300, controls: [control], scripting: { modules: [] } };
  // No host: the editor path is the one that probes, because only the host knows its own semantics.
  setRuntimeHost(null);
  try {
    // Transform has a fixed shape, so a typo lands somewhere nothing reads — it is written (the
    // behaviour does not change) and flagged.
    const probe = probeNestedWrite(control, 'Transform.wdith', 10);
    assert.equal(probe.writes, true);
    assert.equal(probe.fresh, true);
    assert.equal(probe.typed, true);
    // A free-form map takes new keys by design and must stay quiet.
    setNestedValue(control, 'States.Hover.when.custom', true);
    const free = probeNestedWrite(control, 'States.Hover.when.another', true);
    assert.equal(free.typed, false, 'a state\'s `when` is untyped and takes new keys by design');
  } finally {
    setRuntimeHost(null);
  }
  assert.ok(panel);
});

test('set() actually EMITS the fixed-shape warning', () => {
  // The test above pins probeNestedWrite's flags, and they were always right — but nothing asserted
  // that set() said anything, and it did not. The warning hung off `else if (wrote)`, while the
  // probe reports writes:true for a resolvable fresh key and fresh:false whenever writes is false:
  // the two conditions could never coincide, so the branch was unreachable and every typo on a
  // fixed-shape section went through in silence. Going through set() is the only way to catch that.
  withControl('Knob', (api) => {
    clearScriptTrace();
    api.set('k.Transform.wdith', 10);
    assert.match(traced(), /is a new property on a section with a fixed shape/);
    assert.match(traced(), /check the spelling/);
    // Still written — the warning does not change the behaviour, it just stops it being invisible.
    assert.equal(api.get('k.Transform.wdith'), 10);
  });

  // A correctly spelled field on the same section must stay quiet, or the warning is just noise.
  withControl('Knob', (api) => {
    clearScriptTrace();
    api.set('k.Transform.width', 10);
    assert.equal(traced(), '');
  });
});

test('the fixed-shape warning covers Text.Font, which is where it matters most', () => {
  // 41 hand-typed field names is exactly where a typo happens, and it was the case that found the
  // dead branch: set("…Font.sze", 20) stored a key nothing reads and said nothing at all.
  withControl('Label', (api) => {
    clearScriptTrace();
    api.set('k.Text.Font.sze', 20);
    assert.match(traced(), /is a new property on a section with a fixed shape/);
    assert.equal(api.get('k.Text.Font.size'), 12, 'the real field is untouched');
  });
});

test('setNestedValue now answers whether it wrote', () => {
  const knob = createControl('Knob', { name: 'k' });
  assert.equal(setNestedValue(knob, 'Transform.x', 10), true);
  // A Knob ships no Value section, and nothing creates one — so this genuinely writes nothing.
  assert.equal(setNestedValue(knob, 'Value.value', 42), false);
  assert.equal(valueAtPath(knob, 'Value.value'), undefined);
});

/* ------------------------------------------------------------------------------- entries */

test('entries lists a collection, and refuses a section that is not one', () => {
  withControl('Knob', (api, control) => {
    const states = api.panelEntries('k', 'States');
    assert.deepEqual(states, kidsOf(control, 'States'));
    assert.ok(states.includes('Hover'), `expected a Hover state in ${states.join(',')}`);

    // Case-insensitive, the way a path is.
    assert.deepEqual(api.panelEntries('k', 'states'), states);

    clearScriptTrace();
    assert.deepEqual(api.panelEntries('k', 'Transform'), []);
    assert.match(traced(), /is not a collection section/);
    // The message has to list the ones that work, or it only says "no".
    assert.match(traced(), /States, Bindings, Animations/);
  });
});

test('entry reads one out, and nil for one that is not there', () => {
  withControl('Knob', (api) => {
    assert.equal(api.panelEntry('k', 'States', 'Hover')?._type, 'State');
    assert.equal(api.panelEntry('k', 'States', 'hover')?._type, 'State', 'matched case-insensitively');
    assert.equal(api.panelEntry('k', 'States', 'Nope'), null);
  });
});

/* -------------------------------------------------------------------------------- define */

test('define creates an entry from a partial spec, completed by the template', () => {
  withControl('Knob', (api, control) => {
    assert.equal(api.panelDefine('k', 'States', 'Warn', { when: { valueGreaterThan: 0.9 } }), true);
    const warn = api.panelEntry('k', 'States', 'Warn');
    assert.equal(warn._type, 'State');
    assert.equal(warn.name, 'Warn');
    assert.equal(warn.enabled, true);
    // The half a hand-written node always forgets: both patch maps exist, so patch() has somewhere
    // to put things and the renderer has something to read.
    assert.deepEqual(warn.patches, { component: {}, parts: {} });
    assert.deepEqual(warn.when, { valueGreaterThan: 0.9 });
    assert.ok(kidsOf(control, 'States').includes('Warn'));
  });
});

test('a spec naming one nested field does not drop the rest of it', () => {
  withControl('Knob', (api) => {
    api.panelDefine('k', 'States', 'Warn', { patches: { component: { 'Transform.opacity': 50 } } });
    const warn = api.panelEntry('k', 'States', 'Warn');
    assert.deepEqual(warn.patches.component, { 'Transform.opacity': 50 });
    assert.deepEqual(warn.patches.parts, {}, 'parts survived a spec that only mentioned component');
  });
});

test('define works on the other collection sections too', () => {
  withControl('Knob', (api, control) => {
    // The ones a Knob actually carries. ValueChannels, Links and friends belong to custom
    // components, and asking for one on a Knob is the next test.
    for (const section of ['Bindings', 'Animations', 'Parts']) {
      assert.equal(api.panelDefine('k', section, 'mine', { note: section }), true, section);
      assert.ok(kidsOf(control, section).includes('mine'), `${section} did not get the entry`);
      assert.equal(api.panelEntry('k', section, 'mine').note, section);
    }
  });
});

test('a collection section this CONTROL does not have is refused, not invented', () => {
  withControl('Knob', (api) => {
    // Links is a real collection section — on a custom component. A Knob has none, and quietly
    // creating one would put a section on the control that nothing renders and nothing saves.
    clearScriptTrace();
    assert.equal(api.panelDefine('k', 'Links', 'mine', {}), false);
    assert.match(traced(), /has no Links section/);
    assert.deepEqual(api.panelEntries('k', 'Links'), []);
  });
});

test('define refuses a nameless entry and an unknown section', () => {
  withControl('Knob', (api) => {
    clearScriptTrace();
    assert.equal(api.panelDefine('k', 'States', '', {}), false);
    assert.match(traced(), /a name is required/);
    clearScriptTrace();
    assert.equal(api.panelDefine('k', 'Core', 'x', {}), false);
    assert.match(traced(), /is not a collection section/);
  });
});

/* ------------------------------------------------------------------------------ undefine */

test('undefine removes an entry and says whether there was one', () => {
  withControl('Knob', (api, control) => {
    const before = kidsOf(control, 'States').length;
    assert.equal(api.panelUndefine('k', 'States', 'Hover'), true);
    assert.equal(kidsOf(control, 'States').length, before - 1);
    assert.ok(!kidsOf(control, 'States').includes('Hover'));
    // "already gone" reads differently from "removed".
    assert.equal(api.panelUndefine('k', 'States', 'Hover'), false);
  });
});

test('this is the part set() could not do at all', () => {
  withControl('Knob', (api, control) => {
    const before = kidsOf(control, 'States').length;
    // Writing nil over an entry leaves it exactly where it was — which is why nothing could remove
    // one before, and why the failure was invisible.
    api.set('k.States.Hover', undefined);
    assert.equal(kidsOf(control, 'States').length, before);
    assert.equal(api.panelUndefine('k', 'States', 'Hover'), true);
    assert.equal(kidsOf(control, 'States').length, before - 1);
  });
});

/* --------------------------------------------------------------------------------- patch */

test('patch merges keys into a state, rather than replacing the map', () => {
  withControl('Knob', (api) => {
    api.panelDefine('k', 'States', 'Warn', {});
    assert.equal(api.panelPatch('k', 'Warn', { 'Background.Fill.colour': 'FFFF0000' }), 1);
    assert.equal(api.panelPatch('k', 'Warn', { 'Transform.opacity': 60 }), 1);
    // Both survive: "make this one thing red when hovered" must not require knowing everything
    // else the state already changes.
    assert.deepEqual(api.panelEntry('k', 'States', 'Warn').patches.component, {
      'Background.Fill.colour': 'FFFF0000',
      'Transform.opacity': 60,
    });
  });
});

test('patch reaches a part of a custom component', () => {
  withControl('Knob', (api) => {
    api.panelDefine('k', 'States', 'Warn', {});
    assert.equal(api.panelPatch('k', 'Warn', { 'Background.Fill.colour': 'FF00FF00' }, 'cap'), 1);
    const patches = api.panelEntry('k', 'States', 'Warn').patches;
    assert.deepEqual(patches.parts.cap, { 'Background.Fill.colour': 'FF00FF00' });
    assert.deepEqual(patches.component, {}, 'the component map is untouched by a part patch');
  });
});

test('patch on a state that is not there names the ones that are', () => {
  withControl('Knob', (api) => {
    clearScriptTrace();
    assert.equal(api.panelPatch('k', 'Nope', { 'Transform.opacity': 10 }), 0);
    assert.match(traced(), /has no state called "Nope"/);
    assert.match(traced(), /Hover/, 'the message lists what it does have');
  });
});

test('the shipped Hover state can be patched without disturbing what it already changes', () => {
  withControl('Knob', (api) => {
    const before = api.panelEntry('k', 'States', 'Hover').patches.parts;
    const keptKeys = Object.keys(before ?? {});
    api.panelPatch('k', 'Hover', { 'Background.Fill.colour': 'FFFF0000' });
    const after = api.panelEntry('k', 'States', 'Hover').patches;
    assert.deepEqual(after.component, { 'Background.Fill.colour': 'FFFF0000' });
    assert.deepEqual(Object.keys(after.parts ?? {}), keptKeys);
  });
});

test('a missing control is named by every verb', () => {
  withControl('Knob', (api) => {
    for (const call of [
      () => api.panelEntries('ghost', 'States'),
      () => api.panelEntry('ghost', 'States', 'Hover'),
      () => api.panelDefine('ghost', 'States', 'X', {}),
      () => api.panelUndefine('ghost', 'States', 'Hover'),
      () => api.panelPatch('ghost', 'Hover', {}),
    ]) {
      clearScriptTrace();
      call();
      assert.match(traced(), /no control named "ghost"/);
    }
  });
});
