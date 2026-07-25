import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PANIC_SCOPES, panicScope, panicChannel, panicChannels, panicMessages,
  panicLabel, panicSummary, panicGeometry, panicHit, EMERGENCY_PANIC,
  isPanicShortcut, panicCcMessages, DEFAULT_PANIC_SHORTCUT,
  parseShortcut, formatShortcut, shortcutFromEvent, eventMatchesShortcut,
} from '../src/CE_Application/utils/panicLayout.js';

function pc(c) { return { _children: { Core: { controlType: 'Panic' }, Panic: c } }; }

test('scope defaults to every channel', () => {
  assert.equal(panicScope(pc({})), 'all');
  assert.equal(panicScope(pc({ scope: 'nope' })), 'all');
  assert.equal(panicChannels(pc({})).length, 16);
  assert.deepEqual(panicChannels(pc({ scope: 'channel', channel: 10 })), [10]);
  assert.deepEqual(panicChannels(pc({ scope: 'channel', channel: 99 })), [16]);
  assert.equal(panicChannel(pc({ channel: 0 })), 1);
  assert.deepEqual(PANIC_SCOPES, ['all', 'channel']);
});

test('the silence set is sound-off BEFORE notes-off', () => {
  const m = panicMessages(pc({ scope: 'channel', channel: 1 }));
  // 120 first: all-notes-off only lifts the keys, so on a long release the tail
  // would still be ringing if 123 came first.
  assert.deepEqual(m[0], [0xB0, 120, 0]);
  assert.deepEqual(m[1], [0xB0, 123, 0]);
  assert.deepEqual(m[2], [0xB0, 121, 0]);        // reset controllers
  assert.deepEqual(m[3], [0xE0, 0x00, 0x40]);    // bend centred
  assert.equal(m.length, 4);
});

test('the optional parts can be turned off', () => {
  const bare = panicMessages(pc({ scope: 'channel', channel: 1, resetControllers: false, centreBend: false }));
  assert.deepEqual(bare, [[0xB0, 120, 0], [0xB0, 123, 0]]);
  const noBend = panicMessages(pc({ scope: 'channel', channel: 1, centreBend: false }));
  assert.deepEqual(noBend, [[0xB0, 120, 0], [0xB0, 123, 0], [0xB0, 121, 0]]);
});

test('all-channel panic covers 1..16 with the right status bytes', () => {
  const m = panicMessages(pc({ scope: 'all' }));
  assert.equal(m.length, 16 * 4);
  assert.deepEqual(m[0], [0xB0, 120, 0]);          // channel 1
  assert.deepEqual(m[60], [0xBF, 120, 0]);         // channel 16
  assert.deepEqual(m[63], [0xEF, 0x00, 0x40]);
  // every channel appears exactly once in the sound-off pass
  const soundOff = m.filter((b) => b[1] === 120 && (b[0] & 0xF0) === 0xB0);
  assert.equal(soundOff.length, 16);
  assert.equal(new Set(soundOff.map((b) => b[0] & 0x0F)).size, 16);
});

test('label and summary', () => {
  assert.equal(panicLabel(pc({})), 'PANIC');
  assert.equal(panicLabel(pc({ label: '  ' })), 'PANIC');
  assert.equal(panicLabel(pc({ label: 'All Off' })), 'All Off');
  assert.equal(panicSummary(pc({})), 'all ch · reset CC · centre bend');
  assert.equal(panicSummary(pc({ scope: 'channel', channel: 10 })), 'ch 10 · reset CC · centre bend');
  assert.equal(panicSummary(pc({ resetControllers: false, centreBend: false })), 'all ch');
});

test('geometry + hit-test', () => {
  const g = panicGeometry(120, 44, 6);
  assert.deepEqual(g, { x: 6, y: 6, w: 108, h: 32 });
  assert.equal(panicHit(g, 10, 10), true);
  assert.equal(panicHit(g, 2, 10), false);
  assert.equal(panicHit(g, 10, 42), false);
});

test('the emergency config is always maximal', () => {
  // Esc and auto-panic-on-exit use this, NOT whatever a placed Panic button is
  // set to — a narrow "drums off, ch 10" button must not become the emergency.
  const m = panicMessages(EMERGENCY_PANIC);
  assert.equal(m.length, 16 * 4);
  assert.equal(panicScope(EMERGENCY_PANIC), 'all');
  assert.deepEqual(panicChannels(EMERGENCY_PANIC).length, 16);
  // it carries the optional parts too
  assert.ok(m.some((b) => b[1] === 121));
  assert.ok(m.some((b) => (b[0] & 0xF0) === 0xE0));
  // and a narrow button really would have been narrower
  const narrow = { _children: { Panic: { scope: 'channel', channel: 10, resetControllers: false, centreBend: false } } };
  assert.equal(panicMessages(narrow).length, 2);
});

// --- the Esc guard --------------------------------------------------------------
// Escape already cancels four in-place editors. If the global handler stole it,
// every cancelled edit would also panic the rig — so these are the cases that
// matter more than the happy path.

const key = (over = {}) => ({ key: 'Escape', repeat: false, defaultPrevented: false, target: { tagName: 'DIV' }, ...over });

test('Esc fires the emergency stop from the panel surface', () => {
  assert.equal(isPanicShortcut(key()), true);
  assert.equal(isPanicShortcut(key({ target: { tagName: 'BUTTON' } })), true);
  assert.equal(isPanicShortcut(key({ target: null })), true);
});

test('Esc defers to anything that already claimed it', () => {
  // the per-control cancels preventDefault, which is the primary signal
  assert.equal(isPanicShortcut(key({ defaultPrevented: true })), false);
  // …and an active LCD zone edit is the one that cancels without preventing
  assert.equal(isPanicShortcut(key(), { lcdEditing: true }), false);
});

test('Esc never fires while typing', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input', 'textarea']) {
    assert.equal(isPanicShortcut(key({ target: { tagName } })), false, tagName);
  }
  assert.equal(isPanicShortcut(key({ target: { tagName: 'DIV', isContentEditable: true } })), false);
});

test('other keys and key-repeat are ignored', () => {
  assert.equal(isPanicShortcut(key({ key: 'Enter' })), false);
  assert.equal(isPanicShortcut(key({ key: 'esc' })), false);      // case matters
  assert.equal(isPanicShortcut(key({ repeat: true })), false);    // holding it fires once
  assert.equal(isPanicShortcut(null), false);
  assert.equal(isPanicShortcut(undefined), false);
});

// --- the CC-only form (script command + code exports) ---------------------------

test('the CC-only set keeps the same order, minus the bend', () => {
  const one = panicCcMessages({ scope: 'channel', channel: 3 });
  assert.deepEqual(one, [
    { channel: 3, cc: 120 },   // sound off first, same reason as the button
    { channel: 3, cc: 123 },
    { channel: 3, cc: 121 },
  ]);
  // no pitch bend: CC 121 recentres it per spec, and no export target can send
  // a bend message anyway
  assert.equal(one.some((m) => m.cc === undefined), false);
  assert.deepEqual(panicCcMessages({ scope: 'channel', channel: 3, resetControllers: false }),
    [{ channel: 3, cc: 120 }, { channel: 3, cc: 123 }]);
});

test('the CC-only set covers all 16 channels by default', () => {
  const all = panicCcMessages();
  assert.equal(all.length, 16 * 3);
  assert.equal(all[0].channel, 1);
  assert.equal(all[all.length - 1].channel, 16);
  assert.equal(new Set(all.map((m) => m.channel)).size, 16);
  assert.deepEqual(panicCcMessages({ scope: 'channel', channel: 99 })[0].channel, 16);
  assert.deepEqual(panicCcMessages({}), all);
});

// --- the configurable shortcut ---------------------------------------------------

test('shortcut text round-trips', () => {
  assert.deepEqual(parseShortcut('Escape'), { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false });
  assert.deepEqual(parseShortcut('Ctrl+Shift+P'), { key: 'P', ctrl: true, alt: false, shift: true, meta: false });
  // aliases people actually type
  assert.equal(parseShortcut('Cmd+K').meta, true);
  assert.equal(parseShortcut('control+alt+F8').ctrl, true);
  assert.equal(parseShortcut('option+F8').alt, true);
  assert.equal(formatShortcut(parseShortcut('shift+ctrl+p')), 'Ctrl+Shift+P');
  assert.equal(formatShortcut(parseShortcut('F8')), 'F8');
  // an empty shortcut is OFF, not a parse failure
  assert.equal(parseShortcut(''), null);
  assert.equal(parseShortcut('   '), null);
  assert.equal(parseShortcut(null), null);
  assert.equal(parseShortcut('Ctrl'), null);        // a modifier alone is not a shortcut
  assert.equal(formatShortcut(null), '');
});

test('a keypress can be captured back into shortcut text', () => {
  assert.equal(shortcutFromEvent({ key: 'Escape' }), 'Escape');
  assert.equal(shortcutFromEvent({ key: 'P', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+P');
  assert.equal(shortcutFromEvent({ key: 'k', metaKey: true }), 'Meta+K');
  // holding only a modifier is not yet a shortcut — the field keeps waiting
  assert.equal(shortcutFromEvent({ key: 'Shift', shiftKey: true }), '');
  assert.equal(shortcutFromEvent({ key: 'Control', ctrlKey: true }), '');
  assert.equal(shortcutFromEvent({}), '');
});

test('matching is exact about modifiers', () => {
  const b = parseShortcut('Ctrl+P');
  assert.equal(eventMatchesShortcut({ key: 'p', ctrlKey: true }, b), true);
  assert.equal(eventMatchesShortcut({ key: 'P', ctrlKey: true }, b), true);   // case-insensitive
  assert.equal(eventMatchesShortcut({ key: 'p' }, b), false);                 // missing Ctrl
  assert.equal(eventMatchesShortcut({ key: 'p', ctrlKey: true, shiftKey: true }, b), false);  // extra Shift
  assert.equal(eventMatchesShortcut({ key: 'Escape' }, b), false);
  // named keys stay case-sensitive: 'escape' is not 'Escape'
  assert.equal(eventMatchesShortcut({ key: 'escape' }, parseShortcut('Escape')), false);
});

test('a custom shortcut replaces Escape entirely', () => {
  const opts = { shortcut: 'Ctrl+Shift+P' };
  assert.equal(isPanicShortcut(key({ key: 'P', ctrlKey: true, shiftKey: true }), opts), true);
  assert.equal(isPanicShortcut(key(), opts), false);            // Escape no longer fires
  assert.equal(DEFAULT_PANIC_SHORTCUT, 'Escape');
});

test('an empty shortcut switches the key off completely', () => {
  assert.equal(isPanicShortcut(key(), { shortcut: '' }), false);
  assert.equal(isPanicShortcut(key(), { shortcut: '   ' }), false);
});

test('a MODIFIED shortcut still works while typing; a bare one never does', () => {
  const field = { tagName: 'INPUT' };
  // this is the point of allowing modifiers: when it goes wrong you are often
  // mid-edit, and Ctrl+Alt+P is nobody's typing
  assert.equal(isPanicShortcut(key({ key: 'P', ctrlKey: true, altKey: true, target: field }),
    { shortcut: 'Ctrl+Alt+P' }), true);
  // …but a bare key belongs to the field, always
  assert.equal(isPanicShortcut(key({ key: 'F8', target: field }), { shortcut: 'F8' }), false);
  assert.equal(isPanicShortcut(key({ target: field })), false);
  // and a claimed event is still deferred to, modifiers or not
  assert.equal(isPanicShortcut(key({ key: 'P', ctrlKey: true, altKey: true, target: field, defaultPrevented: true }),
    { shortcut: 'Ctrl+Alt+P' }), false);
});
