import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AUTHOR_TAB,
  filterTabsByAudience,
  migratePropertiesUiState,
  sanitizeTabSelection,
  tabAllowedForAudience,
  tabAudience,
} from '../src/CE_Application/utils/propertiesTabAudience.js';

const TABS = [
  { id: 'core' }, { id: 'transform' }, { id: 'background' },
  { id: 'properties' }, { id: 'devicebindings' },
  { id: 'designer' }, { id: 'valuechannels' }, { id: 'behaviors' },
  { id: 'hitzones' }, { id: 'testbench' }, { id: 'states' },
  { id: 'bindings' }, { id: 'animations' }, { id: 'actions' },
];

test('instance context hides authoring tabs for custom components', () => {
  const ids = filterTabsByAudience(TABS, 'instance').map((t) => t.id);
  assert.deepEqual(ids, ['core', 'transform', 'background', 'properties', 'devicebindings', 'actions']);
});

test('author context hides instance-only tabs and shows the graph editors', () => {
  const ids = filterTabsByAudience(TABS, 'author').map((t) => t.id);
  assert.ok(ids.includes('valuechannels'));
  assert.ok(ids.includes('testbench'));
  assert.ok(ids.includes('states'));
  assert.ok(!ids.includes('properties'));
  assert.ok(!ids.includes('devicebindings'));
});

test('non-custom controls are never filtered', () => {
  assert.deepEqual(filterTabsByAudience(TABS, 'instance', false), TABS);
  assert.equal(tabAllowedForAudience('states', 'instance', false), true);
});

test('unknown tab ids default to both audiences', () => {
  assert.equal(tabAudience('someFutureTab'), 'both');
  assert.equal(tabAllowedForAudience('someFutureTab', 'instance'), true);
});

test('sanitize falls back when the stored single tab is hidden', () => {
  const result = sanitizeTabSelection({
    singleTab: 'testbench',
    multiTabs: ['testbench', 'core'],
    validIds: ['core', 'transform', 'properties'],
  });
  assert.equal(result.singleTab, 'core');
  assert.deepEqual(result.multiTabs, ['core']);
});

test('sanitize keeps valid selections untouched', () => {
  const result = sanitizeTabSelection({
    singleTab: 'transform',
    multiTabs: ['core', 'transform'],
    validIds: new Set(['core', 'transform']),
  });
  assert.equal(result.singleTab, 'transform');
  assert.deepEqual(result.multiTabs, ['core', 'transform']);
});

test('sanitize never returns an empty multi set', () => {
  const result = sanitizeTabSelection({ singleTab: 'gone', multiTabs: ['gone'], validIds: ['core'] });
  assert.equal(result.singleTab, 'core');
  assert.deepEqual(result.multiTabs, ['core']);
});

test('v1 state migrates: instance side preserved, author side seeded', () => {
  const v1 = {
    viewMode: 'multi',
    pinPanelProps: true,
    singleTab: 'effects',
    multiTabs: ['effects', 'core'],
    pinnedPanelTab: 'grid',
    pinnedPanelMultiTabs: ['grid'],
    collapsedCards: { core: true },
  };
  const state = migratePropertiesUiState(null, v1);
  assert.equal(state.viewMode, 'multi');
  assert.equal(state.pinPanelProps, true);
  assert.equal(state.singleTab, 'effects');
  assert.deepEqual(state.multiTabs, ['effects', 'core']);
  assert.equal(state.authorSingleTab, DEFAULT_AUTHOR_TAB);
  assert.deepEqual(state.authorMultiTabs, [DEFAULT_AUTHOR_TAB]);
  assert.equal(state.pinnedPanelTab, 'grid');
  assert.deepEqual(state.collapsedCards, { core: true });
});

test('v2 state round-trips including the author side', () => {
  const v2 = {
    viewMode: 'single',
    singleTab: 'core',
    multiTabs: ['core'],
    authorSingleTab: 'testbench',
    authorMultiTabs: ['testbench', 'assets'],
  };
  const state = migratePropertiesUiState(v2);
  assert.equal(state.authorSingleTab, 'testbench');
  assert.deepEqual(state.authorMultiTabs, ['testbench', 'assets']);
});

test('empty storage produces safe defaults', () => {
  const state = migratePropertiesUiState(null, null);
  assert.equal(state.viewMode, 'single');
  assert.equal(state.singleTab, 'core');
  assert.deepEqual(state.multiTabs, ['core']);
  assert.equal(state.authorSingleTab, DEFAULT_AUTHOR_TAB);
});
