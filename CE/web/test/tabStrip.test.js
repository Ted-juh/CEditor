// tabStrip.test.js — reorder, overflow and per-tab commands for the editor tab strip.
//
// Review finding D8: "no tab reorder, no overflow UI, no per-tab context menu, no file-path
// tooltip." Reordering is an override list rather than an array move, because `editorTabs`
// (panels.js:430) is derived from six stores and there is no single array to splice — so the
// tests below are mostly about that override behaving like a real order.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTabOrder, moveTabKey, pruneTabOrder, seedTabOrder, tabContextAvailability, tabKey,
  tabOverflowState, tabsToClose,
} from '../src/CE_Application/utils/tabStrip.js';

const tab = (tabType, id, extra = {}) => ({ tabType, id, name: `${tabType}-${id}`, ...extra });
const tabs = [tab('panel', 1), tab('panel', 2), tab('script', 1), tab('settings', 'settings')];
const keys = tabs.map(tabKey);

test('identity includes the type, because ids collide across types', () => {
  assert.equal(tabKey(tab('panel', 1)), 'panel:1');
  assert.notEqual(tabKey(tab('panel', 1)), tabKey(tab('script', 1)));
  assert.equal(tabKey(null), '');
});

test('with no override the natural order is untouched', () => {
  assert.deepEqual(applyTabOrder(tabs, []).map(tabKey), keys);
});

test('the override decides the order, and a tab it has never seen goes to the end', () => {
  const order = ['script:1', 'panel:2'];
  assert.deepEqual(applyTabOrder(tabs, order).map(tabKey), ['script:1', 'panel:2', 'panel:1', 'settings:settings']);
});

test('an override entry for a closed tab is ignored, not treated as a gap', () => {
  const order = ['panel:99', 'script:1', 'panel:1', 'panel:2', 'settings:settings'];
  assert.deepEqual(applyTabOrder(tabs, order).map(tabKey), ['script:1', 'panel:1', 'panel:2', 'settings:settings']);
});

test('dragging rightwards drops after the target; leftwards drops before it', () => {
  const order = ['a', 'b', 'c', 'd'];
  // The direction rule is the thing that feels broken when it is wrong: inserting at the
  // target's index unconditionally makes one of these two refuse to move past its neighbour.
  assert.deepEqual(moveTabKey(order, 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTabKey(order, 'd', 'b'), ['a', 'd', 'b', 'c']);
});

test('a move onto itself, or involving a key that is not there, changes nothing', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(moveTabKey(order, 'a', 'a'), order);
  assert.deepEqual(moveTabKey(order, 'a', 'zz'), order);
  assert.deepEqual(moveTabKey(order, 'zz', 'a'), order);
  assert.deepEqual(order, ['a', 'b', 'c'], 'the input array is not mutated');
});

test('the first drag seeds the override from what is on screen', () => {
  // Without the seed there is nothing to move within and the first drag would do nothing at all.
  const seeded = seedTabOrder(tabs, []);
  assert.deepEqual(seeded, keys);
  assert.deepEqual(moveTabKey(seeded, 'settings:settings', 'panel:1'),
    ['settings:settings', 'panel:1', 'panel:2', 'script:1']);
});

test('pruning drops keys for tabs that no longer exist', () => {
  assert.deepEqual(pruneTabOrder([...keys, 'panel:404'], tabs), keys);
  assert.deepEqual(pruneTabOrder(null, tabs), []);
});

test('a strip that fits reports no overflow and no hidden edges', () => {
  const state = tabOverflowState({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 });
  assert.equal(state.overflowing, false);
  assert.equal(state.hiddenBefore, false);
  assert.equal(state.hiddenAfter, false);
  assert.equal(state.atStart, true);
  assert.equal(state.atEnd, true);
});

test('sub-pixel layout slack does not count as overflow', () => {
  assert.equal(tabOverflowState({ scrollLeft: 0, scrollWidth: 400.4, clientWidth: 400 }).overflowing, false);
});

test('scrolled to the middle, both edges hide tabs', () => {
  const state = tabOverflowState({ scrollLeft: 100, scrollWidth: 800, clientWidth: 400 });
  assert.equal(state.overflowing, true);
  assert.equal(state.hiddenBefore, true);
  assert.equal(state.hiddenAfter, true);
  assert.equal(state.atStart, false);
  assert.equal(state.atEnd, false);
});

test('at either end only one chevron has anything to do', () => {
  const start = tabOverflowState({ scrollLeft: 0, scrollWidth: 800, clientWidth: 400 });
  assert.deepEqual([start.atStart, start.atEnd], [true, false]);
  const end = tabOverflowState({ scrollLeft: 400, scrollWidth: 800, clientWidth: 400 });
  assert.deepEqual([end.atStart, end.atEnd], [false, true]);
});

test('Close Others and Close to the Right grey out when they would do nothing', () => {
  const single = [tab('panel', 1, { filePath: '' })];
  const one = tabContextAvailability(single, 0, single[0]);
  assert.equal(one.canCloseOthers, false, 'nothing else is open');
  assert.equal(one.canCloseToRight, false, 'it is the last tab');

  const last = tabContextAvailability(tabs, tabs.length - 1, tabs[3]);
  assert.equal(last.canCloseOthers, true);
  assert.equal(last.canCloseToRight, false);
});

test('Copy Path and Reveal need a file, so a never-saved document greys them out', () => {
  const saved = tabContextAvailability(tabs, 0, tab('panel', 1, { filePath: 'C:/Panels/Kit.cepanel' }));
  assert.deepEqual([saved.canCopyPath, saved.canReveal], [true, true]);
  const unsaved = tabContextAvailability(tabs, 0, tab('panel', 1, { filePath: '   ' }));
  assert.deepEqual([unsaved.canCopyPath, unsaved.canReveal], [false, false]);
});

test('the close-many commands name exactly the right tabs', () => {
  assert.deepEqual(tabsToClose(tabs, 1, 'others').map(tabKey), ['panel:1', 'script:1', 'settings:settings']);
  assert.deepEqual(tabsToClose(tabs, 1, 'right').map(tabKey), ['script:1', 'settings:settings']);
  assert.deepEqual(tabsToClose(tabs, 3, 'right'), []);
  assert.deepEqual(tabsToClose(tabs, -1, 'others'), []);
});
