// displayDock.test.js — the bottom dock stops overriding the user, and opens on the tab
// the action asked for.
//
// Review finding B8, all three clauses: `tabDefaultHeights = { colors: 480, gradient: 580 }`
// was applied on every tab click, App.svelte then persisted the snapped value over whatever
// the user had dragged, and the ceiling was 44% of the viewport for what is usually a colour
// picker. Finding B9's last clause: the dock reopened on whatever tab happened to be active
// last rather than the one the user's action implied.
//
// These are exactly the regressions that come back silently — a default table is such an
// obvious-looking thing to reintroduce — so the property under test is not "the numbers are
// these numbers" but "a height the user set survives".

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPLAY_DOCK_MIN_HEIGHT,
  DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS,
  clampDockHeight,
  impliedDockTab,
  maxDisplayDockHeight,
  resolveDockHeight,
} from '../src/CE_Application/utils/displayDock.js';

test('a height the user dragged survives every tab click', () => {
  const dragged = 240;
  for (const tabId of ['colors', 'gradient', 'align', 'console', null]) {
    assert.equal(
      resolveDockHeight({ tabId, currentHeight: dragged, userSized: true, viewportHeight: 1080 }),
      dragged,
      `${tabId} moved a user-set height`,
    );
  }
});

test('and it survives a tab click even when the tab default is bigger', () => {
  // The old code took the max of nothing — it just assigned. 580 over a deliberate 200 is
  // the canvas jumping under the pointer mid-task, which is the actual complaint.
  assert.equal(
    resolveDockHeight({ tabId: 'gradient', currentHeight: 200, userSized: true, viewportHeight: 1080 }),
    200,
  );
});

test('the per-tab default applies only to a dock the user has never sized', () => {
  assert.equal(
    resolveDockHeight({ tabId: 'colors', currentHeight: 480, userSized: false, viewportHeight: 1080 }),
    DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS.colors,
  );
  assert.equal(
    resolveDockHeight({ tabId: 'gradient', currentHeight: 200, userSized: false, viewportHeight: 1080 }),
    DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS.gradient,
  );
});

test('a tab with no default never moves the dock', () => {
  assert.equal(
    resolveDockHeight({ tabId: 'console', currentHeight: 333, userSized: false, viewportHeight: 1080 }),
    333,
  );
  assert.equal(
    resolveDockHeight({ tabId: null, currentHeight: 333, userSized: false, viewportHeight: 1080 }),
    333,
  );
});

test('the defaults no longer eat half the window', () => {
  // The concrete grievance: 480 of a 1080px viewport is 44%, for a colour picker.
  for (const [tab, height] of Object.entries(DISPLAY_DOCK_TAB_DEFAULT_HEIGHTS)) {
    assert.ok(height / 1080 < 0.4, `${tab} default is ${Math.round((height / 1080) * 100)}% of a 1080p viewport`);
  }
});

test('the ceiling reserves canvas rather than dividing the window', () => {
  // A percentage is the wrong shape at both ends of the range. What has to hold is that
  // some editor is left, on any screen.
  for (const viewport of [768, 900, 1080, 1440, 2160]) {
    const max = maxDisplayDockHeight(viewport);
    assert.ok(max < viewport, `dock could fill a ${viewport}px viewport`);
    assert.ok(viewport - max >= 200, `only ${viewport - max}px of canvas left at ${viewport}px`);
  }
  // ...and a user who wants a tall dock on a big screen may now have one, which 44% forbade.
  assert.ok(maxDisplayDockHeight(1080) > Math.floor(1080 * 0.44));
});

test('a nonsensical viewport still yields a usable ceiling instead of zero', () => {
  for (const bad of [0, -1, NaN, undefined, null, 'tall']) {
    assert.ok(maxDisplayDockHeight(bad) >= DISPLAY_DOCK_MIN_HEIGHT);
  }
});

test('clamping happens at render, both ends', () => {
  assert.equal(clampDockHeight(5, 1080), DISPLAY_DOCK_MIN_HEIGHT);
  assert.equal(clampDockHeight(99999, 1080), maxDisplayDockHeight(1080));
  assert.equal(clampDockHeight(300.6, 1080), 301);
});

test('a user height too tall for a shrunken window is clamped, not forgotten', () => {
  // The window is narrow/short right now, so the dock renders smaller...
  assert.equal(clampDockHeight(900, 600), maxDisplayDockHeight(600));
  // ...but the stored preference is untouched, so widening the window gives it back.
  assert.equal(resolveDockHeight({ tabId: 'colors', currentHeight: 900, userSized: true, viewportHeight: 1440 }), 900);
});

test('the tab an action implies beats the tab that happened to be open last', () => {
  assert.equal(impliedDockTab({ colorTarget: { type: 'panel' }, lastTab: 'midi' }), 'colors');
  assert.equal(impliedDockTab({ gradientTarget: { type: 'control' }, lastTab: 'midi' }), 'gradient');
  assert.equal(impliedDockTab({ tabRequest: { tab: 'align' }, lastTab: 'midi' }), 'align');
});

test('an explicit request outranks a target, and a bare toggle keeps the last tab', () => {
  assert.equal(
    impliedDockTab({ tabRequest: { tab: 'align' }, colorTarget: { type: 'panel' }, lastTab: 'console' }),
    'align',
    'someone naming the tab out loud wins',
  );
  assert.equal(impliedDockTab({ lastTab: 'console' }), 'console');
  assert.equal(impliedDockTab({}), 'colors');
});
