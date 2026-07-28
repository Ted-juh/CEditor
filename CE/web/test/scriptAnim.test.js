// scriptAnim.test.js — ce.anim and ce.ui (design doc §6 phase 6).
//
// ce.anim is CROSS-RUNTIME, so the interesting property is not "does it animate" but "does it
// animate the SAME WAY as the C++ runtime". It does, because the position is a pure function of
// elapsed time rather than an accumulated step — and the numbers below are the same ones
// CE/tests/ScriptRuntimeTests.cpp pins ScriptRuntime::animationEase/animationSpring to.
//
// Time is driven explicitly through tickAnimations(). An animation test that waits on a real clock
// is a flaky test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, setRuntimeHost, tickAnimations, stopAllAnimations,
  animationEase, animationSpring,
} from '../src/CE_Application/scripting/panelRuntime.js';
import {
  scriptNotifications, scriptStatus, clearScriptUi, expireNotifications,
} from '../src/CE_Application/stores/scriptUi.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  WEBVIEW_ONLY_MEMBERS, memberPath, membersForRuntime, RUNTIME_ANY,
} from '../src/CE_Application/scripting/panelApi.js';

function animPanel() {
  return {
    id: 'p', name: 'Anim', width: 400, height: 200,
    scripting: { modules: ['ce.anim', 'ce.ui'] },
    controls: [createControl('Knob', {
      name: 'cutoff', Behavior: { min: 0, max: 127 }, Value: { value: 0 },
    })],
  };
}

// A minimal host: `panel` alone is not enough once values move, because the runtime reads and
// writes through host.readValue/writeValue (playerScriptHost.js is the real implementation). This
// keeps the value on the control itself, which is all an animation needs.
function makeHost(panel) {
  // Walks (and on write, CREATES) the section path. A Knob template carries no Value section, and
  // the real writeValue goes through the preview session / updateControlProperty, both of which
  // materialise what they need — a fixture that silently dropped the write would test nothing.
  const at = (control, modelPath, create = false) => {
    const segs = String(modelPath).split('.');
    let node = control?._children;
    for (let i = 0; i < segs.length - 1; i++) {
      if (node == null) return { node: null, leaf: '' };
      if (node[segs[i]] == null) { if (!create) return { node: null, leaf: '' }; node[segs[i]] = {}; }
      node = node[segs[i]];
    }
    return { node, leaf: segs[segs.length - 1] };
  };
  return {
    panel,
    scripts: panel.scripts ?? [],
    readValue(control, modelPath) { const { node, leaf } = at(control, modelPath); return node?.[leaf]; },
    writeValue(control, modelPath, value) { const { node, leaf } = at(control, modelPath, true); if (node) node[leaf] = value; },
  };
}

function withPanel(fn) {
  const panel = animPanel();
  setRuntimeHost(makeHost(panel));
  try { return fn(scriptApiForTesting('', 'anim-script'), panel); } finally {
    stopAllAnimations();
    clearScriptUi();
    setRuntimeHost(null);
  }
}

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* -------------------------------------------------------------------- THE SHARED FORMULAS */

test('the easing curves match the C++ pair exactly', () => {
  // These four assertions are duplicated verbatim in ScriptRuntimeTests. If either side moves, an
  // animation started in the editor stops matching the same animation in the shipped plugin.
  assert.equal(animationEase(0.5, 'linear'), 0.5);
  assert.equal(animationEase(0.5, 'exp'), 0.25);
  assert.equal(animationEase(0.25, 'log'), 0.5);
  assert.equal(animationEase(0.5, 's'), 0.5);

  assert.equal(animationEase(2, 'linear'), 1, 'progress is clamped past the end');
  assert.equal(animationEase(-1, 'linear'), 0, '…and before the start');
  assert.equal(animationEase(0.5, 'nonsense'), 0.5, 'an unknown curve is linear, not an error');
});

test('a spring lands exactly on its target, never near it', () => {
  assert.equal(animationSpring(1, 6, 12), 1);
  assert.equal(animationSpring(2, 6, 12), 1);
  assert.equal(animationSpring(0, 6, 12), 0, 'and starts exactly at the start');
  // It overshoots on the way — that is the point of a spring rather than a ramp.
  const mid = animationSpring(0.25, 6, 12);
  assert.ok(mid > 1, `a spring overshoots (got ${mid})`);
});

/* --------------------------------------------------------------------------- animating */

test('a linear ramp passes through the same values the C++ runtime produces', () => {
  withPanel((api) => {
    tickAnimations(0);
    api.animateTo('cutoff', 100, { duration: 1000, curve: 'linear', from: 0 });
    assert.equal(api.animateRunning('cutoff'), true);
    assert.equal(api.animateRunning('resonance'), false, 'only the path that was animated');
    assert.equal(api.animateRunning(), true, 'no path means "is anything running"');

    tickAnimations(250);
    assert.equal(api.get('cutoff'), 25);
    tickAnimations(500);
    assert.equal(api.get('cutoff'), 50);
    tickAnimations(1000);
    assert.equal(api.get('cutoff'), 100, 'it ends exactly on the target');
    assert.equal(api.animateRunning('cutoff'), false, 'a finished animation stops running');
  });
});

test('from defaults to where the value IS, not to zero', () => {
  withPanel((api) => {
    api.set('cutoff', 40);
    tickAnimations(0);
    api.animateTo('cutoff', 80, { duration: 100, curve: 'linear' });
    tickAnimations(50);
    assert.equal(api.get('cutoff'), 60, 'halfway from 40 to 80 is 60 — it started from the truth');
  });
});

test('a second animation on the same path replaces the first', () => {
  // A value has one destination. Two animations writing to one path is a fight nobody wins, and
  // the visible result would depend on iteration order.
  withPanel((api) => {
    tickAnimations(0);
    api.animateTo('cutoff', 0, { duration: 1000, from: 0 });
    api.animateTo('cutoff', 50, { duration: 100, from: 0, curve: 'linear' });
    tickAnimations(100);
    assert.equal(api.get('cutoff'), 50);
    assert.equal(api.animateRunning(), false, 'and only one animation existed to finish');
  });
});

test('stop leaves the value where it got to', () => {
  withPanel((api) => {
    tickAnimations(0);
    api.animateTo('cutoff', 100, { duration: 1000, curve: 'linear', from: 0 });
    tickAnimations(400);
    assert.equal(api.get('cutoff'), 40);

    api.animateStop('cutoff');
    tickAnimations(900);
    assert.equal(api.get('cutoff'), 40, 'it neither snapped to the target nor reverted');
    assert.equal(api.animateRunning('cutoff'), false);
  });
});

test('stop with no path stops everything', () => {
  withPanel((api) => {
    tickAnimations(0);
    api.animateTo('cutoff', 100, { duration: 1000 });
    assert.equal(api.animateRunning(), true);
    api.animateStop();
    assert.equal(api.animateRunning(), false);
  });
});

test('a spring overshoots and then settles exactly', () => {
  withPanel((api) => {
    tickAnimations(0);
    api.animateSpring('cutoff', 100, { duration: 600, from: 0 });
    tickAnimations(150);   // a quarter in, where the damped cosine is past its target
    assert.ok(api.get('cutoff') > 100, 'it overshoots on the way');
    tickAnimations(600);
    assert.equal(api.get('cutoff'), 100, 'and settles exactly on the target');
  });
});

test('ce.anim is cross-runtime, unlike ce.ui', () => {
  // The roadmap said "values any, visuals webview": a sweep triggered by a note has to work in a
  // DAW with the panel shut, so these must NOT be in the webview-only stub list.
  for (const id of ['animateTo', 'animateSpring', 'animateStop', 'animateRunning']) {
    assert.ok(!WEBVIEW_ONLY_MEMBERS.includes(id), `${id} is cross-runtime`);
    assert.ok(membersForRuntime(RUNTIME_ANY).some((m) => m.id === id));
  }
  for (const id of ['uiNotify', 'uiStatus']) {
    assert.ok(WEBVIEW_ONLY_MEMBERS.includes(id), `${id} is panel-view only`);
  }
  assert.equal(memberPath('animateTo'), 'ce.anim.to');
  assert.equal(memberPath('uiNotify'), 'ce.ui.notify');
});

/* -------------------------------------------------------------------------------- ce.ui */

test('notify raises a message that expires; status persists until changed', () => {
  withPanel((api) => {
    // Two lifetimes, deliberately different. An EVENT expires. A STATE does not.
    api.uiNotify('Patch loaded');
    api.uiNotify('Careful', { kind: 'warn', duration: 50 });
    const shown = get(scriptNotifications);
    assert.equal(shown.length, 2);
    assert.equal(shown[0].message, 'Patch loaded');
    assert.equal(shown[0].kind, 'info', 'the default kind');
    assert.equal(shown[1].kind, 'warn');

    expireNotifications(Date.now() + 100);
    assert.deepEqual(get(scriptNotifications).map((n) => n.message), ['Patch loaded'],
      'the short one expired, the default-duration one did not');

    api.uiStatus('Recording');
    assert.equal(get(scriptStatus), 'Recording');
    expireNotifications(Date.now() + 999999);
    assert.equal(get(scriptStatus), 'Recording', 'a status is a state — it does not expire');

    api.uiStatus();
    assert.equal(get(scriptStatus), '', 'and no message clears it');
  });
});

test('an empty notification is not shown at all', () => {
  withPanel((api) => {
    assert.equal(api.uiNotify(''), false);
    assert.equal(api.uiNotify('   '), false);
    assert.deepEqual(get(scriptNotifications), [], 'an empty toast is worse than none');
  });
});

test('an unknown notification kind falls back rather than rendering unstyled', () => {
  withPanel((api) => {
    api.uiNotify('hm', { kind: 'catastrophe' });
    assert.equal(get(scriptNotifications)[0].kind, 'info');
  });
});

test('a panel that has not enabled the modules gets the gate', () => {
  const panel = animPanel();
  panel.scripting = { modules: [] };
  setRuntimeHost(makeHost(panel));
  try {
    clearScriptTrace();
    const api = scriptApiForTesting('', 'gated');
    api.animateTo('cutoff', 100);
    api.uiNotify('hello');
    assert.match(traced(), /animateTo\(\) needs the ce\.anim module/);
    assert.match(traced(), /uiNotify\(\) needs the ce\.ui module/);
    assert.deepEqual(get(scriptNotifications), []);
  } finally { stopAllAnimations(); clearScriptUi(); setRuntimeHost(null); }
});
