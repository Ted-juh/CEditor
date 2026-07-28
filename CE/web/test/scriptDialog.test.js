// scriptDialog.test.js — ce.ui.dialog: asking, not telling (design doc §18).
//
// The problem this verb had to solve before it could ship: a dialog exists to return an ANSWER, and
// an answer necessarily arrives later than the call, while this API is synchronous everywhere by
// design. The shape that resolves it — and what this file guards:
//
//   • the ANSWER comes through a callback, never through the return value;
//   • the RETURN says whether a dialog was actually shown, and `false` ALWAYS means the callback
//     has already run with no answer, so a script never has to wonder if it is still waiting;
//   • the callback runs EXACTLY ONCE — on a choice, on a dismissal, or on panel teardown.
//
// CE/tests/ScriptRuntimeTests.cpp §23 pins the window-closed half: there is nobody to ask, so it
// returns false and calls back with no answer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import {
  scriptDialog, answerDialog, dialogOpen, clearScriptUi,
} from '../src/CE_Application/stores/scriptUi.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  ALL_MEMBERS, WEBVIEW_ONLY_MEMBERS, memberPath,
} from '../src/CE_Application/scripting/panelApi.js';

// ce.ui declared explicitly: on `auto` it would be derived from the panel's scripts, and this
// fixture has none, so without it every verb here is (correctly) a gated stub.
const panel = { id: 'p', name: 'Ask', width: 400, height: 300, controls: [], scripting: { modules: ['ce.ui'] } };

function withApi(fn) {
  setRuntimeHost({ panel, scripts: [] });
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'ask-script')); } finally { clearScriptUi(); setRuntimeHost(null); }
}

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* ------------------------------------------------------------------ the contract itself */

test('dialog is declared, panel-view only, and reachable at ce.ui.dialog', () => {
  const m = ALL_MEMBERS.find((x) => x.id === 'uiDialog');
  assert.ok(m, 'uiDialog should be a declared member');
  assert.equal(memberPath('uiDialog'), 'ce.ui.dialog');
  // A modal needs somewhere to be modal. Declared webview-only, so the C++ engines stub it.
  assert.ok(WEBVIEW_ONLY_MEMBERS.includes('uiDialog'));
});

test('the return value is documented as "was one shown", not as the answer', () => {
  const m = ALL_MEMBERS.find((x) => x.id === 'uiDialog');
  assert.match(m.signature, /-> boolean$/, 'the signature must not suggest it returns the choice');
  assert.ok(m.params.some((p) => p.name === 'onChoice' && p.required === false));
});

/* ------------------------------------------------------------------------- opening it */

test('opening puts the question on screen and does not answer it', () => {
  withApi((api) => {
    let answered = 'not called';
    const shown = api.uiDialog({ title: 'Overwrite?', buttons: ['Yes', 'No'] }, (c) => { answered = c; });
    assert.equal(shown, true);
    assert.equal(answered, 'not called', 'the callback must not run until somebody answers');
    const d = get(scriptDialog);
    assert.equal(d.title, 'Overwrite?');
    assert.deepEqual(d.buttons, ['Yes', 'No']);
    assert.equal(d.default, 'Yes', 'the first button is the default when none is named');
  });
});

test('a named default is honoured, an unknown one falls back to the first button', () => {
  withApi((api) => {
    api.uiDialog({ title: 'Q', buttons: ['Yes', 'No'], default: 'No' }, () => {});
    assert.equal(get(scriptDialog).default, 'No');
    answerDialog('No');
    api.uiDialog({ title: 'Q', buttons: ['Yes', 'No'], default: 'Maybe' }, () => {});
    assert.equal(get(scriptDialog).default, 'Yes');
  });
});

test('no buttons means one OK — a question with no way out is not shippable', () => {
  withApi((api) => {
    api.uiDialog({ title: 'Done' }, () => {});
    assert.deepEqual(get(scriptDialog).buttons, ['OK']);
  });
});

test('a dialog asking nothing is refused rather than shown empty', () => {
  withApi((api) => {
    let answered = 'not called';
    const shown = api.uiDialog({ buttons: ['OK'] }, (c) => { answered = c; });
    assert.equal(shown, false);
    assert.equal(answered, undefined, 'false always means the callback already ran');
    assert.equal(get(scriptDialog), null);
  });
});

/* ------------------------------------------------------------------------ answering it */

test('choosing a button hands the label to the callback and closes the dialog', () => {
  withApi((api) => {
    let answered = 'not called';
    api.uiDialog({ title: 'Overwrite?', buttons: ['Yes', 'No'] }, (c) => { answered = c; });
    answerDialog('Yes');
    assert.equal(answered, 'Yes');
    assert.equal(get(scriptDialog), null);
    assert.equal(dialogOpen(), false);
  });
});

test('dismissing calls back with no answer at all', () => {
  withApi((api) => {
    let called = 0, answered = 'not called';
    api.uiDialog({ title: 'Overwrite?' }, (c) => { called += 1; answered = c; });
    answerDialog(undefined);
    assert.equal(called, 1);
    assert.equal(answered, undefined, 'a dismissal is the absence of a choice, not a choice');
  });
});

test('the callback runs exactly once, however many times the dialog is settled', () => {
  // A click racing a teardown must not answer the same question twice.
  withApi((api) => {
    let called = 0;
    api.uiDialog({ title: 'Q' }, () => { called += 1; });
    answerDialog('OK');
    answerDialog('OK');
    answerDialog(undefined);
    assert.equal(called, 1);
  });
});

/* ------------------------------------------------------------------- one at a time */

test('a second dialog is refused rather than queued', () => {
  // A queue would let a script in a loop stack a hundred modals in front of somebody. Refusing
  // hands the decision back to the only party that knows what to do about it.
  withApi((api) => {
    let second = 'not called';
    assert.equal(api.uiDialog({ title: 'First' }, () => {}), true);
    assert.equal(api.uiDialog({ title: 'Second' }, (c) => { second = c; }), false);
    assert.equal(second, undefined, 'the refused call still calls back, with no answer');
    assert.equal(get(scriptDialog).title, 'First', 'the open question is not replaced');
  });
});

test('a callback may open the next dialog — the first is already closed by then', () => {
  // The chained-question case: ask A, then ask B in A's callback. This is what makes refusing a
  // second concurrent dialog acceptable rather than limiting.
  withApi((api) => {
    let secondShown = null;
    api.uiDialog({ title: 'First' }, () => {
      secondShown = api.uiDialog({ title: 'Second' }, () => {});
    });
    answerDialog('OK');
    assert.equal(secondShown, true);
    assert.equal(get(scriptDialog).title, 'Second');
  });
});

/* --------------------------------------------------------------------- panel teardown */

test('panel teardown dismisses an open dialog instead of dropping it', () => {
  // The question the design doc flagged as blocking: what happens when the panel closes with a
  // dialog open? It is dismissed — the callback runs with no answer. A callback that never runs is
  // the one failure mode this API cannot afford.
  setRuntimeHost({ panel, scripts: [] });
  let answered = 'not called';
  try {
    scriptApiForTesting('', 'ask-script').uiDialog({ title: 'Still open' }, (c) => { answered = c; });
    assert.equal(dialogOpen(), true);
    clearScriptUi();
  } finally {
    setRuntimeHost(null);
  }
  assert.equal(answered, undefined);
  assert.equal(get(scriptDialog), null);
});

/* ------------------------------------------------------------------ failure behaviour */

test('a throw in the callback is reported rather than escaping', () => {
  // The callback runs long after the handler that asked has returned, so it is outside the dispatch
  // path that would otherwise have caught and reported it.
  withApi((api) => {
    api.uiDialog({ title: 'Q' }, () => { throw new Error('callback blew up'); });
    answerDialog('OK');
    assert.match(traced(), /callback blew up/);
    assert.equal(get(scriptDialog), null, 'and the dialog still closed');
  });
});

test('the callback is optional', () => {
  withApi((api) => {
    assert.equal(api.uiDialog({ title: 'Just so you know' }), true);
    answerDialog('OK');
    assert.equal(get(scriptDialog), null);
  });
});
