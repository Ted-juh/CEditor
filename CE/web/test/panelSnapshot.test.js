// panelSnapshot.test.js — ce.panel.snapshot / restore.
//
// The two ce.panel verbs that are NOT panel-view only. Creating a control needs a renderer; reading
// and writing a value does not — and "put the panel back how it was before the solo" is a footswitch
// action in a DAW with the window shut, which is exactly where it has to work.
// CE/tests/ScriptRuntimeTests.cpp §28 pins the same behaviour there.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, MODULE_BY_ID, WEBVIEW_ONLY_MEMBERS,
  RUNTIME_ANY, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';

// A Knob does not carry a Value section until something writes one — createControl gives it
// Behavior/Parts/Bindings and nothing else. A SAVED panel has one, because the editor writes the
// value there, so that is what the fixture builds. Getting this wrong is what the first run of
// these tests caught: `get("Cutoff.value")` on a brand-new control is undefined, not 0.
function knob(name, value) {
  const c = createControl('Knob', 10, 10);
  c._children.Core.name = name;
  c._children.Value = { _type: 'Value', value };
  return c;
}

/** A panel with three knobs, and ce.panel declared so the verbs are not gated stubs. */
function fixture(controls) {
  return {
    id: 'p', name: 'Snap', width: 800, height: 400, controls,
    scripting: { modules: ['ce.panel'] },
  };
}

// Installing a host makes the runtime read and write through it rather than through the editor
// stores — which is what the exported player does, and what lets the fixture be a plain object.
// These two accessors are the whole host contract snapshot/restore use.
function withPanel(panel, fn) {
  setRuntimeHost({
    panel,
    scripts: [],
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => {
      const segs = String(path).split('.').filter(Boolean);
      let node = control;
      for (let i = 0; i < segs.length - 1; i += 1) {
        // A Value section is created on demand: a control that has never been written has none,
        // which is exactly the state restore has to be able to write into.
        if (node._children && !(segs[i] in node._children)) node._children[segs[i]] = {};
        node = node?._children?.[segs[i]] ?? node?.[segs[i]];
        if (!node) return false;
      }
      node[segs[segs.length - 1]] = value;
      return true;
    },
  });
  try { return fn(scriptApiForTesting('', 'snap-script')); } finally { setRuntimeHost(null); }
}

/* -------------------------------------------------------------------------- the contract */

test('snapshot and restore are declared CROSS-RUNTIME, unlike the verbs beside them', () => {
  // The whole point. If these were panel-view only they would be useless in the case they exist for.
  for (const id of ['panelSnapshot', 'panelRestore']) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
    assert.ok(!WEBVIEW_ONLY_MEMBERS.includes(id), `${id} must not be stubbed window-closed`);
  }
  assert.equal(memberPath('panelSnapshot'), 'ce.panel.snapshot');
  assert.equal(memberPath('panelRestore'), 'ce.panel.restore');
});

test('the structure verbs beside them are still panel-view only', () => {
  // ce.panel is the first MIXED module. The per-member markers are what state the boundary; if
  // these ever became cross-runtime the module's claim would be a lie in the other direction.
  for (const id of ['panelCreate', 'panelClone', 'panelDestroy', 'panelParent', 'panelFind']) {
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_WEBVIEW, id);
  }
  assert.equal(MODULE_BY_ID['ce.panel'].runtime, RUNTIME_ANY,
    'the module reaches window-closed even though most of its verbs do not');
});

/* ------------------------------------------------------------------------------ capture */

test('snapshot captures every control that has a value, keyed by name', () => {
  const panel = fixture([knob('Cutoff', 40), knob('Reso', 12)]);
  withPanel(panel, (api) => {
    assert.deepEqual(api.panelSnapshot(), { Cutoff: 40, Reso: 12 });
  });
});

test('a control with no value of its own is left OUT, not recorded as nothing', () => {
  // Recording it as null would let a restore blank a Label by writing null over it.
  const label = createControl('Label', 10, 10);
  label._children.Core.name = 'Title';
  const panel = fixture([knob('Cutoff', 40), label]);
  withPanel(panel, (api) => {
    const snap = api.panelSnapshot();
    assert.deepEqual(Object.keys(snap), ['Cutoff']);
    assert.ok(!('Title' in snap));
  });
});

test('controls inside a container are captured too', () => {
  // A panel that groups its controls is the normal case, not the exception. A snapshot that stopped
  // at the top level would silently miss most of a real panel.
  const inner = knob('Deep', 77);
  const group = createControl('Container', 0, 0);
  group._children.Core.name = 'Osc1';
  group._children.Children = { _children: { [inner._children.Core.id]: inner } };
  withPanel(fixture([knob('Cutoff', 40), group]), (api) => {
    assert.equal(api.panelSnapshot().Deep, 77);
  });
});

/* ------------------------------------------------------------------------------ restore */

test('restore puts the values back and says how many landed', () => {
  const panel = fixture([knob('Cutoff', 40), knob('Reso', 12)]);
  withPanel(panel, (api) => {
    const before = api.panelSnapshot();
    api.set('Cutoff.value', 99);
    api.set('Reso.value', 1);
    assert.equal(api.get('Cutoff.value'), 99);

    assert.equal(api.panelRestore(before), 2);
    assert.equal(api.get('Cutoff.value'), 40);
    assert.equal(api.get('Reso.value'), 12);
  });
});

test('a name the panel no longer has is skipped, not fatal', () => {
  // A snapshot taken before an edit is still worth most of what it holds; an all-or-nothing restore
  // would throw the rest away over one renamed knob.
  withPanel(fixture([knob('Cutoff', 40)]), (api) => {
    assert.equal(api.panelRestore({ Cutoff: 7, Ghost: 1 }), 1);
    assert.equal(api.get('Cutoff.value'), 7);
  });
});

test('restore is a no-op for anything that is not an object of values', () => {
  withPanel(fixture([knob('Cutoff', 40)]), (api) => {
    for (const bad of [null, undefined, 42, 'nope', [1, 2]]) {
      assert.equal(api.panelRestore(bad), 0, JSON.stringify(bad));
    }
    assert.equal(api.get('Cutoff.value'), 40, 'and nothing moved');
  });
});

/* ------------------------------------------------------------------------ the round trip */

test('snapshot → change everything → restore returns the panel exactly', () => {
  const panel = fixture([knob('A', 1), knob('B', 2), knob('C', 3)]);
  withPanel(panel, (api) => {
    const before = api.panelSnapshot();
    for (const n of ['A', 'B', 'C']) api.set(`${n}.value`, 0);
    api.panelRestore(before);
    assert.deepEqual(api.panelSnapshot(), before);
  });
});

test('an empty panel snapshots to an empty object rather than failing', () => {
  withPanel(fixture([]), (api) => {
    assert.deepEqual(api.panelSnapshot(), {});
    assert.equal(api.panelRestore({}), 0);
  });
});
