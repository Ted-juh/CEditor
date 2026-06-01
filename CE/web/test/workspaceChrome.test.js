import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPACT_CHROME_BREAKPOINT,
  classifyWorkspace,
  resolveWorkspaceChrome,
  workspaceOwnsChrome,
} from '../src/CE_Application/utils/workspaceChrome.js';

test('workspace chrome ownership follows active workspace type', () => {
  assert.equal(classifyWorkspace({ activeTab: { type: 'panel' }, componentWorkspaceMode: 'panel' }), 'panel');
  assert.equal(classifyWorkspace({ activeTab: { type: 'script' }, componentWorkspaceMode: 'panel' }), 'script');
  assert.equal(classifyWorkspace({ activeTab: { type: 'deviceProfile' }, componentWorkspaceMode: 'panel' }), 'device');
  assert.equal(classifyWorkspace({ activeTab: { type: 'panel' }, componentWorkspaceMode: 'surface' }), 'component');
  assert.equal(classifyWorkspace({ activeTab: { type: 'component' }, componentWorkspaceMode: 'surface' }), 'component');

  assert.equal(workspaceOwnsChrome('panel'), false);
  assert.equal(workspaceOwnsChrome('component'), true);
  assert.equal(workspaceOwnsChrome('device'), true);
  assert.equal(workspaceOwnsChrome('script'), true);
});

test('stale component surface mode does not override standalone workspaces', () => {
  assert.equal(classifyWorkspace({ activeTab: { type: 'script' }, componentWorkspaceMode: 'surface' }), 'script');
  assert.equal(classifyWorkspace({ activeTab: { type: 'deviceProfile' }, componentWorkspaceMode: 'surface' }), 'device');
  assert.equal(classifyWorkspace({ activeTab: { type: 'settings' }, componentWorkspaceMode: 'surface' }), 'settings');
});

test('owned workspaces suppress global editor chrome', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'deviceProfile' },
    componentWorkspaceMode: 'panel',
    viewportWidth: 1440,
    showTreePanel: true,
    showDisplayPanel: true,
    showPropertiesPanel: true,
  });

  assert.equal(state.workspaceKind, 'device');
  assert.equal(state.ownsChrome, true);
  assert.equal(state.iconWidth, 0);
  assert.equal(state.showTreePanel, false);
  assert.equal(state.showDisplayPanel, false);
  assert.equal(state.showPropertiesPanel, false);
});

test('compact panel view hides side chrome without changing ownership', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'panel' },
    componentWorkspaceMode: 'panel',
    viewportWidth: COMPACT_CHROME_BREAKPOINT - 1,
    showTreePanel: true,
    showDisplayPanel: true,
    showPropertiesPanel: true,
  });

  assert.equal(state.workspaceKind, 'panel');
  assert.equal(state.ownsChrome, false);
  assert.equal(state.compactPanel, true);
  assert.equal(state.iconWidth, 0);
  assert.equal(state.showTreePanel, false);
  assert.equal(state.showDisplayPanel, false);
  assert.equal(state.showPropertiesPanel, false);
});

test('wide panel view preserves requested global chrome', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'panel' },
    componentWorkspaceMode: 'panel',
    viewportWidth: COMPACT_CHROME_BREAKPOINT,
    showTreePanel: true,
    showDisplayPanel: false,
    showPropertiesPanel: true,
  });

  assert.equal(state.compactPanel, false);
  assert.equal(state.iconWidth, 48);
  assert.equal(state.showTreePanel, true);
  assert.equal(state.showDisplayPanel, false);
  assert.equal(state.showPropertiesPanel, true);
});
