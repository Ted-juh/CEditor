// scriptUi.test.js — ce.ui (design doc §40).
//
// The bar for this module is not the Properties panel: that is a DESIGN-time surface and has no
// run-time messaging at all. The bar is what the APP does to talk to whoever is using it — and it
// asks for text (the browser's prompt(), where a note gets renamed), offers lists to pick from,
// lets a toast be dismissed by clicking it, and copies to the clipboard in six places. A script
// could do none of those.
//
// Everything here is panel-view only, so there is no cross-runtime layer: the C++ engines carry
// explaining stubs, and panelApiParity.test.js is what checks they exist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';
import {
  scriptNotifications, scriptStatus, scriptDialog, answerDialog, clearScriptUi,
  expireNotifications,
} from '../src/CE_Application/stores/scriptUi.js';

const api = scriptApiForTesting('', 'ui-script');

function fresh(fn) {
  clearScriptUi();
  try { return fn(); } finally { clearScriptUi(); }
}

/* ------------------------------------------------------------------------ the contract */

test('every phase-14 verb is declared, panel-view only, and namespaced under ce.ui', () => {
  for (const [id, path] of [
    ['uiPrompt', 'ce.ui.prompt'], ['uiChoose', 'ce.ui.choose'], ['uiDismiss', 'ce.ui.dismiss'],
    ['uiUpdate', 'ce.ui.update'], ['uiState', 'ce.ui.state'], ['uiCopy', 'ce.ui.copy'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // There is nobody to tell, ask or copy for with the window shut. Every one of these is a
    // person-facing affordance, so every one is webview-only — no exceptions to argue about.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_WEBVIEW);
  }
});

test('the flat aliases keep the ui prefix, because these words are all taken', () => {
  for (const bare of ['prompt', 'choose', 'copy', 'update', 'dismiss', 'notify', 'status']) {
    assert.equal(MEMBER_BY_ID[bare], undefined, `"${bare}" must not be a flat global`);
  }
  // `state` IS a flat member — ce.storage's, and it was there first. That is exactly why ce.ui's
  // read is uiState: two modules cannot both own the bare word, and the older one keeps it.
  assert.equal(memberPath('state'), 'ce.storage.state');
});

/* --------------------------------------------------------------------------- notify */

test('notify returns an ID, which is what makes a message addressable at all', () => {
  fresh(() => {
    const id = api.uiNotify('Patch loaded');
    assert.equal(typeof id, 'number', 'the id was always computed — it used to be thrown away');
    assert.equal(get(scriptNotifications).length, 1);
    assert.equal(get(scriptNotifications)[0].id, id);
    assert.equal(api.uiNotify(''), undefined, 'and an empty message is not a message');
    assert.equal(api.uiNotify('   '), undefined);
  });
});

test('a duration of 0 stays until it is dismissed — the basis of a progress message', () => {
  fresh(() => {
    api.uiNotify('Sending dump…', { duration: 0 });
    expireNotifications(Date.now() + 60 * 60 * 1000);
    assert.equal(get(scriptNotifications).length, 1, 'an hour later it is still there');
    assert.equal(api.uiState().notifications[0].sticky, true);
  });
});

/* ------------------------------------------------------------------ update / dismiss */

test('update replaces a live message IN PLACE, keeping its position', () => {
  fresh(() => {
    const first = api.uiNotify('one');
    const id = api.uiNotify('Sending dump… 0%', { duration: 0 });
    api.uiNotify('three');
    assert.equal(api.uiUpdate(id, 'Sending dump… 40%'), true);
    const list = get(scriptNotifications);
    assert.deepEqual(list.map((n) => n.message), ['one', 'Sending dump… 40%', 'three'],
      'dismissing and re-notifying would drop it to the bottom every time, which is why it flickers');
    assert.equal(list[1].id, id, 'and it is still the same message, not a new one');
    assert.ok(first);
  });
});

test('update keeps a sticky message sticky, and can change its kind', () => {
  fresh(() => {
    const id = api.uiNotify('working', { duration: 0 });
    api.uiUpdate(id, 'failed', { kind: 'error' });
    expireNotifications(Date.now() + 60 * 60 * 1000);
    assert.equal(get(scriptNotifications).length, 1, 'still sticky');
    assert.equal(get(scriptNotifications)[0].kind, 'error');
  });
});

test('update refuses once the message is gone — how a script learns to stop', () => {
  fresh(() => {
    const id = api.uiNotify('working', { duration: 0 });
    api.uiDismiss(id);                       // …as clicking the toast would
    assert.equal(api.uiUpdate(id, 'still working'), false);
    assert.equal(get(scriptNotifications).length, 0, 'and it does not come back as a new one');
    assert.equal(api.uiUpdate(id, ''), false, 'an empty replacement is not a replacement');
    assert.equal(api.uiUpdate(null, 'x'), false);
  });
});

test('dismiss with no id clears everything, and says how many went', () => {
  fresh(() => {
    api.uiNotify('a', { duration: 0 });
    api.uiNotify('b', { duration: 0 });
    api.uiNotify('c', { duration: 0 });
    assert.equal(api.uiDismiss(), 3, '"stop saying things" should not need six remembered ids');
    assert.equal(get(scriptNotifications).length, 0);
    assert.equal(api.uiDismiss(), 0, 'and clearing nothing clears nothing');
  });
});

/* --------------------------------------------------------------------------- status */

test('status carries a kind, the same vocabulary notify uses', () => {
  fresh(() => {
    api.uiStatus('Device not responding', { kind: 'warn' });
    assert.deepEqual(get(scriptStatus), { message: 'Device not responding', kind: 'warn' },
      'a state can be a warning — one rendered like "Ready" is a warning nobody sees');
    api.uiStatus('Synced');
    assert.equal(get(scriptStatus).kind, 'info', 'and it goes back to plain when not asked for');
    api.uiStatus('bad', { kind: 'nonsense' });
    assert.equal(get(scriptStatus).kind, 'info', 'an unknown kind is not a kind');
  });
});

test('status still clears with no message, and clearing forgets the kind too', () => {
  fresh(() => {
    api.uiStatus('Recording', { kind: 'error' });
    api.uiStatus();
    assert.deepEqual(get(scriptStatus), { message: '', kind: 'info' });
  });
});

/* ---------------------------------------------------------------------------- state */

test('state is what is on screen, in one read', () => {
  fresh(() => {
    api.uiStatus('Recording', { kind: 'warn' });
    const id = api.uiNotify('Sending', { duration: 0 });
    api.uiNotify('Timed');
    const s = api.uiState();
    assert.equal(s.status, 'Recording');
    assert.equal(s.statusKind, 'warn');
    assert.deepEqual(s.notifications.map((n) => n.message), ['Sending', 'Timed']);
    assert.equal(s.notifications[0].id, id);
    assert.equal(s.notifications[0].sticky, true);
    assert.equal(s.notifications[1].sticky, false, 'and a timed one says so');
    assert.equal(s.dialog, false);
  });
});

test('state tells "nobody to ask" apart from "one already open"', () => {
  fresh(() => {
    // The gap this closes: dialog() returned false for both, and they want opposite handling —
    // one is "give up", the other is "try again in a moment".
    api.uiDialog({ title: 'First?' }, () => {});
    assert.equal(api.uiState().dialog, true);
    let second = 'unset';
    assert.equal(api.uiDialog({ title: 'Second?' }, (c) => { second = c; }), false,
      'a second dialog is refused rather than queued');
    assert.equal(second, undefined, '…and its callback has already run with no answer');
    answerDialog(undefined);
    assert.equal(api.uiState().dialog, false);
  });
});

/* --------------------------------------------------------------------------- prompt */

test('prompt asks for TEXT and hands back the string', () => {
  fresh(() => {
    let got = 'unset';
    assert.equal(api.uiPrompt({ title: 'Name this patch', value: 'Init' }, (a) => { got = a; }), true);
    const d = get(scriptDialog);
    assert.equal(d.ask, 'text');
    assert.equal(d.value, 'Init', 'the field starts with what you gave it');
    assert.deepEqual(d.buttons, ['OK', 'Cancel'], 'a text question needs a yes and a no, not your buttons');
    answerDialog('Lead 1');
    assert.equal(got, 'Lead 1');
  });
});

test('a cancelled prompt is NOTHING, not an empty string', () => {
  fresh(() => {
    // "" is something somebody might mean; "I did not answer" is not one of the things it means.
    let got = 'unset';
    api.uiPrompt({ title: 'Name?' }, (a) => { got = a; });
    answerDialog(undefined);
    assert.equal(got, undefined);
  });
});

test('prompt takes its own accept and cancel labels', () => {
  fresh(() => {
    api.uiPrompt({ title: 'Rename', accept: 'Rename', cancel: 'Keep' }, () => {});
    assert.deepEqual(get(scriptDialog).buttons, ['Rename', 'Keep']);
  });
});

/* --------------------------------------------------------------------------- choose */

test('choose offers a LIST, because buttons stop working past about three', () => {
  fresh(() => {
    const items = ['Lead', 'Pad', 'Bass', 'Keys', 'Brass'];
    let got = 'unset';
    assert.equal(api.uiChoose({ title: 'Load which?', items, default: 'Bass' }, (a) => { got = a; }), true);
    const d = get(scriptDialog);
    assert.equal(d.ask, 'list');
    assert.deepEqual(d.items, items);
    assert.equal(d.selected, 'Bass', 'and it opens on the one you named');
    answerDialog('Pad');
    assert.equal(got, 'Pad');
  });
});

test('choose with multiple answers with a list', () => {
  fresh(() => {
    let got = 'unset';
    api.uiChoose({ title: 'Which?', items: ['a', 'b'], multiple: true }, (a) => { got = a; });
    assert.equal(get(scriptDialog).multiple, true);
    answerDialog(['a', 'b']);
    assert.deepEqual(got, ['a', 'b']);
  });
});

test('a picker with nothing to pick is refused rather than shown empty', () => {
  fresh(() => {
    let got = 'unset';
    assert.equal(api.uiChoose({ title: 'Which?', items: [] }, (a) => { got = a; }), false);
    assert.equal(got, undefined, 'and the callback has already run, so nothing is left waiting');
    assert.equal(get(scriptDialog), null);
  });
});

test('every question shape shares one modal, one callback, one teardown', () => {
  fresh(() => {
    let answered = 0;
    api.uiPrompt({ title: 'One' }, () => { answered += 1; });
    // One dialog at a time whatever it is asking — a text question does not get its own slot.
    assert.equal(api.uiChoose({ title: 'Two', items: ['x'] }, () => { answered += 1; }), false);
    assert.equal(answered, 1, 'the refused one answered immediately');
    clearScriptUi();
    assert.equal(answered, 2, 'and teardown settles the open one rather than dropping it');
  });
});

/* ----------------------------------------------------------------------------- copy */

test('copy puts text on the clipboard, and reports when there is none', () => {
  fresh(() => {
    const written = [];
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'navigator');
    const before = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: (t) => { written.push(t); return Promise.resolve(); } } },
        configurable: true, writable: true,
      });
      assert.equal(api.uiCopy('F0 41 10 F7'), true);
      assert.deepEqual(written, ['F0 41 10 F7']);
      assert.equal(api.uiCopy(''), false, 'copying nothing is not a copy');
      assert.equal(api.uiCopy(null), false);

      // No clipboard at all: reported, not thrown, and honest about not having copied.
      Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
      assert.equal(api.uiCopy('x'), false);
    } finally {
      if (had) Object.defineProperty(globalThis, 'navigator', { value: before, configurable: true, writable: true });
      else delete globalThis.navigator;
    }
  });
});

test('a browser refusing the write does not throw into the script', () => {
  fresh(() => {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'navigator');
    const before = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: () => Promise.reject(new Error('no gesture')) } },
        configurable: true, writable: true,
      });
      // The write is asynchronous and browsers decline it without a click behind them. The return
      // says ATTEMPTED, and the refusal is reported rather than raised in a handler that has long
      // since returned.
      assert.equal(api.uiCopy('x'), true);
    } finally {
      if (had) Object.defineProperty(globalThis, 'navigator', { value: before, configurable: true, writable: true });
      else delete globalThis.navigator;
    }
  });
});
